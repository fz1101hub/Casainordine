import { decryptSecret } from './mail-core.mjs';

const BUCKETS = ['house-documents', 'mail-bills'];

// Case di cui l'utente è proprietario e che hanno altri membri: vanno cedute o eliminate prima,
// altrimenti la cancellazione dell'account cancellerebbe anche i dati degli altri.
export async function sharedOwnedHomes(admin, userId) {
  const { data: owned, error } = await admin.from('homes').select('id,name').eq('owner_id', userId).limit(100);
  if (error) throw error;
  const shared = [];
  for (const home of owned || []) {
    const { count, error: membersError } = await admin.from('home_members').select('user_id', { count: 'exact', head: true })
      .eq('home_id', home.id).neq('user_id', userId);
    if (membersError) throw membersError;
    if ((count || 0) > 0) shared.push(home);
  }
  return shared;
}

// File da non cancellare: i documenti caricati nelle case condivise di altri. Con l'account
// passano al proprietario della casa (supabase/migrate_v41_ex_membri.sql) e il file resta nella
// cartella di chi l'aveva caricato. I documenti delle case dell'utente si cancellano con la casa.
export async function sharedDocumentPaths(admin, userId) {
  // Senza la migrazione v4.1 le righe si cancellano a cascata: tenere i file li lascerebbe orfani.
  // Ogni altro errore ferma la cancellazione: meglio riprovare che perdere i file della casa.
  const { error: probeError } = await admin.from('home_documents').select('former_user_id').limit(1);
  if (probeError?.code === '42703') return new Set();
  if (probeError) throw probeError;
  const { data: owned, error: ownedError } = await admin.from('homes').select('id').eq('owner_id', userId).limit(1000);
  if (ownedError) throw ownedError;
  const ownedHomes = new Set((owned || []).map(home => home.id));
  const keep = new Set();
  for (let from = 0; from < 100000; from += 1000) {
    const { data, error } = await admin.from('home_documents').select('storage_path,home_id')
      .eq('user_id', userId).not('home_id', 'is', null).range(from, from + 999);
    if (error) throw error;
    for (const document of data || []) if (!ownedHomes.has(document.home_id)) keep.add(document.storage_path);
    if (!data || data.length < 1000) break;
  }
  return keep;
}

// File dell'utente nei bucket (cartella <user_id>/): le righe del database si cancellano a cascata,
// i file no. Restano solo quelli in `keep` (percorsi completi).
export async function removeUserFiles(admin, userId, keep = new Set()) {
  let removed = 0;
  for (const bucket of BUCKETS) {
    // I file tenuti restano nell'elenco: la pagina successiva parte dopo di loro.
    let offset = 0;
    for (let round = 0; round < 1000; round++) {
      const { data, error } = await admin.storage.from(bucket).list(userId, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } });
      if (error) throw error;
      const paths = (data || []).filter(f => f.name).map(f => `${userId}/${f.name}`);
      if (!paths.length) break;
      const doomed = paths.filter(path => !(bucket === 'house-documents' && keep.has(path)));
      offset += paths.length - doomed.length;
      if (doomed.length) {
        const { error: removeError } = await admin.storage.from(bucket).remove(doomed);
        if (removeError) throw removeError;
        removed += doomed.length;
      }
      if (paths.length < 100) break;
    }
  }
  return removed;
}


// Coda durevole: si scrive PRIMA della cancellazione in Auth. Non si cancella mai alcun file
// se la cancellazione non è confermata. La riga sopravvive all'utente (niente FK).
export async function queueAccountCleanup(admin, userId, keep = new Set()) {
  const paths = [...keep];
  if (paths.length > 100000 || paths.some(p => typeof p !== 'string' || !p.startsWith(userId + '/')))
    throw new Error('Invalid account cleanup manifest');
  const { error } = await admin.from('account_cleanup_jobs')
    .upsert({ user_id: userId, keep_paths: paths }, { onConflict: 'user_id' });
  if (error) throw error;
}

// Un fallimento di deleteUser lascia l'account intatto: si può togliere la richiesta di pulizia.
// Se questa cancellazione della coda fallisce, il cron NON tocca i file finché Auth vede l'utente.
export async function discardAccountCleanup(admin, userId) {
  const { error } = await admin.from('account_cleanup_jobs').delete().eq('user_id', userId);
  if (error) throw error;
}

// La verifica di esistenza su Auth è un requisito di sicurezza: un errore diverso da 404,
// una risposta ambigua o un account esistente NON autorizzano la rimozione dei file.
export async function finishAccountCleanup(admin, userId) {
  const { data: job, error: readError } = await admin.from('account_cleanup_jobs')
    .select('keep_paths').eq('user_id', userId).maybeSingle();
  if (readError) throw readError;
  if (!job) return false;
  const { data, error: authError } = await admin.auth.admin.getUserById(userId);
  if (!authError || Number(authError.status) !== 404) {
    if (authError && Number(authError.status) !== 404) throw authError;
    // Anche una risposta HTTP 200 senza utente è ambigua: non autorizza la pulizia.
    return false;
  }
  await removeUserFiles(admin, userId, new Set(job.keep_paths || []));
  const { error: deleteError } = await admin.from('account_cleanup_jobs').delete().eq('user_id', userId);
  if (deleteError) throw deleteError;
  return true;
}

export async function runAccountCleanupJobs(admin, { limit = 3 } = {}) {
  const { data, error } = await admin.from('account_cleanup_jobs')
    .select('user_id').order('created_at', { ascending: true }).limit(limit);
  if (error) throw error;
  const result = { cleaned: 0, errors: [] };
  for (const job of data || []) {
    try { if (await finishAccountCleanup(admin, job.user_id)) result.cleaned++; }
    catch (e) {
      result.errors.push(`Account cleanup: ${String(e?.message || e).slice(0, 120)}`);
      // Registro diagnostico best effort; la coda rimane intatta per un nuovo tentativo.
      await admin.from('account_cleanup_jobs').update({
        last_attempt_at: new Date().toISOString(), last_error: String(e?.message || e).slice(0, 200),
      }).eq('user_id', job.user_id);
    }
  }
  return result;
}

// Revoca l'accesso Gmail concesso all'app (best effort: il token viene comunque cancellato).
export async function revokeGoogleAccess(admin, userId, fetchImpl = fetch) {
  const { data, error } = await admin.from('mail_connections').select('refresh_token_enc').eq('user_id', userId).eq('provider', 'gmail').limit(20);
  if (error) return 0;
  let revoked = 0;
  for (const row of data || []) {
    try {
      const token = decryptSecret(row.refresh_token_enc);
      const response = await fetchImpl('https://oauth2.googleapis.com/revoke', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token })
      });
      if (response.ok) revoked++;
    } catch { /* il token resta solo fino alla cancellazione della riga */ }
  }
  return revoked;
}

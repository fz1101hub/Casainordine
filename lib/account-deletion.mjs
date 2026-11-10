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

// File dell'utente nei bucket (cartella <user_id>/): le righe del database si cancellano a cascata,
// i file no.
export async function removeUserFiles(admin, userId) {
  let removed = 0;
  for (const bucket of BUCKETS) {
    for (let round = 0; round < 50; round++) {
      const { data, error } = await admin.storage.from(bucket).list(userId, { limit: 100 });
      if (error) throw error;
      const paths = (data || []).filter(f => f.name).map(f => `${userId}/${f.name}`);
      if (!paths.length) break;
      const { error: removeError } = await admin.storage.from(bucket).remove(paths);
      if (removeError) throw removeError;
      removed += paths.length;
    }
  }
  return removed;
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

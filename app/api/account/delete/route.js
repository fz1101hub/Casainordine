import { authenticatedUser, getAdmin, json } from '../../../../lib/server.mjs';
import { sharedOwnedHomes, sharedDocumentPaths, ownedLeasePhotoPaths, queueAccountCleanup, discardAccountCleanup, finishAccountCleanup, revokeGoogleAccess } from '../../../../lib/account-deletion.mjs';
export const runtime = 'nodejs';
export const maxDuration = 60;

// Cancellazione definitiva dell'account (GDPR art. 17). Le spese e la spesa condivise restano
// alla casa senza nome (supabase/migrate_v37_account.sql); le altre voci delle case condivise
// passano al proprietario della casa, con i file dei documenti (migrate_v41_ex_membri.sql).
// Lo spazio personale si cancella a cascata.
export async function POST(request) {
  const user = await authenticatedUser(request);
  if (!user) return json({ error: 'unauthorized' }, 401);
  const { confirm_email } = await request.json().catch(() => ({}));
  if (String(confirm_email || '').trim().toLowerCase() !== String(user.email || '').trim().toLowerCase())
    return json({ error: 'accountConfirm' }, 400);
  let admin;
  try { admin = getAdmin(); } catch { return json({ error: 'databaseConfig' }, 503); }
  try {
    const shared = await sharedOwnedHomes(admin, user.id);
    if (shared.length) return json({ error: 'accountOwner', homes: shared.map(h => h.name) }, 409);
    const keep = await sharedDocumentPaths(admin, user.id);
    const leasePaths = await ownedLeasePhotoPaths(admin, user.id);
    // Se questa scrittura fallisce, l'account resta intatto e nessun file viene cancellato.
    await queueAccountCleanup(admin, user.id, keep, leasePaths);
    await revokeGoogleAccess(admin, user.id);
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) {
      try { await discardAccountCleanup(admin, user.id); } catch (cleanupError) {
        console.error('[account/delete] Pending cleanup record after failed Auth delete', cleanupError?.message);
      }
      throw error;
    }
    // Auth ha eliminato l'account e le righe personali. Solo ora si possono togliere i file.
    // Se Storage non risponde, il cron riprenderà dalla coda, senza perdere l'account prima.
    try {
      const cleaned = await finishAccountCleanup(admin, user.id);
      return json(cleaned ? { ok: true } : { ok: true, cleanup_pending: true });
    } catch (cleanupError) {
      console.error('[account/delete] Storage cleanup queued', cleanupError?.message);
      return json({ ok: true, cleanup_pending: true });
    }
  } catch {
    return json({ error: 'accountDeleteFailed' }, 500);
  }
}

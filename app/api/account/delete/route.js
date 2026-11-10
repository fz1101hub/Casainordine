import { authenticatedUser, getAdmin, json } from '../../../../lib/server.mjs';
import { sharedOwnedHomes, removeUserFiles, revokeGoogleAccess } from '../../../../lib/account-deletion.mjs';
export const runtime = 'nodejs';
export const maxDuration = 60;

// Cancellazione definitiva dell'account (GDPR art. 17). Le spese e la spesa condivise restano
// alla casa senza nome (supabase/migrate_v37_account.sql); tutto il resto si cancella a cascata.
export async function POST(request) {
  const user = await authenticatedUser(request);
  if (!user) return json({ error: 'Non autorizzato', code: 'auth' }, 401);
  const { confirm_email } = await request.json().catch(() => ({}));
  if (String(confirm_email || '').trim().toLowerCase() !== String(user.email || '').trim().toLowerCase())
    return json({ error: 'Conferma non valida', code: 'confirm' }, 400);
  let admin;
  try { admin = getAdmin(); } catch { return json({ error: 'Configurazione del database incompleta', code: 'config' }, 503); }
  try {
    const shared = await sharedOwnedHomes(admin, user.id);
    if (shared.length) return json({ error: 'Case condivise di proprietà', code: 'owner', homes: shared.map(h => h.name) }, 409);
    await revokeGoogleAccess(admin, user.id);
    await removeUserFiles(admin, user.id);
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw error;
    return json({ ok: true });
  } catch {
    return json({ error: 'Cancellazione non riuscita', code: 'failed' }, 500);
  }
}

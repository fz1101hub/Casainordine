import { getAdmin, json, scheduledCallAuthorized } from '../../../../lib/server.mjs';
import { runDeferredPushes } from '../../../../lib/daily-jobs.mjs';
export const runtime = 'nodejs';
export const maxDuration = 60;

// Ogni ora (Supabase Cron, supabase/migrate_v53_cron_push.sql): manda le push rinviate
// dall'orario silenzioso a chi non è più nell'orario silenzioso (lib/push-deferred.mjs).
export async function GET(request) {
  let admin;
  try { admin = getAdmin(); } catch { return json({error:'databaseConfig'},503); }
  if (!(await scheduledCallAuthorized(request, admin))) return json({error:'unauthorized'},401);
  const { status, body } = await runDeferredPushes(admin);
  return json(body, status);
}

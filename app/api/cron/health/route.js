import { getAdmin, json, scheduledCallAuthorized } from '../../../../lib/server.mjs';
import { runHealthReminders } from '../../../../lib/health-reminders.mjs';
export const runtime = 'nodejs';
export const maxDuration = 60;

// Ogni 5 minuti (Supabase Cron, supabase/migrate_v60_cron_salute.sql): promemoria delle terapie
// all'orario e delle visite (lib/health-reminders.mjs).
export async function GET(request) {
  let admin;
  try { admin = getAdmin(); } catch { return json({error:'databaseConfig'},503); }
  if (!(await scheduledCallAuthorized(request, admin))) return json({error:'unauthorized'},401);
  const { status, body } = await runHealthReminders(admin);
  return json(body, status);
}

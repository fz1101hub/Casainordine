import { getAdmin, json, scheduledCallAuthorized, publicAppUrl } from '../../../lib/server.mjs';
import { runDailyJobs } from '../../../lib/daily-jobs.mjs';
export const runtime = 'nodejs';
export const maxDuration = 60;

// Lavoro giornaliero (lib/daily-jobs.mjs), chiamato da Vercel Cron e da Supabase Cron.
export async function GET(request) {
  let admin;
  try { admin = getAdmin(); } catch { return json({error:'databaseConfig'},503); }
  if (!(await scheduledCallAuthorized(request, admin))) return json({error:'unauthorized'},401);
  // Il pulsante delle email porta all'app vera anche se APP_URL manca (prima: http://localhost:3000).
  const { status, body } = await runDailyJobs(admin, { appUrl: publicAppUrl(request) });
  return json(body, status);
}

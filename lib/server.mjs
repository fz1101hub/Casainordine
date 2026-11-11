import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('Configurazione database incompleta');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
export function getPublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Configurazione database incompleta');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
export async function authenticatedUser(request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await getPublicClient().auth.getUser(token);
  return error ? null : data.user;
}
export function hashToken(token) { return createHash('sha256').update(token).digest('hex'); }
export function newIntegrationToken() { return `cio_${randomBytes(32).toString('base64url')}`; }
export const json = (payload, status = 200) => Response.json(payload, { status, headers: {'Cache-Control':'no-store'} });

export { publicError } from './public-error.mjs';
// Risposta di errore per il browser. I messaggi tecnici (database, configurazione, servizi esterni)
// restano nei log del server: al browser arriva solo `message`, salvo gli errori pubblici.
export function failure(error, message, status = 500, where = 'api') {
  if (error?.public) return json({ error: error.message }, status < 500 ? status : 400);
  console.error(`[${where}]`, error?.message || error);
  return json({ error: message }, status);
}

// Indirizzo pubblico dell'app per i link nelle email e il ritorno dal collegamento delle caselle:
// APP_URL se è https; altrimenti l'indirizzo della richiesta, se è https (su Vercel lo è) o è
// una prova in locale; in ultimo l'indirizzo di produzione. Mai http://localhost per sbaglio.
export const PRODUCTION_URL = 'https://casainordine.vercel.app';
export function publicAppUrl(request, configured = process.env.APP_URL) {
  try { const url = new URL(configured); if (url.protocol === 'https:') return url.origin; } catch {}
  try {
    const url = new URL(request?.url);
    if (url.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(url.hostname)) return url.origin;
  } catch {}
  return PRODUCTION_URL;
}
// Confronto a tempo costante dell'intestazione inviata da Vercel Cron.
export function cronAuthorized(request, secret = process.env.CRON_SECRET) {
  if (!secret) return false;
  const given = Buffer.from(String(request.headers.get('authorization') || ''));
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
// Chiamate programmate da Supabase Cron (supabase/migrate_v35_cron.sql): la chiave sta nel Vault
// del database e si verifica con la chiave di servizio, quindi non va copiata su Vercel.
export async function supabaseCronAuthorized(request, admin) {
  const token = String(request.headers.get('x-casa-cron-token') || '');
  if (!/^[0-9a-f]{64}$/.test(token)) return false;
  try {
    const { data, error } = await admin.rpc('v35_cron_token_valid', { token });
    return !error && data === true;
  } catch { return false; }
}
// Vercel Cron (Authorization: Bearer CRON_SECRET) oppure Supabase Cron.
export async function scheduledCallAuthorized(request, admin) {
  return cronAuthorized(request) || await supabaseCronAuthorized(request, admin);
}

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

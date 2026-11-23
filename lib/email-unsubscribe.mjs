// Collegamenti per smettere di ricevere le email (lib/reminder-email.mjs, app/api/email/unsubscribe).
// Il codice è una firma HMAC di persona e tipo di email, con una chiave ricavata dalla chiave di
// servizio di Supabase (già solo sul server: niente variabili nuove su Vercel). Non scade: un
// collegamento per disiscriversi deve funzionare anche in un'email vecchia. Può solo spegnere quel
// tipo di email per quella persona; per riaccenderle servono le impostazioni dell'app.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const UNSUBSCRIBE_KINDS = ['reminder', 'summary'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function signingKey(secret = process.env.SUPABASE_SECRET_KEY) {
  if (!secret) throw new Error('Configurazione del server incompleta');
  return createHmac('sha256', secret).update('casa-in-ordine/email-unsubscribe/v1').digest();
}

export function unsubscribeToken(userId, kind, secret) {
  return createHmac('sha256', signingKey(secret)).update(`${String(userId).toLowerCase()}:${kind}`).digest('base64url').slice(0, 32);
}

export function unsubscribeUrl(appUrl, userId, kind, language = 'it', secret) {
  const url = new URL('/api/email/unsubscribe', appUrl);
  url.searchParams.set('u', userId);
  url.searchParams.set('t', kind);
  url.searchParams.set('k', unsubscribeToken(userId, kind, secret));
  url.searchParams.set('l', language);
  return url.toString();
}

// Valori della richiesta già letti; true solo se codice, persona e tipo corrispondono.
export function validUnsubscribe({ u, t, k }, secret) {
  if (!UUID.test(String(u || '')) || !UNSUBSCRIBE_KINDS.includes(t) || typeof k !== 'string' || k.length !== 32) return false;
  let expected;
  try { expected = unsubscribeToken(u, t, secret); } catch { return false; }
  const a = Buffer.from(expected), b = Buffer.from(k);
  return a.length === b.length && timingSafeEqual(a, b);
}

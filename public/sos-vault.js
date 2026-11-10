// Schede SOS cifrate con la frase della casa (supabase/migrate_v40_sos_cifrate.sql).
// IDENTICO a /public/sos-vault.js, che usa la pagina offline: tienili uguali (c'è un test).
//
// La frase non lascia mai il browser. Da frase e sale (PBKDF2, SHA-256) si ricava una chiave
// AES-GCM a 256 bit; ogni scheda è cifrata con un IV casuale e legata alla sua casa (dati
// aggiuntivi), così una scheda copiata in un'altra casa non si apre. Il "controllo" è una frase
// fissa cifrata con la stessa chiave: serve a dire subito se la frase inserita è quella giusta.
const ITERATIONS = 600000;
const VERIFIER_TEXT = 'casa-in-ordine-sos-v40';
export const MIN_PHRASE = 10;
export const OFFLINE_PREFIX = 'casa-in-ordine-sos-v40:';
const FIELDS = [['title', 120], ['location_hint', 500], ['instructions', 2500], ['contact_label', 100], ['contact_phone', 80]];
const encoder = new TextEncoder(), decoder = new TextDecoder();
const b64 = bytes => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); };
const unb64 = value => Uint8Array.from(atob(String(value || '')), c => c.charCodeAt(0));
function subtle() { const s = globalThis.crypto?.subtle; if (!s) throw new Error('crypto-unavailable'); return s; }

// null se la frase va bene; altrimenti 'short' (meno di 10 caratteri) o 'mismatch' (conferma diversa).
export function phraseProblem(phrase, confirm) {
  if (typeof phrase !== 'string' || phrase.length < MIN_PHRASE) return 'short';
  if (confirm !== undefined && phrase !== confirm) return 'mismatch';
  return null;
}
export const scopeOf = (homeId, userId) => homeId ? `casa:${homeId}` : `personale:${userId}`;
export function newSalt() { return b64(globalThis.crypto.getRandomValues(new Uint8Array(16))); }
export async function deriveKey(phrase, salt) {
  const base = await subtle().importKey('raw', encoder.encode(String(phrase).normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey({ name: 'PBKDF2', salt: unb64(salt), iterations: ITERATIONS, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function seal(text, key, scope) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const data = await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(scope) }, key, encoder.encode(text));
  return { v: 1, iv: b64(iv), data: b64(new Uint8Array(data)) };
}
async function unseal(sealed, key, scope) {
  if (!sealed || sealed.v !== 1) throw new Error('sos-format');
  const bytes = await subtle().decrypt({ name: 'AES-GCM', iv: unb64(sealed.iv), additionalData: encoder.encode(scope) }, key, unb64(sealed.data));
  return decoder.decode(bytes);
}
export function makeVerifier(key, scope) { return seal(VERIFIER_TEXT, key, scope); }
export async function phraseMatches(verifier, key, scope) {
  try { return (await unseal(verifier, key, scope)) === VERIFIER_TEXT; } catch { return false; }
}
export function cleanCard(card) {
  return Object.fromEntries(FIELDS.map(([name, max]) => [name, String(card?.[name] ?? '').slice(0, max)]));
}
export function sealCard(card, key, scope) { return seal(JSON.stringify(cleanCard(card)), key, scope); }
export async function openCard(sealed, key, scope) { return cleanCard(JSON.parse(await unseal(sealed, key, scope))); }

// Copia offline: una per casa e per account, solo dati cifrati. Si apre con la stessa frase.
export function offlineKey(userId, scope) { return `${OFFLINE_PREFIX}${userId || 'nessuno'}:${scope}`; }
export function buildOfflineCopy({ label, scope, salt, verifier, cards, savedAt = new Date().toISOString() }) {
  return { v: 2, label: String(label || '').slice(0, 120), scope, salt, verifier, cards: cards.slice(0, 500), saved_at: savedAt };
}
export function saveOfflineCopy(storage, userId, copy) { storage.setItem(offlineKey(userId, copy.scope), JSON.stringify(copy)); }
export function hasOfflineCopy(storage, userId, scope) { try { return Boolean(storage.getItem(offlineKey(userId, scope))); } catch { return false; } }
export function removeOfflineCopy(storage, userId, scope) { storage.removeItem(offlineKey(userId, scope)); }
// Con un account si vedono solo le sue copie; senza accesso, tutte quelle del dispositivo.
export function listOfflineCopies(storage, userId) {
  const copies = [];
  for (let i = 0; i < storage.length; i++) {
    const storageKey = storage.key(i);
    if (!storageKey || !storageKey.startsWith(OFFLINE_PREFIX)) continue;
    const owner = storageKey.slice(OFFLINE_PREFIX.length).split(':')[0];
    if (userId && owner !== userId) continue;
    try { const copy = JSON.parse(storage.getItem(storageKey)); if (copy?.v === 2) copies.push({ storageKey, ...copy }); } catch {}
  }
  return copies.sort((a, b) => String(b.saved_at).localeCompare(String(a.saved_at)));
}
// null se la frase è sbagliata; altrimenti le schede leggibili.
export async function openOfflineCopy(copy, phrase) {
  const key = await deriveKey(phrase, copy.salt);
  if (!(await phraseMatches(copy.verifier, key, copy.scope))) return null;
  const cards = [];
  for (const sealed of copy.cards || []) { try { cards.push(await openCard(sealed, key, copy.scope)); } catch {} }
  return cards;
}

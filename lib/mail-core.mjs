import { randomBytes, createHash, createCipheriv, createDecipheriv } from 'node:crypto';
import { senderHint } from './mail-senders.mjs';
import { supplierMatch } from './mail-suppliers.mjs';

export const MAIL_BUCKET = 'mail-bills';
export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
export const SCAN_QUERY = 'has:attachment newer_than:35d {bolletta fattura invoice energia gas acqua internet fibra utenza rifiuti condominio scadenza}';
// Signals are intentionally specific: "pagamento" by itself is not a bill.
export const BILL_MARKERS = /\b(?:bollett[ae]|fattur[ae]|invoic(?:e|es)|utility\s+bill|energia\s+elettrica|gas\s+naturale|servizio\s+idrico|internet|fibra|telefonia|rifiuti|tari|condomin(?:io|iali)|utenza|acquedotto|pagoPA)\b/i;
const BILL_STRONG = /\b(?:bollett[ae]|fattur[ae]|invoice|utility\s+bill|scadenza\s+(?:bolletta|fattura)|avviso\s+di\s+pagamento\s+pagoPA)\b/i;
const UTILITY = /\b(?:energia\s+elettrica|gas\s+naturale|fornitura\s+gas|servizio\s+idrico|acquedotto|internet|fibra|telefonia|rifiuti|tari|condomin(?:io|iali)|utenza)\b/i;
const RECEIPT = /\b(?:ricevuta\s+di\s+pagamento|quietanza|pagamento\s+(?:eseguito|effettuato|ricevuto|confermato)|bonifico\s+eseguito)\b/i;
const JUNK_MAIL = /\b(?:newsletter|offerta\s+speciale|sconto\s+esclusivo|pubblicit[aà]|promozione\s+commerciale)\b/i;
const DECORATIVE = /(?:^|[._\- ])(?:logo|banner|footer|header|signature|firma|pixel|tracking|social|facebook|instagram|icon|icona|spacer)(?:[._\-0-9 ]|$)/i;

/** Positive heuristic used equally by Gmail, Microsoft and IMAP; never approves payments. */
export function likelyBillDocument({subject='',sender='',filenames=[],learnedSenders=[],knownSuppliers=[],bodyText='',senderAuth='unknown'}={}){
  const title=String(subject).slice(0,240);
  const names=(filenames||[]).map(String).slice(0,100);
  const strongFile=names.some(name=>BILL_STRONG.test(name));
  if(RECEIPT.test(title)&&!strongFile)return false;
  if(JUNK_MAIL.test(title)&&!strongFile)return false;
  if(strongFile||BILL_STRONG.test(title))return true;
  // An onboarding supplier name can catch generic PDFs, but is only a review hint.
  if(supplierMatch(knownSuppliers,`${title} ${String(bodyText).slice(0,2500)}`,sender)&&names.some(name=>/\.(?:pdf|jpe?g|png|webp)$/i.test(name)&&!DECORATIVE.test(name)))return true;
  // A manually confirmed, exact sender lets us find generically named PDFs too.
  // A domain hint alone never bypasses the normal document heuristics.
  if(senderHint(learnedSenders,sender,senderAuth)?.match==='exact' &&
    names.some(name=>/\.(?:pdf|jpe?g|png|webp)$/i.test(name)&&!DECORATIVE.test(name)))return true;
  return UTILITY.test(title) && names.some(name=>/\.(?:pdf|jpe?g|png|webp)$/i.test(name)&&!DECORATIVE.test(name));
}
export function isDocumentAttachment(filename){return !DECORATIVE.test(String(filename||''));}

const MIME_BY_EXT = { pdf:'application/pdf', jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', webp:'image/webp' };

export function hashState(value) { return createHash('sha256').update(value).digest('hex'); }
export function newOAuthState() { return randomBytes(32).toString('base64url'); }
export function newCodeVerifier() { return randomBytes(48).toString('base64url'); }
export function codeChallenge(verifier) { return createHash('sha256').update(verifier).digest('base64url'); }

function encryptionKey() {
  const key = Buffer.from(process.env.MAIL_TOKEN_ENCRYPTION_KEY || '', 'base64');
  if (key.length !== 32) throw new Error('MAIL_TOKEN_ENCRYPTION_KEY deve essere una chiave casuale da 32 byte in base64.');
  return key;
}
export function encryptSecret(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${ciphertext.toString('base64url')}`;
}
export function decryptSecret(value) {
  const parts = String(value || '').split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('Formato credenziali non riconosciuto.');
  const iv = Buffer.from(parts[1], 'base64url'), tag = Buffer.from(parts[2], 'base64url');
  // Tag di autenticazione sempre di 16 byte: GCM accetta anche tag corti, più facili da forzare.
  if (iv.length !== 12 || tag.length !== 16) throw new Error('Formato credenziali non riconosciuto.');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv, { authTagLength: 16 });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(Buffer.from(parts[3], 'base64url')), decipher.final()]).toString('utf8');
}
export function mailRedirectUri() {
  const url = new URL(process.env.APP_URL || 'http://localhost:3000');
  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') throw new Error('APP_URL deve utilizzare HTTPS.');
  if (url.pathname !== '/' || url.search || url.hash) throw new Error('APP_URL deve contenere solo il dominio.');
  return `${url.origin}/api/mail/callback`;
}
export const googleRedirectUri = mailRedirectUri;
export function googleConsentUrl(state, verifier) {
  if (!process.env.GOOGLE_MAIL_CLIENT_ID || !process.env.GOOGLE_MAIL_CLIENT_SECRET) throw new Error('OAuth Gmail non configurato.');
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_MAIL_CLIENT_ID,
    redirect_uri: mailRedirectUri(),
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/gmail.readonly',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'false',
    state,
    code_challenge: codeChallenge(verifier),
    code_challenge_method: 'S256'
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}
export function safeFileName(name) {
  return String(name || 'allegato').replace(/[\\/\x00-\x1f\x7f<>:"|?*]/g, '_').slice(0, 180) || 'allegato';
}
export function allowedAttachment(filename, mimeType, size) {
  const ext = String(filename || '').toLowerCase().split('.').pop();
  if (!(ext in MIME_BY_EXT) || !Number.isFinite(size) || size < 1 || size > MAX_ATTACHMENT_BYTES) return null;
  // Avoid trusting arbitrary MIME declarations for browser display.
  if (mimeType && mimeType !== 'application/octet-stream' && mimeType !== MIME_BY_EXT[ext]) return null;
  return MIME_BY_EXT[ext];
}
export function likelyBillEmail(message) {
  const headers = message?.payload?.headers || [];
  const get = key => headers.find(h => h.name?.toLowerCase() === key)?.value || '';
  const subject = get('subject').slice(0, 240);
  const sender = get('from').slice(0, 240);
  const attachments = flattenAttachments(message?.payload);
  return {subject,sender,attachments, matched:likelyBillDocument({subject,sender,filenames:attachments.map(a=>a.filename)})};
}
export function flattenAttachments(part, depth=0) {
  if (!part || depth > 12) return [];
  const found = [];
  if (part.filename && part.body?.attachmentId) found.push({filename:part.filename,attachmentId:part.body.attachmentId,mimeType:part.mimeType, size:part.body.size});
  for (const item of part.parts || []) found.push(...flattenAttachments(item,depth+1));
  return found;
}
export function decodeGmailData(value) {
  if (typeof value !== 'string' || !/^[\w-]+={0,2}$/.test(value)) throw new Error('Allegato non valido.');
  const buffer = Buffer.from(value, 'base64url');
  if (buffer.length > MAX_ATTACHMENT_BYTES) throw new Error('Allegato troppo grande.');
  return buffer;
}
export function fileSignatureIsValid(buffer,mime) {
  if (mime === 'application/pdf') return buffer.subarray(0,5).toString() === '%PDF-';
  if (mime === 'image/png') return buffer.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'));
  if (mime === 'image/jpeg') return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mime === 'image/webp') return buffer.subarray(0,4).toString() === 'RIFF' && buffer.subarray(8,12).toString() === 'WEBP';
  return false;
}

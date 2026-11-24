// Archivio della casa: il file va nel bucket «house-documents» (cartella di chi lo carica, 200 MB a
// persona: migrate_v36_quota.sql) e una riga in home_documents. Lo usano l'archivio,
// l'acquisizione unica e i progetti; un file già presente (stessa impronta SHA-256) non si ricarica.
import { appError } from './friendly-error.mjs';

export const DOCUMENT_MIME_TYPES = Object.freeze(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain']);
export const IMAGE_MIME_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);
export const MAX_DOCUMENT_BYTES = 10485760;
export const STORAGE_QUOTA_BYTES = 200 * 1024 * 1024;
const EXTENSION = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'text/plain': 'txt' };

export async function documentFingerprint(file) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function validDocument(file, types = DOCUMENT_MIME_TYPES) {
  return Boolean(file) && types.includes(file.type) && file.size > 0 && file.size <= MAX_DOCUMENT_BYTES;
}

// Restituisce {id, duplicate}. Errori noti come appError: «extra.archive.invalidFile», «extra.archive.quotaFull».
// known: documenti già caricati nello spazio ({id, sha256}), per riconoscere un doppione senza caricarlo.
export async function uploadHouseDocument(client, { file, userId, homeId = null, docType = 'altro', notes = '', propertyId = null, billId = null, known = [], types = DOCUMENT_MIME_TYPES }) {
  // Nel browser: foto HEIC in JPEG e foto molto pesanti ridotte prima di controllarle e caricarle.
  if (file && typeof document !== 'undefined') file = (await (await import('./image-prepare.js')).preparePhoto(file)).file;
  if (!validDocument(file, types)) throw appError('extra.archive.invalidFile');
  const sha256 = await documentFingerprint(file);
  const existing = known.find(document => document.sha256 === sha256);
  if (existing) return { id: existing.id, duplicate: true };
  const path = `${userId}/${crypto.randomUUID()}.${EXTENSION[file.type]}`;
  const uploaded = await client.storage.from('house-documents').upload(path, file, { contentType: file.type, upsert: false, cacheControl: '3600' });
  // Spazio per utente pieno: la regola di accesso del bucket rifiuta il file.
  if (uploaded.error && /row-level security|violates|unauthorized|403/i.test(`${uploaded.error.message || ''} ${uploaded.error.statusCode || ''}`)) {
    const { data: used } = await client.rpc('v36_my_storage_used');
    if (Number(used) >= STORAGE_QUOTA_BYTES) throw appError('extra.archive.quotaFull');
  }
  if (uploaded.error) throw uploaded.error;
  const saved = await client.from('home_documents').insert({ user_id: userId, home_id: homeId || null, property_id: propertyId || null, bill_id: billId || null,
    doc_type: docType, notes, name: file.name.slice(0, 200), mime_type: file.type, file_size: file.size, storage_path: path, sha256 }).select('id').single();
  if (saved.error) { await client.storage.from('house-documents').remove([path]); throw saved.error; }
  return { id: saved.data.id, duplicate: false };
}

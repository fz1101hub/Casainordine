// Foto dal telefono, prima di leggerle o di conservarle (solo nel browser).
// - HEIC/HEIF dell'iPhone: diventano JPEG. Safari le apre da solo; negli altri browser si carica,
//   solo in quel momento, il lettore heic-to (libheif, LGPL-3.0) nella versione senza eval (CSP).
// - Foto molto pesanti (oltre 4 MB): si riducono a 3200 pixel sul lato lungo, JPEG all'88%.
//   Una foto da 48 megapixel passa da 15-25 MB a 1-2 MB e resta leggibile per l'OCR.
// I PDF e le foto già leggere non si toccano: il file resta identico (stessa impronta SHA-256).
import { appError } from './friendly-error.mjs';

export const HEIC_TYPES = Object.freeze(['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence']);
export const HEIC_ACCEPT = '.heic,.heif,image/heic,image/heif';
export const PHOTO_MAX_SIDE = 3200;
export const PHOTO_SHRINK_BYTES = 4 * 1024 * 1024;
// Oltre questo peso una foto non si apre nemmeno (memoria del telefono).
export const PHOTO_MAX_SOURCE_BYTES = 60 * 1024 * 1024;
const SIMPLE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function looksHeic(file) {
  const type = String(file?.type || '').toLowerCase();
  if (HEIC_TYPES.includes(type)) return true;
  return /\.(heic|heif)$/i.test(String(file?.name || '')) && (!type || type === 'application/octet-stream' || type.startsWith('image/'));
}

function jpegName(name) {
  const base = String(name || 'foto').replace(/\.[a-z0-9]{2,5}$/i, '') || 'foto';
  return `${base}.jpg`;
}

async function decode(file, heic) {
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* sotto */ }
  if (!heic) return null;
  try {
    const { heicTo } = await import('heic-to/csp');
    return await heicTo({ blob: file, type: 'bitmap' });
  } catch { return null; }
}

function toJpeg(bitmap, maxSide, quality) {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise(resolve => canvas.toBlob(blob => { canvas.width = 0; canvas.height = 0; resolve(blob); }, 'image/jpeg', quality));
}

// Restituisce { file, converted, resized }. onProgress riceve {key} come la lettura dei documenti.
export async function preparePhoto(file, { maxSide = PHOTO_MAX_SIDE, shrinkBytes = PHOTO_SHRINK_BYTES, quality = 0.88, onProgress = () => {} } = {}) {
  if (!file || typeof document === 'undefined') return { file, converted: false, resized: false };
  const heic = looksHeic(file);
  const simple = SIMPLE_TYPES.includes(String(file.type).toLowerCase());
  if (!heic && !(simple && file.size > shrinkBytes)) return { file, converted: false, resized: false };
  if (file.size > PHOTO_MAX_SOURCE_BYTES) throw appError('photo.tooLarge');
  onProgress({ key: heic ? 'photo.converting' : 'photo.shrinking' });
  const bitmap = await decode(file, heic);
  if (!bitmap) {
    if (heic) throw appError('photo.heicUnreadable');
    return { file, converted: false, resized: false };
  }
  try {
    const resized = Math.max(bitmap.width, bitmap.height) > maxSide;
    const blob = await toJpeg(bitmap, maxSide, quality);
    if (!blob) { if (heic) throw appError('photo.heicUnreadable'); return { file, converted: false, resized: false }; }
    // Una foto non HEIC che non diventa più leggera resta com'è.
    if (!heic && blob.size >= file.size) return { file, converted: false, resized: false };
    const out = new File([blob], jpegName(file.name), { type: 'image/jpeg', lastModified: file.lastModified || Date.now() });
    return { file: out, converted: heic, resized };
  } finally { bitmap.close?.(); }
}

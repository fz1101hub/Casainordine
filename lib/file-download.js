// Scarica un file dell'archivio con il suo nome (solo nel browser).
// Si legge con la sessione di chi usa l'app (le regole del bucket valgono come sempre) e si salva
// da un indirizzo blob: dello stesso sito, così il nome del file resta quello originale anche
// su Safari e sui telefoni.
export function safeFileName(name, fallback = 'documento') {
  const clean = String(name || '').replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);
  return clean || fallback;
}

export function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = safeFileName(name); a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export async function downloadStoredFile(client, { bucket = 'house-documents', path, name, type }) {
  const { data, error } = await client.storage.from(bucket).download(path);
  if (error) throw error;
  saveBlob(type && data?.type !== type ? new Blob([data], { type }) : data, name);
}

// Backup con i file (scelta dell'utente, 23 novembre 2026): un archivio .zip con il backup JSON
// e i file dell'archivio dei documenti (bucket «house-documents»: documenti, foto e preventivi
// dei progetti). Il ripristino (lib/backup-restore.mjs) li ricarica e ricollega le voci.
//
// Dentro lo .zip:
//   casa-in-ordine-backup.json   il backup di sempre, con in più «files»: [{document_id, path, size, sha256}]
//   files/<id del documento>.<estensione>
// I file sono già compressi (PDF, JPEG, PNG, WebP): si salvano senza ricomprimerli, così lo .zip
// si crea in fretta anche sul telefono. Le foto dei verbali d'affitto restano fuori, come i
// contratti d'affitto nel ripristino.
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { RestoreFileError } from './backup-restore.mjs';

export const ZIP_JSON = 'casa-in-ordine-backup.json';
// Lo .zip si legge tutto in memoria: oltre questa soglia il telefono rischia di bloccarsi.
export const MAX_ZIP_BYTES = 400 * 1024 * 1024;
// Sopra questa dimensione si chiede conferma prima di creare lo .zip.
export const LARGE_ZIP_BYTES = 100 * 1024 * 1024;
const EXTENSION = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'text/plain': 'txt' };

export const zipPathFor = document => `files/${document.id}.${EXTENSION[document.mime_type] || 'bin'}`;

// Quanto peseranno i file (dai metadati, prima di scaricarli).
export const filesSize = documents => (documents || []).reduce((sum, d) => sum + (d?.storage_path ? Number(d.file_size) || 0 : 0), 0);

// Tutti i documenti dello spazio (l'archivio della pagina ne carica al massimo 600).
export async function listSpaceDocuments(client, { homeId = null, userId }, { pageSize = 1000, maxRows = 20000 } = {}) {
  const out = [];
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const q = client.from('home_documents').select('*');
    const { data, error } = await (homeId ? q.eq('home_id', homeId) : q.is('home_id', null).eq('user_id', userId))
      .order('created_at', { ascending: false }).order('id').range(offset, offset + pageSize - 1);
    if (error) throw error;
    out.push(...(data || []));
    if ((data || []).length < pageSize) break;
  }
  return out;
}

// Scarica i file dei documenti (bucket.download(path) → Blob). Un file che non si scarica non
// ferma il backup: finisce in missing. Al massimo `concurrency` download insieme.
export async function collectDocumentFiles(bucket, documents, { concurrency = 4, onProgress = () => {} } = {}) {
  const list = (documents || []).filter(d => d?.id && d.storage_path);
  const files = {}, manifest = [], missing = [];
  let next = 0, done = 0;
  async function worker() {
    while (next < list.length) {
      const document = list[next++];
      try {
        const { data, error } = await bucket.download(document.storage_path);
        if (error || !data) throw error || new Error('empty');
        const bytes = new Uint8Array(await data.arrayBuffer());
        const path = zipPathFor(document);
        files[path] = bytes;
        manifest.push({ document_id: document.id, path, size: bytes.length, sha256: document.sha256 || null });
      } catch {
        missing.push(document.id);
      }
      onProgress({ done: ++done, total: list.length });
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, worker));
  manifest.sort((a, b) => a.path.localeCompare(b.path));
  return { files, manifest, missing };
}

// Lo .zip: il JSON (con l'elenco dei file) e i file, senza ricompressione.
export function buildBackupZip(bundle, { files = {}, manifest = [], missing = [] } = {}) {
  const json = { ...bundle, files: manifest };
  if (missing.length) json.files_missing = missing;
  const entries = { [ZIP_JSON]: [strToU8(JSON.stringify(json, null, 2)), { level: 6 }] };
  for (const [path, bytes] of Object.entries(files)) entries[path] = [bytes, { level: 0 }];
  return zipSync(entries);
}

const isZip = bytes => bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;

// Legge un backup .zip o .json (bytes). Restituisce il testo JSON e i file per documento:
// files = Map(id del documento → Uint8Array). Lo .zip può anche essere stato rifatto a mano
// (cartella compressa dal computer): il JSON si cerca anche dentro una cartella e i file si
// riconoscono dall'elenco del JSON o dal nome files/<id>.<estensione>.
export function readBackupBytes(bytes) {
  if (!isZip(bytes)) return { text: strFromU8(bytes), files: new Map() };
  let entries;
  try { entries = unzipSync(bytes); } catch { throw new RestoreFileError('badZip'); }
  const names = Object.keys(entries).filter(name => !name.endsWith('/') && !name.split('/').some(part => part === '__MACOSX'));
  const jsonName = names.find(name => name === ZIP_JSON) || names.find(name => name.endsWith('/' + ZIP_JSON))
    || (names.filter(name => name.endsWith('.json')).length === 1 ? names.find(name => name.endsWith('.json')) : null);
  if (!jsonName) throw new RestoreFileError('notBackup');
  const root = jsonName.slice(0, jsonName.length - jsonName.split('/').pop().length);
  const text = strFromU8(entries[jsonName]);
  let listed = [];
  try { listed = JSON.parse(text)?.files; } catch { /* readBackup dirà che non è un JSON valido */ }
  const files = new Map();
  for (const item of Array.isArray(listed) ? listed : []) {
    const bytes = item && entries[root + item.path];
    if (item?.document_id && bytes?.length) files.set(item.document_id, bytes);
  }
  for (const name of names) {
    const match = name.slice(root.length).match(/^files\/([0-9a-f-]{36})\.[a-z]+$/i);
    if (match && !files.has(match[1]) && entries[name].length) files.set(match[1], entries[name]);
  }
  return { text, files };
}

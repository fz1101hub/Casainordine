// Backup con i file (.zip) e ripristino di documenti e foto (scelta dell'utente, 23 novembre 2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { zipSync, strToU8 } from 'fflate';
import { ZIP_JSON, zipPathFor, filesSize, listSpaceDocuments, collectDocumentFiles, buildBackupZip, readBackupBytes } from '../lib/backup-files.mjs';
import { RESTORE_ORDER, readBackup, restorePlan, runRestore, existingDocumentIds, sha256Hex, RestoreFileError } from '../lib/backup-restore.mjs';
import { TRANSLATIONS } from '../lib/i18n.mjs';

const ME = 'me';
const D1 = '11111111-1111-4111-8111-111111111111', D2 = '22222222-2222-4222-8222-222222222222', D3 = '33333333-3333-4333-8333-333333333333';
const pdf = text => strToU8('%PDF-1.4 ' + text);
const bundle = () => ({ format: 'casa-in-ordine-backup', version: 2, exported_at: '2026-11-22T08:00:00Z', scope: { home_id: 'casa-1' },
  bills: [{ id: 'b1', user_id: 'altro', home_id: 'casa-1', title: 'Luce', amount: 50, due_date: '2026-12-01' }],
  documents: [
    { id: D1, user_id: 'altro', former_user_id: 'vecchio', home_id: 'casa-1', bill_id: 'b1', name: 'bolletta.pdf', doc_type: 'bolletta', mime_type: 'application/pdf', file_size: 13, sha256: 'x' },
    { id: D2, user_id: 'altro', home_id: 'casa-1', name: 'foto.jpg', doc_type: 'foto', mime_type: 'image/jpeg', file_size: 9 },
    { id: D3, user_id: 'altro', home_id: 'casa-1', name: 'senza-file.pdf', doc_type: 'altro', mime_type: 'application/pdf', file_size: 5 },
  ],
  receipts: [{ id: 'r1', user_id: 'altro', home_id: 'casa-1', bill_id: 'b1', document_id: D1, amount: 50, status: 'pending' }],
  household: {
    home_projects: [{ id: 'pr1', user_id: 'altro', home_id: 'casa-1', title: 'Bagno' }],
    home_project_photos: [{ id: 'ph1', project_id: 'pr1', document_id: D2, kind: 'before' }, { id: 'ph2', project_id: 'pr1', document_id: D3, kind: 'after' }],
    home_project_expenses: [{ id: 'e1', project_id: 'pr1', document_id: D3, amount: 10 }],
  } });

test('lo .zip contiene il JSON con l’elenco dei file e i file senza ricompressione; si rilegge uguale', () => {
  const files = { [zipPathFor({ id: D1, mime_type: 'application/pdf' })]: pdf('uno'), [zipPathFor({ id: D2, mime_type: 'image/jpeg' })]: strToU8('jpegbytes') };
  const manifest = [{ document_id: D1, path: `files/${D1}.pdf`, size: 13, sha256: null }, { document_id: D2, path: `files/${D2}.jpg`, size: 9, sha256: null }];
  const zip = buildBackupZip(bundle(), { files, manifest, missing: [D3] });
  assert.deepEqual([...zip.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  const { text, files: read } = readBackupBytes(zip);
  const json = JSON.parse(text);
  assert.deepEqual(json.files.map(f => f.document_id), [D1, D2]);
  assert.deepEqual(json.files_missing, [D3]);
  assert.equal(new TextDecoder().decode(read.get(D1)), '%PDF-1.4 uno');
  assert.equal(read.size, 2);
  // Senza ricompressione: i byte dei file compaiono così come sono dentro lo .zip.
  assert.ok(Buffer.from(zip).includes(Buffer.from('jpegbytes')));
});

test('lettura: .json semplice, .zip rifatto dal computer (cartella e compressione), file rovinati', () => {
  const plain = readBackupBytes(strToU8('{"format":"casa-in-ordine-backup","version":2}'));
  assert.equal(plain.files.size, 0);
  assert.match(plain.text, /casa-in-ordine-backup/);
  // Cartella compressa a mano: JSON dentro una cartella, file compressi, niente elenco nel JSON.
  const rezipped = zipSync({ 'backup/': new Uint8Array(0), [`backup/${ZIP_JSON}`]: strToU8(JSON.stringify(bundle())), [`backup/files/${D1}.pdf`]: [pdf('uno'), { level: 9 }],
    '__MACOSX/backup/._x.json': strToU8('x') });
  const read = readBackupBytes(rezipped);
  assert.equal(JSON.parse(read.text).format, 'casa-in-ordine-backup');
  assert.deepEqual([...read.files.keys()], [D1]);
  assert.throws(() => readBackupBytes(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3])), e => e instanceof RestoreFileError && e.message === 'badZip');
  assert.throws(() => readBackupBytes(zipSync({ 'a.txt': strToU8('x'), 'b.txt': strToU8('y') })), e => e.message === 'notBackup');
});

test('scaricamento dei file: un file che non arriva non ferma il backup', async () => {
  const bucket = { async download(path) {
    if (path.includes('rotto')) return { data: null, error: { message: 'not found' } };
    return { data: new Blob([pdf(path)]), error: null };
  } };
  const docs = [{ id: D1, storage_path: 'u/1.pdf', mime_type: 'application/pdf', sha256: 'aa' }, { id: D2, storage_path: 'u/rotto.jpg', mime_type: 'image/jpeg' }, { id: D3, storage_path: null }];
  const progress = [];
  const out = await collectDocumentFiles(bucket, docs, { concurrency: 2, onProgress: p => progress.push(p.done) });
  assert.deepEqual(Object.keys(out.files), [`files/${D1}.pdf`]);
  assert.deepEqual(out.manifest, [{ document_id: D1, path: `files/${D1}.pdf`, size: 16, sha256: 'aa' }]);
  assert.deepEqual(out.missing, [D2]);
  assert.deepEqual(progress.sort(), [1, 2]);
  assert.equal(filesSize([{ storage_path: 'a', file_size: 10 }, { storage_path: null, file_size: 99 }, { storage_path: 'b', file_size: '5' }]), 15);
});

test('elenco completo dei documenti dello spazio, a pagine', async () => {
  const all = Array.from({ length: 2500 }, (_, i) => ({ id: `d${i}` }));
  const filters = [];
  const query = { eq(c, v) { filters.push([c, v]); return query; }, is(c, v) { filters.push([c, v]); return query; }, order() { return query; },
    range: async (from, to) => ({ data: all.slice(from, to + 1), error: null }) };
  const client = { from: () => ({ select: () => query }) };
  assert.equal((await listSpaceDocuments(client, { homeId: 'casa-1', userId: ME })).length, 2500);
  assert.deepEqual(filters[0], ['home_id', 'casa-1']);
  filters.length = 0;
  await listSpaceDocuments(client, { homeId: null, userId: ME });
  assert.deepEqual(filters.slice(0, 2), [['home_id', null], ['user_id', ME]], 'nello spazio personale solo i propri');
});

test('piano: documenti con il file si ripristinano, gli altri no; i collegamenti seguono', () => {
  const backup = { ...readBackup(JSON.stringify(bundle())), files: new Map([[D1, pdf('uno')], [D2, strToU8('jpegbytes')]]) };
  const plan = restorePlan(backup, { homeId: 'casa-1', userId: ME });
  const step = plan.steps.find(s => s.table === 'home_documents');
  assert.deepEqual(step.rows.map(r => r.id), [D1, D2]);
  assert.equal(step.files.length, 2);
  const doc = step.rows[0];
  assert.deepEqual([doc.user_id, doc.home_id, 'former_user_id' in doc, 'storage_path' in doc], [ME, 'casa-1', false, false]);
  const rows = Object.fromEntries(plan.steps.map(s => [s.table, s.rows]));
  assert.equal(rows.payment_receipts[0].document_id, D1, 'il documento torna: il collegamento resta');
  assert.equal(rows.home_project_expenses[0].document_id, null, 'documento senza file: collegamento tolto');
  assert.deepEqual(rows.home_project_photos.map(p => p.id), ['ph1'], 'la foto senza file resta fuori');
  assert.equal(plan.skipped.files, 2, 'un documento e una foto senza file');
  assert.ok(RESTORE_ORDER.indexOf('home_documents') > RESTORE_ORDER.indexOf('bills'));
  for (const t of ['payment_receipts', 'maintenance_events', 'home_contracts', 'home_inventory_items', 'home_project_quotes', 'home_project_expenses', 'home_project_photos'])
    assert.ok(RESTORE_ORDER.indexOf('home_documents') < RESTORE_ORDER.indexOf(t), `documenti prima di ${t}`);
  assert.ok(RESTORE_ORDER.indexOf('home_projects') < RESTORE_ORDER.indexOf('home_project_photos'));
  // Spazio diverso: identificativi nuovi anche per documenti e foto, collegamenti coerenti.
  let n = 0;
  const copy = restorePlan(backup, { homeId: 'casa-2', userId: ME }, { makeId: () => `nuovo-${++n}` });
  const c = Object.fromEntries(copy.steps.map(s => [s.table, s.rows]));
  assert.notEqual(c.home_documents[0].id, D1);
  assert.equal(c.payment_receipts[0].document_id, c.home_documents[0].id);
  assert.equal(c.home_documents[0].bill_id, c.bills[0].id);
  assert.equal(c.home_project_photos[0].document_id, c.home_documents[1].id);
  // Backup JSON (senza file) nello stesso spazio: i documenti ancora presenti restano collegati.
  const json = restorePlan(readBackup(JSON.stringify(bundle())), { homeId: 'casa-1', userId: ME }, { existingDocuments: [D3] });
  const j = Object.fromEntries(json.steps.map(s => [s.table, s.rows]));
  assert.equal(j.home_documents, undefined);
  assert.equal(j.home_project_expenses[0].document_id, D3);
  assert.equal(j.payment_receipts[0].document_id, null);
  assert.deepEqual(j.home_project_photos.map(p => p.id), ['ph2']);
});

test('documenti ancora presenti: solo nello stesso spazio', async () => {
  const client = { from: () => ({ select: () => ({ in: async (_c, ids) => ({ data: ids.filter(id => id === D3).map(id => ({ id })), error: null }) }) }) };
  const backup = readBackup(JSON.stringify(bundle()));
  assert.deepEqual(await existingDocumentIds(client, backup, { homeId: 'casa-1', userId: ME }), [D3]);
  assert.deepEqual(await existingDocumentIds(client, backup, { homeId: 'casa-2', userId: ME }), []);
});

// Client finto per il ripristino dei documenti: tabelle in memoria, bucket, spazio usato.
function fakeClient({ docs = [], usedBytes = 0, uploadFails = () => false, insertFails = () => null } = {}) {
  const state = { docs: [...docs], uploads: [], removed: [], upserts: {} };
  const client = { state,
    rpc: async name => ({ data: name === 'v36_my_storage_used' ? usedBytes : null, error: null }),
    storage: { from: bucket => ({
      upload: async (path, blob, options) => {
        if (bucket !== 'house-documents' || !(blob instanceof Blob) || options.upsert !== false) throw new Error('upload sbagliato');
        if (uploadFails(path, state.uploads.length)) return { data: null, error: { message: 'new row violates row-level security policy', statusCode: '403' } };
        state.uploads.push(path); return { data: { path }, error: null };
      },
      remove: async paths => { state.removed.push(...paths); return { error: null }; },
    }) },
    from(table) {
      if (table === 'home_documents') {
        const filters = [];
        const q = { select() { return q; }, in(col, vals) { filters.push(['in', col, vals]); return q; }, eq(col, v) { filters.push(['eq', col, v]); return q; }, is(col, v) { filters.push(['eq', col, v]); return q; },
          then(resolve) {
            const data = state.docs.filter(d => filters.every(([, col, v]) => (Array.isArray(v) ? v.includes(d[col]) : d[col] === v)));
            resolve({ data: data.map(d => ({ id: d.id, sha256: d.sha256 })), error: null });
          },
          insert(row) { return { select: async () => {
            const error = insertFails(row);
            if (error) return { data: null, error };
            state.docs.push(row); return { data: [{ id: row.id }], error: null };
          } }; } };
        return q;
      }
      return { upsert(rows) { return { select: async () => { (state.upserts[table] ||= []).push(...rows); return { data: rows.map(r => ({ id: r.id })), error: null }; } }; } };
    } };
  return client;
}

test('ripristino dei documenti: ricarica il file, riconosce i doppioni, ricollega le voci', async () => {
  const same = strToU8('stesso file');
  const plan = { target: { homeId: 'casa-1', userId: ME }, steps: [
    { table: 'home_documents', rows: [
      { id: 'gia-qui', mime_type: 'application/pdf', name: 'a.pdf' },
      { id: 'doppione', mime_type: 'application/pdf', name: 'b.pdf' },
      { id: 'nuovo', mime_type: 'image/png', name: 'c.png', sha256: 'falso', file_size: 1 },
      { id: 'rifiutato', mime_type: 'application/pdf', name: 'd.pdf' },
    ], files: [pdf('a'), same, strToU8('png'), pdf('d')] },
    { table: 'payment_receipts', rows: [{ id: 'r1', document_id: 'doppione' }, { id: 'r2', document_id: 'rifiutato' }, { id: 'r3', document_id: 'nuovo' }] },
    { table: 'home_project_photos', rows: [{ id: 'ph1', document_id: 'nuovo' }, { id: 'ph2', document_id: 'rifiutato' }] },
  ] };
  const client = fakeClient({ docs: [{ id: 'gia-qui', home_id: 'casa-1' }, { id: 'esistente', home_id: 'casa-1', sha256: await sha256Hex(same) }],
    insertFails: row => (row.id === 'rifiutato' ? { code: '23514', message: 'check' } : null) });
  const result = await runRestore(client, plan);
  assert.deepEqual(result.home_documents, { added: 1, present: 2, failed: 1 });
  assert.equal(client.state.uploads.length, 2, 'si caricano solo i due file che mancano');
  assert.ok(client.state.uploads.every(p => p.startsWith(`${ME}/`)), 'nella cartella di chi ripristina');
  assert.match(client.state.uploads[0], /\.png$/);
  assert.deepEqual(client.state.removed, [client.state.uploads[1]], 'il file della riga rifiutata si toglie');
  const saved = client.state.docs.find(d => d.id === 'nuovo');
  assert.equal(saved.sha256, await sha256Hex(strToU8('png')), 'impronta ricalcolata dai byte');
  assert.equal(saved.file_size, 3);
  assert.deepEqual(client.state.upserts.payment_receipts.map(r => r.document_id), ['esistente', null, 'nuovo']);
  assert.deepEqual(client.state.upserts.home_project_photos.map(r => r.id), ['ph1']);
  assert.deepEqual(result.home_project_photos, { added: 1, present: 0, failed: 1 });
});

test('spazio per i documenti pieno: si smette di caricare e lo si dice', async () => {
  const rows = ['a', 'b', 'c'].map(id => ({ id, mime_type: 'application/pdf', name: `${id}.pdf` }));
  const plan = { target: { homeId: null, userId: ME }, steps: [{ table: 'home_documents', rows, files: rows.map(r => pdf(r.id)) }] };
  const client = fakeClient({ usedBytes: 200 * 1024 * 1024, uploadFails: (_p, n) => n >= 1 });
  const result = await runRestore(client, plan);
  assert.deepEqual(result.home_documents, { added: 1, present: 0, failed: 2, quotaFull: true });
  assert.equal(client.state.uploads.length, 1, 'dopo il primo rifiuto non si riprova');
});

test('pannelli e testi: pulsante .zip, lettura .zip nel ripristino, 6 lingue', () => {
  const extra = readFileSync(new URL('../app/HomeExtra.jsx', import.meta.url), 'utf8');
  assert.match(extra, /exportData\('zip'\)/);
  assert.match(extra, /await import\('\.\.\/lib\/backup-files\.mjs'\)/, 'la libreria .zip si carica solo quando serve');
  assert.doesNotMatch(extra, /^import .*backup-files/m);
  const panel = readFileSync(new URL('../app/BackupRestore.jsx', import.meta.url), 'utf8');
  assert.match(panel, /accept="application\/json,\.json,application\/zip,\.zip"/);
  assert.match(panel, /await import\('\.\.\/lib\/backup-files\.mjs'\)/);
  for (const [lang, d] of Object.entries(TRANSLATIONS)) {
    for (const key of ['extra.backup.zip', 'extra.backup.zipProgress', 'extra.backup.zipLarge', 'extra.backup.zipTooBig', 'extra.backup.zipDone', 'extra.backup.zipMissing',
      'extra.backup.zipNotice', 'extra.backup.zipNotIncluded', 'extra.restore.error.tooBigZip', 'extra.restore.error.badZip', 'extra.restore.quotaFull'])
      assert.ok(d[key], `${key} in ${lang}`);
    assert.match(d['extra.backup.zipProgress'], /\{done\}.*\{total\}/);
  }
  assert.doesNotMatch(TRANSLATIONS.it['extra.backup.caution'], /non contiene i file/);
});


test('ZIP con espansione eccessiva o dimensione ZIP64 non attendibile: rifiutato prima di allocare', () => {
  const oversized = zipSync({ 'files/grande.pdf': [new Uint8Array(21 * 1024 * 1024), { level: 9 }] });
  assert.ok(oversized.length < 100_000, 'la ZIP bomb è molto compressa');
  assert.throws(() => readBackupBytes(oversized), e => e instanceof RestoreFileError && e.message === 'badZip');
  const normal = zipSync({ [ZIP_JSON]: strToU8(JSON.stringify(bundle())) });
  const forged = new Uint8Array(normal);
  let central = -1;
  for (let i = 0; i < forged.length - 46; i++)
    if (forged[i] === 0x50 && forged[i + 1] === 0x4b && forged[i + 2] === 0x01 && forged[i + 3] === 0x02) { central = i; break; }
  assert.ok(central >= 0);
  forged.fill(0xff, central + 24, central + 28); // taglia dichiarata: 4 GiB
  assert.throws(() => readBackupBytes(forged), e => e instanceof RestoreFileError && e.message === 'badZip');
});

// Foto e diario delle piante (scelta dell'utente del 25 novembre 2026, sera): note di diario nel
// registro, foto nel backup e nel ripristino (solo con il loro file).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TASK_KINDS, LOG_KINDS, GARDEN_LIMITS, normalizeLog } from '../lib/garden.mjs';
import { NEEDS_DOCUMENT, prepareRows, RESTORE_ORDER, RESTORE_SECTIONS } from '../lib/backup-restore.mjs';
import { BACKUP_TABLES } from '../lib/backup-tables.mjs';
import { translate } from '../lib/i18n.mjs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('note di diario: tipo del registro accettato dalla v59, non dalle voci del piano', () => {
  assert.deepEqual(LOG_KINDS.filter(k => !TASK_KINDS.includes(k)), ['note']);
  const sql = read('supabase/migrate_v59_animali_foto_meteo_730.sql');
  assert.match(sql, /home_garden_log_kind_check[\s\S]*'note'/);
  assert.equal(normalizeLog({ title: 'Foglie gialle', kind: 'note', done_on: '2026-11-20' }, '2026-11-25').value.kind, 'note');
  for (const lang of ['it', 'en', 'es', 'fr', 'de', 'pt']) assert.notEqual(translate(lang, 'garden.kind.note'), 'garden.kind.note', lang);
});

test('limiti delle foto uguali a quelli del database', () => {
  const sql = read('supabase/migrate_v59_animali_foto_meteo_730.sql');
  assert.match(sql, new RegExp(`char_length\\(caption\\) <= ${GARDEN_LIMITS.caption}`));
  assert.match(sql, new RegExp(`>= ${GARDEN_LIMITS.photosPerPlant} then\\s+raise exception 'Questa pianta`));
});

test('backup e ripristino: le foto tornano solo con il loro file, legate alla pianta e alla nota giuste', () => {
  assert.ok(BACKUP_TABLES.some(t => t.name === 'home_garden_photos' && t.parent === 'home_garden_plants'));
  assert.ok(NEEDS_DOCUMENT.includes('home_garden_photos'));
  assert.equal(RESTORE_SECTIONS.home_garden_photos, 'garden');
  assert.ok(RESTORE_ORDER.indexOf('home_documents') < RESTORE_ORDER.indexOf('home_garden_photos'));
  assert.ok(RESTORE_ORDER.indexOf('home_garden_log') < RESTORE_ORDER.indexOf('home_garden_photos'));
  const ids = { home_garden_plants: { p1: 'P1' }, home_garden_log: { l1: 'L1' }, home_documents: { d1: 'D1' }, home_garden_photos: { f1: 'F1' } };
  const rows = prepareRows('home_garden_photos', [
    { id: 'f1', plant_id: 'p1', log_id: 'l1', document_id: 'd1', caption: 'Prima', taken_on: '2026-05-01', created_by: 'old', home_id: 'x' },
    { id: 'f2', plant_id: 'p1', log_id: null, document_id: 'd9', caption: 'Senza file', taken_on: '2026-05-02' },
  ], { homeId: 'h2', userId: 'me', ids, documents: new Set(['D1']) });
  assert.deepEqual([rows[0].id, rows[0].plant_id, rows[0].log_id, rows[0].document_id, rows[0].created_by, 'home_id' in rows[0]], ['F1', 'P1', 'L1', 'D1', 'me', false]);
  assert.equal(rows[1].document_id, null, 'senza file il collegamento si toglie (e il ripristino salta la foto)');
});

test('la schermata: foto solo con la v59, nell\'archivio dello spazio, eliminata con il file', () => {
  const source = read('app/Garden.jsx');
  assert.match(source, /from\('home_garden_photos'\)/);
  assert.match(source, /if \(pics\.error\) \{ setPhotosOn\(false\)/);
  assert.match(source, /uploadHouseDocument\(client, \{ file, userId: user\.id, homeId: homeId \|\| null/);
  assert.match(source, /storage\.from\('house-documents'\)\.remove/);
  assert.match(source, /preparePhoto\(picked\)/);
});

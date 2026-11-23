// Fase 2 · 3.3 — progetti e lavori: scheda, fasi, preventivi, spese, foto prima/dopo e fornitori.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PROJECT_STATUSES, QUOTE_STATUSES, PHOTO_KINDS, normalizeProject, normalizePhase, normalizeQuote, normalizeExpense, projectSummary, sortPhases, photosByKind } from '../lib/projects.mjs';
import { validDocument, IMAGE_MIME_TYPES, MAX_DOCUMENT_BYTES } from '../lib/document-upload.mjs';
import { MESSAGE_KEYS } from '../lib/i18n.mjs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('Scheda del progetto: titolo, stato noto, budget e date coerenti', () => {
  assert.deepEqual(normalizeProject({ title: ' Bagno  nuovo ', status: 'in_progress', budget: '8000,50', start_on: '2027-01-10', end_on: '2027-03-01', notes: ' Piastrelle grigie ' }).value,
    { title: 'Bagno nuovo', status: 'in_progress', budget: 8000.5, start_on: '2027-01-10', end_on: '2027-03-01', notes: 'Piastrelle grigie' });
  assert.equal(normalizeProject({ title: 'Bagno', status: 'boh', budget: '' }).value.status, 'planning');
  assert.equal(normalizeProject({ title: 'Bagno', budget: '' }).value.budget, null);
  assert.equal(normalizeProject({ title: 'B' }).error, 'project.error.title');
  assert.equal(normalizeProject({ title: 'Bagno', budget: -1 }).error, 'project.error.amount');
  assert.equal(normalizeProject({ title: 'Bagno', start_on: '2027-03-01', end_on: '2027-01-01' }).error, 'project.error.dates');
});

test('Fasi, preventivi e spese: controlli', () => {
  assert.deepEqual(normalizePhase({ title: 'Demolizione', due_on: 'domani' }).value, { title: 'Demolizione', due_on: null });
  assert.equal(normalizePhase({ title: 'D' }).error, 'project.error.phase');
  assert.equal(normalizeQuote({ amount: 100 }).error, 'project.error.supplier', 'serve un professionista o un nome');
  assert.equal(normalizeQuote({ professional_id: 'p1', amount: 7200 }).value.professional_id, 'p1');
  assert.equal(normalizeQuote({ supplier: 'Bagni Srl', amount: '' }).error, 'project.error.amount');
  assert.equal(normalizeQuote({ supplier: 'Bagni Srl', amount: 100, status: 'forse' }).value.status, 'pending');
  assert.equal(normalizeExpense({ description: 'Acconto', amount: 2000, paid_on: '' }).error, 'project.error.date');
  assert.deepEqual(normalizeExpense({ description: 'Acconto', amount: '2000', paid_on: '2027-01-12', quote_id: 'q1' }).value, { description: 'Acconto', amount: 2000, paid_on: '2027-01-12', quote_id: 'q1' });
});

test('Conti e avanzamento del progetto', () => {
  const data = {
    phases: [{ id: 'f2', title: 'Impianti', position: 1, done_at: null }, { id: 'f1', title: 'Demolizione', position: 0, done_at: '2027-01-15T10:00:00Z' }, { id: 'f3', title: 'Piastrelle', position: 2, done_at: null }],
    quotes: [{ amount: 7200, status: 'accepted' }, { amount: 7900, status: 'rejected' }, { amount: 300, status: 'accepted' }],
    expenses: [{ amount: 2000 }, { amount: '450.5' }],
  };
  const s = projectSummary({ budget: 8000 }, data);
  assert.deepEqual({ done: s.phasesDone, total: s.phasesTotal, accepted: s.accepted, spent: s.spent, remaining: s.remaining, over: s.overBudget, next: s.nextPhase.id },
    { done: 1, total: 3, accepted: 7500, spent: 2450.5, remaining: 5549.5, over: false, next: 'f2' });
  assert.equal(projectSummary({ budget: 7000 }, data).overBudget, true, 'gli accettati superano il budget');
  assert.equal(projectSummary({ budget: null }, data).remaining, null);
  assert.deepEqual(sortPhases(data.phases).map(p => p.id), ['f1', 'f2', 'f3']);
  const photos = photosByKind([{ id: 'a', kind: 'after', created_at: '2' }, { id: 'b', kind: 'before', created_at: '1' }, { id: 'c', kind: 'strano' }]);
  assert.deepEqual(Object.keys(photos), PHOTO_KINDS);
  assert.deepEqual(photos.before.map(p => p.id), ['c', 'b']);
});

test('Foto: solo immagini fino a 10 MB', () => {
  assert.ok(validDocument({ type: 'image/jpeg', size: 1000 }, IMAGE_MIME_TYPES));
  assert.ok(!validDocument({ type: 'application/pdf', size: 1000 }, IMAGE_MIME_TYPES));
  assert.ok(!validDocument({ type: 'image/png', size: MAX_DOCUMENT_BYTES + 1 }, IMAGE_MIME_TYPES));
  assert.ok(!validDocument({ type: 'image/png', size: 0 }, IMAGE_MIME_TYPES));
});

test('Migrazione v47: voci legate al progetto, riferimenti dello stesso spazio, nuovi tipi di documento', () => {
  const sql = read('supabase/migrate_v47_progetti.sql');
  assert.match(sql, new RegExp(`status in \\(${PROJECT_STATUSES.map(s => `'${s}'`).join(',')}\\)`));
  assert.match(sql, new RegExp(`status in \\(${QUOTE_STATUSES.map(s => `'${s}'`).join(',')}\\)`));
  assert.match(sql, new RegExp(`kind in \\(${PHOTO_KINDS.map(s => `'${s}'`).join(',')}\\)`));
  assert.match(sql, /'altro','foto','preventivo'/);
  for (const table of ['phases', 'quotes', 'expenses', 'photos']) assert.match(sql, new RegExp(`idx_home_project_${table}_created_by on public\\.home_project_${table}\\(created_by\\)`), table);
  assert.match(sql, /create policy v47_read on public\.%I for select to authenticated using \(public\.v47_project_access\(project_id, false\)\)/);
  assert.match(sql, /created_by uuid default auth\.uid\(\) references auth\.users\(id\) on delete set null/);
  assert.match(sql, /raise exception 'Professionista non appartenente allo spazio'/);
  assert.match(sql, /raise exception 'Preventivo di un altro progetto'/);
  assert.doesNotMatch(sql.match(/grant update \(title, due_on, done_at, position\)/)[0], /project_id/);
  assert.match(read('README.md'), /migrate_v47_progetti\.sql/);
});

test('Collegamenti: menu, archivio condiviso, testi', () => {
  const page = read('app/page.jsx');
  assert.match(page, /\{id:'projects',icon:Hammer\}/);
  assert.match(page, /const Projects=lazy\(\(\)=>import\('\.\/Projects'\)\);/);
  // L'archivio, l'acquisizione unica e i progetti caricano i file con lo stesso codice.
  assert.match(read('app/HomeExtra.jsx'), /uploadHouseDocument\(client,\{file,userId:user\.id,homeId:homeId\|\|null,docType,notes,propertyId,billId,known:rows\.documents\}\)/);
  assert.match(read('app/Projects.jsx'), /uploadHouseDocument\(client, \{ file, userId: user\.id, homeId: homeId \|\| null, docType, notes: project\.title, types \}\)/);
  for (const key of [...PROJECT_STATUSES.map(s => 'project.status.' + s), ...QUOTE_STATUSES.map(s => 'project.quote.' + s), ...PHOTO_KINDS.map(k => 'project.photo.' + k),
    'nav.projects', 'project.help', 'project.overBudget', 'project.migration', 'project.error.supplier'])
    assert.ok(MESSAGE_KEYS.includes(key), key);
});

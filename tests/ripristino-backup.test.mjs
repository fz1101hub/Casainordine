import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RESTORE_ORDER, RESTORE_SKIPPED, RESTORE_SECTIONS, LINKS, readBackup, prepareRows, restorePlan, existingCounts, runRestore, previewBySection, restoreTotals, RestoreFileError } from '../lib/backup-restore.mjs';
import { BACKUP_MAIN, BACKUP_TABLES } from '../lib/backup-tables.mjs';
import { TRANSLATIONS } from '../lib/i18n.mjs';

const ME = 'me', H2 = 'casa-2';
const backup = (extra = {}) => ({ format: 'casa-in-ordine-backup', version: 2, exported_at: '2026-11-20T10:00:00Z', scope: { home_id: 'casa-1' },
  utilities: [{ id: 'u1', user_id: 'altro', home_id: 'casa-1', supplier: 'Enel', property_id: 'p1' }],
  properties: [{ id: 'p1', user_id: 'altro', home_id: 'casa-1', label: 'Appartamento' }],
  bills: [{ id: 'b1', user_id: 'altro', home_id: 'casa-1', utility_id: 'u1', property_id: 'p1', title: 'Luce', amount: 50, due_date: '2026-12-01' }],
  documents: [{ id: 'd1', name: 'bolletta.pdf' }],
  receipts: [{ id: 'r1', user_id: 'altro', home_id: 'casa-1', bill_id: 'b1', document_id: 'd1', confirmed_by: 'altro', amount: 50 }],
  household: {
    home_projects: [{ id: 'pr1', user_id: 'altro', home_id: 'casa-1', title: 'Bagno' }],
    home_project_quotes: [{ id: 'q1', project_id: 'pr1', created_by: 'altro', amount: 100 }],
    home_project_expenses: [{ id: 'e1', project_id: 'pr1', quote_id: 'q1', created_by: 'altro', amount: 10, document_id: 'd1' }],
    home_professional_notes: [{ professional_id: 'x', user_id: 'altro', note: 'sua' }, { professional_id: 'x', user_id: ME, note: 'mia' }],
    home_expenses: [{ id: 'sp1' }], home_leases: [{ id: 'l1' }], home_decision_votes: [{ decision_id: 'd', user_id: 'z' }],
    user_suppliers: [{ id: 's1', user_id: 'altro', name: 'Enel' }],
    ...extra,
  } });

test('ogni tabella del backup si ripristina o ha il motivo per cui no', () => {
  const all = [...BACKUP_MAIN, ...BACKUP_TABLES.map(t => t.name)];
  for (const table of all) assert.ok(RESTORE_ORDER.includes(table) || RESTORE_SKIPPED[table], table);
  for (const table of RESTORE_ORDER) { assert.ok(all.includes(table), `${table} è nel backup`); assert.ok(RESTORE_SECTIONS[table], `${table} ha una sezione`); }
  for (const reason of new Set(Object.values(RESTORE_SKIPPED))) for (const [lang, d] of Object.entries(TRANSLATIONS)) assert.ok(d['extra.restore.reason.' + reason], `${reason} in ${lang}`);
});

test('ordine: ogni voce dopo quelle a cui è collegata', () => {
  const parents = { utilities: ['home_properties'], bills: ['utilities', 'home_properties'], pagopa_notices: ['bills'], bill_security_reviews: ['bills'], payment_receipts: ['bills'],
    home_refund_expectations: ['bills'], maintenance_events: ['maintenance_assets', 'home_professionals'], home_professional_notes: ['home_professionals'],
    home_replacement_plans: ['maintenance_assets'], home_inventory_items: ['maintenance_assets', 'home_properties'], meter_readings: ['home_properties'],
    meter_reminders: ['home_properties'], home_contracts: ['home_properties'], home_project_phases: ['home_projects'], home_project_quotes: ['home_projects', 'home_professionals'],
    home_project_expenses: ['home_projects', 'home_project_quotes'], home_move_steps: ['home_move_plans'] };
  for (const [child, list] of Object.entries(parents)) for (const parent of list)
    assert.ok(RESTORE_ORDER.indexOf(parent) < RESTORE_ORDER.indexOf(child), `${parent} prima di ${child}`);
  for (const target of Object.values(LINKS)) assert.ok(RESTORE_ORDER.includes(target), target);
});

test('lettura del file: rifiuta ciò che non è un backup, legge i formati 1 e 2', () => {
  assert.throws(() => readBackup('{non json'), e => e instanceof RestoreFileError && e.message === 'notJson');
  assert.throws(() => readBackup('{"format":"altro","version":2}'), e => e.message === 'notBackup');
  assert.throws(() => readBackup('{"format":"casa-in-ordine-backup","version":9}'), e => e.message === 'notBackup');
  const v2 = readBackup(JSON.stringify(backup()));
  assert.deepEqual(Object.keys(v2.tables).sort().slice(0, 4), ['bills', 'home_decision_votes', 'home_documents', 'home_expenses']);
  const v1 = readBackup(JSON.stringify({ format: 'casa-in-ordine-backup', version: 1, bills: [{ id: 'x' }], household: { house_tasks: [{ id: 't' }] } }));
  assert.deepEqual(Object.keys(v1.tables).sort(), ['bills', 'house_tasks']);
});

test('righe pronte: diventano tue e della casa di destinazione, senza documenti né note altrui', () => {
  const [receipt] = prepareRows('payment_receipts', backup().receipts, { homeId: H2, userId: ME });
  assert.deepEqual([receipt.user_id, receipt.home_id, receipt.document_id, receipt.confirmed_by], [ME, H2, null, ME]);
  const [quote] = prepareRows('home_project_quotes', backup().household.home_project_quotes, { homeId: H2, userId: ME });
  assert.equal(quote.created_by, ME);
  assert.equal('home_id' in prepareRows('user_suppliers', [{ id: 's', user_id: 'x' }], { homeId: H2, userId: ME })[0], false, 'i fornitori sono personali');
  assert.deepEqual(prepareRows('home_professional_notes', backup().household.home_professional_notes, { homeId: H2, userId: ME }).map(n => n.note), ['mia']);
  assert.equal('storage_path' in prepareRows('house_tasks', [{ id: 't', storage_path: 'x' }], { homeId: null, userId: ME })[0], false);
});

test('stesso spazio: stessi identificativi; spazio diverso: identificativi nuovi e collegamenti coerenti', () => {
  let n = 0; const makeId = () => `nuovo-${++n}`;
  const same = restorePlan(readBackup(JSON.stringify(backup())), { homeId: 'casa-1', userId: ME }, { makeId });
  assert.equal(same.copy, false);
  assert.equal(same.steps.find(s => s.table === 'bills').rows[0].id, 'b1');
  const copy = restorePlan(readBackup(JSON.stringify(backup())), { homeId: H2, userId: ME }, { makeId });
  assert.equal(copy.copy, true);
  const rows = Object.fromEntries(copy.steps.map(s => [s.table, s.rows]));
  const bill = rows.bills[0], utility = rows.utilities[0], property = rows.home_properties[0];
  assert.notEqual(bill.id, 'b1');
  assert.equal(bill.utility_id, utility.id);
  assert.equal(bill.property_id, property.id);
  assert.equal(rows.payment_receipts[0].bill_id, bill.id);
  assert.equal(rows.home_project_expenses[0].quote_id, rows.home_project_quotes[0].id);
  assert.equal(rows.home_project_expenses[0].project_id, rows.home_projects[0].id);
  assert.deepEqual(copy.skipped, { files: 1, appOnly: 1, twoParties: 1, otherPeople: 1 });
  assert.deepEqual(copy.steps.map(s => s.table), RESTORE_ORDER.filter(t => rows[t]));
});

function fakeClient({ existing = {}, failing = new Set(), unique = new Set() } = {}) {
  const calls = [];
  return { calls, from(table) {
    return {
      select(column) { return { in: async (col, ids) => { calls.push(['select', table, ids.length]); return { data: ids.filter(id => (existing[table] || []).includes(id)).map(id => ({ [col]: id })), error: null }; } }; },
      upsert(rows, options) {
        calls.push(['upsert', table, rows.length, options.onConflict, options.ignoreDuplicates]);
        return { select: async () => {
          if (rows.some(r => failing.has(r.id))) return rows.length === 1 && unique.has(rows[0].id) ? { data: null, error: { code: '23505' } } : { data: null, error: { code: '23503', message: 'collegamento' } };
          const fresh = rows.filter(r => !(existing[table] || []).includes(r.id));
          (existing[table] ||= []).push(...fresh.map(r => r.id));
          return { data: fresh.map(r => ({ id: r.id })), error: null };
        } };
      },
    };
  } };
}

test('ripristino: aggiunge ciò che manca, isola le righe rifiutate, segnala i progressi', async () => {
  const plan = { copy: false, steps: [{ table: 'house_tasks', rows: Array.from({ length: 250 }, (_, i) => ({ id: `t${i}` })) }, { table: 'home_replacement_plans', rows: [{ asset_id: 'a1' }] }] };
  const client = fakeClient({ existing: { house_tasks: ['t0', 't1'] }, failing: new Set(['t5', 't6']), unique: new Set(['t6']) });
  const progress = [];
  const result = await runRestore(client, plan, { onProgress: p => progress.push(p.done) });
  assert.deepEqual(result.house_tasks, { added: 246, present: 3, failed: 1 }, '250 = 246 nuove + 2 già presenti + 1 doppione (23505) + 1 rifiutata');
  assert.deepEqual(progress, [1, 2]);
  assert.ok(client.calls.some(c => c[0] === 'upsert' && c[1] === 'home_replacement_plans' && c[3] === 'asset_id' && c[4] === true), 'conflitto sulla chiave giusta, senza sovrascrivere');
  assert.deepEqual(restoreTotals(result), { added: 247, present: 3, failed: 1 });
  const again = await runRestore(fakeClient({ existing: { house_tasks: plan.steps[0].rows.map(r => r.id) } }), { steps: [plan.steps[0]] });
  assert.deepEqual(again.house_tasks, { added: 0, present: 250, failed: 0 }, 'un secondo ripristino non aggiunge niente');
});

test('anteprima: per sezione dell’app, con quante voci ci sono già', async () => {
  const plan = restorePlan(readBackup(JSON.stringify(backup())), { homeId: 'casa-1', userId: ME });
  const client = fakeClient({ existing: { bills: ['b1'] } });
  const existing = await existingCounts(client, plan);
  assert.equal(existing.bills, 1);
  const rows = previewBySection(plan, existing);
  assert.deepEqual(rows.find(r => r.section === 'bills'), { section: 'bills', total: 1, present: 1 });
  assert.deepEqual(rows.find(r => r.section === 'projects'), { section: 'projects', total: 3, present: 0 });
  assert.deepEqual(await existingCounts(client, { copy: true, steps: plan.steps }), {}, 'con identificativi nuovi non si legge niente');
});

test('pannello nella sezione backup, testi nelle 6 lingue', () => {
  const extra = readFileSync(new URL('../app/HomeExtra.jsx', import.meta.url), 'utf8');
  assert.match(extra, /<BackupRestore client=\{client\} user=\{user\} homeId=\{homeId\} canWrite=\{canWrite\}/);
  const panel = readFileSync(new URL('../app/BackupRestore.jsx', import.meta.url), 'utf8');
  assert.match(panel, /disabled=\{!canWrite \|\| busy\}/);
  assert.match(panel, /MAX_BYTES = 20 \* 1024 \* 1024/);
  for (const [lang, d] of Object.entries(TRANSLATIONS)) {
    for (const key of ['button', 'title', 'intro', 'otherSpace', 'row', 'confirm', 'done', 'nothing', 'error.notJson', 'error.notBackup', 'error.tooBig', 'failed', 'readOnly'])
      assert.ok(d['extra.restore.' + key], `extra.restore.${key} in ${lang}`);
  }
  assert.doesNotMatch(TRANSLATIONS.it['extra.backup.caution'], /non sono ancora disponibili/);
});

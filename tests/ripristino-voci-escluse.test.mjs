// Ripristino delle voci escluse (scelta dell'utente, 23 novembre 2026): spese divise e scadenze
// dell'auto passano dalle funzioni dell'app; voci solo-casa, ex membri e ricevute confermate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RESTORE_ORDER, HOME_ONLY, SKIP_REASONS, expenseRows, readBackup, restorePlan, runRestore } from '../lib/backup-restore.mjs';
import { TRANSLATIONS } from '../lib/i18n.mjs';

const ME = 'me', ANNA = 'anna', LUCA = 'luca', EX = 'ex';
const bundle = () => ({ format: 'casa-in-ordine-backup', version: 2, exported_at: '2026-11-20T10:00:00Z', scope: { home_id: 'casa-1' },
  bills: [{ id: 'b1', user_id: ANNA, home_id: 'casa-1', utility_id: 'u1', title: 'Bollo · Panda', amount: 180, due_date: '2026-05-01', paid_at: '2026-04-20T00:00:00Z' }],
  utilities: [{ id: 'u1', user_id: ANNA, home_id: 'casa-1', supplier: 'Panda · Bollo', category: 'Auto' }],
  receipts: [{ id: 'r1', user_id: ANNA, home_id: 'casa-1', bill_id: 'b1', amount: 180, status: 'confirmed', confirmed_by: ANNA, confirmed_at: '2026-04-21T00:00:00Z' },
    { id: 'r2', user_id: ANNA, home_id: 'casa-1', bill_id: 'b1', amount: 180, status: 'pending' }],
  household: {
    home_vehicles: [{ id: 'v1', home_id: 'casa-1', name: 'Panda' }],
    home_vehicle_deadlines: [{ id: 'dl1', home_id: 'casa-1', vehicle_id: 'v1', bill_id: 'b1', utility_id: 'u1', label: 'Bollo', due_date: '2026-05-01', repeat_months: 12 }],
    home_shopping: [{ id: 's1', home_id: 'casa-1', title: 'Pane' }],
    home_budgets: [{ id: 'bu1', home_id: 'casa-1', month: '2026-11-01', amount: 500 }],
    home_expenses: [
      { id: 'e1', home_id: 'casa-1', created_by: ANNA, paid_by: ANNA, title: 'Spesa', category: 'Spesa alimentare', amount: 10.01, incurred_on: '2026-11-02' },
      { id: 'e2', home_id: 'casa-1', created_by: EX, paid_by: EX, title: 'Pizza', category: null, amount: 30, incurred_on: '2026-11-03' },
      { id: 'e3', home_id: 'casa-1', created_by: ANNA, paid_by: ANNA, title: 'Senza quote', amount: 5, incurred_on: '2026-11-04' },
    ],
    home_expense_shares: [
      { expense_id: 'e1', user_id: LUCA, amount: 5.00 }, { expense_id: 'e1', user_id: ANNA, amount: 5.01 },
      { expense_id: 'e2', user_id: EX, amount: 15 }, { expense_id: 'e2', user_id: ANNA, amount: 15 },
    ],
  } });

// Come add_home_expense divide i centesimi: uguali, con un centesimo in più ai primi.
const split = (cents, members) => members.map((m, i) => [m, Math.floor(cents / members.length) + (i < cents % members.length ? 1 : 0)]);

test('spese: righe per add_home_expense che rifanno quote identiche', () => {
  const rows = expenseRows(bundle().household.home_expenses, bundle().household.home_expense_shares);
  assert.deepEqual(rows.map(r => r.id), ['e1', 'e2'], 'la spesa senza quote non si può rifare');
  const [e1, e2] = rows;
  assert.deepEqual([e1.cents, e1.payer, e1.date, e1.category], [1001, ANNA, '2026-11-02', 'Spesa alimentare']);
  assert.deepEqual(split(e1.cents, e1.members), [[ANNA, 501], [LUCA, 500]], 'chi aveva il centesimo in più lo riceve di nuovo');
  assert.equal(e2.category, 'Altro', 'categoria mancante: «Altro», che add_home_expense accetta');
});

test('piano in una casa: spese con ex membri fuori, ricevute confermate fuori, scadenze collegate', () => {
  const plan = restorePlan(readBackup(JSON.stringify(bundle())), { homeId: 'casa-1', userId: ME }, { members: [ME, ANNA, LUCA] });
  const steps = Object.fromEntries(plan.steps.map(s => [s.table, s.rows]));
  assert.deepEqual(steps.home_expenses.map(e => e.id), ['e1']);
  assert.deepEqual(plan.skipped, { formerMembers: 1, unknown: 1, confirmedReceipts: 1 });
  assert.deepEqual(steps.payment_receipts.map(r => r.id), ['r2']);
  assert.deepEqual(steps.home_vehicle_deadlines, [{ id: 'dl1', home_id: 'casa-1', vehicle_id: 'v1', bill_id: 'b1', utility_id: 'u1', label: 'Bollo', due_date: '2026-05-01', repeat_months: 12 }]);
  assert.equal(steps.bills[0].paid_at, '2026-04-20T00:00:00Z', 'la bolletta torna pagata');
  for (const [parent, child] of [['bills', 'home_vehicle_deadlines'], ['utilities', 'home_vehicle_deadlines'], ['home_vehicles', 'home_vehicle_deadlines']])
    assert.ok(RESTORE_ORDER.indexOf(parent) < RESTORE_ORDER.indexOf(child), `${parent} prima di ${child}`);
  // In un'altra casa la scadenza segue i nuovi identificativi di auto, bolletta e utenza.
  let n = 0;
  const copy = restorePlan(readBackup(JSON.stringify(bundle())), { homeId: 'casa-2', userId: ME }, { makeId: () => `nuovo-${++n}`, members: [ME, ANNA, LUCA] });
  const c = Object.fromEntries(copy.steps.map(s => [s.table, s.rows]));
  const d = c.home_vehicle_deadlines[0];
  assert.deepEqual([d.vehicle_id, d.bill_id, d.utility_id, d.home_id], [c.home_vehicles[0].id, c.bills[0].id, c.utilities[0].id, 'casa-2']);
});

test('nello spazio personale: niente voci che esistono solo in una casa', () => {
  const plan = restorePlan(readBackup(JSON.stringify(bundle())), { homeId: null, userId: ME });
  const tables = plan.steps.map(s => s.table);
  for (const t of HOME_ONLY) assert.ok(!tables.includes(t), t);
  assert.equal(plan.skipped.homeOnly, 1 + 1 + 1 + 3 + 1, 'auto, scadenza, spesa, tre spese divise, budget');
  assert.ok(tables.includes('bills') && tables.includes('utilities'));
});

function fakeClient({ expenses = [], rpc = () => ({ data: null, error: null }) } = {}) {
  const calls = [];
  return { calls,
    rpc: async (name, args) => { calls.push([name, args]); return rpc(name, args, calls.length); },
    from(table) {
      const filters = [];
      const q = { select() { return q; }, eq(c, v) { filters.push([c, [v]]); return q; }, in(c, v) { filters.push([c, v]); return q; },
        then(resolve) { resolve({ data: table === 'home_expenses' ? expenses.filter(e => filters.every(([c, v]) => v.includes(e[c]))) : [], error: null }); } };
      return q;
    } };
}

test('ripristino delle spese: già presenti per identificativo o per contenuto, le altre con add_home_expense', async () => {
  const rows = [
    { id: 'gia', title: 'A', category: 'Casa', cents: 100, date: '2026-11-01', payer: ANNA, members: [ANNA] },
    { id: 'altra-copia', title: 'Spesa', category: 'Casa', cents: 1001, date: '2026-11-02', payer: ANNA, members: [ANNA, LUCA] },
    { id: 'nuova', title: 'Gas', category: 'Casa', cents: 4000, date: '2026-11-05', payer: LUCA, members: [LUCA, ANNA] },
    { id: 'rifiutata', title: 'Gas', category: 'Casa', cents: 1, date: '2026-11-05', payer: LUCA, members: [LUCA] },
  ];
  const client = fakeClient({ expenses: [
    { id: 'gia', home_id: 'casa-1', paid_by: ANNA, title: 'A', amount: 1, incurred_on: '2026-11-01' },
    { id: 'diversa', home_id: 'casa-1', paid_by: ANNA, title: 'Spesa', amount: 10.01, incurred_on: '2026-11-02' },
    { id: 'altra-casa', home_id: 'casa-9', paid_by: LUCA, title: 'Gas', amount: 40, incurred_on: '2026-11-05' },
  ], rpc: (_n, args) => (args.expense_cents === 1 ? { data: null, error: { code: 'P0001', message: 'Spesa non valida' } } : { data: 'id', error: null }) });
  const result = await runRestore(client, { target: { homeId: 'casa-1', userId: ME }, steps: [{ table: 'home_expenses', rows }] });
  assert.deepEqual(result.home_expenses, { added: 1, present: 2, failed: 1 });
  assert.deepEqual(client.calls[0], ['add_home_expense', { target_home: 'casa-1', expense_title: 'Gas', expense_category: 'Casa', expense_cents: 4000,
    expense_date: '2026-11-05', payer: LUCA, split_members: [LUCA, ANNA] }]);
  const missing = await runRestore(fakeClient({ rpc: () => ({ data: null, error: { code: 'PGRST202' } }) }), { target: { homeId: 'casa-1' }, steps: [{ table: 'home_expenses', rows: [rows[2]] }] });
  assert.deepEqual(missing.home_expenses, { added: 0, present: 0, failed: 1, needsUpdate: true });
});

test('ripristino delle scadenze: collegate a bolletta e utenza, senza collegamento se non ci sono, aggiornamento v52 mancante', async () => {
  const rows = [
    { id: 'nuova', vehicle_id: 'v1', bill_id: 'b1', utility_id: 'u1', label: 'Bollo', due_date: '2026-05-01', repeat_months: 12 },
    { id: 'gia', vehicle_id: 'v1', bill_id: null, utility_id: null, label: 'Revisione', due_date: '2026-09-01', repeat_months: 24 },
    { id: 'senza-bolletta', vehicle_id: 'v1', bill_id: 'b-persa', utility_id: null, label: 'Tagliando', due_date: '2026-10-01', repeat_months: 0 },
    { id: 'auto-persa', vehicle_id: 'v-persa', bill_id: null, utility_id: null, label: 'Altro', due_date: '2026-10-02', repeat_months: 0 },
  ];
  const client = fakeClient({ rpc: (_n, a) => {
    if (a.target_vehicle === 'v-persa') return { data: null, error: { code: '42501', message: 'Veicolo non appartenente alla casa' } };
    if (a.linked_bill === 'b-persa') return { data: null, error: { code: '42501', message: 'Bolletta non appartenente alla casa' } };
    return { data: a.deadline_id === 'gia' ? null : a.deadline_id, error: null };
  } });
  const result = await runRestore(client, { target: { homeId: 'casa-1', userId: ME }, steps: [{ table: 'home_vehicle_deadlines', rows }] });
  assert.deepEqual(result.home_vehicle_deadlines, { added: 2, present: 1, failed: 1 });
  assert.deepEqual(client.calls[0], ['v52_restore_vehicle_deadline', { target_home: 'casa-1', target_vehicle: 'v1', deadline_label: 'Bollo', deadline_date: '2026-05-01',
    repeat_every_months: 12, linked_bill: 'b1', linked_utility: 'u1', deadline_id: 'nuova' }]);
  assert.ok(client.calls.some(([, a]) => a.deadline_id === 'senza-bolletta' && a.linked_bill === null), 'riprova senza la bolletta che non c\'è');
  const missing = await runRestore(fakeClient({ rpc: () => ({ data: null, error: { code: 'PGRST202' } }) }), { target: { homeId: 'casa-1' }, steps: [{ table: 'home_vehicle_deadlines', rows: [rows[0]] }] });
  assert.deepEqual(missing.home_vehicle_deadlines, { added: 0, present: 0, failed: 1, needsUpdate: true });
  assert.equal(missing === null, false);
});

test('pannello e testi: elenco dei motivi, membri della casa, aggiornamento v52, 6 lingue', () => {
  const panel = readFileSync(new URL('../app/BackupRestore.jsx', import.meta.url), 'utf8');
  assert.match(panel, /SKIP_REASONS\.filter/);
  assert.match(panel, /from\('home_members'\)\.select\('user_id'\)\.eq\('home_id', homeId\)/);
  assert.match(panel, /extra\.restore\.needsUpdate/);
  for (const [lang, d] of Object.entries(TRANSLATIONS)) {
    for (const r of SKIP_REASONS) assert.ok(d['extra.restore.reason.' + r], `${r} in ${lang}`);
    assert.match(d['extra.restore.needsUpdate'], /v52/, lang);
    assert.equal(d['extra.restore.reason.appOnly'], undefined, `motivo non più usato in ${lang}`);
  }
  const sql = readFileSync(new URL('../supabase/migrate_v52_ripristino_scadenze.sql', import.meta.url), 'utf8');
  assert.match(sql, /security definer set search_path = ''/);
  assert.match(sql, /private\.can_edit_home\(target_home\)/);
  assert.match(sql, /revoke all on function public\.v52_restore_vehicle_deadline\([^)]*\) from public, anon/);
});

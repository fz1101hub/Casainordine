// Avvisi notturni con molte persone (scelta dell'utente «Prestazioni del database», 24 novembre 2026).
// Il Supabase finto risponde al massimo con 1000 righe, come il progetto vero («Max rows»).
// Prima i controlli delle bollette mancanti e degli importi insoliti leggevano al massimo 1000
// utenze e 1000 bollette di tutti, e le automazioni al massimo 1000 regole: con più persone una
// parte degli avvisi non partiva mai, senza nessun errore.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { startFakeSupabase } from './helpers/fake-supabase.mjs';
import { processV20Alerts } from '../lib/v20-alerts.mjs';
import { processAutomations } from '../lib/automation-alerts.mjs';
import { addDaysISO } from '../lib/dates.mjs';

const TODAY = '2026-11-24', PEOPLE = 1500;
const person = i => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
const uuid = (prefix, i) => `${prefix}-0000-4000-8000-${String(i).padStart(12, '0')}`;
let fake, admin;

test.before(async () => {
  fake = await startFakeSupabase({ maxRows: 1000 });
  admin = createClient(fake.url, 'chiave-di-servizio-finta', { auth: { persistSession: false, autoRefreshToken: false } });
  const utilities = [], bills = [], rules = [];
  for (let i = 1; i <= PEOPLE; i++) {
    // Luce mensile: bollette del 20 agosto e del 20 settembre, poi più niente (quella di ottobre manca).
    utilities.push({ id: uuid('20000000', i), user_id: person(i), home_id: null, supplier: 'Lumen Casa', category: 'Luce', frequency: 'monthly', active: true });
    for (const [n, due] of [[1, '2026-08-20'], [2, '2026-09-20']])
      bills.push({ id: uuid(`3000000${n}`, i), user_id: person(i), home_id: null, utility_id: uuid('20000000', i), supplier: 'Lumen Casa', category: 'Luce',
        title: 'Luce', amount: 50, due_date: due, paid_at: '2026-09-25T10:00:00Z', source: 'manual', is_estimate: false, created_at: '2026-09-01T10:00:00Z' });
    // Bolletta del gas appena arrivata, da pagare: la regola «oltre 100 €» deve avvisare.
    bills.push({ id: uuid('30000009', i), user_id: person(i), home_id: null, utility_id: null, supplier: 'GasNord', category: 'Gas', title: 'Gas',
      amount: 120, due_date: addDaysISO(TODAY, 10), paid_at: null, source: 'manual', is_estimate: false, created_at: '2026-09-01T10:00:00Z' });
    rules.push({ id: uuid('40000000', i), user_id: person(i), home_id: null, kind: 'bill_amount', name: 'Bollette alte', amount_threshold: 100, paused: false, notify_all: false });
  }
  // Ultima persona: quattro bollette dell'acqua da circa 40 € e una nuova da 200 € inserita ieri.
  for (const [n, due] of [[1, '2026-04-10'], [2, '2026-06-10'], [3, '2026-08-10'], [4, '2026-10-10']])
    bills.push({ id: uuid(`5000000${n}`, PEOPLE), user_id: person(PEOPLE), home_id: null, utility_id: null, supplier: 'Acque del Fiume', category: 'Acqua',
      title: 'Acqua', amount: 40, due_date: due, paid_at: due + 'T09:00:00Z', source: 'manual', is_estimate: false, created_at: due + 'T09:00:00Z' });
  bills.push({ id: uuid('50000009', PEOPLE), user_id: person(PEOPLE), home_id: null, utility_id: null, supplier: 'Acque del Fiume', category: 'Acqua',
    title: 'Acqua', amount: 200, due_date: '2026-12-10', paid_at: null, source: 'manual', is_estimate: false, created_at: '2026-11-23T09:00:00Z' });
  fake.seed('utilities', utilities);
  fake.seed('bills', bills);
  fake.seed('home_automations', rules);
});
test.after(() => fake?.close());

const counts = () => ({ errors: [] });
const alerts = kind => fake.rows('user_alerts').filter(a => a.kind === kind);

test('bollette mancanti e importi insoliti: controllate per tutte le 1500 persone', async () => {
  const c = counts();
  await processV20Alerts(admin, TODAY, c, { configuredPush: () => false });
  assert.deepEqual(c.errors, []);
  const missing = alerts('missing_bill');
  assert.equal(new Set(missing.map(a => a.user_id)).size, PEOPLE, 'la bolletta della luce di ottobre manca a tutti');
  assert.ok(missing.some(a => a.user_id === person(PEOPLE)), 'anche l\'ultima persona');
  const fraud = alerts('fraud');
  assert.deepEqual(fraud.map(a => [a.user_id, a.reference_id]), [[person(PEOPLE), uuid('50000009', PEOPLE)]]);
});

test('seconda esecuzione nello stesso giorno: nessun avviso in più', async () => {
  const before = fake.rows('user_alerts').length;
  await processV20Alerts(admin, TODAY, counts(), { configuredPush: () => false });
  assert.equal(fake.rows('user_alerts').length, before);
});

test('automazioni: tutte le 1500 regole guardano le bollette del proprio spazio', async () => {
  const c = counts();
  await processAutomations(admin, TODAY, c, { configuredPush: () => false });
  assert.deepEqual(c.errors, []);
  const fired = alerts('automation');
  assert.equal(new Set(fired.map(a => a.user_id)).size, PEOPLE);
  // Ognuno solo per la propria bolletta del gas (e l'ultima persona anche per l'acqua da 200 €).
  for (const a of fired) assert.ok(a.reference_id.endsWith(a.user_id.slice(-12)), `${a.user_id}: ${a.reference_id}`);
  assert.equal(fired.length, PEOPLE + 1);
});

test('le letture dei controlli notturni non hanno più tetti fissi', async () => {
  const { readFileSync } = await import('node:fs');
  for (const file of ['lib/v20-alerts.mjs', 'lib/automation-alerts.mjs'])
    assert.doesNotMatch(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), /\.limit\(\d+\)/, file);
});

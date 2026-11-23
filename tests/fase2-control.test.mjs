// Fase 2 · 3.3 — Casa Control: pannello facoltativo, indicatori da eventi veri, formula trasparente,
// gestione della mancanza di dati e nessun punteggio arbitrario.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { controlIndicators, MIN_EVENTS } from '../lib/control.mjs';
import { MESSAGE_KEYS, translate } from '../lib/i18n.mjs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const TODAY = '2026-11-23';
const byId = list => Object.fromEntries(list.map(item => [item.id, item]));

test('Bollette: pagate in tempo e scadute da pagare, dai dati registrati', () => {
  const bills = [
    { due_date: '2026-01-10', paid_at: '2026-01-08T10:00:00Z', amount: 80, category: 'Luce' },
    { due_date: '2026-03-10', paid_at: '2026-03-12T10:00:00Z', amount: 90, category: 'Luce' },
    { due_date: '2026-06-10', paid_at: '2026-06-10', amount: 70, category: 'Gas' },
    { due_date: '2026-11-01', paid_at: null, amount: 40, category: 'Acqua' },
    { due_date: '2026-12-01', paid_at: null, amount: 55, category: 'Luce' },
  ];
  const r = byId(controlIndicators({ bills, today: TODAY }));
  assert.deepEqual([r.billsOnTime.status, r.billsOnTime.numerator, r.billsOnTime.denominator, r.billsOnTime.value], ['ok', 2, 4, 50]);
  assert.deepEqual([r.billsOverdue.value, r.billsOverdue.total], [1, 40], 'la bolletta di dicembre non è ancora scaduta');
});

test('Pochi dati: lo dice invece di stimare', () => {
  const r = byId(controlIndicators({ bills: [{ due_date: '2026-10-01', paid_at: '2026-09-30' }], tasks: [], assets: [], contracts: [], today: TODAY }));
  assert.equal(r.billsOnTime.status, 'missing');
  assert.equal(r.billsOnTime.need, MIN_EVENTS);
  assert.equal(r.billsOnTime.value, undefined, 'nessun numero inventato');
  assert.equal(r.tasksOnTime.status, 'missing');
  assert.equal(r.utilitySpend.status, 'missing');
  assert.equal(byId(controlIndicators({ today: TODAY, assetsKnown: false, contractsKnown: false })).maintenanceOnTrack.status, 'unavailable');
});

test('Attività, manutenzioni, garanzie, rinnovi e spesa per le utenze', () => {
  const tasks = [
    { due_date: '2026-09-01', done_at: '2026-08-30T08:00:00Z' }, { due_date: '2026-10-01', done_at: '2026-10-05T08:00:00Z' },
    { due_date: '2026-11-10', done_at: null }, { due_date: '2026-06-01', done_at: '2026-06-01' },
  ];
  const assets = [{ next_service_on: '2026-12-01', warranty_until: '2027-01-15' }, { next_service_on: '2026-10-01', warranty_until: '2028-01-01' }, { next_service_on: '2027-03-01' }, { warranty_until: '2025-01-01' }];
  const contracts = [{ renewal_on: '2026-12-15' }, { renewal_on: '2027-06-01' }, {}];
  const bills = [
    ...['2025-12-01', '2026-03-01', '2026-07-01'].map(d => ({ due_date: d, amount: 100, category: 'Luce' })),
    ...['2024-12-01', '2025-03-01', '2025-07-01'].map(d => ({ due_date: d, amount: 80, category: 'Gas' })),
    { due_date: '2026-05-01', amount: 999, category: 'Auto' },
  ];
  const r = byId(controlIndicators({ bills, tasks, assets, contracts, today: TODAY }));
  assert.deepEqual([r.tasksOnTime.numerator, r.tasksOnTime.denominator], [1, 3], 'quella di giugno è fuori dai 90 giorni');
  assert.deepEqual([r.maintenanceOnTrack.numerator, r.maintenanceOnTrack.denominator, r.maintenanceOnTrack.value], [2, 3, 67]);
  assert.deepEqual([r.warrantiesEnding.value, r.warrantiesEnding.of], [1, 3]);
  assert.deepEqual([r.renewalsSoon.value, r.renewalsSoon.of], [1, 2]);
  assert.deepEqual([r.utilitySpend.recent, r.utilitySpend.previous, r.utilitySpend.value], [300, 240, 25], 'l’auto non è un’utenza');
});

test('Nessun punteggio complessivo, formula per ogni indicatore', () => {
  const list = controlIndicators({ today: TODAY });
  const source = read('lib/control.mjs') + read('app/Control.jsx');
  assert.doesNotMatch(source, /\bscore\b|totalScore|weight/i, 'nessuna somma o peso degli indicatori');
  for (const item of list) for (const part of ['title', 'formula', 'missing'])
    assert.ok(MESSAGE_KEYS.includes(`control.${item.id}.${part}`), `${item.id}.${part}`);
  assert.match(translate('en', 'control.billsOnTime.formula', { num: 2, den: 4 }), /2 paid by the due date out of 4/);
});

test('Pannello facoltativo: spento finché non lo si attiva', () => {
  const ui = read('app/Control.jsx');
  assert.match(ui, /function readEnabled\(userId\) \{ try \{ return localStorage\.getItem\(storageKey\(userId\)\) === '1'; \} catch \{ return false; \} \}/);
  assert.match(ui, /\{!enabled \? <section className="panel extra-panel control-intro">/);
  assert.match(read('app/page.jsx'), /\{id:'control',icon:Gauge\}/);
});

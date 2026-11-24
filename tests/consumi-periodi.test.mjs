// Grafici dei consumi con il periodo di fatturazione (scelta dell'utente, 24 novembre 2026).
// Da quando periodo e consumo si leggono dalle bollette (PR #108), il consumo si divide fra i mesi
// del periodo in base ai giorni; senza periodo vale il mese della scadenza, come prima.
import test from 'node:test';
import assert from 'node:assert/strict';
import { monthlyConsumption, consumptionAnomalies } from '../lib/home-insights.mjs';
import { translate as t } from '../lib/i18n.mjs';

const bill = (start, end, value, unit = 'kWh', extra = {}) => ({ category: unit === 'kWh' ? 'Luce' : unit === 'Smc' ? 'Gas' : 'Acqua',
  consumption_value: value, consumption_unit: unit, period_start: start, period_end: end, due_date: end, amount: 100, ...extra });
const values = rows => rows.map(r => [r.month, r.value]);

test('bolletta bimestrale: metà del consumo in ciascun mese, in proporzione ai giorni', () => {
  const rows = monthlyConsumption([bill('2026-09-01', '2026-10-31', 305)]);
  assert.deepEqual(values(rows), [['2026-09', 150], ['2026-10', 155]]);
  assert.deepEqual(rows.map(r => r.amount), [49.18, 50.82]);
  assert.ok(rows.every(r => r.coverage === 1 && !r.partial && !r.overlap));
});

test('da mensile a bimestrale: nessun falso aumento (prima +107%)', () => {
  const bills = [bill('2026-01-01', '2026-01-31', 150), bill('2026-02-01', '2026-02-28', 140), bill('2026-03-01', '2026-03-31', 145), bill('2026-04-01', '2026-05-31', 300)];
  assert.deepEqual(consumptionAnomalies(monthlyConsumption(bills)), []);
});

test('un aumento vero si segnala ancora', () => {
  const bills = [bill('2026-09-01', '2026-09-30', 30, 'Smc'), bill('2026-10-01', '2026-10-31', 32, 'Smc'), bill('2026-11-01', '2026-11-30', 31, 'Smc'), bill('2026-12-01', '2026-12-31', 90, 'Smc')];
  const found = consumptionAnomalies(monthlyConsumption(bills));
  assert.deepEqual(found.map(a => [a.month, a.unit]), [['2026-12', 'Smc']]);
});

test('periodo a cavallo dei mesi: mesi non completi segnati e non confrontati', () => {
  const rows = monthlyConsumption([bill('2026-09-15', '2026-10-14', 100, 'm³')]);
  assert.deepEqual(values(rows), [['2026-09', 53.3], ['2026-10', 46.7]]);
  assert.ok(rows.every(r => r.partial));
  // La bolletta successiva completa ottobre.
  const full = monthlyConsumption([bill('2026-09-15', '2026-10-14', 100, 'm³'), bill('2026-10-15', '2026-11-14', 93, 'm³')]);
  assert.equal(full.find(r => r.month === '2026-10').partial, undefined);
  assert.equal(full.find(r => r.month === '2026-10').value, 46.7 + 51);
});

test('conguaglio sopra le bollette normali: periodi sovrapposti, nessun falso allarme', () => {
  const bills = [bill('2026-01-01', '2026-02-28', 300), bill('2026-03-01', '2026-04-30', 300), bill('2026-05-01', '2026-06-30', 300),
    bill('2026-01-01', '2026-06-30', 400, 'kWh', { title: 'Conguaglio' })];
  const rows = monthlyConsumption(bills);
  assert.ok(rows.every(r => r.overlap), JSON.stringify(rows.map(r => r.coverage)));
  assert.deepEqual(consumptionAnomalies(rows), []);
});

test('senza periodo: tutto nel mese della scadenza, come prima', () => {
  const rows = monthlyConsumption([{ category: 'Luce', consumption_value: 120, consumption_unit: 'kWh', due_date: '2026-11-20', amount: 40 }]);
  assert.deepEqual(rows, [{ month: '2026-11', unit: 'kWh', value: 120, amount: 40, count: 1 }]);
});

test('periodo assurdo (fine prima dell\'inizio, oltre 400 giorni): si usa il mese della fine', () => {
  assert.deepEqual(values(monthlyConsumption([bill('2026-10-31', '2026-09-01', 50)])), [['2026-09', 50]]);
  assert.deepEqual(values(monthlyConsumption([bill('2024-01-01', '2026-03-31', 50)])), [['2026-03', 50]]);
});

test('le note «mese non completo» e «periodi sovrapposti» ci sono in tutte le lingue', () => {
  for (const lang of ['it', 'en', 'es', 'fr', 'de', 'pt'])
    for (const key of ['extra.insights.partial', 'extra.insights.overlap']) assert.notEqual(t(lang, key), key, `${lang} ${key}`);
});

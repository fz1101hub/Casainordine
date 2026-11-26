import test from 'node:test';
import assert from 'node:assert/strict';
import { spendingForecast, forecastMonths, toCents } from '../lib/spending-forecast.mjs';

const today = '2026-11-26';

test('mesi della previsione: dal mese corrente, al massimo 24', () => {
  assert.deepEqual(forecastMonths(today, 3), ['2026-11', '2026-12', '2027-01']);
  assert.equal(forecastMonths(today, 99).length, 24);
  assert.equal(toCents('12.345'), 1235);
  assert.equal(toCents(''), null);
  assert.equal(toCents(-1), null);
});

test('bollette, utenze, storico e rate si sommano senza contare due volte', () => {
  const bills = [
    // Bolletta stimata già creata dall'utenza per dicembre: l'utenza non si conta di nuovo.
    { id: 'b1', utility_id: 'u1', supplier: 'Luce Srl', title: 'Luce · Luce Srl', category: 'Luce', amount: 80, due_date: '2026-12-12', is_estimate: true },
    // Storico del condominio, ogni 3 mesi, senza utenza.
    { id: 'c1', supplier: 'Condominio', category: 'Casa', amount: 300, due_date: '2026-02-10' },
    { id: 'c2', supplier: 'Condominio', category: 'Casa', amount: 300, due_date: '2026-05-10' },
    { id: 'c3', supplier: 'Condominio', category: 'Casa', amount: 360, due_date: '2026-08-10' },
    // Fornitore fermo da tempo: non si stima più.
    { id: 'o1', supplier: 'Vecchio gas', category: 'Gas', amount: 50, due_date: '2024-01-10' },
    { id: 'o2', supplier: 'Vecchio gas', category: 'Gas', amount: 50, due_date: '2024-02-10' },
  ];
  const utilities = [{ id: 'u1', supplier: 'Luce Srl', category: 'Luce', estimated_amount: 80, frequency: 'monthly', billing_day: 12, next_due_date: '2027-01-12', active: true }];
  const plans = [{ id: 'p1', title: 'Scuola', ended_on: null }, { id: 'p2', title: 'Finito', ended_on: '2026-06-30' }];
  const installments = [
    { plan_id: 'p1', label: 'Retta di dicembre', due_on: '2026-12-05', amount_cents: 45000, paid_on: null },
    { plan_id: 'p1', label: 'Retta di novembre', due_on: '2026-11-05', amount_cents: 45000, paid_on: '2026-11-04', paid_cents: 44000 },
    { plan_id: 'p1', label: 'Gita', due_on: '2027-01-20', amount_cents: null, paid_on: null },
    { plan_id: 'p2', label: 'Vecchia rata', due_on: '2026-12-01', amount_cents: 1000, paid_on: null },
  ];
  const f = spendingForecast({ bills, utilities, plans, installments, months: 3, today });
  const [nov, dec, jan] = f.months;
  assert.deepEqual([nov.month, dec.month, jan.month], ['2026-11', '2026-12', '2027-01']);
  assert.equal(nov.installments, 44000, 'rata pagata: conta quanto si è pagato');
  assert.equal(nov.estimated, 32000, 'condominio ogni 3 mesi: media delle ultime (300+300+360)/3');
  assert.equal(dec.bills, 8000);
  assert.equal(dec.utilities, 0, 'la bolletta stimata di dicembre prende il posto dell\'utenza');
  assert.equal(dec.installments, 45000, 'il piano finito non conta');
  assert.equal(dec.estimated, 0);
  assert.equal(jan.utilities, 8000, 'gennaio: dall\'utenza');
  assert.equal(jan.unknown, 1, 'rata senza importo: segnalata, non sommata');
  assert.equal(f.total, nov.total + dec.total + jan.total);
  assert.equal(f.peak.month, '2026-11', 'novembre: retta pagata e condominio');
  assert.equal(f.unknown, 1);
  assert.ok(!f.months.some(m => m.items.some(i => /Vecchio gas/.test(i.label))), 'fornitore fermo: niente stima');
  assert.equal(dec.items[0].label, 'Scuola · Retta di dicembre', 'voci dalla più cara');
});

test('una bolletta registrata a mano prende il posto della stima della stessa serie', () => {
  const bills = [
    { supplier: 'Acqua', category: 'Acqua', amount: 22, due_date: '2026-06-20' },
    { supplier: 'Acqua', category: 'Acqua', amount: 26, due_date: '2026-08-20' },
    { supplier: 'Acqua', category: 'Acqua', amount: 24, due_date: '2026-10-20' },
    { supplier: 'Acqua', category: 'Acqua', amount: 30, due_date: '2026-12-18' },
  ];
  const f = spendingForecast({ bills, months: 4, today });
  assert.deepEqual(f.months.map(m => [m.bills, m.estimated]), [[0, 0], [3000, 0], [0, 0], [0, 2400]], 'dicembre è già registrata; febbraio si stima dalla serie fino a ottobre');
});

test('utenza con prima data passata: si parte dal mese corrente; bimestrale ogni due mesi', () => {
  const utilities = [{ id: 'u2', supplier: 'Acqua Spa', category: 'Acqua', estimated_amount: 40, frequency: 'bimonthly', billing_day: 15, next_due_date: '2026-09-15', active: true },
    { id: 'u3', supplier: 'Spenta', category: 'Gas', estimated_amount: 40, frequency: 'monthly', billing_day: 1, next_due_date: '2026-12-01', active: false }];
  const f = spendingForecast({ utilities, months: 6, today });
  assert.deepEqual(f.months.map(m => m.utilities), [4000, 0, 4000, 0, 4000, 0]);
  assert.equal(f.average, Math.round(12000 / 6));
});

test('senza dati: tutto a zero, nessun mese più caro', () => {
  const f = spendingForecast({ months: 12, today });
  assert.equal(f.months.length, 12);
  assert.equal(f.total, 0);
  assert.equal(f.peak, null);
  assert.equal(f.max, 0);
});

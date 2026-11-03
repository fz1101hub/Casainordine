import test from 'node:test';
import assert from 'node:assert/strict';
import { addDaysISO, nextRecurringDue, normalizeDate, parseMoney } from '../lib/dates.mjs';
import { parseBillsCsv } from '../lib/csv.mjs';

test('reminder in three calendar days, including February', () => {
  assert.equal(addDaysISO('2028-02-27', 3), '2028-03-01');
});
test('recurrence on 31st handles short months without drifting', () => {
  assert.equal(nextRecurringDue('2026-01-31', 'monthly', 31), '2026-02-28');
  assert.equal(nextRecurringDue('2026-02-28', 'monthly', 31), '2026-03-31');
});
test('money and dates for Italy', () => {
  assert.equal(parseMoney('1.234,50 €'), 1234.5);
  assert.equal(normalizeDate('31/02/2026'), null);
  assert.equal(normalizeDate('02/11/2026'), '2026-11-02');
});
test('CSV with quoted delimiter', () => {
  const r = parseBillsCsv('fornitore;importo;scadenza;descrizione\n"Luce;Gas";89,70;12/12/2026;Energia');
  assert.equal(r.bills[0].supplier, 'Luce;Gas');
  assert.equal(r.bills[0].amount, 89.7);
});

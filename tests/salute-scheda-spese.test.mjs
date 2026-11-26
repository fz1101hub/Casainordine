// Scheda d'emergenza, spese sanitarie per il 730 e bilanci di salute (scelte dell'utente del
// 26 novembre 2026, notte).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizePerson, BLOOD_TYPES, emergencyCard, ageOn, normalizeExpense, expenseTaxItem, expenseNeedsTraceable, expenseYear, EXPENSE_KINDS, EXPENSE_PAYMENTS, CASH_OK_KINDS,
  CHECKUP_SCHEDULE, checkupPlan, vaccineNotices } from '../lib/health.mjs';
import { normalizeTaxItem, itemWarnings, taxCandidates, TAX_SOURCES } from '../lib/taxes.mjs';
import { BACKUP_TABLES } from '../lib/backup-tables.mjs';
import { RESTORE_ORDER, TAX_SOURCES as RESTORE_TAX_SOURCES, LINKS, prepareRows } from '../lib/backup-restore.mjs';
import { TRANSLATIONS } from '../lib/i18n.mjs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const sql = read('supabase/migrate_v62_scheda_spese_bilanci.sql');
const LANGS = ['it', 'en', 'es', 'fr', 'de', 'pt'];

test('scheda: gruppo sanguigno, allergie, medico e chi chiamare; telefoni solo con cifre e simboli', () => {
  const { value } = normalizePerson({ name: 'Luca', relation: 'child', blood_type: 'A+', allergies: ' Penicillina ', doctor_name: 'Dott.ssa Bianchi', doctor_phone: '+39 02 123.456', emergency_name: 'Nonna', emergency_phone: '(333) 123-4567' });
  assert.deepEqual([value.blood_type, value.allergies, value.doctor_phone, value.emergency_phone], ['A+', 'Penicillina', '+39 02 123.456', '(333) 123-4567']);
  assert.equal(normalizePerson({ name: 'Luca', blood_type: 'C+' }).value.blood_type, null);
  assert.equal(normalizePerson({ name: 'Luca', doctor_phone: 'chiamami' }).error, 'health.error.phone');
  assert.equal(normalizePerson({ name: 'Luca', emergency_phone: '1'.repeat(41) }).error, 'health.error.phone');
  for (const b of BLOOD_TYPES) assert.match(sql, new RegExp(`'${b.replace('+', '\\+')}'`));
  assert.match(sql, /doctor_phone ~ '\^\[0-9 \+\(\)\.\/-\]\{0,40\}\$'/);
});

test('scheda: terapie in corso (non finite, o che cominciano entro una settimana) e vaccini fatti', () => {
  const person = { id: 'l', name: 'Luca', birth_on: '2025-01-10' };
  const therapies = [
    { id: 't1', person_id: 'l', name: 'Ventolin', start_on: '2026-11-01', end_on: null, times: ['08:00:00'] },
    { id: 't2', person_id: 'l', name: 'Antibiotico', start_on: '2026-11-01', end_on: '2026-11-20', times: ['08:00'] },
    { id: 't3', person_id: 'l', name: 'Ferro', start_on: '2026-11-30', end_on: null, times: ['12:00'] },
    { id: 't4', person_id: 'l', name: 'Vitamina D', start_on: '2027-01-15', end_on: null, times: ['12:00'] },
    { id: 't5', person_id: 'x', name: 'Di un altro', start_on: '2026-11-01', end_on: null, times: ['12:00'] },
  ];
  const appointments = [
    { id: 'a1', person_id: 'l', kind: 'vaccine', title: 'Esavalente – 1ª dose', done_on: '2025-03-12' },
    { id: 'a2', person_id: 'l', kind: 'vaccine', title: 'Esavalente – 2ª dose', done_on: '2025-05-14' },
    { id: 'a3', person_id: 'l', kind: 'vaccine', title: 'MPRV', done_on: null },
    { id: 'a4', person_id: 'l', kind: 'visit', title: 'Pediatra', done_on: '2025-06-01' },
  ];
  const card = emergencyCard(person, therapies, appointments, '2026-11-25');
  assert.deepEqual(card.therapies.map(t => t.name), ['Ferro', 'Ventolin']);
  assert.deepEqual(card.vaccines.map(v => v.id), ['a2', 'a1']);
  assert.deepEqual(card.age, { months: 22 });
  assert.equal(card.missing, true);
  assert.equal(emergencyCard({ ...person, allergies: 'Arachidi' }, [], [], '2026-11-25').missing, false);
  assert.deepEqual(ageOn('2020-11-26', '2026-11-25'), { years: 5 });
  assert.deepEqual(ageOn('2020-11-25', '2026-11-25'), { years: 6 });
  assert.equal(ageOn('2027-01-01', '2026-11-25'), null);
});

test('spese: controlli, voce del 730 con «anche in contanti» per farmaci, dispositivi e ticket', () => {
  assert.equal(normalizeExpense({ description: 'x', amount: '5', spent_on: '2026-11-20' }).error, 'health.error.expenseDescription');
  assert.equal(normalizeExpense({ description: 'Sciroppo', amount: '5', spent_on: '2026-11-30' }, '2026-11-25').error, 'health.error.expenseDate');
  assert.equal(normalizeExpense({ description: 'Sciroppo', amount: '0', spent_on: '2026-11-20' }).error, 'health.error.amount');
  const { value } = normalizeExpense({ description: ' Sciroppo ', amount: '8.50', spent_on: '2026-11-20', kind: 'boh', payment_method: 'assegno', appointment_id: '' }, '2026-11-25');
  assert.deepEqual([value.description, value.amount_cents, value.kind, value.payment_method, value.appointment_id], ['Sciroppo', 850, 'other', null, null]);
  const item = expenseTaxItem({ id: 'e1', kind: 'pharmacy', description: 'Sciroppo', amount_cents: 850, spent_on: '2026-11-20', payment_method: 'cash' }, { name: 'Luca' });
  assert.deepEqual(item, { tax_year: 2026, category: 'medical', description: 'Luca · Sciroppo', amount_cents: 850, paid_on: '2026-11-20', payment_method: 'cash', cash_ok: true, source: 'health_expense', source_id: 'e1' });
  assert.equal(expenseTaxItem({ id: 'e2', kind: 'visit', description: 'Visita', amount_cents: 12000, spent_on: '2025-12-31', payment_method: 'traceable' }, { name: 'Luca' }).tax_year, 2025, 'anno del pagamento');
  assert.equal(expenseNeedsTraceable({ kind: 'visit', payment_method: 'cash' }), true);
  assert.equal(expenseNeedsTraceable({ kind: 'visit', payment_method: null }), true);
  assert.equal(expenseNeedsTraceable({ kind: 'visit', payment_method: 'traceable' }), false);
  for (const kind of CASH_OK_KINDS) assert.equal(expenseNeedsTraceable({ kind, payment_method: 'cash' }), false, kind);
  assert.deepEqual(expenseYear([{ spent_on: '2026-01-02', amount_cents: 850 }, { spent_on: '2026-11-20', amount_cents: 12000 }, { spent_on: '2025-12-31', amount_cents: 999 }], 2026), { total_cents: 12850, count: 2 });
  for (const k of EXPENSE_KINDS) assert.match(sql, new RegExp(`'${k}'`));
  for (const m of EXPENSE_PAYMENTS) assert.match(sql, new RegExp(`'${m}'`));
});

test('Spese detraibili: le spese sanitarie tra le proposte, niente avviso sui contanti quando non serve', () => {
  assert.ok(TAX_SOURCES.includes('health_expense'));
  const healthExpenses = [
    { id: 'e1', person_id: 'l', kind: 'pharmacy', description: 'Sciroppo', amount_cents: 850, spent_on: '2026-11-20', payment_method: 'cash' },
    { id: 'e2', person_id: 'l', kind: 'visit', description: 'Visita', amount_cents: 12000, spent_on: '2026-11-21', payment_method: 'traceable' },
    { id: 'e3', person_id: 'l', kind: 'visit', description: 'Dell\'anno prima', amount_cents: 5000, spent_on: '2025-11-21', payment_method: 'traceable' },
  ];
  const list = taxCandidates({ healthExpenses, healthPeople: [{ id: 'l', name: 'Luca' }] }, 2026, [{ source: 'health_expense', source_id: 'e2' }]);
  assert.deepEqual(list.map(c => [c.source_id, c.description, c.category, c.payment_method, c.cash_ok]), [['e1', 'Luca · Sciroppo', 'medical', 'cash', true]]);
  const cash = normalizeTaxItem({ description: 'Sciroppo', amount: '8.5', tax_year: 2026, category: 'medical', payment_method: 'cash', cash_ok: true }).value;
  assert.equal(cash.cash_ok, true);
  assert.ok(!itemWarnings(cash).includes('traceable'));
  assert.ok(itemWarnings({ ...cash, cash_ok: false }).includes('traceable'));
  assert.equal(normalizeTaxItem({ description: 'Divano', amount: '800', tax_year: 2026, category: 'furniture', cash_ok: true }).value.cash_ok, false, 'solo per le spese sanitarie');
});

test('backup: spese sanitarie con persona, visita e voce del 730 che le cita', () => {
  assert.ok(BACKUP_TABLES.some(t => t.name === 'health_expenses' && t.parent === 'health_people' && t.key === 'person_id'));
  assert.ok(RESTORE_ORDER.indexOf('health_expenses') > RESTORE_ORDER.indexOf('health_appointments'));
  assert.ok(RESTORE_ORDER.indexOf('health_expenses') < RESTORE_ORDER.indexOf('home_tax_items'), 'prima la spesa, poi la voce che la cita');
  assert.equal(RESTORE_TAX_SOURCES.health_expense, 'health_expenses');
  assert.equal(LINKS.appointment_id, 'health_appointments');
  const ids = { health_people: { p1: 'P1' }, health_appointments: { a1: 'A1' }, health_expenses: { e1: 'E1' } };
  const [expense] = prepareRows('health_expenses', [{ id: 'e1', person_id: 'p1', appointment_id: 'a1', created_by: 'old', home_id: 'h' }], { userId: 'u', homeId: 'h2', ids });
  assert.deepEqual([expense.id, expense.person_id, expense.appointment_id, expense.created_by, 'home_id' in expense], ['E1', 'P1', 'A1', 'u', false]);
  const [tax] = prepareRows('home_tax_items', [{ id: 't1', source: 'health_expense', source_id: 'e1', user_id: 'old' }], { userId: 'u', homeId: 'h2', ids });
  assert.deepEqual([tax.source, tax.source_id], ['health_expense', 'E1']);
});

test('bilanci di salute: 10 tappe dal 1° giorno al 13° anno, stati e avviso insieme ai vaccini', () => {
  assert.equal(CHECKUP_SCHEDULE.length, 10);
  const baby = { id: 'luca', name: 'Luca', birth_on: '2026-09-20', vaccine_plan: 'mandatory', checkup_plan: true };
  const plan = checkupPlan(baby, [{ person_id: 'luca', schedule_key: 'bds_1', on_date: '2026-10-05', done_on: '2026-10-05' }], '2026-11-25');
  assert.deepEqual(plan.map(s => `${s.key}:${s.from}:${s.state}`).slice(0, 4), ['bds_1:2026-09-20:done', 'bds_2:2026-11-19:due', 'bds_3:2026-12-20:later', 'bds_4:2027-03-20:later']);
  assert.deepEqual(plan.map(s => s.until).slice(-1), ['2039-09-20'], 'fino al 13° anno');
  assert.deepEqual(checkupPlan({ ...baby, checkup_plan: false }, [], '2026-11-25'), []);
  const notices = vaccineNotices([baby], [], '2026-11-05');
  assert.deepEqual(notices.map(n => [n.from, n.items.map(i => `${i.type}:${i.key}`)]), [['2026-11-19', ['vaccine:hexa_1', 'checkup:bds_2']]], 'stessa data: una notizia sola');
  assert.deepEqual(vaccineNotices([{ ...baby, vaccine_plan: 'off' }], [], '2026-12-08').map(n => n.items.map(i => i.key)), [['bds_3']]);
  for (const lang of LANGS) for (const s of CHECKUP_SCHEDULE) assert.ok(TRANSLATIONS[lang]['health.checkupAge.' + s.key], `${lang} ${s.key}`);
  assert.match(sql, /checkup_plan boolean not null default false/);
});

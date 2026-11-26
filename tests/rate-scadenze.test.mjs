// Rate e scadenze (richiesta dell'utente del 26 novembre 2026, notte).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PLAN_KINDS, TAX_CHOICES, TEMPLATES, easter, isHoliday, nextWorkingDay, normalizePlan, normalizeInstallment, generateInstallments, installmentState,
  installmentAgenda, monthTotal, planSummary, installmentNotices } from '../lib/installments.mjs';
import { installmentAlertCopy, processInstallmentAlerts } from '../lib/installment-alerts.mjs';
import { taxCandidates, taxRuleKey, TAX_CATEGORIES, PAYMENT_NEEDED } from '../lib/taxes.mjs';
import { BACKUP_TABLES } from '../lib/backup-tables.mjs';
import { RESTORE_ORDER, TABLE_LINKS, TAX_SOURCES, prepareRows } from '../lib/backup-restore.mjs';
import { MENU_GROUPS } from '../lib/menu-groups.mjs';
import { SEARCH_SOURCES } from '../lib/search.mjs';
import { TRANSLATIONS, translate } from '../lib/i18n.mjs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const sql = read('supabase/migrate_v64_rate_scadenze.sql');
const LANGS = ['it', 'en', 'es', 'fr', 'de', 'pt'];
const TODAY = '2026-11-26';
const t = (key, params) => translate('it', key, params);
const month = m => new Intl.DateTimeFormat('it', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, m - 1, 15)));
const gen = (template, options = {}) => generateInstallments(template, { today: TODAY, ...options }, t, month);

test('giorni lavorativi: Pasqua, festivi nazionali, fine settimana', () => {
  assert.equal(easter(2026), '2026-04-05'); assert.equal(easter(2027), '2027-03-28');
  assert.ok(isHoliday('2026-04-06'), 'lunedì dell’Angelo'); assert.ok(isHoliday('2026-12-08')); assert.ok(!isHoliday('2026-12-09'));
  assert.equal(nextWorkingDay('2026-10-10'), '2026-10-12', 'sabato → lunedì');
  assert.equal(nextWorkingDay('2027-01-10'), '2027-01-11', 'domenica → lunedì');
  assert.equal(nextWorkingDay('2026-05-16'), '2026-05-18');
  assert.equal(nextWorkingDay('2026-04-06'), '2026-04-07', 'lunedì dell’Angelo → martedì');
});

test('contributi del lavoro domestico: entro il 10 del mese dopo ogni trimestre, slittati al giorno lavorativo', () => {
  assert.deepEqual(gen('domestic_inps').map(r => [r.label, r.due_on, r.amount_cents]), [
    ['Contributi INPS 4° trimestre 2026', '2027-01-11', null], ['Contributi INPS 1° trimestre 2027', '2027-04-12', null],
    ['Contributi INPS 2° trimestre 2027', '2027-07-12', null], ['Contributi INPS 3° trimestre 2027', '2027-10-11', null]]);
  assert.deepEqual(generateInstallments('domestic_inps', { today: '2026-07-01' }, t, month).map(r => r.due_on), ['2026-07-10', '2026-10-12', '2027-01-11', '2027-04-12']);
});

test('libero professionista: INPS fissi, saldo e acconti, IVA trimestrale', () => {
  assert.deepEqual(gen('artisans_inps').map(r => [r.label, r.due_on]), [['Contributi INPS fissi: 4ª rata 2026', '2027-02-16'], ['Contributi INPS fissi: 1ª rata 2027', '2027-05-17'],
    ['Contributi INPS fissi: 2ª rata 2027', '2027-08-20'], ['Contributi INPS fissi: 3ª rata 2027', '2027-11-16']]);
  assert.deepEqual(generateInstallments('artisans_inps', { today: '2026-05-01' }, t, month)[0].due_on, '2026-05-18', '16 maggio 2026 è sabato');
  assert.deepEqual(gen('income_taxes').map(r => [r.label, r.due_on]), [['2° acconto 2026', '2026-11-30'], ['Saldo 2026 e 1° acconto 2027', '2027-06-30']]);
  assert.deepEqual(gen('vat_quarterly').map(r => [r.label, r.due_on]), [['IVA 4° trimestre e saldo 2026', '2027-03-16'], ['IVA 1° trimestre 2027', '2027-05-17'],
    ['IVA 2° trimestre 2027', '2027-08-20'], ['IVA 3° trimestre 2027', '2027-11-16']]);
});

test('rette, sport, stipendi e rate libere', () => {
  const school = gen('school_year', { schoolYear: 2026, day: 10, amount_cents: 35000 });
  assert.equal(school.length, 10);
  assert.deepEqual([school[0].label, school[0].due_on, school[9].label, school[9].due_on, school[0].amount_cents], ['Retta di settembre 2026', '2026-09-10', 'Retta di giugno 2027', '2027-06-10', 35000]);
  assert.deepEqual(gen('monthly', { from: '2027-01-31', count: 2 }).map(r => r.due_on), ['2027-01-31', '2027-02-28'], 'giorno che non esiste: ultimo del mese');
  const pay = gen('domestic_pay', { from: '2026-11-27', count: 2, day: 27, thirteenth: true, amount_cents: 120000 });
  assert.deepEqual(pay.map(r => r.label), ['Stipendio di novembre 2026', 'Stipendio di dicembre 2026', 'Tredicesima 2026']);
  assert.deepEqual(gen('custom', { from: '2026-12-15', count: 3, every: 2 }).map(r => [r.label, r.due_on]), [['1ª rata', '2026-12-15'], ['2ª rata', '2027-02-15'], ['3ª rata', '2027-04-15']]);
  assert.deepEqual(gen('custom', { from: '2026-12-15', count: 3, every: 0 }).length, 1, 'una volta sola');
  assert.deepEqual(gen('custom', { from: '' }), []);
  for (const tpl of TEMPLATES) for (const lang of LANGS) {
    const rows = generateInstallments(tpl, { today: TODAY, from: TODAY, count: 2, every: 1, schoolYear: 2026, thirteenth: true }, (k, p) => translate(lang, k, p), month);
    assert.ok(rows.length && rows.every(r => !/\{|inst\.gen/.test(r.label)), `${tpl} ${lang}`);
  }
});

test('controlli, stato, agenda e totali del mese', () => {
  assert.equal(normalizePlan({ title: 'x' }).error, 'inst.error.title');
  assert.deepEqual(normalizePlan({ title: ' Retta ', kind: 'boh', tax_category: 'vacanze', remind_days: 5 }).value, { title: 'Retta', kind: 'other', payee: '', person: '', tax_category: null, remind_days: 5, notes: '' });
  assert.equal(normalizeInstallment({ label: 'Rata', due_on: '2026-02-30' }).error, 'inst.error.date');
  assert.equal(normalizeInstallment({ label: 'Rata', due_on: '2026-12-01', amount: '0' }).error, 'inst.error.amount');
  assert.equal(normalizeInstallment({ label: 'Contributi', due_on: '2027-01-11', amount: '' }).value.amount_cents, null, 'importo da definire');
  const plans = [{ id: 'p1', title: 'Retta', remind_days: 3, ended_on: null }, { id: 'p2', title: 'Vecchio', remind_days: 3, ended_on: '2026-01-01' }];
  const items = [
    { id: 'a', plan_id: 'p1', label: 'Ottobre', due_on: '2026-10-10', amount_cents: 35000, paid_on: '2026-10-09', paid_cents: 35000 },
    { id: 'b', plan_id: 'p1', label: 'Novembre', due_on: '2026-11-10', amount_cents: 35000, paid_on: null },
    { id: 'c', plan_id: 'p1', label: 'Dicembre', due_on: '2026-12-01', amount_cents: 35000, paid_on: null },
    { id: 'd', plan_id: 'p1', label: 'Contributi', due_on: '2026-11-30', amount_cents: null, paid_on: null },
    { id: 'e', plan_id: 'p2', label: 'Concluso', due_on: '2026-11-28', amount_cents: 999, paid_on: null },
  ];
  assert.deepEqual(['a', 'b', 'c', 'd'].map(id => installmentState(items.find(i => i.id === id), TODAY, 3)), ['paid', 'late', 'soon', 'soon']);
  assert.deepEqual(installmentAgenda(items, plans, TODAY).map(a => a.inst.id), ['b', 'd', 'c'], 'scadute prima, niente impegni conclusi');
  assert.deepEqual(monthTotal(items, plans, '2026-11'), { cents: 35000, count: 2, unknown: 1 });
  assert.deepEqual(planSummary(plans[0], items, TODAY), { next: items[3], late: 1, paidYear: 35000, count: 4 });
});

test('avvisi: preavviso, il giorno stesso e dopo la scadenza, nel testo nella lingua di chi riceve', async () => {
  const plans = [{ id: 'p1', user_id: 'anna', home_id: null, title: 'Retta scuola Luca', remind_days: 3, ended_on: null }];
  const items = [{ id: 'c', plan_id: 'p1', label: 'Retta di dicembre 2026', due_on: '2026-11-29', amount_cents: 35000, paid_on: null }];
  assert.deepEqual(installmentNotices(items, plans, '2026-11-25'), [], 'quattro giorni prima: ancora niente');
  assert.deepEqual(installmentNotices(items, plans, TODAY).map(n => [n.type, n.event_date, n.days]), [['soon', '2026-11-29', 3]]);
  assert.deepEqual(installmentNotices(items, plans, '2026-11-30').map(n => [n.type, n.event_date]), [['late', '2026-11-30']]);
  assert.deepEqual(installmentNotices([{ ...items[0], paid_on: '2026-11-28' }], plans, '2026-11-30'), []);
  const copy = installmentAlertCopy({ plan: 'Retta scuola Luca', label: 'Retta di dicembre 2026', due_on: '2026-11-29', amount_cents: 35000, days: 3, type: 'soon' }, 'it');
  assert.equal(copy.title, 'In scadenza: Retta scuola Luca');
  assert.match(copy.body, /^Retta di dicembre 2026: 350,00\s€ entro il 29 nov 2026, tra 3 giorni\.$/);
  for (const lang of LANGS) for (const [type, days, amount] of [['soon', 1, 100], ['soon', 5, null], ['soon', 0, 100], ['late', -2, null], ['late', -2, 100]]) {
    const c = installmentAlertCopy({ plan: 'P', label: 'L', due_on: '2026-11-29', amount_cents: amount, days, type }, lang);
    assert.ok(!/\{|undefined|server\./.test(c.title + c.body), `${lang} ${type} ${days} ${amount}: ${c.body}`);
  }
  const tables = { payment_installments: items, payment_plans: plans, user_alerts: [], user_alert_preferences: [] };
  const admin = { from(name) { const f = []; const b = { select() { return b; }, order() { return b; }, is(c, v) { f.push(r => (r[c] ?? null) === v); return b; },
    gte(c, v) { f.push(r => r[c] >= v); return b; }, lte(c, v) { f.push(r => r[c] <= v); return b; }, in(c, vs) { f.push(r => vs.includes(r[c])); return b; },
    range(from, to) { return b.then(r => ({ data: r.data.slice(from, to + 1), error: null })); }, eq(c, v) { f.push(r => r[c] === v); return b; },
    upsert(rows) { (tables[name] ||= []).push(...[].concat(rows)); return { select: () => Promise.resolve({ data: [].concat(rows), error: null }) }; },
    then(res, rej) { return Promise.resolve({ data: (tables[name] || []).filter(r => f.every(fn => fn(r))), error: null }).then(res, rej); } }; return b; } };
  const counts = { errors: [] };
  await processInstallmentAlerts(admin, TODAY, counts);
  assert.deepEqual(counts.errors, []);
  assert.deepEqual(tables.user_alerts.map(a => [a.kind, a.reference_id, a.event_date]), [['installment', 'c', '2026-11-29']]);
  assert.match(read('lib/daily-jobs.mjs'), /await processInstallmentAlerts\(admin,today,counts,/);
});

test('730: le rate pagate degli impegni detraibili tra le proposte, con le regole', () => {
  for (const c of TAX_CHOICES) { assert.ok(TAX_CATEGORIES.includes(c)); assert.match(sql, new RegExp(`'${c}'`)); assert.notEqual(taxRuleKey(c, 2026), 'taxes.rule.unknown', c); }
  assert.equal(PAYMENT_NEEDED.sport, 'traceable'); assert.equal(PAYMENT_NEEDED.domestic_worker, undefined, 'i contributi INPS si pagano con l’avviso pagoPA');
  assert.match(translate('it', 'taxes.rule.education'), /1\.000 € per studente/);
  assert.match(translate('it', 'taxes.rule.sport'), /210 €.*5 e 18 anni/);
  assert.match(translate('it', 'taxes.rule.domestic_worker'), /1\.549,37 €/);
  const plans = [{ id: 'p1', title: 'Retta scuola Luca', payee: 'Istituto', tax_category: 'education' }, { id: 'p2', title: 'Stipendio Maria', tax_category: null }];
  const installments = [{ id: 'a', plan_id: 'p1', label: 'Retta di ottobre', amount_cents: 35000, paid_on: '2026-10-09', paid_cents: 34000 },
    { id: 'b', plan_id: 'p1', label: 'Retta di novembre', amount_cents: 35000, paid_on: null }, { id: 'c', plan_id: 'p2', label: 'Stipendio', amount_cents: 120000, paid_on: '2026-10-27' }];
  assert.deepEqual(taxCandidates({ plans, installments }, 2026).map(c => [c.source, c.source_id, c.description, c.amount_cents, c.category, c.supplier]),
    [['installment', 'a', 'Retta scuola Luca · Retta di ottobre', 34000, 'education', 'Istituto']]);
});

test('menu, backup, ricerca, migrazione', () => {
  const money = MENU_GROUPS.find(g => g.id === 'money').items;
  assert.ok(money.includes('installments') && money.length <= 12);
  assert.ok(MENU_GROUPS.find(g => g.id === 'tools').items.includes('simulator'));
  assert.ok(BACKUP_TABLES.some(x => x.name === 'payment_plans') && BACKUP_TABLES.some(x => x.name === 'payment_installments' && x.parent === 'payment_plans'));
  assert.ok(RESTORE_ORDER.indexOf('payment_installments') > RESTORE_ORDER.indexOf('payment_plans') && RESTORE_ORDER.indexOf('payment_installments') < RESTORE_ORDER.indexOf('home_tax_items'));
  assert.equal(TABLE_LINKS.payment_installments.plan_id, 'payment_plans', 'plan_id delle rate non è un piano di trasloco');
  assert.equal(TAX_SOURCES.installment, 'payment_installments');
  const ids = { payment_plans: { p1: 'P1' }, home_move_plans: { p1: 'TRASLOCO' }, payment_installments: { i1: 'I1' } };
  const [row] = prepareRows('payment_installments', [{ id: 'i1', plan_id: 'p1', created_by: 'x', home_id: 'h' }], { userId: 'u', homeId: 'h2', ids });
  assert.deepEqual([row.id, row.plan_id, 'home_id' in row], ['I1', 'P1', false]);
  assert.ok(SEARCH_SOURCES.some(s => s.table === 'payment_plans' && s.tab === 'installments'));
  for (const k of PLAN_KINDS) { assert.match(sql, new RegExp(`'${k}'`)); for (const lang of LANGS) assert.ok(TRANSLATIONS[lang]['inst.kind.' + k], `${lang} ${k}`); }
  assert.match(sql, /'health','document','installment'\)\)/);
});

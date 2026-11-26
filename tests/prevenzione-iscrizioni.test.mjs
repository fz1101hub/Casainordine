// Prevenzione, iscrizioni scolastiche, certificato sportivo, scadenze nel calendario e riquadro delle
// rate (scelte dell'utente del 26 novembre 2026, notte).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SCREENINGS, screeningPlan, screeningNotices, screeningKey, screeningOf, normalizePerson } from '../lib/health.mjs';
import { screeningAlertCopy } from '../lib/health-reminders.mjs';
import { schoolEnrollments, enrollmentNotices, suggestedRenewal, DOC_KINDS, DOC_NOTICE } from '../lib/family-documents.mjs';
import { enrollmentAlertCopy } from '../lib/document-alerts.mjs';
import { calendarText } from '../lib/calendar.mjs';
import { HOME_WIDGETS } from '../lib/home-preferences.mjs';
import { translate } from '../lib/i18n.mjs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const sql = read('supabase/migrate_v65_scadenze_prevenzione.sql');
const LANGS = ['it', 'en', 'es', 'fr', 'de', 'pt'];
const TODAY = '2026-11-26';

test('screening: per età e sesso, con l’intervallo dall’ultimo fatto', () => {
  const anna = { id: 'a', name: 'Anna', birth_on: '1972-03-04', sex: 'female', screening_plan: true };
  assert.deepEqual(screeningPlan(anna, [], TODAY).map(s => [s.key, s.state, s.event]), [['cervix_hpv', 'due', '2026-01-01'], ['breast', 'due', '2026-01-01'], ['colorectal', 'due', '2026-01-01'], ['dentist', 'due', '2026-01-01']]);
  const done = [{ person_id: 'a', schedule_key: screeningKey('breast', '2025-03-10'), done_on: '2025-03-10' }, { person_id: 'a', schedule_key: 'scr_colorectal_2026', on_date: '2026-12-02', done_on: null }];
  const plan = Object.fromEntries(screeningPlan(anna, done, TODAY).map(s => [s.key, s]));
  assert.deepEqual([plan.breast.state, plan.breast.next, plan.breast.event], ['ok', '2027-03-10', '2027-03-10'], 'mammografia ogni 2 anni');
  assert.equal(plan.colorectal.state, 'booked');
  assert.deepEqual(screeningPlan({ ...anna, sex: 'male' }, [], TODAY).map(s => s.key), ['colorectal', 'dentist'], 'uomo: niente screening femminili');
  assert.deepEqual(screeningPlan({ ...anna, sex: null }, [], TODAY).map(s => s.key), ['colorectal', 'dentist'], 'senza sesso: solo quelli per tutti');
  assert.deepEqual(screeningPlan({ ...anna, birth_on: '1999-01-01' }, [], TODAY).map(s => s.key), ['cervix_pap', 'dentist'], '27 anni: Pap test');
  assert.deepEqual(screeningPlan({ ...anna, birth_on: '1960-01-01', sex: 'male' }, [], TODAY).map(s => s.key), ['colorectal', 'flu', 'dentist'], '66 anni: antinfluenzale');
  const flu = screeningPlan({ ...anna, birth_on: '1960-01-01' }, [{ person_id: 'a', schedule_key: 'scr_flu_2026', done_on: '2026-10-20' }], TODAY).find(s => s.key === 'flu');
  assert.deepEqual([flu.state, flu.next], ['ok', '2027-10-01'], 'fatto quest’autunno: il prossimo a ottobre');
  assert.deepEqual(screeningPlan({ ...anna, screening_plan: false }, [], TODAY), []);
  assert.equal(screeningOf('scr_cervix_hpv_2026'), 'cervix_hpv'); assert.equal(screeningOf('hexa_1'), null);
  assert.equal(normalizePerson({ name: 'Anna', sex: 'female' }).value.sex, 'female'); assert.equal(normalizePerson({ name: 'Anna', sex: 'x' }).value.sex, null);
  assert.match(sql, /sex in \('female','male'\)/); assert.match(sql, /screening_plan boolean not null default false/);
});

test('avvisi della prevenzione: una notizia per data stabile, senza nomi se i dettagli sono spenti', () => {
  const anna = { id: 'a', name: 'Anna', birth_on: '1972-03-04', sex: 'female', screening_plan: true };
  const notices = screeningNotices([anna], [], TODAY);
  assert.deepEqual(notices.map(n => [n.event, n.items.map(i => i.key)]), [['2026-01-01', ['cervix_hpv', 'breast', 'colorectal', 'dentist']]]);
  assert.deepEqual(screeningNotices([anna], [], '2026-11-27').map(n => n.event), ['2026-01-01'], 'il giorno dopo la stessa data: niente doppioni');
  assert.match(screeningAlertCopy({ person: 'Anna', keys: ['breast'] }, 'it', true).body, /Da prenotare: Mammografia\./);
  assert.doesNotMatch(screeningAlertCopy({ person: 'Anna', keys: ['breast'] }, 'it', false).body, /Mammografia/);
  for (const lang of LANGS) for (const details of [true, false]) { const c = screeningAlertCopy({ person: 'Anna', keys: SCREENINGS.map(s => s.key) }, lang, details); assert.ok(!/\{|undefined|health\./.test(c.title + c.body), lang); }
});

test('iscrizioni scolastiche e certificato sportivo', () => {
  const kids = [{ name: 'Luca', birth_on: '2023-05-02' }, { name: 'Mia', birth_on: '2020-01-01' }, { name: 'Leo', birth_on: '2015-09-01' }];
  assert.deepEqual(schoolEnrollments(kids, TODAY).map(e => [e.person.name, e.grade, e.schoolYear]), [['Leo', 'high', '2029/2030'], ['Luca', 'primary', '2029/2030'], ['Mia', 'middle', '2031/2032']]);
  assert.deepEqual(enrollmentNotices(kids, '2026-01-10').map(e => [e.person.name, e.grade, e.event_date]), [['Leo', 'middle', '2026-01-07'], ['Luca', 'nursery_school', '2026-01-07'], ['Mia', 'primary', '2026-01-07']]);
  assert.deepEqual(enrollmentNotices(kids, '2026-01-06'), []); assert.deepEqual(enrollmentNotices(kids, '2026-03-01'), []);
  assert.match(enrollmentAlertCopy({ person: 'Mia', grade: 'primary', schoolYear: '2026/2027' }, 'it').body, /Per il 2026\/2027 Mia inizia Scuola primaria/);
  for (const lang of LANGS) { const c = enrollmentAlertCopy({ person: 'Mia', grade: 'high', schoolYear: '2026/2027' }, lang); assert.ok(!/\{|undefined|iddocs\./.test(c.title + c.body), lang); }
  assert.ok(DOC_KINDS.includes('sport_certificate') && DOC_NOTICE.sport_certificate === 30);
  assert.equal(suggestedRenewal({ kind: 'sport_certificate', expires_on: '2027-09-15' }, TODAY), '2028-09-15');
  assert.equal(suggestedRenewal({ kind: 'sport_certificate', expires_on: '2026-10-01' }, TODAY), '2027-11-26', 'già scaduto: un anno da oggi');
  assert.equal(suggestedRenewal({ kind: 'passport', expires_on: '2027-09-15' }, TODAY), '');
  assert.match(sql, /'sport_certificate'/);
});

test('calendario: rate e documenti come eventi di giornata intera, nella lingua di chi legge', () => {
  const extra = [{ uid: 'installment-1', date: '2026-12-10', key: 'installment', params: { plan: 'Retta scuola Luca', label: 'Retta di dicembre 2026' } },
    { uid: 'document-2', date: '2027-05-12', key: 'document', params: { holder: 'Luca', what: '', kind: 'passport' } }];
  const ics = calendarText([], '20261126T090000Z', 'it', [], [], extra);
  assert.match(ics, /UID:installment-1@casainordine\r\nDTSTAMP:20261126T090000Z\r\nDTSTART;VALUE=DATE:20261210\r\nDTEND;VALUE=DATE:20261211\r\nSUMMARY:Retta scuola Luca: Retta di dicembre 2026/);
  assert.match(ics, /SUMMARY:Scade: Passaporto di Luca/);
  assert.match(calendarText([], '20261126T090000Z', 'en', [], [], extra), /SUMMARY:Expires: Luca’s Passport/);
  assert.match(read('app/api/calendar/[token]/route.js'), /deadlineEvents\(admin,feed\.user_id,homes,today\)/);
  assert.ok(HOME_WIDGETS.some(w => w.id === 'installments'));
  assert.match(sql, /'documents','installments'\]::text\[\]/);
});

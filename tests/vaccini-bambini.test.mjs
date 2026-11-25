// Calendario vaccinale dei bambini (richiesta dell'utente del 25 novembre 2026, sera): tappe del
// Calendario nazionale (PNPV 2023-2025, prorogato per il 2026) dalla data di nascita e promemoria.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VACCINE_SCHEDULE, VACCINE_PLANS, vaccinePlan, vaccineNotices, normalizeAppointment } from '../lib/health.mjs';
import { TRANSLATIONS, translate } from '../lib/i18n.mjs';

const LANGS = ['it', 'en', 'es', 'fr', 'de', 'pt'];
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const baby = { id: 'luca', name: 'Luca', birth_on: '2026-09-20', vaccine_plan: 'mandatory', user_id: 'anna', home_id: null };

test('le obbligatorie: esavalente (3 dosi), MPRV (2 dosi), richiami a 5 anni e in adolescenza', () => {
  const mandatory = VACCINE_SCHEDULE.filter(v => v.mandatory).map(v => v.key);
  assert.deepEqual(mandatory, ['hexa_1', 'hexa_2', 'hexa_3', 'mprv_1', 'dtpa_ipv_5', 'mprv_2', 'dtpa_ipv_teen']);
  const plan = vaccinePlan(baby, [], '2026-11-25');
  assert.deepEqual(plan.map(v => `${v.key}:${v.from}`), ['hexa_1:2026-11-19', 'hexa_2:2027-01-20', 'hexa_3:2027-07-20', 'mprv_1:2027-09-20', 'dtpa_ipv_5:2031-09-20', 'mprv_2:2031-09-20', 'dtpa_ipv_teen:2038-09-20']);
  assert.equal(plan[0].from, '2026-11-19', '61° giorno di vita');
  assert.equal(vaccinePlan({ ...baby, vaccine_plan: 'all' }, [], '2026-11-25').length, 12, 'con le raccomandate: pneumococco, meningococco ACWY, HPV');
  assert.deepEqual(vaccinePlan({ ...baby, vaccine_plan: 'off' }, [], '2026-11-25'), []);
  assert.deepEqual(vaccinePlan({ ...baby, birth_on: null }, [], '2026-11-25'), []);
  assert.match(read('supabase/migrate_v61_vaccini_bambini.sql'), new RegExp(VACCINE_PLANS.map(p => `'${p}'`).join(',')));
});

test('stato delle tappe: fatta, prenotata, da fare ora, tra poco, più avanti, oltre il periodo', () => {
  const appointments = [{ person_id: 'luca', schedule_key: 'hexa_1', on_date: '2026-11-27', done_on: null }];
  const states = date => Object.fromEntries(vaccinePlan(baby, appointments, date).map(v => [v.key, v.state]));
  assert.equal(states('2026-11-25').hexa_1, 'booked');
  assert.equal(states('2027-01-06').hexa_2, 'soon', 'due settimane prima del 20 gennaio');
  assert.equal(states('2027-01-05').hexa_2, 'later');
  assert.equal(states('2027-01-25').hexa_2, 'due');
  assert.equal(states('2027-03-01').hexa_2, 'late', 'oltre il 5° mese');
  const done = vaccinePlan(baby, [{ person_id: 'luca', schedule_key: 'hexa_2', on_date: '2027-01-22', done_on: '2027-01-22' }], '2027-03-01');
  assert.equal(done.find(v => v.key === 'hexa_2').state, 'done');
  assert.equal(normalizeAppointment({ title: 'Esavalente', on_date: '2026-11-27', schedule_key: 'hexa_1' }).value.schedule_key, 'hexa_1');
  assert.equal(normalizeAppointment({ title: 'Esavalente', on_date: '2026-11-27', schedule_key: 'Hexa 1!' }).value.schedule_key, null);
});

test('avviso due settimane prima, una notizia per data, niente se è prenotata o passata da tempo', () => {
  assert.deepEqual(vaccineNotices([baby], [], '2026-11-05').map(n => [n.from, n.items.map(i => i.key)]), [['2026-11-19', ['hexa_1']]]);
  assert.deepEqual(vaccineNotices([baby], [], '2026-11-04'), [], 'oltre due settimane prima: ancora niente');
  assert.deepEqual(vaccineNotices([{ ...baby, vaccine_plan: 'all' }], [], '2026-11-05').map(n => n.items.map(i => i.key)), [['hexa_1', 'pcv_1']], 'stessa data: una notizia sola');
  assert.deepEqual(vaccineNotices([baby], [{ person_id: 'luca', schedule_key: 'hexa_1', on_date: '2026-11-20' }], '2026-11-05'), [], 'prenotata: niente');
  assert.deepEqual(vaccineNotices([baby], [], '2026-12-10'), [], 'cominciata da più di due settimane: niente avvisi ripetuti');
});

function fakeAdmin(tables) {
  return {
    from(name) {
      const filters = []; let upsert = null;
      const builder = {
        select() {
          if (!upsert) return builder;
          const list = (tables[name] ||= []), keys = upsert.options.onConflict.split(','), added = [];
          for (const row of [].concat(upsert.rows)) { if (list.some(r => keys.every(k => String(r[k]) === String(row[k])))) continue; list.push(row); added.push(row); }
          return Promise.resolve({ data: added, error: null });
        },
        order() { return builder; },
        range(from, to) { return builder.then(r => ({ data: r.data ? r.data.slice(from, to + 1) : null, error: r.error })); },
        eq(c, v) { filters.push(r => r[c] === v); return builder; }, neq(c, v) { filters.push(r => r[c] !== v); return builder; },
        is(c, v) { filters.push(r => (r[c] ?? null) === v); return builder; }, not(c, op, v) { filters.push(r => (r[c] ?? null) !== v); return builder; },
        in(c, vs) { filters.push(r => vs.includes(r[c])); return builder; },
        upsert(rows, options) { upsert = { rows, options }; return builder; },
        then(resolve, reject) { return Promise.resolve({ data: (tables[name] || []).filter(r => filters.every(f => f(r))), error: null }).then(resolve, reject); },
      };
      return builder;
    },
  };
}

test('lavoro giornaliero: avviso ai genitori, senza nomi dei vaccini se non li vogliono, una volta', async () => {
  const { processVaccinePlan, vaccineAlertCopy } = await import('../lib/health-reminders.mjs');
  const tables = { health_people: [baby, { ...baby, id: 'off', vaccine_plan: 'off' }], health_appointments: [], user_alerts: [], user_alert_preferences: [] };
  const counts = { errors: [] };
  await processVaccinePlan(fakeAdmin(tables), '2026-11-05', counts);
  assert.deepEqual(counts.errors, []);
  assert.deepEqual(tables.user_alerts.map(a => [a.user_id, a.kind, a.reference_id, a.event_date]), [['anna', 'health', 'luca', '2026-11-19']]);
  assert.equal(tables.user_alerts[0].title, 'Vaccinazioni: Luca');
  assert.match(tables.user_alerts[0].body, /^Dal 19 nov 2026 c’è una tappa del calendario vaccinale/);
  await processVaccinePlan(fakeAdmin(tables), '2026-11-06', { errors: [] });
  assert.equal(tables.user_alerts.length, 1, 'il giorno dopo non ripete');
  assert.match(vaccineAlertCopy({ person: 'Luca', date: '2026-11-19', keys: ['hexa_1', 'pcv_1'] }, 'it', true).body, /Esavalente – 1ª dose, Pneumococco – 1ª dose/);
  for (const lang of LANGS) {
    for (const v of VACCINE_SCHEDULE) for (const prefix of ['health.vaccine.', 'health.vaccineAge.']) assert.ok(TRANSLATIONS[lang][prefix + v.key], `${lang} ${prefix}${v.key}`);
    for (const p of VACCINE_PLANS) assert.ok(TRANSLATIONS[lang]['health.vaccinePlan.' + p], `${lang} ${p}`);
    for (const details of [true, false]) { const c = vaccineAlertCopy({ person: 'Luca', date: '2026-11-19', keys: ['hexa_1'] }, lang, details); assert.ok(!/\{|undefined/.test(c.title + c.body), lang); }
  }
  assert.match(read('lib/daily-jobs.mjs'), /await processVaccinePlan\(admin,today,counts,/);
  assert.match(translate('it', 'health.vaccinesSource'), /10 vaccinazioni obbligatorie/);
});

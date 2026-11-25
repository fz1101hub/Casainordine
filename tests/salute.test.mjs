// Salute: medicine, terapie e visite con i promemoria all'ora (richiesta dell'utente del 25 novembre
// 2026, sera): lib/health.mjs, lib/health-reminders.mjs, calendario, backup.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  RELATIONS, THERAPY_KINDS, APPOINTMENT_KINDS, REMINDER_CODES, HEALTH_LIMITS, romeInstant, romeParts, normalizePerson, normalizeTherapy, normalizeAppointment, normalizeTimes,
  therapyOnDate, dosesOnDate, doseState, dueDoses, dosesPerDay, stockEstimates, reminderInstants, dueAppointmentReminders, upcomingAppointments, addMonths, healthCalendarEvents,
} from '../lib/health.mjs';
import { TRANSLATIONS, translate } from '../lib/i18n.mjs';
import { buildCalendar } from '../lib/calendar-core.mjs';
import { BACKUP_TABLES, BACKUP_EXCLUDED } from '../lib/backup-tables.mjs';
import { RESTORE_ORDER, RESTORE_SECTIONS, prepareRows } from '../lib/backup-restore.mjs';

const LANGS = ['it', 'en', 'es', 'fr', 'de', 'pt'];
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('la migrazione accetta quello che il modulo produce', () => {
  const sql = read('supabase/migrate_v60_salute.sql');
  for (const list of [RELATIONS, THERAPY_KINDS, APPOINTMENT_KINDS, REMINDER_CODES]) for (const v of list) assert.match(sql, new RegExp(`'${v}'`), v);
  assert.match(sql, /cardinality\(times\) between 1 and 12/); assert.equal(HEALTH_LIMITS.times, 12);
  assert.match(sql, /every_days between 1 and 90/); assert.equal(HEALTH_LIMITS.maxEvery, 90);
  assert.match(sql, /repeat_months between 0 and 120/);
  assert.match(sql, /health_push_details boolean not null default false/, 'di partenza niente nomi nelle notifiche');
  assert.match(read('supabase/migrate_v60_cron_salute.sql'), /cron\.schedule\('casa-salute', '\*\/5 \* \* \* \*'/);
});

test('ora di Roma: ora solare, ora legale e cambio dell\'ora', () => {
  assert.equal(romeInstant('2026-11-25', '08:00').toISOString(), '2026-11-25T07:00:00.000Z', 'novembre: UTC+1');
  assert.equal(romeInstant('2026-07-01', '08:00').toISOString(), '2026-07-01T06:00:00.000Z', 'luglio: UTC+2');
  assert.equal(romeInstant('2026-03-29', '01:30').toISOString(), '2026-03-29T00:30:00.000Z', 'prima del cambio');
  assert.equal(romeInstant('2026-03-29', '03:30').toISOString(), '2026-03-29T01:30:00.000Z', 'dopo il cambio');
  assert.equal(romeInstant('2026-03-29', '02:30').toISOString(), '2026-03-29T01:30:00.000Z', 'le 2:30 non esistono: vanno alle 3:30');
  assert.equal(romeInstant('2026-10-25', '08:00').toISOString(), '2026-10-25T07:00:00.000Z', 'ritorno all\'ora solare');
  assert.deepEqual(romeParts('2026-11-25T23:30:00Z'), { date: '2026-11-26', time: '00:30' }, 'dopo mezzanotte a Roma è già domani');
});

test('dati controllati: persona, terapia, appuntamento', () => {
  assert.equal(normalizePerson({ name: '' }).error, 'health.error.name');
  assert.equal(normalizePerson({ name: 'Mamma', birth_on: '2030-01-01' }, '2026-11-25').error, 'health.error.birth');
  assert.equal(normalizePerson({ name: 'Mamma', relation: 'vicina' }).value.relation, 'other');
  assert.deepEqual(normalizeTimes(['20:00', '08:00:00', '08:00', '25:00', 'x']), ['08:00', '20:00']);
  assert.equal(normalizeTherapy({ name: 'X', times: ['08:00'], start_on: '2026-11-25' }).error, 'health.error.therapyName');
  assert.equal(normalizeTherapy({ name: 'Aspirina', times: [], start_on: '2026-11-25' }).error, 'health.error.times');
  assert.equal(normalizeTherapy({ name: 'Aspirina', times: ['08:00'], start_on: '2026-11-25', end_on: '2026-11-20' }).error, 'health.error.end');
  assert.equal(normalizeTherapy({ name: 'Aspirina', times: ['08:00'], start_on: '2026-11-25', every_days: 91 }).error, 'health.error.every');
  const t = normalizeTherapy({ name: 'Vitamina D', times: ['08:00'], start_on: '2026-11-25', weekdays: [4, 1, 1], every_days: 5, stock_item_id: 's', stock_use: '2' }).value;
  assert.deepEqual([t.weekdays, t.every_days, t.stock_use, t.kind, t.remind], [[1, 4], 1, 2, 'medicine', true], 'con i giorni della settimana «ogni quanti giorni» non conta');
  assert.equal(normalizeAppointment({ title: 'V', on_date: '2026-11-28' }).error, 'health.error.title');
  const a = normalizeAppointment({ title: 'Vaccino', on_date: '2026-11-28', reminders: ['day_before', 'hour_before', 'boh'], repeat_months: 12 }).value;
  assert.deepEqual(a.reminders, ['day_before'], '«un\'ora prima» senza ora si toglie');
  assert.deepEqual(normalizeAppointment({ title: 'Vaccino', on_date: '2026-11-28', at_time: '10:30:00', reminders: ['hour_before', 'same_morning'] }).value.reminders, ['same_morning', 'hour_before']);
});

test('in quali giorni: ogni giorno, a giorni alterni, giorni della settimana, inizio e fine', () => {
  const daily = { start_on: '2026-11-20', end_on: '2026-11-26', every_days: 1, times: ['08:00'] };
  assert.equal(therapyOnDate(daily, '2026-11-19'), false); assert.equal(therapyOnDate(daily, '2026-11-26'), true); assert.equal(therapyOnDate(daily, '2026-11-27'), false);
  const alternate = { start_on: '2026-11-20', every_days: 2, times: ['08:00'] };
  assert.equal(therapyOnDate(alternate, '2026-11-24'), true); assert.equal(therapyOnDate(alternate, '2026-11-25'), false);
  const mondaysThursdays = { start_on: '2026-11-01', weekdays: [1, 4], times: ['08:00'] };
  assert.equal(therapyOnDate(mondaysThursdays, '2026-11-26'), true, 'giovedì'); assert.equal(therapyOnDate(mondaysThursdays, '2026-11-25'), false, 'mercoledì');
  assert.equal(dosesPerDay({ times: ['08:00', '20:00'], every_days: 1 }), 2);
  assert.equal(dosesPerDay({ times: ['08:00'], weekdays: [1, 4] }), 2 / 7);
});

test('le dosi di oggi, in ordine di ora, e il loro stato', () => {
  const therapies = [{ id: 'a', person_id: 'p', name: 'Aspirina', times: ['20:00:00', '08:00:00'], every_days: 1, start_on: '2026-11-01' },
    { id: 'b', person_id: 'p', name: 'Vitamina', times: ['13:00'], weekdays: [3], start_on: '2026-11-01' }];
  const list = dosesOnDate(therapies, '2026-11-25');
  assert.deepEqual(list.map(d => `${d.therapy.id}@${d.time}`), ['a@08:00', 'b@13:00', 'a@20:00']);
  assert.equal(list[0].due_at, '2026-11-25T07:00:00.000Z');
  const now = new Date('2026-11-25T12:30:00Z');
  const doses = [{ therapy_id: 'a', due_at: '2026-11-25T07:00:00+00:00', status: 'taken' }];
  assert.equal(doseState(list[0], doses, now).state, 'taken', 'stessa ora anche scritta in un altro modo');
  assert.equal(doseState(list[1], doses, now).state, 'due');
  assert.equal(doseState(list[2], doses, now).state, 'later');
});

test('promemoria delle dosi: negli ultimi 30 minuti, anche a cavallo della mezzanotte, solo con il promemoria', () => {
  const therapies = [{ id: 'a', times: ['08:00', '23:55'], every_days: 1, start_on: '2026-11-01', remind: true }, { id: 'b', times: ['08:00'], every_days: 1, start_on: '2026-11-01', remind: false }];
  assert.deepEqual(dueDoses(therapies, new Date('2026-11-25T07:05:00Z')).map(d => d.therapy.id + d.time), ['a08:00']);
  assert.deepEqual(dueDoses(therapies, new Date('2026-11-25T07:40:00Z')), [], 'oltre i 30 minuti non si manda più');
  assert.deepEqual(dueDoses(therapies, new Date('2026-11-25T06:59:00Z')), [], 'non prima dell\'ora');
  assert.deepEqual(dueDoses(therapies, new Date('2026-11-25T23:10:00Z')).map(d => d.time), ['23:55'], 'le 23:55 di ieri, a mezzanotte e dieci');
});

test('promemoria delle visite: il giorno prima alle 18, la mattina alle 8, un\'ora prima', () => {
  const a = { id: 'v', on_date: '2026-11-28', at_time: '10:30:00', reminders: ['day_before', 'same_morning', 'hour_before'] };
  assert.deepEqual(reminderInstants(a), [
    { code: 'day_before', due_at: '2026-11-27T17:00:00.000Z' }, { code: 'same_morning', due_at: '2026-11-28T07:00:00.000Z' }, { code: 'hour_before', due_at: '2026-11-28T08:30:00.000Z' }]);
  assert.deepEqual(reminderInstants({ ...a, at_time: '07:30', reminders: ['same_morning'] }), [], 'la mattina alle 8 dopo una visita alle 7:30 non serve');
  assert.deepEqual(dueAppointmentReminders([a], new Date('2026-11-27T17:10:00Z')).map(r => r.code), ['day_before']);
  assert.deepEqual(dueAppointmentReminders([{ ...a, done_on: '2026-11-27' }], new Date('2026-11-27T17:10:00Z')), [], 'fatta: niente promemoria');
  const list = upcomingAppointments([{ on_date: '2026-12-01' }, { on_date: '2026-11-28', at_time: '09:00' }, { on_date: '2026-11-28' }, { on_date: '2027-03-01' }, { on_date: '2026-11-20', done_on: '2026-11-20' }], '2026-11-25');
  assert.deepEqual(list.map(x => `${x.on_date}${x.at_time || ''}`), ['2026-11-2809:00', '2026-11-28', '2026-12-01']);
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28'); assert.equal(addMonths('2026-11-28', 12), '2027-11-28');
});

test('scorte: giorni che restano con tutte le terapie che usano la confezione', () => {
  const therapies = [{ id: 'a', times: ['08:00', '20:00'], every_days: 1, stock_item_id: 's', stock_use: 1, start_on: '2026-11-01' },
    { id: 'b', times: ['08:00'], weekdays: [1], stock_item_id: 's', stock_use: 7, start_on: '2026-11-01' },
    { id: 'c', times: ['08:00'], every_days: 1, stock_item_id: 's', stock_use: 5, start_on: '2026-10-01', end_on: '2026-10-10' }];
  const est = stockEstimates(therapies, [{ id: 's', name: 'Compresse', quantity: 12 }], '2026-11-25').get('s');
  assert.deepEqual([est.daily, est.days, est.runs_out_on, est.low], [3, 4, '2026-11-29', true]);
});

// Admin finto: tabelle in memoria; upsert con onConflict e ignoreDuplicates come PostgREST.
function fakeAdmin(tables) {
  let seq = 0;
  return {
    from(name) {
      const filters = []; let upsert = null;
      const builder = {
        select() {
          if (!upsert) return builder;
          const list = (tables[name] ||= []), keys = upsert.options.onConflict.split(','), added = [];
          for (const row of [].concat(upsert.rows)) {
            if (list.some(r => keys.every(k => String(r[k]) === String(row[k])))) continue;
            const made = { id: `${name}-${++seq}`, ...row }; list.push(made); added.push(made);
          }
          return Promise.resolve({ data: added, error: null });
        },
        order() { return builder; }, limit() { return builder; },
        range(from, to) { return builder.then(r => ({ data: r.data ? r.data.slice(from, to + 1) : null, error: r.error })); },
        eq(c, v) { filters.push(r => r[c] === v); return builder; },
        is(c, v) { filters.push(r => (r[c] ?? null) === v); return builder; },
        not(c, op, v) { filters.push(r => (r[c] ?? null) !== v); return builder; },
        in(c, vs) { filters.push(r => vs.includes(r[c])); return builder; },
        gte(c, v) { filters.push(r => r[c] >= v); return builder; },
        lte(c, v) { filters.push(r => r[c] <= v); return builder; },
        upsert(rows, options) { upsert = { rows, options }; return builder; },
        then(resolve, reject) {
          if (tables.error?.[name]) return Promise.resolve({ data: null, error: tables.error[name] }).then(resolve, reject);
          return Promise.resolve({ data: (tables[name] || []).filter(r => filters.every(f => f(r))), error: null }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

test('giro dei promemoria: dose e visita, a chi segue la persona, una volta, senza nomi se non li vuole, anche nell\'orario silenzioso', async () => {
  const { processHealthReminders } = await import('../lib/health-reminders.mjs');
  const tables = {
    health_people: [{ id: 'mamma', user_id: 'anna', home_id: 'h1', name: 'Mamma' }, { id: 'io', user_id: 'carla', home_id: null, name: 'Carla' }],
    health_therapies: [
      { id: 't1', person_id: 'mamma', name: 'Cardioaspirina', dose: '1 compressa', times: ['08:00:00', '20:00:00'], every_days: 1, weekdays: null, start_on: '2026-11-01', end_on: null, remind: true },
      { id: 't2', person_id: 'io', name: 'Antibiotico', dose: '', times: ['08:00:00'], every_days: 1, weekdays: null, start_on: '2026-11-20', end_on: '2026-11-24', remind: true },
      { id: 't3', person_id: 'io', name: 'Vitamina', dose: '', times: ['08:00:00'], every_days: 1, weekdays: null, start_on: '2026-11-01', end_on: null, remind: true },
    ],
    health_doses: [{ id: 'd-presa', therapy_id: 't3', due_at: '2026-11-25T07:00:00.000Z', status: 'taken' }],
    health_appointments: [{ id: 'v1', person_id: 'io', kind: 'vaccine', title: 'Antinfluenzale', on_date: '2026-11-25', at_time: '09:00:00', place: 'Farmacia', reminders: ['hour_before'], done_on: null }],
    home_members: [{ home_id: 'h1', user_id: 'anna' }, { home_id: 'h1', user_id: 'bruno' }],
    user_language_preferences: [{ user_id: 'bruno', language: 'en' }],
    user_alert_preferences: [{ user_id: 'anna', health_push_details: true, quiet_from: '06:00', quiet_until: '09:00' }, { user_id: 'carla', quiet_from: '06:00', quiet_until: '09:00' }],
    push_subscriptions: [{ id: 'dev-anna', user_id: 'anna', endpoint: 'x' }, { id: 'dev-carla', user_id: 'carla', endpoint: 'y' }],
    user_alerts: [],
  };
  const pushed = [];
  const options = { sendPush: async (device, payload) => { pushed.push([device.id, payload.body]); }, configuredPush: () => true };
  const counts = { errors: [] };
  await processHealthReminders(fakeAdmin(tables), new Date('2026-11-25T07:05:00Z'), counts, options);
  assert.deepEqual(counts.errors, []);
  assert.deepEqual(tables.user_alerts.map(a => a.user_id).sort(), ['anna', 'bruno', 'carla'], 'dose della mamma a chi è nella casa; il vaccino di Carla alle 9 (un\'ora prima)');
  const anna = tables.user_alerts.find(a => a.user_id === 'anna'), bruno = tables.user_alerts.find(a => a.user_id === 'bruno'), carla = tables.user_alerts.find(a => a.user_id === 'carla');
  assert.equal(anna.title, 'Terapia: Mamma'); assert.equal(anna.body, 'Sono le 08:00: Cardioaspirina (1 compressa).', 'Anna vuole i nomi');
  assert.equal(bruno.body, 'It’s 08:00: time for the treatment.', 'Bruno no: niente nome del farmaco');
  assert.equal(carla.body, 'Tra un’ora, alle 09:00: vaccinazione.', 'Carla: il tipo, non il titolo');
  assert.deepEqual(tables.health_doses.map(d => `${d.therapy_id}:${d.status}`).sort(), ['t1:pending', 't3:taken'], 'la vitamina già presa non fa partire niente; l\'antibiotico è finito ieri');
  assert.equal(anna.reference_id, tables.health_doses.find(d => d.therapy_id === 't1').id);
  assert.deepEqual(pushed.map(p => p[0]).sort(), ['dev-anna', 'dev-carla'], 'le push partono anche nell\'orario silenzioso (6–9)');
  await processHealthReminders(fakeAdmin(tables), new Date('2026-11-25T07:10:00Z'), { errors: [] }, options);
  assert.equal(tables.user_alerts.length, 3, 'il giro dopo non ripete');
  assert.equal(pushed.length, 2);
});

test('senza la v60 il giro salta in silenzio; testi in tutte le lingue', async () => {
  const { processHealthReminders, doseAlertCopy, appointmentAlertCopy, stockAlertCopy } = await import('../lib/health-reminders.mjs');
  const counts = { errors: [] };
  await processHealthReminders(fakeAdmin({ error: { health_therapies: { code: '42P01', message: 'missing' } } }), new Date(), counts);
  assert.deepEqual(counts.errors, []);
  for (const lang of LANGS) {
    for (const details of [true, false]) {
      const texts = [doseAlertCopy({ person: 'Mamma', name: 'X', dose: '1', time: '08:00' }, lang, details),
        ...['day_before', 'same_morning', 'hour_before'].map(code => appointmentAlertCopy({ person: 'Mamma', code, kind: 'visit', title: 'Cardiologo', place: 'Ospedale', time: '10:30' }, lang, details)),
        appointmentAlertCopy({ person: 'Mamma', code: 'day_before', kind: 'exam', title: 'Analisi' }, lang, details), stockAlertCopy({ name: 'X', days: 1, date: '2026-11-29' }, lang, details)];
      for (const c of texts) assert.ok(c.title && c.body && !/\{|undefined|server\./.test(c.title + c.body), `${lang} ${details}: ${c.title} / ${c.body}`);
      if (!details) assert.ok(!texts.some(c => /Cardiologo|Ospedale/.test(c.body)), `${lang}: niente dettagli`);
    }
    for (const k of [...RELATIONS.map(r => 'health.relation.' + r), ...THERAPY_KINDS.map(r => 'health.kind.' + r), ...APPOINTMENT_KINDS.map(r => 'health.appointmentKind.' + r), ...REMINDER_CODES.map(r => 'health.reminder.' + r)])
      assert.ok(TRANSLATIONS[lang][k], `${lang} ${k}`);
  }
  assert.equal(appointmentAlertCopy({ person: 'Mamma', code: 'day_before', kind: 'visit', title: 'Cardiologo', time: '10:30' }, 'it', true).body, 'Domani alle 10:30: Cardiologo.');
});

test('calendario del telefono: visite con l\'ora, solo il tipo se non si vogliono i dettagli', () => {
  const events = healthCalendarEvents([{ id: 'p', name: 'Mamma' }], [
    { id: 'v1', person_id: 'p', kind: 'visit', title: 'Cardiologo', on_date: '2026-11-28', at_time: '10:30:00', place: 'Ospedale' },
    { id: 'v2', person_id: 'p', kind: 'vaccine', title: 'Antinfluenzale', on_date: '2026-12-02', at_time: null, place: '' },
    { id: 'v3', person_id: 'p', kind: 'exam', title: 'Fatto', on_date: '2026-11-26', done_on: '2026-11-26' }], '2026-11-25');
  assert.deepEqual(events.map(e => e.uid), ['health-v1', 'health-v2']);
  const t = (key, params) => translate('it', 'calendar.ics.' + key, params);
  const ics = buildCalendar([], '20261125T000000Z', t, [], events.map(e => ({ ...e, what: '', place: '' })));
  assert.match(ics, /DTSTART;TZID=Europe\/Rome:20261128T103000/);
  assert.match(ics, /DURATION:PT1H/);
  assert.match(ics, /SUMMARY:Mamma: Visita/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261202/);
  assert.doesNotMatch(ics, /Cardiologo|Ospedale/);
  assert.match(buildCalendar([], 'x', t, [], [{ ...events[0], what: 'Cardiologo' }]), /SUMMARY:Mamma: Cardiologo/);
});

test('backup e ripristino: persone, terapie, dosi e visite; i promemoria mandati restano fuori', () => {
  for (const table of ['health_people', 'health_therapies', 'health_doses', 'health_appointments']) {
    assert.ok(BACKUP_TABLES.some(t => t.name === table), table);
    assert.ok(RESTORE_ORDER.includes(table), table);
    assert.equal(RESTORE_SECTIONS[table], 'health');
  }
  assert.ok(BACKUP_EXCLUDED.health_reminders_sent);
  const ids = { health_people: { p1: 'P1' }, health_therapies: { t1: 'T1' }, home_stock_items: { s1: 'S1' }, health_doses: { d1: 'D1' } };
  const [therapy] = prepareRows('health_therapies', [{ id: 't1', person_id: 'p1', stock_item_id: 's1', created_by: 'old', home_id: 'x' }], { homeId: 'h2', userId: 'me', ids });
  assert.deepEqual([therapy.id, therapy.person_id, therapy.stock_item_id, therapy.created_by, 'home_id' in therapy], ['T1', 'P1', 'S1', 'me', false]);
  const [dose] = prepareRows('health_doses', [{ id: 'd1', therapy_id: 't1', due_at: '2026-11-25T07:00:00Z', status: 'taken' }], { homeId: 'h2', userId: 'me', ids });
  assert.deepEqual([dose.id, dose.therapy_id], ['D1', 'T1']);
});

test('collegamenti: menu, pagina, notifiche, giro ogni 5 minuti, lavoro giornaliero', () => {
  assert.match(read('lib/menu-groups.mjs'), /'household', 'health'/);
  assert.match(read('app/page.jsx'), /tab==='health'&&<Health /);
  assert.match(read('app/Health.jsx'), /useSection\('health'\)/);
  assert.match(read('lib/push-preferences.mjs'), /health:'push_health'/);
  assert.match(read('app/HomeExtra.jsx'), /\['push_health','extra\.alerts\.health'\]/);
  assert.match(read('app/api/cron/health/route.js'), /scheduledCallAuthorized\(request, admin\)/);
  assert.match(read('lib/daily-jobs.mjs'), /await processHealthStock\(admin,today,counts,/);
  assert.match(read('lib/extra-alerts.mjs'), /ignoreQuiet\?pushKindAllowed\(pref,row\.kind\):pushAllowed\(pref,row\.kind,now\)/);
});

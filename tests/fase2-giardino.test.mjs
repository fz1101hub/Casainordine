import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  TASK_KINDS, PLANT_KINDS, GARDEN_LIMITS, EVERY_CHOICES, PRESETS, PRESET_KEYS, ALL_MONTHS,
  normalizeMonths, monthWindows, windowAt, firstActiveFrom, nextWindowStart, nextDue, deadlineOf, taskState, markDone, postpone,
  gardenAgenda, normalizePlant, normalizeTask, normalizeLog, presetTextKeys, presetTasks, presetTaskTitle, missingPresetTasks, gardenEventsToday, addDays,
  expectedHarvest as expectedHarvestOf, safeHarvestFrom as safeFrom, FAMILIES,
} from '../lib/garden.mjs';
import { TRANSLATIONS, translate } from '../lib/i18n.mjs';

const LANGS = ['it', 'en', 'es', 'fr', 'de', 'pt'];
const it = (key, params) => translate('it', key, params);

test('mesi e periodi, anche a cavallo dell\'anno', () => {
  assert.deepEqual(normalizeMonths([3, '4', 4, 13, 0, 'x', 12]), [3, 4, 12]);
  assert.deepEqual(monthWindows([3, 4, 10, 11]), [[3, 4], [10, 11]]);
  assert.deepEqual(monthWindows([1, 2, 11, 12]), [[11, 12, 1, 2]]);
  assert.deepEqual(monthWindows([3, 5, 9]), [[3], [5], [9]]);
  assert.deepEqual(monthWindows(ALL_MONTHS), [ALL_MONTHS]);
  assert.deepEqual(windowAt([11, 12, 1, 2], '2026-01-15'), { start: '2025-11-01', end: '2026-02-28' });
  assert.deepEqual(windowAt([11, 12, 1, 2], '2026-11-03'), { start: '2026-11-01', end: '2027-02-28' });
  assert.deepEqual(windowAt([2], '2028-02-10'), { start: '2028-02-01', end: '2028-02-29' }, 'anno bisestile');
  assert.equal(windowAt([3, 4], '2026-05-01'), null);
  assert.equal(firstActiveFrom([3, 4], '2026-03-20'), '2026-03-20');
  assert.equal(firstActiveFrom([3, 4], '2026-11-25'), '2027-03-01');
  assert.equal(nextWindowStart([3, 4, 10, 11], '2026-04-30'), '2026-10-01');
  assert.equal(nextWindowStart([11, 12, 1, 2], '2026-02-28'), '2026-11-01');
  assert.equal(nextWindowStart(ALL_MONTHS, '2026-05-05'), '2027-01-01');
});

test('prossima data: interventi ripetuti nei loro mesi', () => {
  const feed = { months: [3, 4, 5, 6, 7, 8, 9, 10], every_days: 30 };
  assert.equal(nextDue(feed, '2026-05-10'), '2026-05-10', 'mai fatto, siamo nei mesi: subito');
  assert.equal(nextDue(feed, '2026-11-25'), '2027-03-01', 'mai fatto, fuori stagione: inizio dei mesi');
  assert.equal(nextDue({ ...feed, last_done_on: '2026-05-01' }, '2026-05-01'), '2026-05-31');
  assert.equal(nextDue({ ...feed, last_done_on: '2026-10-15' }, '2026-10-15'), '2027-03-01', 'fuori dai mesi si salta alla primavera');
  assert.equal(nextDue({ ...feed, last_done_on: '2026-05-01' }), '2026-05-31', 'con l\'ultima volta la data di oggi non serve');
  assert.equal(nextDue({ months: [], every_days: 7 }, '2026-05-01'), null);
  // Registrato dopo: fatto a metà settembre, oggi è novembre e la stagione è chiusa → primavera, non «in ritardo».
  assert.equal(nextDue({ ...feed, months: [3, 4, 5, 6, 7, 8, 9], every_days: 15, last_done_on: '2026-09-15' }, '2026-11-25'), '2027-03-01');
  // Fatto ad agosto, oggi è il 20 settembre: la stagione continua e la volta dopo è già passata → da fare.
  assert.equal(nextDue({ ...feed, months: [3, 4, 5, 6, 7, 8, 9], every_days: 15, last_done_on: '2026-08-01' }, '2026-09-20'), '2026-08-16');
  assert.equal(nextDue({ months: [3, 4, 10, 11], every_days: 0, last_done_on: '2025-03-10' }, '2026-11-02'), '2026-11-02', 'una volta per periodo: il periodo in corso non è ancora fatto');
});

test('prossima data: una volta per periodo', () => {
  const copper = { months: [3, 4, 10, 11], every_days: 0 };
  assert.equal(nextDue(copper, '2026-03-20'), '2026-03-20');
  assert.equal(nextDue(copper, '2026-06-01'), '2026-10-01');
  assert.equal(nextDue({ ...copper, last_done_on: '2026-03-10' }, '2026-03-10'), '2026-10-01', 'fatto in primavera: il prossimo è in autunno');
  assert.equal(nextDue({ ...copper, last_done_on: '2026-11-02' }, '2026-11-02'), '2027-03-01');
  assert.equal(nextDue({ months: [11, 12, 1, 2], every_days: 0, last_done_on: '2027-01-10' }), '2027-11-01', 'periodo a cavallo dell\'anno: una volta sola');
  assert.equal(nextDue({ months: ALL_MONTHS, every_days: 0, last_done_on: '2026-05-05' }), '2027-01-01');
});

test('stato, fine del tempo utile, fatto e rimandato', () => {
  const once = { months: [3, 4], every_days: 0, next_on: '2026-03-01' };
  assert.equal(deadlineOf(once), '2026-04-30');
  assert.equal(taskState(once, '2026-04-30'), 'due');
  assert.equal(taskState(once, '2026-05-01'), 'late');
  const repeat = { months: [3], every_days: 14, next_on: '2026-03-01' };
  assert.equal(deadlineOf(repeat), '2026-03-08');
  assert.equal(taskState(repeat, '2026-03-08'), 'due');
  assert.equal(taskState(repeat, '2026-03-09'), 'late');
  assert.equal(taskState({ next_on: '2026-03-10' }, '2026-03-01'), 'soon');
  assert.equal(taskState({ next_on: '2026-06-10' }, '2026-03-01'), 'later');
  assert.equal(taskState({ next_on: null }, '2026-03-01'), 'none');
  assert.deepEqual(markDone({ months: [3, 4, 10, 11], every_days: 0 }, '2026-03-12'), { last_done_on: '2026-03-12', next_on: '2026-10-01' });
  assert.equal(postpone('2026-12-28'), '2027-01-04');
  assert.deepEqual(markDone({ months: [3, 4, 5, 6, 7, 8, 9], every_days: 15 }, '2026-09-15', '2026-11-25'), { last_done_on: '2026-09-15', next_on: '2027-03-01' }, 'registrato a novembre');
});

test('da fare: in ritardo, da fare, in arrivo; niente oltre 30 giorni', () => {
  const today = '2026-05-10';
  const tasks = [
    { id: 'a', title: 'Più avanti', next_on: '2026-07-01', months: [7] },
    { id: 'b', title: 'Tra poco', next_on: '2026-05-15', months: [5] },
    { id: 'c', title: 'In ritardo', next_on: '2026-03-01', months: [3, 4], every_days: 0 },
    { id: 'd', title: 'Da fare', next_on: '2026-05-09', months: [5], every_days: 30 },
    { id: 'e', title: 'Senza data', next_on: null, months: [5] },
  ];
  assert.deepEqual(gardenAgenda(tasks, today).map(x => [x.task.id, x.state]), [['c', 'late'], ['d', 'due'], ['b', 'soon']]);
});

test('pianta, intervento e registro controllati', () => {
  assert.equal(normalizePlant({ name: ' x ' }).error, 'garden.error.name');
  assert.deepEqual(normalizePlant({ name: '  Limone   sul terrazzo ', preset: 'citrus', location: 'Terrazzo' }).value,
    { name: 'Limone sul terrazzo', preset: 'citrus', kind: 'fruit', location: 'Terrazzo', notes: '' });
  assert.equal(normalizePlant({ name: 'Strana', preset: 'non-esiste' }).value.preset, null);
  assert.equal(normalizeTask({ title: 'a', months: [3] }, '2026-03-01').error, 'garden.error.title');
  assert.equal(normalizeTask({ title: 'Potatura', months: [] }, '2026-03-01').error, 'garden.error.months');
  assert.equal(normalizeTask({ title: 'Potatura', months: [3], every_days: 400 }, '2026-03-01').error, 'garden.error.every');
  assert.equal(normalizeTask({ title: 'Potatura', months: [3], every_days: 1.5 }, '2026-03-01').error, 'garden.error.every');
  const task = normalizeTask({ title: 'Potatura', kind: 'pruning', months: ['4', 3], product: 'Forbici', remind: false }, '2026-03-20').value;
  assert.deepEqual([task.kind, task.months, task.every_days, task.next_on, task.remind], ['pruning', [3, 4], 0, '2026-03-20', false]);
  assert.equal(normalizeTask({ title: 'X y', kind: 'magia', months: [3] }, '2026-03-01').value.kind, 'other');
  assert.equal(normalizeLog({ title: 'Concime', done_on: '2026-05-02' }, '2026-05-01').error, 'garden.error.date', 'niente date future');
  assert.equal(normalizeLog({ title: 'Concime', done_on: '2026-05-01', kind: 'fertilize' }, '2026-05-01').value.kind, 'fertilize');
});

test('proposte: tipi, mesi e frequenze validi, testi in tutte le lingue', () => {
  assert.ok(PRESET_KEYS.length >= 25);
  for (const lang of LANGS) for (const f of FAMILIES) assert.ok(TRANSLATIONS[lang]['garden.family.' + f], `garden.family.${f} in ${lang}`);
  for (const [key, preset] of Object.entries(PRESETS)) {
    assert.match(key, /^[a-z][a-z_]{1,39}$/, 'come chiede il database');
    assert.ok(PLANT_KINDS.includes(preset.kind), key);
    assert.ok(preset.tasks.length >= 2 && preset.tasks.length <= GARDEN_LIMITS.tasksPerPlant, key);
    for (const task of preset.tasks) {
      assert.ok(TASK_KINDS.includes(task.kind), `${key}: ${task.kind}`);
      assert.deepEqual(normalizeMonths(task.months), [...task.months].sort((a, b) => a - b), `${key}: mesi`);
      assert.ok(EVERY_CHOICES.includes(task.every), `${key}: ogni ${task.every} giorni è tra le scelte del modulo`);
      assert.ok(!(task.title && task.purpose), `${key}: titolo o scopo, non tutti e due`);
    }
  }
  const keys = presetTextKeys();
  assert.ok(keys.length > 60);
  for (const lang of LANGS) for (const key of keys) assert.ok(TRANSLATIONS[lang][key]?.trim(), `${key} in ${lang}`);
  for (const lang of LANGS) {
    for (const kind of TASK_KINDS) assert.ok(TRANSLATIONS[lang]['garden.kind.' + kind], `garden.kind.${kind} in ${lang}`);
    for (const kind of PLANT_KINDS) assert.ok(TRANSLATIONS[lang]['garden.plantKind.' + kind], `garden.plantKind.${kind} in ${lang}`);
  }
});

test('proposte pronte nella lingua di chi le usa, da accettare o cambiare', () => {
  const tasks = presetTasks('citrus', it, '2026-03-20');
  assert.equal(tasks.length, PRESETS.citrus.tasks.length);
  const feed = tasks.find(t => t.kind === 'fertilize' && t.every_days === 30);
  assert.deepEqual([feed.title, feed.product, feed.next_on], ['Concimazione', 'Concime per agrumi con microelementi', '2026-03-20']);
  assert.equal(tasks.find(t => t.product === 'Olio bianco minerale').title, 'Trattamento contro la cocciniglia');
  const en = presetTasks('citrus', (k, p) => translate('en', k, p), '2026-03-20');
  assert.equal(en.find(t => t.kind === 'treatment').title, 'Treatment against scale insects');
  assert.equal(presetTaskTitle({ kind: 'pruning', title: 'winter_pruning' }, (k, p) => translate('de', k, p)), 'Winterschnitt');
  for (const task of tasks) assert.ok(normalizeTask(task, '2026-03-20').value, `${task.title} passa i controlli`);
  assert.deepEqual(presetTasks('non-esiste', it, '2026-03-20'), []);
  const plant = { preset: 'citrus' };
  assert.equal(missingPresetTasks(plant, [{ title: 'concimazione' }, { title: 'Potatura di forma' }], it, '2026-03-20').length, tasks.length - 2);
});

test('promemoria: una volta per intervento e data, anche se il lavoro salta qualche giorno', () => {
  const today = '2026-05-10';
  const tasks = [
    { id: 'oggi', next_on: today, remind: true }, { id: 'ieri', next_on: '2026-05-09', remind: true },
    { id: 'vecchio', next_on: addDays(today, -GARDEN_LIMITS.graceDays - 1), remind: true },
    { id: 'domani', next_on: '2026-05-11', remind: true }, { id: 'muto', next_on: today, remind: false }, { id: 'senza', next_on: null },
  ];
  assert.deepEqual(gardenEventsToday(tasks, today), [
    { kind: 'garden', reference_id: 'oggi', event_date: today }, { kind: 'garden', reference_id: 'ieri', event_date: '2026-05-09' }]);
});

test('la migrazione accetta quello che il modulo produce', () => {
  const sql = readFileSync(new URL('../supabase/migrate_v57_giardino.sql', import.meta.url), 'utf8');
  for (const kind of TASK_KINDS) assert.match(sql, new RegExp(`'${kind}'`), kind);
  for (const kind of PLANT_KINDS) assert.match(sql, new RegExp(`'${kind}'`), kind);
  assert.match(sql, /between 2 and 120/);
  assert.match(sql, /every_days between 0 and 365/);
  assert.match(sql, />= 300/);
  assert.match(sql, />= 40/);
});

// Admin finto come in tests/fase2-automazioni.test.mjs: legge le tabelle in memoria, gli avvisi
// sono unici per persona, tipo, voce e data.
function fakeAdmin(tables) {
  const alerts = tables.user_alerts ||= [];
  return {
    from(name) {
      const filters = []; let upsertRow = null;
      const builder = {
        select() {
          if (!upsertRow) return builder;
          const added = [];
          for (const row of [].concat(upsertRow)) {
            const exists = alerts.some(a => a.user_id === row.user_id && a.kind === row.kind && a.reference_id === row.reference_id && a.event_date === row.event_date);
            if (!exists) { alerts.push(row); added.push(row); }
          }
          return Promise.resolve({ data: added, error: null });
        },
        order() { return builder; },
        range(from, to) { return builder.then(result => ({ data: result.data ? result.data.slice(from, to + 1) : null, error: result.error })); },
        eq(column, value) { filters.push(row => row[column] === value); return builder; },
        in(column, values) { filters.push(row => values.includes(row[column])); return builder; },
        gte(column, value) { filters.push(row => row[column] >= value); return builder; },
        lte(column, value) { filters.push(row => row[column] <= value); return builder; },
        upsert(row) { upsertRow = row; return builder; },
        then(resolve, reject) {
          if (tables.error?.[name]) return Promise.resolve({ data: null, error: tables.error[name] }).then(resolve, reject);
          return Promise.resolve({ data: (tables[name] || []).filter(row => filters.every(f => f(row))), error: null }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

test('promemoria del lavoro giornaliero: a chi ha la pianta o a tutta la casa, nella sua lingua, una volta', async () => {
  const { processGardenAlerts, gardenAlertCopy } = await import('../lib/garden-alerts.mjs');
  const today = '2026-05-10';
  const tables = {
    home_garden_plants: [{ id: 'p-casa', user_id: 'anna', home_id: 'h1', name: 'Limone sul terrazzo' }, { id: 'p-mia', user_id: 'carla', home_id: null, name: 'Basilico' }],
    home_garden_tasks: [
      { id: 't1', plant_id: 'p-casa', title: 'Concimazione', product: 'Concime per agrumi', next_on: today, remind: true },
      { id: 't2', plant_id: 'p-mia', title: 'Potatura di forma', product: '', next_on: '2026-05-08', remind: true },
      { id: 't3', plant_id: 'p-mia', title: 'Senza promemoria', product: '', next_on: today, remind: false },
      { id: 't4', plant_id: 'p-casa', title: 'Domani', product: '', next_on: '2026-05-11', remind: true },
    ],
    home_members: [{ home_id: 'h1', user_id: 'anna' }, { home_id: 'h1', user_id: 'bruno' }],
    user_language_preferences: [{ user_id: 'bruno', language: 'en' }],
  };
  const counts = { errors: [] };
  await processGardenAlerts(fakeAdmin(tables), today, counts);
  assert.deepEqual(counts.errors, []);
  assert.deepEqual(tables.user_alerts.map(a => [a.user_id, a.kind, a.reference_id, a.event_date]).sort(), [
    ['anna', 'garden', 't1', today], ['bruno', 'garden', 't1', today], ['carla', 'garden', 't2', '2026-05-08']]);
  const anna = tables.user_alerts.find(a => a.user_id === 'anna'), bruno = tables.user_alerts.find(a => a.user_id === 'bruno');
  assert.equal(anna.title, 'Giardino: Limone sul terrazzo');
  assert.match(anna.body, /^È il momento di: Concimazione \(Concime per agrumi\)\. Data prevista: /);
  assert.equal(bruno.title, 'Garden: Limone sul terrazzo');
  const before = tables.user_alerts.length;
  await processGardenAlerts(fakeAdmin(tables), today, { errors: [] });
  assert.equal(tables.user_alerts.length, before, 'rilanciato non duplica');
  for (const lang of LANGS) {
    const copy = gardenAlertCopy({ plant: 'Rosa', task: 'Potatura', product: '', date: today }, lang);
    assert.ok(copy.title.includes('Rosa') && copy.body.includes('Potatura') && !/\{|undefined/.test(copy.title + copy.body), lang);
  }
  assert.throws(() => gardenAlertCopy({ plant: '', task: 'x', date: today }));
});

test('senza la migrazione il lavoro giornaliero salta il giardino senza errori', async () => {
  const { processGardenAlerts } = await import('../lib/garden-alerts.mjs');
  const counts = { errors: [] };
  await processGardenAlerts(fakeAdmin({ error: { home_garden_tasks: { code: 'PGRST205', message: 'missing' } } }), '2026-05-10', counts);
  assert.deepEqual(counts.errors, []);
  const other = { errors: [] };
  await processGardenAlerts(fakeAdmin({ error: { home_garden_tasks: { code: '57014', message: 'timeout' } } }), '2026-05-10', other);
  assert.equal(other.errors.length, 1);
});

test('notifiche push del giardino: interruttore proprio, collegato al lavoro giornaliero e alla schermata', async () => {
  const { pushAllowed } = await import('../lib/extra-alerts.mjs');
  const at = new Date('2026-05-10T10:00:00Z');
  assert.ok(pushAllowed({}, 'garden', at));
  assert.ok(!pushAllowed({ push_garden: false }, 'garden', at));
  assert.match(readFileSync(new URL('../lib/daily-jobs.mjs', import.meta.url), 'utf8'), /await processGardenAlerts\(admin,today,counts,/);
  assert.match(readFileSync(new URL('../app/HomeExtra.jsx', import.meta.url), 'utf8'), /\['push_garden','extra\.alerts\.garden'\]/);
  assert.match(readFileSync(new URL('../supabase/migrate_v57_giardino.sql', import.meta.url), 'utf8'), /add column if not exists push_garden boolean not null default true/);
});

// Seconda parte (25 novembre 2026): clima, calendario, prodotti e sicurezza, orto.
test('clima della zona: i periodi si spostano di un mese, senza ridursi troppo', async () => {
  const { adjustMonths, shiftMonth, presetTasks: tasksFor, presetPlant } = await import('../lib/garden.mjs');
  assert.equal(shiftMonth(3, 'cold'), 4); assert.equal(shiftMonth(10, 'cold'), 9); assert.equal(shiftMonth(12, 'cold'), 12); assert.equal(shiftMonth(3, 'warm'), 2);
  assert.deepEqual(adjustMonths([3, 4, 10, 11], 'mild'), [3, 4, 10, 11]);
  assert.deepEqual(adjustMonths([3, 4, 10, 11], 'cold'), [4, 5, 9, 10], 'primavera più tardi, autunno prima');
  assert.deepEqual(adjustMonths([3, 4, 10, 11], 'warm'), [2, 3, 11, 12]);
  assert.deepEqual(adjustMonths([11], 'cold'), [10], 'riparo dal freddo prima dove gli inverni sono rigidi');
  assert.deepEqual(adjustMonths([11, 12, 1, 2], 'cold'), [1, 2, 3, 10, 11, 12], 'periodo a cavallo dell\'anno più lungo');
  assert.deepEqual(adjustMonths([7, 8, 9], 'cold'), [8, 9], 'un periodo estivo breve perde al massimo un mese');
  assert.deepEqual(adjustMonths(ALL_MONTHS, 'warm'), ALL_MONTHS);
  const cold = tasksFor('olive', it, '2026-11-25', 'cold').find(t => t.product.startsWith('Rame'));
  assert.deepEqual(cold.months, [4, 5, 9, 10]);
  assert.deepEqual(presetPlant('tomato'), { kind: 'vegetable', family: 'solanaceae', harvest_days: 75 });
  assert.deepEqual(presetPlant('rose'), { kind: 'ornamental', family: null, harvest_days: null });
});

test('calendario dell\'anno: date ripetute nei loro mesi, dodici mesi da oggi', async () => {
  const { projectDates, yearCalendar } = await import('../lib/garden.mjs');
  assert.deepEqual(projectDates({ next_on: '2026-05-01', months: [5, 6], every_days: 15 }, '2026-05-01', '2026-12-31'),
    ['2026-05-01', '2026-05-16', '2026-05-31', '2026-06-15', '2026-06-30']);
  assert.deepEqual(projectDates({ next_on: '2026-11-25', months: [3, 4, 10, 11], every_days: 0 }, '2026-11-01', '2027-12-31'), ['2026-11-25', '2027-03-01', '2027-10-01']);
  assert.deepEqual(projectDates({ next_on: null, months: [3] }, '2026-01-01', '2026-12-31'), []);
  const months = yearCalendar([{ id: 'a', title: 'Concime', next_on: '2026-12-10', months: [12, 1], every_days: 14 }], '2026-11-25');
  assert.equal(months.length, 12);
  assert.deepEqual([months[0].key, months[11].key], ['2026-11', '2027-10']);
  assert.deepEqual(months[1].entries[0].dates, ['2026-12-10', '2026-12-24']);
  assert.deepEqual(months[2].entries[0].dates, ['2027-01-07', '2027-01-21']);
  assert.equal(months[0].entries.length, 0);
});

test('raccolta prevista, attesa dopo i trattamenti e nuovi campi controllati', () => {
  assert.equal(expectedHarvestOf({ planted_on: '2026-04-20', harvest_days: 75 }), '2026-07-04');
  assert.equal(expectedHarvestOf({ planted_on: '2026-04-20' }), null);
  const entries = [{ done_on: '2026-07-01', wait_days: 20 }, { done_on: '2026-07-10', wait_days: 3 }, { done_on: '2026-06-01' }];
  assert.equal(safeFrom(entries, '2026-07-12'), '2026-07-21');
  assert.equal(safeFrom(entries, '2026-07-21'), null, 'dal giorno sicuro in poi niente avviso');
  const plant = normalizePlant({ name: 'Pomodori', preset: 'tomato', planted_on: '2026-04-20', harvest_days: '75', bed: ' Aiuola  1 ', family: 'solanaceae' }).value;
  assert.deepEqual([plant.planted_on, plant.harvest_days, plant.bed, plant.family, plant.ended_on], ['2026-04-20', 75, 'Aiuola 1', 'solanaceae', null]);
  assert.equal(normalizePlant({ name: 'Pomodori', harvest_days: 500 }).error, 'garden.error.harvest');
  assert.equal(normalizePlant({ name: 'Pomodori', planted_on: '2026-04-20', ended_on: '2026-04-01' }).error, 'garden.error.ended');
  assert.equal(normalizePlant({ name: 'Pomodori', family: 'rettili', bed: '' }).value.family, null);
  assert.ok(!('bed' in normalizePlant({ name: 'Rosa' }).value), 'senza i campi dell\'orto il modulo resta quello della v57');
  const task = normalizeTask({ title: 'Rame', months: [6], wait_days: '20', stock_item_id: 's1', stock_use: '0,05'.replace(',', '.') }, '2026-06-01').value;
  assert.deepEqual([task.wait_days, task.stock_item_id, task.stock_use], [20, 's1', 0.05]);
  assert.equal(normalizeTask({ title: 'Rame', months: [6], wait_days: 400 }, '2026-06-01').error, 'garden.error.wait');
  assert.equal(normalizeTask({ title: 'Rame', months: [6], stock_item_id: 's1', stock_use: 0 }, '2026-06-01').error, 'garden.error.stockUse');
  assert.equal(normalizeTask({ title: 'Rame', months: [6], stock_item_id: '', stock_use: 5 }, '2026-06-01').value.stock_use, null, 'senza scorta niente quantità');
  assert.equal(normalizeLog({ title: 'Rame', done_on: '2026-06-01', wait_days: '20' }, '2026-06-02').value.wait_days, 20);
});

test('orto: rotazione nelle aiuole e storia degli ultimi anni', async () => {
  const { rotationCheck, bedsOverview } = await import('../lib/garden.mjs');
  const plants = [
    { id: 'p1', name: 'Pomodori', bed: 'Aiuola 1', family: 'solanaceae', planted_on: '2025-04-20', ended_on: '2025-09-30' },
    { id: 'p2', name: 'Fagiolini', bed: 'aiuola 1', family: 'fabaceae', planted_on: '2024-05-01', ended_on: '2024-08-30' },
    { id: 'p3', name: 'Peperoni', bed: 'Aiuola 1', family: 'solanaceae', planted_on: '2022-04-20', ended_on: '2022-09-30' },
    { id: 'p4', name: 'Insalata', bed: 'Aiuola 2', family: 'asteraceae', planted_on: '2026-03-10' },
  ];
  const tomatoes = rotationCheck(plants, { bed: 'AIUOLA 1', family: 'solanaceae', year: 2026 });
  assert.deepEqual(tomatoes.conflicts.map(p => p.id), ['p1'], 'pomodori dell\'anno scorso; i peperoni di quattro anni fa non contano');
  assert.ok(!tomatoes.suggestions.includes('solanaceae') && !tomatoes.suggestions.includes('fabaceae') && tomatoes.suggestions.includes('brassicaceae'));
  assert.deepEqual(rotationCheck(plants, { bed: 'Aiuola 1', family: 'brassicaceae', year: 2026 }).conflicts, []);
  assert.deepEqual(rotationCheck(plants, { bed: '', family: 'solanaceae', year: 2026 }), { conflicts: [], suggestions: [] });
  const beds = bedsOverview(plants, 2026);
  assert.deepEqual(beds.map(b => b.bed), ['Aiuola 1', 'Aiuola 2']);
  assert.deepEqual(beds[0].now, [], 'aiuola 1 adesso libera');
  assert.deepEqual(beds[0].years.map(([y, list]) => [y, list.map(p => p.id)]), [[2025, ['p1']], [2024, ['p2']]]);
  assert.deepEqual(beds[1].now.map(p => p.id), ['p4']);
});

test('calendario del telefono: eventi del giardino, non delle colture finite', async () => {
  const { gardenCalendarEvents } = await import('../lib/garden.mjs');
  const { calendarText } = await import('../lib/calendar.mjs');
  const plants = [{ id: 'g1', name: 'Limone' }, { id: 'g2', name: 'Pomodori', ended_on: '2026-09-30' }];
  const tasks = [{ id: 't1', plant_id: 'g1', title: 'Concimazione', product: 'Concime per agrumi', months: [3, 4], every_days: 30, next_on: '2027-03-01' },
    { id: 't2', plant_id: 'g2', title: 'Rame', months: [6], every_days: 10, next_on: '2027-06-01' }];
  const events = gardenCalendarEvents(plants, tasks, '2026-11-25');
  assert.deepEqual(events.map(e => e.uid), ['garden-t1-2027-03-01', 'garden-t1-2027-03-31', 'garden-t1-2027-04-30']);
  const text = calendarText([], '20261125T090000Z', 'it', events).replace(/\r\n /g, ''); // righe ripiegate a 75 byte
  assert.match(text, /SUMMARY:Giardino: Concimazione · Limone/);
  assert.match(text, /DESCRIPTION:Prodotto: Concime per agrumi\. Segna «Fatto» nell’app quando l’hai fatto\./);
  assert.match(text, /UID:garden-t1-2027-03-01@casainordine/);
  assert.equal((text.match(/BEGIN:VEVENT/g) || []).length, 3);
  for (const lang of LANGS) assert.ok(!/\{|undefined/.test(calendarText([], '20261125T090000Z', lang, events)), lang);
});

test('promemoria: niente avvisi per le colture finite', async () => {
  const { processGardenAlerts } = await import('../lib/garden-alerts.mjs');
  const today = '2026-05-10';
  const tables = {
    home_garden_plants: [{ id: 'p1', user_id: 'anna', home_id: null, name: 'Pomodori', ended_on: '2026-05-01' }, { id: 'p2', user_id: 'anna', home_id: null, name: 'Limone', ended_on: null }],
    home_garden_tasks: [{ id: 't1', plant_id: 'p1', title: 'Rame', product: '', next_on: today, remind: true }, { id: 't2', plant_id: 'p2', title: 'Concime', product: '', next_on: today, remind: true }],
  };
  await processGardenAlerts(fakeAdmin(tables), today, { errors: [] });
  assert.deepEqual(tables.user_alerts.map(a => a.reference_id), ['t2']);
});

// Animali di casa (scelta dell'utente del 25 novembre 2026, sera): lib/pets.mjs, lib/pet-alerts.mjs,
// calendario del telefono e ripristino del backup.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SPECIES, PET_TASK_KINDS, PET_LOG_KINDS, PET_LIMITS, PET_EVERY_CHOICES, PET_PRESETS, PET_PRESET_KEYS, PET_TASK_KEYS,
  normalizePet, normalizePetTask, normalizePetLog, petPresetTasks, missingPetPresetTasks, petTaskState, markPetDone, postponePet,
  petAgenda, petAge, weightSeries, weightChange, foodEstimates, petEventsToday, petCalendarEvents, vetCosts,
} from '../lib/pets.mjs';
import { TRANSLATIONS, translate } from '../lib/i18n.mjs';
import { buildCalendar } from '../lib/calendar-core.mjs';
import { prepareRows, RESTORE_ORDER, RESTORE_SECTIONS } from '../lib/backup-restore.mjs';
import { BACKUP_TABLES } from '../lib/backup-tables.mjs';

const LANGS = ['it', 'en', 'es', 'fr', 'de', 'pt'];
const it = (key, params) => translate('it', key, params);
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('la migrazione accetta quello che il modulo produce', () => {
  const sql = read('supabase/migrate_v59_animali_foto_meteo_730.sql');
  for (const s of SPECIES) assert.match(sql, new RegExp(`'${s}'`), s);
  for (const k of PET_LOG_KINDS) assert.match(sql, new RegExp(`'${k}'`), k);
  assert.match(sql, /every_days between 0 and 1095/);
  assert.equal(PET_LIMITS.maxEvery, 1095);
  assert.match(sql, />= 50 then/); assert.match(sql, />= 40 then/); assert.match(sql, />= 3000 then/);
  assert.ok(PET_EVERY_CHOICES.every(n => n >= 0 && n <= 1095));
});

test('scheda dell\'animale controllata', () => {
  const today = '2026-11-25';
  assert.equal(normalizePet({ name: ' ' }).error, 'pets.error.name');
  assert.equal(normalizePet({ name: 'Fido', birth_on: '2027-01-01' }, today).error, 'pets.error.birth');
  assert.equal(normalizePet({ name: 'Fido', birth_on: '2026-02-30' }, today).error, 'pets.error.birth');
  assert.equal(normalizePet({ name: 'Fido', weight_kg: '0' }).error, 'pets.error.weight');
  assert.equal(normalizePet({ name: 'Fido', birth_on: '2020-01-01', ended_on: '2019-01-01' }, today).error, 'pets.error.ended');
  const { value } = normalizePet({ name: ' Fido ', species: 'drago', sex: 'x', weight_kg: '18.456', food_stock_item_id: 's1', food_daily: '0.3', neutered: true, preset: 'dog' }, today);
  assert.equal(value.name, 'Fido'); assert.equal(value.species, 'other'); assert.equal(value.sex, null);
  assert.equal(value.weight_kg, 18.46); assert.equal(value.food_daily, 0.3); assert.equal(value.neutered, true); assert.equal(value.preset, 'dog');
  // Senza cibo collegato la dose giornaliera non serve.
  assert.equal(normalizePet({ name: 'Micia', food_daily: '0.1' }).value.food_daily, null);
});

test('voci del piano e registro controllati', () => {
  assert.equal(normalizePetTask({ title: 'x' }).error, 'pets.error.taskTitle');
  assert.equal(normalizePetTask({ title: 'Vaccino', every_days: 1096 }).error, 'pets.error.every');
  assert.equal(normalizePetTask({ title: 'Vaccino', next_on: '2026-13-01' }).error, 'pets.error.date');
  assert.equal(normalizePetTask({ title: 'Pipetta', stock_item_id: 's', stock_use: '0' }).error, 'pets.error.stockUse');
  const task = normalizePetTask({ title: 'Pipetta', kind: 'boh', every_days: 30, next_on: '2026-12-01', stock_item_id: 's', stock_use: '1' }).value;
  assert.equal(task.kind, 'other'); assert.equal(task.stock_use, 1); assert.equal(task.remind, true);
  assert.equal(normalizePetTask({ title: 'Pipetta', stock_use: '1' }).value.stock_use, null, 'senza scorta niente quantità');
  assert.equal(normalizePetLog({ title: 'Visita', done_on: '2026-11-26' }, '2026-11-25').error, 'pets.error.doneOn');
  assert.equal(normalizePetLog({ title: 'Visita', done_on: '2026-11-25', cost: '-1' }, '2026-11-25').error, 'pets.error.cost');
  const entry = normalizePetLog({ title: 'Visita', kind: 'note', done_on: '2026-11-20', cost: '65.5', weight_kg: '18,2'.replace(',', '.') }, '2026-11-25').value;
  assert.equal(entry.cost_cents, 6550); assert.equal(entry.weight_kg, 18.2); assert.equal(entry.kind, 'note');
});

test('date del piano: stato, fatto, una volta sola, rimanda, da fare', () => {
  const today = '2026-11-25';
  assert.equal(petTaskState({ next_on: null }, today), 'none');
  assert.equal(petTaskState({ next_on: '2026-11-20' }, today), 'late');
  assert.equal(petTaskState({ next_on: today }, today), 'due');
  assert.equal(petTaskState({ next_on: '2026-12-02' }, today), 'soon');
  assert.equal(petTaskState({ next_on: '2026-12-03' }, today), 'later');
  assert.deepEqual(markPetDone({ every_days: 365 }, today), { last_done_on: today, next_on: '2027-11-25' });
  assert.deepEqual(markPetDone({ every_days: 0 }, today), { last_done_on: today, next_on: null });
  assert.deepEqual(postponePet({ next_on: '2026-11-01' }, today), { next_on: '2026-12-02' }, 'scaduta: da oggi');
  assert.deepEqual(postponePet({ next_on: '2026-12-10' }, today), { next_on: '2026-12-17' }, 'futura: dalla sua data');
  const agenda = petAgenda([{ id: 'a', title: 'B', next_on: '2026-12-20' }, { id: 'b', title: 'A', next_on: '2026-11-01' }, { id: 'c', title: 'C', next_on: '2027-02-01' }, { id: 'd', title: 'D', next_on: null }], today);
  assert.deepEqual(agenda.map(a => [a.task.id, a.state]), [['b', 'late'], ['a', 'later']]);
});

test('età, peso e spese del veterinario', () => {
  assert.deepEqual(petAge('2020-03-15', '2026-11-25'), { years: 6, months: 8 });
  assert.deepEqual(petAge('2026-11-26', '2026-11-25'), null);
  assert.deepEqual(petAge('2026-10-30', '2026-11-25'), { years: 0, months: 0 });
  assert.equal(it('pets.ageYears', { years: 1 }), '1 anno');
  assert.equal(it('pets.ageMonths', { months: 3 }), '3 mesi');
  const log = [{ pet_id: 'p', done_on: '2026-10-01', weight_kg: 20 }, { pet_id: 'p', done_on: '2026-11-01', weight_kg: 17.5 }, { pet_id: 'q', done_on: '2026-11-02', weight_kg: 4 }];
  const series = weightSeries({ id: 'p', weight_kg: 17.5 }, log);
  assert.deepEqual(series.map(p => p.kg), [20, 17.5]);
  assert.equal(weightChange(series), -12.5);
  assert.deepEqual(weightSeries({ id: 'z', weight_kg: 5 }, log), [{ date: null, kg: 5 }]);
  assert.equal(weightChange([{ kg: 5 }]), null);
  const costs = vetCosts([{ done_on: '2026-03-01', cost_cents: 6500 }, { done_on: '2025-12-01', cost_cents: 100 }, { done_on: '2026-04-01', cost_cents: 0 }], 2026);
  assert.deepEqual(costs.map(c => c.cost_cents), [6500]);
});

test('cibo dalle Scorte: stima dall\'ultimo aggiornamento, anche con più animali', () => {
  const today = '2026-11-25';
  const pets = [{ id: 'fido', food_stock_item_id: 's1', food_daily: 0.3 }, { id: 'rex', food_stock_item_id: 's1', food_daily: 0.2 }, { id: 'old', food_stock_item_id: 's1', food_daily: 5, ended_on: '2026-01-01' }, { id: 'micia', food_stock_item_id: 's2', food_daily: 0.05 }];
  const stock = [{ id: 's1', name: 'Crocchette', quantity: 6, updated_at: '2026-11-21T10:00:00Z' }, { id: 's2', name: 'Umido', quantity: 2, updated_at: '2026-11-25T08:00:00Z' }, { id: 's3', name: 'Altro', quantity: 1 }];
  const out = foodEstimates(pets, stock, today);
  const s1 = out.get('s1');
  assert.equal(s1.daily, 0.5, 'chi non c\'è più non mangia');
  assert.equal(s1.left, 4, '6 kg − 4 giorni × 0,5');
  assert.equal(s1.days, 8); assert.equal(s1.runs_out_on, '2026-12-03'); assert.equal(s1.low, false);
  assert.equal(out.get('s2').days, 40);
  assert.equal(out.has('s3'), false);
  const low = foodEstimates(pets, [{ ...stock[0], quantity: 3.5 }], today).get('s1');
  assert.equal(low.days, 3); assert.equal(low.low, true);
  const finished = foodEstimates(pets, [{ ...stock[0], quantity: 1, updated_at: '2026-10-01T00:00:00Z' }], today).get('s1');
  assert.equal(finished.left, 0); assert.equal(finished.days, 0); assert.equal(finished.runs_out_on, today);
});

test('proposte: specie, tipi e frequenze validi, testi in tutte le lingue', () => {
  for (const [key, preset] of Object.entries(PET_PRESETS)) {
    assert.ok(SPECIES.includes(preset.species), key);
    for (const task of preset.tasks) {
      assert.ok(PET_TASK_KINDS.includes(task.kind), `${key}.${task.key}`);
      assert.ok(PET_EVERY_CHOICES.includes(task.every), `${key}.${task.key}: ${task.every}`);
    }
  }
  for (const lang of LANGS) {
    for (const key of PET_PRESET_KEYS) assert.ok(TRANSLATIONS[lang]['pets.preset.' + key], `${lang} preset ${key}`);
    for (const key of PET_TASK_KEYS) assert.ok(TRANSLATIONS[lang]['pets.task.' + key], `${lang} task ${key}`);
    for (const s of SPECIES) assert.ok(TRANSLATIONS[lang]['pets.species.' + s], `${lang} ${s}`);
    for (const k of PET_TASK_KINDS) assert.ok(TRANSLATIONS[lang]['pets.kind.' + k], `${lang} ${k}`);
    for (const k of PET_LOG_KINDS) assert.ok(TRANSLATIONS[lang]['pets.logKind.' + k], `${lang} ${k}`);
  }
  const t = key => translate('de', key);
  const tasks = petPresetTasks('dog', t, '2026-11-25');
  assert.equal(tasks[0].title, 'Jährliche Auffrischimpfung');
  assert.ok(tasks.every(x => x.next_on === '2026-11-25'));
  assert.equal(tasks.find(x => x.preset_task === 'rabies').use, false, 'antirabbica non accesa di partenza');
  assert.ok(tasks.every(x => !normalizePetTask(x).error));
  assert.deepEqual(petPresetTasks('drago', t, '2026-11-25'), []);
  const missing = missingPetPresetTasks('cat', [{ title: ' jährliche auffrischimpfung ' }], t, '2026-11-25');
  assert.equal(missing.length, PET_PRESETS.cat.tasks.length - 1);
});

test('«ogni quanto» in parole, con il singolare', async () => {
  const { everyLabel } = await import('../app/Pets.jsx').catch(() => ({}));
  // Il componente è JSX: qui si controllano i testi che usa.
  assert.equal(it('pets.everyYears', { years: 1 }), 'Ogni anno');
  assert.equal(it('pets.everyYears', { years: 3 }), 'Ogni 3 anni');
  assert.equal(it('pets.everyMonths', { months: 1 }), 'Ogni mese');
  assert.equal(it('pets.everyWeeks', { count: 2 }), 'Ogni 2 settimane');
  assert.equal(translate('en', 'pets.everyDays', { days: 1 }), 'Every day');
  assert.equal(translate('fr', 'pets.foodLine', { food: 'Croquettes', days: 0, date: '3 déc.' }), 'Croquettes : il reste environ 0 jour (fini vers le 3 déc.)');
  void everyLabel;
});

// Admin finto: tabelle in memoria, avvisi unici per persona, tipo, voce e data.
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
            if (!alerts.some(a => a.user_id === row.user_id && a.kind === row.kind && a.reference_id === row.reference_id && a.event_date === row.event_date)) { alerts.push(row); added.push(row); }
          }
          return Promise.resolve({ data: added, error: null });
        },
        order() { return builder; },
        range(from, to) { return builder.then(result => ({ data: result.data ? result.data.slice(from, to + 1) : null, error: result.error })); },
        eq(column, value) { filters.push(row => row[column] === value); return builder; },
        is(column, value) { filters.push(row => (row[column] ?? null) === value); return builder; },
        not(column, op, value) { filters.push(row => (row[column] ?? null) !== value); return builder; },
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

test('promemoria e cibo che finisce: a chi ha l\'animale o a tutta la casa, nella sua lingua, una volta', async () => {
  const { processPetAlerts, petAlertCopy, petFoodAlertCopy } = await import('../lib/pet-alerts.mjs');
  const today = '2026-11-25';
  const tables = {
    home_pets: [
      { id: 'fido', user_id: 'anna', home_id: 'h1', name: 'Fido', food_stock_item_id: 's1', food_daily: 0.5, ended_on: null },
      { id: 'micia', user_id: 'carla', home_id: null, name: 'Micia', food_stock_item_id: null, food_daily: null, ended_on: null },
      { id: 'vecchio', user_id: 'anna', home_id: 'h1', name: 'Vecchio', food_stock_item_id: null, food_daily: null, ended_on: '2026-01-01' },
    ],
    home_pet_tasks: [
      { id: 't1', pet_id: 'fido', title: 'Antiparassitario', product: 'Pipetta', next_on: today, remind: true },
      { id: 't2', pet_id: 'micia', title: 'Vaccino', product: '', next_on: '2026-11-20', remind: true },
      { id: 't3', pet_id: 'micia', title: 'Senza promemoria', product: '', next_on: today, remind: false },
      { id: 't4', pet_id: 'vecchio', title: 'Non c\'è più', product: '', next_on: today, remind: true },
      { id: 't5', pet_id: 'fido', title: 'Troppo vecchio', product: '', next_on: '2026-11-10', remind: true },
    ],
    home_stock_items: [{ id: 's1', user_id: 'anna', home_id: 'h1', name: 'Crocchette', quantity: 2, updated_at: '2026-11-25T07:00:00Z' }],
    home_members: [{ home_id: 'h1', user_id: 'anna' }, { home_id: 'h1', user_id: 'bruno' }],
    user_language_preferences: [{ user_id: 'bruno', language: 'en' }],
  };
  const counts = { errors: [] };
  await processPetAlerts(fakeAdmin(tables), today, counts);
  assert.deepEqual(counts.errors, []);
  assert.deepEqual(tables.user_alerts.map(a => [a.user_id, a.reference_id, a.event_date]).sort(), [
    ['anna', 's1', '2026-11-29'], ['anna', 't1', today], ['bruno', 's1', '2026-11-29'], ['bruno', 't1', today], ['carla', 't2', '2026-11-20']]);
  assert.ok(tables.user_alerts.every(a => a.kind === 'pet'));
  const anna = tables.user_alerts.find(a => a.user_id === 'anna' && a.reference_id === 't1');
  assert.equal(anna.title, 'Fido: promemoria');
  assert.match(anna.body, /^È il momento di: Antiparassitario \(Pipetta\)\. Data prevista: /);
  const food = tables.user_alerts.find(a => a.user_id === 'bruno' && a.reference_id === 's1');
  assert.equal(food.title, 'Food running low: Crocchette');
  assert.match(food.body, /^Fido has about 4 days of food left/);
  const before = tables.user_alerts.length;
  await processPetAlerts(fakeAdmin(tables), today, { errors: [] });
  assert.equal(tables.user_alerts.length, before, 'rilanciato non duplica');
  for (const lang of LANGS) {
    const copy = petAlertCopy({ pet: 'Fido', task: 'Vaccino', product: '', date: today }, lang);
    assert.ok(copy.title.includes('Fido') && copy.body.includes('Vaccino') && !/\{|undefined/.test(copy.title + copy.body), lang);
    const one = petFoodAlertCopy({ pets: 'Fido', food: 'Crocchette', date: today, days: 1 }, lang);
    assert.ok(!/\{|undefined/.test(one.title + one.body), lang);
  }
  assert.match(petFoodAlertCopy({ pets: 'Fido', food: 'X', date: today, days: 1 }, 'it').body, /resta circa 1 giorno/);
  assert.throws(() => petAlertCopy({ pet: '', task: 'x', date: today }));
  assert.throws(() => petFoodAlertCopy({ pets: 'Fido', food: 'X', date: 'ieri' }));
});

test('senza la migrazione il lavoro giornaliero salta gli animali senza errori', async () => {
  const { processPetAlerts } = await import('../lib/pet-alerts.mjs');
  const counts = { errors: [] };
  await processPetAlerts(fakeAdmin({ error: { home_pet_tasks: { code: 'PGRST205', message: 'missing' } } }), '2026-11-25', counts);
  assert.deepEqual(counts.errors, []);
  const other = { errors: [] };
  await processPetAlerts(fakeAdmin({ error: { home_pet_tasks: { code: '57014', message: 'timeout' } } }), '2026-11-25', other);
  assert.equal(other.errors.length, 1);
});

test('notifiche push degli animali: interruttore proprio, collegato al lavoro giornaliero, al menu e alla schermata', () => {
  assert.match(read('lib/push-preferences.mjs'), /pet:'push_pets'/);
  assert.match(read('lib/daily-jobs.mjs'), /await processPetAlerts\(admin,today,counts,/);
  assert.match(read('app/HomeExtra.jsx'), /\['push_pets','extra\.alerts\.pets'\]/);
  assert.match(read('lib/menu-groups.mjs'), /'garden', 'pets'/);
  assert.match(read('app/page.jsx'), /tab==='pets'&&<Pets /);
  assert.match(read('app/Pets.jsx'), /useSection\('pets'\)/);
});

test('calendario del telefono: le voci degli animali, ripetute fino a un anno, non quelli che non ci sono più', () => {
  const today = '2026-11-25';
  const pets = [{ id: 'fido', name: 'Fido' }, { id: 'old', name: 'Old', ended_on: '2026-01-01' }];
  const tasks = [{ id: 't1', pet_id: 'fido', title: 'Pipetta', product: 'X', every_days: 30, next_on: '2026-12-01' },
    { id: 't2', pet_id: 'fido', title: 'Vaccino', product: '', every_days: 0, next_on: '2027-03-01' },
    { id: 't3', pet_id: 'old', title: 'No', product: '', every_days: 30, next_on: '2026-12-01' },
    { id: 't4', pet_id: 'fido', title: 'Vecchio', product: '', every_days: 30, next_on: '2026-10-01' }];
  const events = petCalendarEvents(pets, tasks, today);
  assert.equal(events.filter(e => e.task === 'Pipetta').length, 12);
  assert.equal(events.filter(e => e.task === 'Vaccino').length, 1);
  assert.ok(!events.some(e => e.task === 'No' || e.task === 'Vecchio'));
  const ics = buildCalendar([], '20261125T000000Z', (key, params) => translate('it', 'calendar.ics.' + key, params), events.slice(0, 2));
  assert.match(ics, /SUMMARY:Fido: Pipetta/);
  assert.match(ics, /DESCRIPTION:Prodotto: X\./);
  assert.match(read('app/api/calendar/[token]/route.js'), /petEvents\(admin,feed\.user_id,homes,today\)/);
});

test('backup e ripristino: animali, piano, registro e voci collegate nella copia in un altro spazio', () => {
  for (const table of ['home_pets', 'home_pet_tasks', 'home_pet_log', 'home_garden_photos', 'home_tax_items']) {
    assert.ok(BACKUP_TABLES.some(t => t.name === table), table);
    assert.ok(RESTORE_ORDER.includes(table), table);
  }
  assert.equal(RESTORE_SECTIONS.home_pets, 'pets');
  assert.ok(RESTORE_ORDER.indexOf('home_pet_tasks') < RESTORE_ORDER.indexOf('home_pet_log'));
  assert.ok(RESTORE_ORDER.indexOf('home_pet_log') < RESTORE_ORDER.indexOf('home_tax_items'));
  const ids = { home_pets: { p1: 'P1' }, home_pet_tasks: { t1: 'T1' }, home_garden_tasks: { t1: 'GARDEN' }, home_stock_items: { s1: 'S1' }, home_pet_log: { l1: 'L1' } };
  const [pet] = prepareRows('home_pets', [{ id: 'p1', user_id: 'old', home_id: 'h0', name: 'Fido', food_stock_item_id: 's1' }], { homeId: 'h2', userId: 'me', ids });
  assert.deepEqual([pet.id, pet.user_id, pet.home_id, pet.food_stock_item_id], ['P1', 'me', 'h2', 'S1']);
  const [other] = prepareRows('home_pets', [{ id: 'p1', name: 'Fido', food_stock_item_id: 'sX' }], { homeId: 'h2', userId: 'me', ids });
  assert.equal(other.food_stock_item_id, null, 'cibo di un altro spazio tolto');
  const [entry] = prepareRows('home_pet_log', [{ id: 'l1', pet_id: 'p1', task_id: 't1', created_by: 'old', home_id: 'x' }], { homeId: 'h2', userId: 'me', ids });
  assert.deepEqual([entry.id, entry.pet_id, entry.task_id, entry.created_by, 'home_id' in entry], ['L1', 'P1', 'T1', 'me', false]);
  const [tax] = prepareRows('home_tax_items', [{ id: 'x1', source: 'pet_log', source_id: 'l1' }], { homeId: 'h2', userId: 'me', ids });
  assert.equal(tax.source_id, 'L1');
  const [lost] = prepareRows('home_tax_items', [{ id: 'x2', source: 'bill', source_id: 'b9' }], { homeId: 'h2', userId: 'me', ids });
  assert.deepEqual([lost.source, lost.source_id], ['manual', null]);
});

// Fase 2 · 3.3 — programma stagionale: voci per clima, tipo di casa e dotazioni; ogni anno tornano.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SEASONAL_ITEMS, SEASONAL_IDS, CLIMATES, FEATURES, normalizeProfile, applicableItems, windowFor, occurrence, recentlyMissed, seasonalPlan, LATE_DAYS } from '../lib/seasonal.mjs';
import { MESSAGE_KEYS } from '../lib/i18n.mjs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const ids = list => list.map(entry => entry.id);

test('Catalogo coerente: mesi validi, condizioni note, testi nelle 6 lingue', () => {
  assert.equal(new Set(SEASONAL_IDS).size, SEASONAL_ITEMS.length);
  for (const item of SEASONAL_ITEMS) {
    assert.match(item.id, /^[a-z][a-z_]{1,39}$/, 'lo stesso formato che accetta il database');
    for (const [climate, months] of Object.entries(item.months)) {
      assert.ok(CLIMATES.includes(climate), item.id);
      assert.ok(months.length >= 1 && months.every(m => Number.isInteger(m) && m >= 1 && m <= 12), item.id);
    }
    for (const need of item.needs) assert.ok(need === 'house' || FEATURES.includes(need), item.id);
    assert.ok(MESSAGE_KEYS.includes('seasonal.item.' + item.id) && MESSAGE_KEYS.includes('seasonal.why.' + item.id), item.id);
  }
  for (const key of [...CLIMATES.map(c => 'seasonal.climate.' + c), ...FEATURES.map(f => 'seasonal.feature.' + f), 'nav.seasonal', 'seasonal.migration', 'seasonal.taskAdded'])
    assert.ok(MESSAGE_KEYS.includes(key), key);
});

test('Profilo: valori noti, dotazioni senza doppioni', () => {
  assert.deepEqual(normalizeProfile({ climate: 'tropicale', home_type: 'castello', features: ['garden', 'piscina', 'garden', 'boiler'] }),
    { climate: 'mild', home_type: 'apartment', features: ['boiler', 'garden'] });
  assert.deepEqual(normalizeProfile({}), { climate: 'mild', home_type: 'apartment', features: ['boiler'] });
});

test('Le voci dipendono da clima, tipo di casa e dotazioni', () => {
  const flat = ids(applicableItems({ climate: 'warm', home_type: 'apartment', features: [] }));
  assert.ok(!flat.includes('boiler_service') && !flat.includes('gutters') && !flat.includes('frost_protection'));
  assert.ok(flat.includes('detectors') && flat.includes('heat_ready'));
  const house = ids(applicableItems({ climate: 'cold', home_type: 'house', features: ['boiler', 'fireplace', 'garden', 'air_conditioning'] }));
  for (const id of ['boiler_service', 'chimney_sweep', 'gutters', 'frost_protection', 'garden_winter', 'ac_service', 'roof_check'])
    assert.ok(house.includes(id), id);
  assert.ok(!house.includes('heat_ready'), 'dove gli inverni sono rigidi il caldo non è una voce');
  // Il clima sposta i mesi: il condizionatore si pulisce prima dove fa più caldo.
  const ac = climate => applicableItems({ climate, home_type: 'apartment', features: ['air_conditioning'] }).find(i => i.id === 'ac_service').months;
  assert.deepEqual([ac('warm'), ac('mild'), ac('cold')], [[4, 5], [5], [6]]);
});

test('Finestre: mesi a cavallo dell’anno, stato di oggi e stagione appena finita', () => {
  assert.deepEqual(windowFor([12, 1], 2026), { period: '2026', start: '2026-12-01', end: '2027-01-31' });
  assert.deepEqual(windowFor([2], 2028), { period: '2028', start: '2028-02-01', end: '2028-02-29' });
  assert.equal(occurrence([12, 1], '2027-01-10').status, 'now');
  assert.equal(occurrence([12, 1], '2027-01-10').period, '2026', 'gennaio appartiene alla stagione iniziata a dicembre');
  assert.equal(occurrence([12, 1], '2026-11-23').status, 'soon');
  assert.equal(occurrence([7, 8], '2026-11-23').status, 'later');
  assert.equal(occurrence([7, 8], '2026-11-23').period, '2027');
  assert.equal(recentlyMissed([9, 10], '2026-11-23').period, '2026');
  assert.equal(recentlyMissed([9, 10], '2026-12-16'), null, `oltre ${LATE_DAYS} giorni non è più in vista`);
});

test('Programma: rimaste indietro, adesso, presto, più avanti, fatte', () => {
  const profile = { climate: 'mild', home_type: 'house', features: ['boiler', 'garden'] };
  const plan = seasonalPlan(profile, [{ id: 'd1', item_id: 'gutters', period: '2026', done_on: '2026-11-02' }, { id: 'd2', item_id: 'detectors', period: '2026', done_on: '2026-10-20' }], '2026-11-23');
  assert.deepEqual(ids(plan.late), ['boiler_service', 'window_seals']);
  assert.deepEqual(ids(plan.now), ['radiators_bleed', 'frost_protection', 'garden_winter']);
  assert.deepEqual(ids(plan.soon), ['ventilation']);
  assert.deepEqual(ids(plan.done).sort(), ['detectors', 'gutters']);
  assert.ok(plan.later.every(entry => entry.period === '2027'));
  // L'anno dopo la stessa voce torna da fare.
  const next = seasonalPlan(profile, [{ id: 'd1', item_id: 'gutters', period: '2026', done_on: '2026-11-02' }], '2027-10-15');
  assert.ok(ids(next.now).includes('gutters'));
});

test('Migrazione v45: un profilo per spazio, una voce fatta per stagione, accesso per casa', () => {
  const sql = read('supabase/migrate_v45_stagionale.sql');
  assert.match(sql, /uq_home_seasonal_settings_home on public\.home_seasonal_settings\(home_id\) where home_id is not null/);
  assert.match(sql, /uq_home_seasonal_done_home on public\.home_seasonal_done\(home_id, item_id, period\) where home_id is not null/);
  assert.match(sql, /check \(item_id ~ '\^\[a-z\]\[a-z_\]\{1,39\}\$'\)/);
  assert.match(sql, new RegExp(`features <@ array\\[${FEATURES.map(f => `'${f}'`).join(',')}\\]`));
  assert.match(sql, new RegExp(`climate in \\(${CLIMATES.map(c => `'${c}'`).join(',')}\\)`));
  assert.match(sql, /grant update \(climate, home_type, features\) on public\.home_seasonal_settings to authenticated;/);
  assert.match(sql, /grant select, insert, delete on public\.home_seasonal_done to authenticated;/);
  assert.match(read('README.md'), /migrate_v45_stagionale\.sql/);
});

test('Collegamenti: menu, sezione a parte, attività con la scadenza della stagione', () => {
  const page = read('app/page.jsx');
  assert.match(page, /\{id:'seasonal',icon:SunSnow\}/);
  assert.match(page, /onAddTask=\{addTaskQuick\}/);
  assert.match(page, /async function addTaskQuick\(\{title,due_date\}\)/);
  const ui = read('app/Seasonal.jsx');
  assert.match(ui, /const due = entry\.status === 'late' \? addDaysISO\(today, LATE_TASK_DAYS\) : entry\.end;/, 'una voce rimasta indietro non diventa un\'attività già scaduta');
  assert.match(ui, /onAddTask\(\{ title: tr\('seasonal\.item\.' \+ entry\.id\), due_date: due \}\)/);
  assert.match(ui, /error\.code !== '23505'/, 'segnata due volte nella stessa casa: nessun errore');
  assert.match(ui, /useSection\('seasonal'\)/);
});

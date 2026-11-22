// Fase 2 · 3.3 — fondo sostituzioni: vita utile indicativa, costi stimati, quota mensile e avviso che sono stime.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { REPLACEMENT_TYPES, REPLACEMENT_TYPE_KEYS, guessType, normalizePlan, replacementEstimate, monthsUntil, fundSummary } from '../lib/replacement.mjs';
import { MESSAGE_KEYS, translate } from '../lib/i18n.mjs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const TODAY = '2026-11-23';

test('Tipo proposto dal nome, in tutte le lingue', () => {
  assert.equal(guessType('Caldaia Vaillant'), 'boiler');
  assert.equal(guessType('Boiler elettrico del bagno'), 'water_heater', 'la parola più lunga vince');
  assert.equal(guessType('Kühlschrank Küche'), 'fridge');
  assert.equal(guessType('Küchenkühlschrank'), 'fridge', 'parola composta tedesca');
  assert.equal(guessType('Lave-linge'), 'washing_machine');
  assert.equal(guessType('Termostato'), 'other', 'una parola dentro un’altra non conta');
  assert.equal(guessType(''), 'other');
  for (const [type, { life }] of Object.entries(REPLACEMENT_TYPES)) assert.ok(Number.isInteger(life) && life >= 1 && life <= 60, type);
});

test('Controllo del piano', () => {
  assert.deepEqual(normalizePlan({ item_type: 'boiler', life_years: '', cost: '2500,50', saved: '', installed_on: 'ieri' }).value,
    { item_type: 'boiler', life_years: null, cost: 2500.5, saved: 0, installed_on: null });
  assert.equal(normalizePlan({ item_type: 'astronave' }).value.item_type, 'other');
  assert.equal(normalizePlan({ life_years: 0 }).error, 'replacement.error.life');
  assert.equal(normalizePlan({ life_years: 12.5 }).error, 'replacement.error.life');
  assert.equal(normalizePlan({ cost: -1 }).error, 'replacement.error.cost');
  assert.equal(normalizePlan({ saved: 'tanto' }).error, 'replacement.error.saved');
});

test('Stima: scadenza indicativa, mesi rimasti e quota mensile', () => {
  assert.equal(monthsUntil(TODAY, '2029-03-01'), 27);
  assert.equal(monthsUntil(TODAY, '2026-12-22'), 0, 'meno di un mese intero');
  assert.equal(monthsUntil(TODAY, '2020-01-01'), 0);
  const boiler = replacementEstimate({ name: 'Caldaia', purchased_on: '2014-03-01' }, { cost: 2500, saved: 500 }, TODAY);
  assert.deepEqual({ type: boiler.type, due: boiler.dueOn, months: boiler.monthsLeft, monthly: boiler.monthly, status: boiler.status },
    { type: 'boiler', due: '2029-03-01', months: 27, monthly: 74.07, status: 'ok' });
  // La durata scelta dalla persona vince su quella indicativa; la data d'installazione su quella d'acquisto.
  assert.equal(replacementEstimate({ name: 'Caldaia', purchased_on: '2014-03-01' }, { life_years: 20, installed_on: '2016-02-29', cost: 100 }, TODAY).dueOn, '2036-02-29');
  assert.equal(replacementEstimate({ name: 'Frigo' }, {}, TODAY).status, 'missing_date');
  assert.equal(replacementEstimate({ name: 'Frigo', purchased_on: '2020-01-01' }, {}, TODAY).status, 'missing_cost');
  const old = replacementEstimate({ name: 'Lavatrice', purchased_on: '2010-01-01' }, { cost: 600, saved: 100 }, TODAY);
  assert.deepEqual([old.status, old.needed, old.monthly], ['due', 500, 500]);
  const summary = fundSummary([boiler, old, replacementEstimate({ name: 'Frigo' }, {}, TODAY)]);
  assert.deepEqual(summary, { monthly: 74.07, dueNow: 500, saved: 600, counted: 1, dueCount: 1, incomplete: 1 });
});

test('Avviso che sono stime, nelle 6 lingue e sempre visibile', () => {
  for (const lang of ['it', 'en', 'es', 'fr', 'de', 'pt']) assert.ok(translate(lang, 'replacement.disclaimer').length > 80, lang);
  const ui = read('app/ReplacementFund.jsx');
  assert.match(ui, /<div className="informative replacement-disclaimer"><TriangleAlert size=\{17\} \/><p>\{tr\('replacement\.disclaimer'\)\}<\/p><\/div>/);
  assert.match(ui, /upsert\(\{ asset_id: asset\.id, \.\.\.result\.value \}, \{ onConflict: 'asset_id' \}\)/);
});

test('Migrazione v48: accesso dell’oggetto, tipi e limiti uguali all’app', () => {
  const sql = read('supabase/migrate_v48_fondo.sql');
  assert.match(sql, new RegExp(`item_type in \\(${REPLACEMENT_TYPE_KEYS.map(t => `'${t}'`).join(',')}\\)`));
  assert.match(sql, /life_years between 1 and 60/);
  assert.match(sql, /references public\.maintenance_assets\(id\) on delete cascade/);
  assert.match(sql, /using \(public\.v48_asset_access\(asset_id, false\)\)/);
  assert.match(read('README.md'), /migrate_v48_fondo\.sql/);
});

test('Collegamenti e testi', () => {
  const page = read('app/page.jsx');
  assert.match(page, /\{id:'replacement',icon:PiggyBank\}/);
  assert.match(page, /const ReplacementFund=lazy\(\(\)=>import\('\.\/ReplacementFund'\)\);/);
  for (const type of REPLACEMENT_TYPE_KEYS) assert.ok(MESSAGE_KEYS.includes('replacement.type.' + type), type);
  for (const key of ['nav.replacement', 'replacement.help', 'replacement.status.ok', 'replacement.status.dueNeeded', 'replacement.migration', 'replacement.demo.boiler'])
    assert.ok(MESSAGE_KEYS.includes(key), key);
});

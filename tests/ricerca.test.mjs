// Ricerca (scelta dell'utente, 24 novembre 2026): accenti, finali delle parole, categorie nella
// lingua dell'app ed errori di battitura, con il client Supabase vero contro il Supabase finto
// (lo stesso filtro ilike del database, con _ come «una lettera qualsiasi»).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { startFakeSupabase } from './helpers/fake-supabase.mjs';
import { searchEverything, searchLocal, searchFuzzy, wordPattern, textMatches, searchWords } from '../lib/search.mjs';
import { translate } from '../lib/i18n.mjs';
import { BILL_CATEGORIES } from '../lib/bill-categories.mjs';

const USER = '11111111-1111-4111-8111-111111111111';
const BILLS = [
  { id: 'b1', user_id: USER, home_id: null, title: 'Bolletta luce', supplier: 'Enel Energia', category: 'Luce', due_date: '2026-11-20' },
  { id: 'b2', user_id: USER, home_id: null, title: 'Acqua', supplier: 'Società Acque del Fiume', category: 'Acqua', due_date: '2026-11-25' },
  { id: 'b3', user_id: USER, home_id: null, title: 'TARI', supplier: 'Citta di Torino', category: 'Rifiuti', due_date: '2026-12-02' },
  { id: 'b4', user_id: USER, home_id: null, title: 'Fatture fibra', supplier: 'FibraVeloce', category: 'Internet', due_date: '2026-12-05' },
];
const categories = lang => Object.fromEntries(BILL_CATEGORIES.flatMap(code => [[translate(lang, 'billCategory.' + code), code], [code, code]]));
let fake, client;
test.before(async () => {
  fake = await startFakeSupabase();
  client = createClient(fake.url, 'chiave-di-servizio-finta', { auth: { persistSession: false, autoRefreshToken: false } });
  fake.seed('bills', BILLS);
});
test.after(() => fake?.close());
const find = async (text, lang = 'it') => (await searchEverything(client, { text, userId: USER, categories: categories(lang) })).results.filter(r => r.type === 'bills').map(r => r.id).sort();

test('accenti: «societa» trova «Società», «città» trova «Citta»', async () => {
  assert.deepEqual(await find('societa'), ['b2']);
  assert.deepEqual(await find('città'), ['b3']);
});

test('finale delle parole: singolare e plurale', async () => {
  assert.deepEqual(await find('bollette'), ['b1']);
  assert.deepEqual(await find('fattura'), ['b4']);
});

test('categorie nella lingua dell\'app', async () => {
  assert.deepEqual(await find('electricity', 'en'), ['b1']);
  assert.deepEqual(await find('Wasser', 'de'), ['b2']);
  assert.deepEqual(await find('rifiuti'), ['b3']);
  assert.deepEqual(await find('enel elec', 'en'), ['b1'], 'una parola nel fornitore, l\'altra nella categoria');
});

test('parole a metà e corte restano precise', async () => {
  assert.deepEqual(await find('fibr'), ['b4']);
  assert.deepEqual(await find('gas'), []);
  assert.equal(wordPattern('enel'), 'enel');
});

test('caratteri jolly scritti dall\'utente non allargano la ricerca', async () => {
  assert.deepEqual(searchWords('%_* "x"'), []);
  assert.deepEqual(await find('*a*'), []);
});

test('errori di battitura: suggerimenti sui dati già caricati', () => {
  const data = { bills: BILLS };
  assert.deepEqual(searchFuzzy(data, 'bolleta').results.map(r => r.id), ['b1']);
  assert.deepEqual(searchFuzzy(data, 'fbra').results.map(r => r.id), ['b4']);
  assert.deepEqual(searchFuzzy(data, 'enrl').results.map(r => r.id), ['b1']);
  assert.deepEqual(searchFuzzy(data, 'bolet').results.map(r => r.id), ['b1'], 'parola a metà con un errore');
  assert.deepEqual(searchFuzzy(data, 'gas').results, [], 'parole corte: nessun indovinello');
  assert.deepEqual(searchFuzzy(data, 'zanzara').results, []);
});

test('demo ed elenco delle bollette usano gli stessi criteri', () => {
  assert.deepEqual(searchLocal({ bills: BILLS }, 'societa citta').results.map(r => r.id), []);
  assert.deepEqual(searchLocal({ bills: BILLS }, 'electricity', 5, categories('en')).results.map(r => r.id), ['b1']);
  assert.equal(textMatches('Bolletta luce Enel Energia Luce Elettricità', 'bollette elettricita'), true);
  assert.equal(textMatches('Bolletta luce', 'gas'), false);
});

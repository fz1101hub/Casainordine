// Fase 2 · 3.3 — ricerca universale.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SEARCH_SOURCES, searchWords, wordFilter, searchQuery, searchEverything, searchLocal } from '../lib/search.mjs';
import { MESSAGE_KEYS } from '../lib/i18n.mjs';

// Finto client Supabase: registra la catena di chiamate e risponde con le righe date per tabella.
function fakeClient(rows = {}, failing = new Set()) {
  const calls = [];
  const client = {
    calls,
    from(table) {
      const chain = { table, steps: [] };
      calls.push(chain);
      const builder = {
        select(fields) { chain.steps.push(['select', fields]); return builder; },
        eq(column, value) { chain.steps.push(['eq', column, value]); return builder; },
        is(column, value) { chain.steps.push(['is', column, value]); return builder; },
        or(filter) { chain.steps.push(['or', filter]); return builder; },
        order(column, options) { chain.steps.push(['order', column, options]); return builder; },
        limit(n) { chain.steps.push(['limit', n]); return Promise.resolve(failing.has(table) ? { data: null, error: { code: '42P01' } } : { data: rows[table] || [], error: null }); }
      };
      return builder;
    }
  };
  return client;
}

test('Parole cercate: niente caratteri jolly, niente doppioni, al massimo 4', () => {
  assert.deepEqual(searchWords('  Enel   ENEL luce '), ['enel', 'luce']);
  assert.deepEqual(searchWords('100% a_b *x* "q" \\'), ['100', 'a', 'b', 'x', 'q'].filter(w => w.length >= 2));
  assert.deepEqual(searchWords('a'), []);
  assert.deepEqual(searchWords(null), []);
  assert.equal(searchWords('uno due tre quattro cinque sei').length, 4);
});

test('Il filtro mette ogni valore tra virgolette: virgole, punti e parentesi non rompono la richiesta', () => {
  assert.equal(wordFilter('s.p.a.,(x)', ['title', 'supplier']), 'title.ilike."*s.p.a.,(x)*",supplier.ilike."*s.p.a.,(x)*"');
});

test('Spazio personale: solo le righe dell’account senza casa; casa condivisa: solo quella casa', () => {
  const personal = fakeClient();
  searchQuery(personal, SEARCH_SOURCES[0], { words: ['enel', 'luce'], userId: 'u1', homeId: null });
  const steps = personal.calls[0].steps;
  assert.deepEqual(steps.filter(s => s[0] === 'eq' || s[0] === 'is'), [['eq', 'user_id', 'u1'], ['is', 'home_id', null]]);
  assert.equal(steps.filter(s => s[0] === 'or').length, 2, 'ogni parola deve esserci (AND), in una colonna qualsiasi (OR)');
  const shared = fakeClient();
  searchQuery(shared, SEARCH_SOURCES[0], { words: ['enel'], userId: 'u1', homeId: 'h1' });
  assert.deepEqual(shared.calls[0].steps.filter(s => s[0] === 'eq' || s[0] === 'is'), [['eq', 'home_id', 'h1']]);
});

test('Cerca in ogni sezione dello spazio attivo; le sezioni solo di casa non si cercano nello spazio personale', async () => {
  const client = fakeClient({ bills: [{ id: 'b1', title: 'Bolletta luce', supplier: 'Enel', due_date: '2026-12-01' }], home_contracts: [{ id: 'c1', supplier: 'Enel', service: 'Luce', renewal_on: '2027-01-01' }] });
  const personal = await searchEverything(client, { text: 'enel', userId: 'u1' });
  assert.deepEqual(client.calls.map(c => c.table).sort(), SEARCH_SOURCES.filter(s => !s.homeOnly).map(s => s.table).sort());
  assert.deepEqual(personal.results.map(r => [r.type, r.tab, r.id]), [['bills', 'bills', 'b1'], ['contracts', 'contracts', 'c1']]);
  assert.equal(personal.results[1].detail, 'Luce');
  const home = fakeClient();
  await searchEverything(home, { text: 'enel', userId: 'u1', homeId: 'h1' });
  assert.equal(home.calls.length, SEARCH_SOURCES.length);
});

test('Una sezione che non risponde non blocca le altre', async () => {
  const client = fakeClient({ bills: [{ id: 'b1', title: 'Luce' }] }, new Set(['home_inventory_items']));
  const found = await searchEverything(client, { text: 'luce', userId: 'u1' });
  assert.equal(found.failed, 1);
  assert.equal(found.results.length, 1);
});

test('Testo troppo corto o nessun account: nessuna richiesta', async () => {
  const client = fakeClient();
  assert.deepEqual(await searchEverything(client, { text: 'a', userId: 'u1' }), { results: [], failed: 0 });
  assert.deepEqual(await searchEverything(client, { text: 'luce' }), { results: [], failed: 0 });
  assert.equal(client.calls.length, 0);
});

test('Prova senza account: stessi criteri sui dati di esempio', () => {
  const data = { bills: [{ id: 'b1', title: 'Bolletta luce', supplier: 'Energia Esempio' }, { id: 'b2', title: 'Bolletta gas', supplier: 'Gas di Prova' }], tasks: [{ id: 't1', title: 'Pulire il filtro' }] };
  assert.deepEqual(searchLocal(data, 'luce esempio').results.map(r => r.id), ['b1']);
  assert.deepEqual(searchLocal(data, 'filtro').results.map(r => r.tab), ['tasks']);
  assert.deepEqual(searchLocal(data, 'x').results, []);
});

test('Ogni tipo di risultato ha l’etichetta della sua sezione e la ricerca ha i suoi testi', () => {
  for (const source of SEARCH_SOURCES) assert.ok(MESSAGE_KEYS.includes('nav.' + source.tab), source.tab);
  for (const key of ['open', 'title', 'placeholder', 'hint', 'loading', 'empty', 'scope', 'partial', 'demoNote']) assert.ok(MESSAGE_KEYS.includes('search.' + key), key);
  const component = readFileSync(new URL('../app/UniversalSearch.jsx', import.meta.url), 'utf8');
  assert.match(component, /role="dialog" aria-modal="true"/);
  assert.match(component, /\(e\.ctrlKey\|\|e\.metaKey\)&&e\.key\.toLowerCase\(\)==='k'/);
  assert.match(component, /if\(ticket===sequence\.current\)setState/, 'le risposte vecchie non sovrascrivono quelle nuove');
});

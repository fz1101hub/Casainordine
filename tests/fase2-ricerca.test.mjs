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
        in(column, values) { chain.steps.push(['in', column, values]); chain.ids = { column, values }; return builder; },
        or(filter) { chain.steps.push(['or', filter]); return builder; },
        order(column, options) { chain.steps.push(['order', column, options]); return builder; },
        limit(n) {
          chain.steps.push(['limit', n]);
          if (failing.has(table)) return Promise.resolve({ data: null, error: { code: failing instanceof Map ? failing.get(table) : '57014' } });
          const list = (rows[table] || []).filter(r => !chain.ids || chain.ids.values.includes(r[chain.ids.column]));
          return Promise.resolve({ data: list, error: null });
        }
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
  // Una richiesta per sezione, più una per le voci madri (persone, animali); senza persone né animali
  // le loro terapie, visite e voci del piano non si cercano.
  const direct = SEARCH_SOURCES.filter(s => !s.homeOnly && !s.parent).map(s => s.table);
  const parentTables = [...new Set(SEARCH_SOURCES.filter(s => s.parent).map(s => s.parent.table))];
  assert.deepEqual(client.calls.map(c => c.table).sort(), [...direct, ...parentTables].sort());
  assert.deepEqual(personal.results.map(r => [r.type, r.tab, r.id]), [['bills', 'bills', 'b1'], ['contracts', 'contracts', 'c1']]);
  assert.equal(personal.results[1].detail, 'Luce');
  const home = fakeClient();
  await searchEverything(home, { text: 'enel', userId: 'u1', homeId: 'h1' });
  assert.equal(home.calls.length, SEARCH_SOURCES.filter(s => !s.parent).length + parentTables.length);
});

test('Terapie, visite e piano degli animali: si cercano tra le persone e gli animali dello spazio attivo', async () => {
  const client = fakeClient({
    health_people: [{ id: 'p1', name: 'Luca' }],
    health_therapies: [{ id: 't1', person_id: 'p1', name: 'Tachipirina 250', dose: '5 ml' }, { id: 't2', person_id: 'altro', name: 'Tachipirina di un altro' }],
    home_pets: [{ id: 'a1', name: 'Fido' }],
    home_pet_tasks: [{ id: 'k1', pet_id: 'a1', title: 'Tachipirina? no: antiparassitario', next_on: '2026-12-01' }],
  });
  const found = await searchEverything(client, { text: 'tachipirina', userId: 'u1', homeId: 'h1' });
  const people = client.calls.find(c => c.table === 'health_people' && c.steps.some(s => s[0] === 'select' && s[1] === 'id'));
  assert.deepEqual(people.steps.filter(s => s[0] === 'eq'), [['eq', 'home_id', 'h1']], 'persone della casa attiva');
  const therapies = client.calls.find(c => c.table === 'health_therapies');
  assert.deepEqual(therapies.steps.find(s => s[0] === 'in'), ['in', 'person_id', ['p1']]);
  assert.ok(!therapies.steps.some(s => s[0] === 'eq'), 'le terapie non hanno uno spazio proprio');
  // (il finto client non filtra per parola: conta solo quali righe arrivano da quale spazio)
  assert.deepEqual(found.results.filter(r => r.type === 'therapies').map(r => [r.tab, r.id, r.detail]), [['health', 't1', '5 ml']]);
  assert.deepEqual(found.results.filter(r => r.type === 'petTasks').map(r => [r.tab, r.id]), [['pets', 'k1']]);
});

test('Una sezione che non risponde non blocca le altre', async () => {
  const client = fakeClient({ bills: [{ id: 'b1', title: 'Luce' }] }, new Set(['home_inventory_items']));
  const found = await searchEverything(client, { text: 'luce', userId: 'u1' });
  assert.equal(found.failed, 1);
  assert.equal(found.results.length, 1);
  // Una tabella non ancora creata (migrazione da eseguire) non conta come sezione che non risponde.
  const early = await searchEverything(fakeClient({ bills: [{ id: 'b1', title: 'Luce' }] }, new Map([['home_professionals', 'PGRST205']])), { text: 'luce', userId: 'u1' });
  assert.equal(early.failed, 0);
  assert.equal(early.results.length, 1);
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
  const button = readFileSync(new URL('../app/UniversalSearch.jsx', import.meta.url), 'utf8');
  const dialog = readFileSync(new URL('../app/SearchDialog.jsx', import.meta.url), 'utf8');
  assert.match(button, /\(e\.ctrlKey\|\|e\.metaKey\)&&e\.key\.toLowerCase\(\)==='k'/);
  // La finestra e la logica arrivano solo alla prima apertura: la prima pagina resta leggera.
  assert.match(button, /dynamic\(\(\)=>import\('\.\/SearchDialog'\)/);
  assert.doesNotMatch(button, /lib\/search\.mjs/);
  assert.match(dialog, /role="dialog" aria-modal="true"/);
  assert.match(dialog, /if\(ticket===sequence\.current\)setState/, 'le risposte vecchie non sovrascrivono quelle nuove');
});

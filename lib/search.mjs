// Ricerca universale (Fase 2, 3.3): una richiesta per tipo di dato, sempre nello spazio attivo
// (personale oppure la casa condivisa scelta). Le regole di accesso del database (RLS) restano il
// limite; il filtro sullo spazio in più evita di mescolare account o case diverse.
// Modulo per il browser: niente testi (le etichette dei tipi sono «nav.<sezione>» del dizionario).

import { MIN_SEARCH_LENGTH, searchWords, fold, wordPattern, patternRegex, textMatches } from './search-text.mjs';
export { MIN_SEARCH_LENGTH, searchWords, fold, wordPattern, textMatches };
const MISSING_TABLE = new Set(['42P01', 'PGRST205']);

// columns: colonne in cui cercare; homeOnly: tabelle che esistono solo nelle case condivise.
export const SEARCH_SOURCES = Object.freeze([
  { type: 'bills', table: 'bills', tab: 'bills', fields: 'id,title,supplier,due_date', columns: ['title', 'supplier', 'category'], date: 'due_date', title: r => r.title || r.supplier, detail: r => r.supplier },
  { type: 'tasks', table: 'house_tasks', tab: 'tasks', fields: 'id,title,due_date', columns: ['title'], date: 'due_date', title: r => r.title },
  { type: 'utilities', table: 'utilities', tab: 'utilities', fields: 'id,supplier,category,next_due_date', columns: ['supplier', 'category', 'account_reference'], date: 'next_due_date', title: r => r.supplier },
  { type: 'contracts', table: 'home_contracts', tab: 'contracts', fields: 'id,supplier,service,renewal_on', columns: ['supplier', 'service', 'notes'], date: 'renewal_on', title: r => r.supplier, detail: r => r.service },
  { type: 'documents', table: 'home_documents', tab: 'archive', fields: 'id,name,doc_type', columns: ['name', 'notes'], title: r => r.name },
  { type: 'objects', table: 'maintenance_assets', tab: 'maintenance', fields: 'id,name,model,room,next_service_on', columns: ['name', 'model', 'room', 'category'], date: 'next_service_on', title: r => r.name, detail: r => [r.model, r.room].filter(Boolean).join(' · ') },
  { type: 'inventory', table: 'home_inventory_items', tab: 'inventory', fields: 'id,name,room', columns: ['name', 'room', 'notes'], title: r => r.name, detail: r => r.room },
  // Mestiere salvato come chiave («plumber»): si cerca per nome, mestiere scritto a mano e note; accanto, il telefono.
  { type: 'professionals', table: 'home_professionals', tab: 'professionals', fields: 'id,name,phone', columns: ['name', 'trade', 'notes'], title: r => r.name, detail: r => r.phone },
  { type: 'properties', table: 'home_properties', tab: 'properties', fields: 'id,label,kind', columns: ['label'], title: r => r.label },
  { type: 'shopping', table: 'home_shopping', tab: 'shopping', fields: 'id,title,quantity', columns: ['title'], homeOnly: true, title: r => r.title, detail: r => r.quantity },
  { type: 'vehicles', table: 'home_vehicles', tab: 'vehicles', fields: 'id,name,plate', columns: ['name', 'plate'], homeOnly: true, title: r => r.name, detail: r => r.plate },
  // Sezioni del 25-26 novembre 2026: salute, animali, giardino, spese detraibili, progetti, documenti.
  // parent: righe senza spazio proprio (terapie, visite, piano degli animali), cercate tra quelle
  // delle persone o degli animali dello spazio attivo.
  { type: 'people', table: 'health_people', tab: 'health', fields: 'id,name', columns: ['name', 'allergies', 'notes'], title: r => r.name },
  { type: 'therapies', table: 'health_therapies', tab: 'health', fields: 'id,name,dose', columns: ['name', 'dose', 'instructions', 'notes'], parent: { table: 'health_people', key: 'person_id' }, title: r => r.name, detail: r => r.dose },
  { type: 'appointments', table: 'health_appointments', tab: 'health', fields: 'id,title,place,on_date', columns: ['title', 'place', 'notes'], date: 'on_date', parent: { table: 'health_people', key: 'person_id' }, title: r => r.title, detail: r => r.place },
  { type: 'pets', table: 'home_pets', tab: 'pets', fields: 'id,name,breed', columns: ['name', 'breed', 'vet_name', 'notes'], title: r => r.name, detail: r => r.breed },
  { type: 'petTasks', table: 'home_pet_tasks', tab: 'pets', fields: 'id,title,product,next_on', columns: ['title', 'product', 'notes'], date: 'next_on', parent: { table: 'home_pets', key: 'pet_id' }, title: r => r.title, detail: r => r.product },
  { type: 'plants', table: 'home_garden_plants', tab: 'garden', fields: 'id,name,location', columns: ['name', 'location', 'notes'], title: r => r.name, detail: r => r.location },
  { type: 'taxItems', table: 'home_tax_items', tab: 'taxes', fields: 'id,description,supplier,paid_on', columns: ['description', 'supplier', 'notes'], date: 'paid_on', title: r => r.description, detail: r => r.supplier },
  { type: 'projects', table: 'home_projects', tab: 'projects', fields: 'id,title', columns: ['title', 'notes'], title: r => r.title },
  { type: 'iddocs', table: 'family_documents', tab: 'iddocs', fields: 'id,holder,label,expires_on', columns: ['holder', 'label', 'notes'], date: 'expires_on', title: r => [r.label, r.holder].filter(Boolean).join(' · '), detail: () => '' }
]);
// Quante voci madri (persone, animali) si leggono al massimo per cercare tra le loro righe.
const PARENT_LIMIT = 500;

// Il valore tra virgolette può contenere virgole, punti e parentesi senza cambiare il significato
// del filtro. alternatives: altre condizioni per la stessa parola (per esempio la categoria).
export function wordFilter(word, columns, alternatives = []) {
  return [...columns.map(column => `${column}.ilike."*${word}*"`), ...alternatives].join(',');
}
// categories: {parola nella lingua dell'app → codice salvato}, per esempio {electricity: 'Luce'}.
function categoryAlternatives(word, source, categories) {
  if (!categories || !source.columns.includes('category')) return [];
  const key = fold(word);
  const codes = [...new Set(Object.entries(categories).filter(([label]) => key.length >= 3 && fold(label).startsWith(key)).map(([, code]) => code))];
  return codes.map(code => `category.eq."${code}"`);
}

// Una richiesta: tutte le parole (AND), ciascuna in almeno una colonna (OR), nello spazio attivo.
export function searchQuery(client, source, { words, userId, homeId, limit = 5, categories = null, parentIds = null }) {
  let query = client.from(source.table).select(source.fields);
  if (source.parent) query = query.in(source.parent.key, parentIds || []);
  else query = homeId ? query.eq('home_id', homeId) : query.eq('user_id', userId).is('home_id', null);
  for (const word of words) query = query.or(wordFilter(wordPattern(word), source.columns, categoryAlternatives(word, source, categories)));
  if (source.date) query = query.order(source.date, { ascending: false, nullsFirst: false });
  return query.limit(limit);
}

const result = (source, row) => ({ type: source.type, tab: source.tab, id: row.id, title: String(source.title(row) || ''),
  detail: String(source.detail?.(row) || ''), date: source.date ? row[source.date] || null : null });

// Cerca in tutte le sezioni dello spazio attivo. failed: sezioni che non hanno risposto
// (per esempio una tabella non ancora creata): non bloccano le altre.
export async function searchEverything(client, { text, userId, homeId = null, limit = 5, categories = null }) {
  const words = searchWords(text);
  if (!words.length || !client || (!userId && !homeId)) return { results: [], failed: 0 };
  const sources = SEARCH_SOURCES.filter(source => homeId || !source.homeOnly);
  // Voci madri dello spazio (una richiesta per tabella): senza nessuna, le righe figlie non si cercano.
  const parentTables = [...new Set(sources.filter(s => s.parent).map(s => s.parent.table))];
  const parents = Object.fromEntries(await Promise.all(parentTables.map(async table => {
    let query = client.from(table).select('id');
    query = homeId ? query.eq('home_id', homeId) : query.eq('user_id', userId).is('home_id', null);
    try { const { data, error } = await query.limit(PARENT_LIMIT); return [table, error ? null : (data || []).map(r => r.id)]; } catch { return [table, null]; }
  })));
  const answers = await Promise.all(sources.filter(source => !source.parent || parents[source.parent.table]?.length).map(source =>
    Promise.resolve(searchQuery(client, source, { words, userId, homeId, limit, categories, parentIds: source.parent ? parents[source.parent.table] : null }))
      .then(({ data, error }) => ({ source, data, error }), error => ({ source, error }))));
  const results = [];
  let failed = 0;
  for (const { source, data, error } of answers) {
    // Una tabella non ancora creata (migrazione non eseguita) non ha niente da trovare: non è un errore.
    if (error) { if (!MISSING_TABLE.has(error.code)) failed++; continue; }
    for (const row of data || []) results.push(result(source, row));
  }
  return { results, failed };
}

export function rowMatches(row, source, words, categories = null) {
  return words.every(word => {
    const re = patternRegex(word);
    if (source.columns.some(column => re.test(fold(row[column])))) return true;
    return categoryAlternatives(word, source, categories).length > 0 && categoryAlternatives(word, source, categories).some(alt => alt === `category.eq."${row.category}"`);
  });
}
// Modalità senza account: gli stessi criteri sui dati di esempio già caricati nella pagina.
export function searchLocal(data, text, limit = 5, categories = null) {
  const words = searchWords(text);
  if (!words.length || !data) return { results: [], failed: 0 };
  const results = [];
  for (const source of SEARCH_SOURCES) {
    const rows = (data[source.type] || []).filter(row => rowMatches(row, source, words, categories));
    for (const row of rows.slice(0, limit)) results.push(result(source, row));
  }
  return { results, failed: 0 };
}

// Errori di battitura: distanza di Damerau-Levenshtein (una lettera in più, in meno, diversa o
// due lettere scambiate). Al massimo 1 per parole di 4-7 lettere, 2 da 8 in su; le parole più corte
// non si correggono. Confronta anche con l'inizio delle parole (ricerca di una parola a metà).
function distance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let best = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      best = Math.min(best, d[i][j]);
    }
    if (best > max) return max + 1;
  }
  return d[a.length][b.length];
}
function closeTo(word, token) {
  const max = word.length >= 8 ? 2 : word.length >= 4 ? 1 : 0;
  if (!max) return false;
  if (distance(word, token, max) <= max) return true;
  // Parola scritta a metà: «bolet» con l'inizio di «bollette».
  // L'inizio può essere più corto o più lungo di una lettera (una lettera saltata o in più).
  return token.length > word.length && [-1, 0, 1].some(extra => distance(word, token.slice(0, word.length + extra), max) <= max);
}
export function searchFuzzy(data, text, limit = 5) {
  const words = searchWords(text).map(fold);
  if (!words.length || !data || words.every(w => w.length < 4)) return { results: [], failed: 0, fuzzy: true };
  const results = [];
  for (const source of SEARCH_SOURCES) {
    const rows = (data[source.type] || []).filter(row => {
      const tokens = source.columns.flatMap(column => fold(row[column]).split(/[^a-z0-9]+/)).filter(Boolean);
      return words.every(word => tokens.some(token => token.includes(word) || closeTo(word, token)));
    });
    for (const row of rows.slice(0, limit)) results.push(result(source, row));
  }
  return { results, failed: 0, fuzzy: true };
}

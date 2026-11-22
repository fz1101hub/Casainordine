// Ricerca universale (Fase 2, 3.3): una richiesta per tipo di dato, sempre nello spazio attivo
// (personale oppure la casa condivisa scelta). Le regole di accesso del database (RLS) restano il
// limite; il filtro sullo spazio in più evita di mescolare account o case diverse.
// Modulo per il browser: niente testi (le etichette dei tipi sono «nav.<sezione>» del dizionario).

export const MIN_SEARCH_LENGTH = 2;
const MAX_WORDS = 4;

// columns: colonne in cui cercare; homeOnly: tabelle che esistono solo nelle case condivise.
export const SEARCH_SOURCES = Object.freeze([
  { type: 'bills', table: 'bills', tab: 'bills', fields: 'id,title,supplier,due_date', columns: ['title', 'supplier', 'category'], date: 'due_date', title: r => r.title || r.supplier, detail: r => r.supplier },
  { type: 'tasks', table: 'house_tasks', tab: 'tasks', fields: 'id,title,due_date', columns: ['title'], date: 'due_date', title: r => r.title },
  { type: 'utilities', table: 'utilities', tab: 'utilities', fields: 'id,supplier,category,next_due_date', columns: ['supplier', 'category', 'account_reference'], date: 'next_due_date', title: r => r.supplier },
  { type: 'contracts', table: 'home_contracts', tab: 'contracts', fields: 'id,supplier,service,renewal_on', columns: ['supplier', 'service', 'notes'], date: 'renewal_on', title: r => r.supplier, detail: r => r.service },
  { type: 'documents', table: 'home_documents', tab: 'archive', fields: 'id,name,doc_type', columns: ['name', 'notes'], title: r => r.name },
  { type: 'objects', table: 'maintenance_assets', tab: 'maintenance', fields: 'id,name,model,room,next_service_on', columns: ['name', 'model', 'room', 'category'], date: 'next_service_on', title: r => r.name, detail: r => [r.model, r.room].filter(Boolean).join(' · ') },
  { type: 'inventory', table: 'home_inventory_items', tab: 'inventory', fields: 'id,name,room', columns: ['name', 'room', 'notes'], title: r => r.name, detail: r => r.room },
  { type: 'properties', table: 'home_properties', tab: 'properties', fields: 'id,label,kind', columns: ['label'], title: r => r.label },
  { type: 'shopping', table: 'home_shopping', tab: 'shopping', fields: 'id,title,quantity', columns: ['title'], homeOnly: true, title: r => r.title, detail: r => r.quantity },
  { type: 'vehicles', table: 'home_vehicles', tab: 'vehicles', fields: 'id,name,plate', columns: ['name', 'plate'], homeOnly: true, title: r => r.name, detail: r => r.plate }
]);

// Parole cercate: senza i caratteri jolly del database (% _ *) né quelli che rompono il filtro.
export function searchWords(input) {
  const clean = String(input ?? '').normalize('NFKC').replace(/[%_*\\"]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  return [...new Set(clean.toLowerCase().split(' ').filter(word => word.length >= MIN_SEARCH_LENGTH))].slice(0, MAX_WORDS);
}

// Filtro PostgREST per una parola: «una qualsiasi delle colonne la contiene». Il valore tra
// virgolette può contenere virgole, punti e parentesi senza cambiare il significato del filtro.
export function wordFilter(word, columns) {
  return columns.map(column => `${column}.ilike."*${word}*"`).join(',');
}

// Una richiesta: tutte le parole (AND), ciascuna in almeno una colonna (OR), nello spazio attivo.
export function searchQuery(client, source, { words, userId, homeId, limit = 5 }) {
  let query = client.from(source.table).select(source.fields);
  query = homeId ? query.eq('home_id', homeId) : query.eq('user_id', userId).is('home_id', null);
  for (const word of words) query = query.or(wordFilter(word, source.columns));
  if (source.date) query = query.order(source.date, { ascending: false, nullsFirst: false });
  return query.limit(limit);
}

const result = (source, row) => ({ type: source.type, tab: source.tab, id: row.id, title: String(source.title(row) || ''),
  detail: String(source.detail?.(row) || ''), date: source.date ? row[source.date] || null : null });

// Cerca in tutte le sezioni dello spazio attivo. failed: sezioni che non hanno risposto
// (per esempio una tabella non ancora creata): non bloccano le altre.
export async function searchEverything(client, { text, userId, homeId = null, limit = 5 }) {
  const words = searchWords(text);
  if (!words.length || !client || (!userId && !homeId)) return { results: [], failed: 0 };
  const sources = SEARCH_SOURCES.filter(source => homeId || !source.homeOnly);
  const answers = await Promise.all(sources.map(source =>
    Promise.resolve(searchQuery(client, source, { words, userId, homeId, limit })).then(({ data, error }) => ({ source, data, error }), error => ({ source, error }))));
  const results = [];
  let failed = 0;
  for (const { source, data, error } of answers) {
    if (error) { failed++; continue; }
    for (const row of data || []) results.push(result(source, row));
  }
  return { results, failed };
}

// Modalità senza account: gli stessi criteri sui dati di esempio già caricati nella pagina.
export function searchLocal(data, text, limit = 5) {
  const words = searchWords(text);
  if (!words.length || !data) return { results: [], failed: 0 };
  const results = [];
  for (const source of SEARCH_SOURCES) {
    const rows = (data[source.type] || []).filter(row => words.every(word =>
      source.columns.some(column => String(row[column] ?? '').toLowerCase().includes(word))));
    for (const row of rows.slice(0, limit)) results.push(result(source, row));
  }
  return { results, failed: 0 };
}

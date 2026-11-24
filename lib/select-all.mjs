// Tutte le righe di una lettura dal browser, a pagine da 1000: Supabase non restituisce mai più di
// 1000 righe per richiesta («Max rows»). Prima l'app chiedeva le bollette in una sola richiesta: con
// più di 1000 bollette (qualche anno di storico) arrivavano solo le 1000 più vecchie, quindi mancavano
// le prossime scadenze, e il backup era incompleto senza nessun avviso (tests/molti-dati.test.mjs).
// build(count) crea la lettura (con count:'exact' alla prima pagina); l'ordine deve finire con una
// colonna unica (id), altrimenti fra una pagina e l'altra righe uguali potrebbero mancare o ripetersi.
export const PAGE_ROWS = 1000;
export async function selectAll(build, { page = PAGE_ROWS, max = 50000 } = {}) {
  const first = await build(true).range(0, page - 1);
  if (first.error) return { data: null, error: first.error };
  const rows = [...(first.data || [])];
  if (rows.length < page) return { data: rows, error: null };
  const total = Number.isFinite(first.count) ? Math.min(first.count, max) : null;
  if (total !== null && total > page) {
    // Conosciuto il totale, le altre pagine partono insieme.
    const offsets = [];
    for (let offset = page; offset < total; offset += page) offsets.push(offset);
    const pages = await Promise.all(offsets.map(offset => build(false).range(offset, offset + page - 1)));
    for (const result of pages) { if (result.error) return { data: null, error: result.error }; rows.push(...(result.data || [])); }
    return { data: rows, error: null };
  }
  for (let offset = page; offset < max; offset += page) {
    const result = await build(false).range(offset, offset + page - 1);
    if (result.error) return { data: null, error: result.error };
    rows.push(...(result.data || []));
    if ((result.data || []).length < page) break;
  }
  return { data: rows, error: null };
}

// select … where column in (ids) a gruppi di 100: con centinaia di id l'indirizzo della richiesta
// supera i 16 KB che Supabase accetta e la richiesta fallisce (errore 520). Le parti partono insieme.
// build(part) crea la lettura per un gruppo di id; ogni gruppo legge anche oltre le 1000 righe.
export const ID_CHUNK = 100;
export async function selectIn(build, ids, { chunk = ID_CHUNK } = {}) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  const parts = [];
  for (let i = 0; i < unique.length; i += chunk) parts.push(unique.slice(i, i + chunk));
  const results = await Promise.all(parts.map(part => selectAll(count => build(part, count))));
  const failed = results.find(r => r.error);
  return failed ? { data: null, error: failed.error } : { data: results.flatMap(r => r.data || []), error: null };
}

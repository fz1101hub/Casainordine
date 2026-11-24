// Letture e scritture a blocchi per i lavori notturni (cron): una richiesta per tipo di dato
// invece che una per voce o per persona. Usato da promemoria, riepiloghi e avvisi.
const ID_CHUNK = 100, PAGE = 1000;

// select ... where <column> in (values), a gruppi di 100 id (l'indirizzo della richiesta resta
// corto) e a pagine da 1000 righe (il limite di Supabase). `refine` aggiunge altri filtri.
export async function readIn(admin, table, columns, column, values, refine = q => q) {
  const ids = [...new Set((values || []).filter(Boolean))], rows = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const part = ids.slice(i, i + ID_CHUNK);
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await refine(admin.from(table).select(columns).in(column, part)).range(offset, offset + PAGE - 1);
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }
  }
  return rows;
}

// Tutte le righe di una lettura filtrata, a pagine da 1000 (senza tetto nascosto).
export async function readAll(admin, table, columns, refine = q => q, { max = 50000 } = {}) {
  const rows = [];
  for (let offset = 0; offset < max; offset += PAGE) {
    const { data, error } = await refine(admin.from(table).select(columns)).range(offset, offset + PAGE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
    if (offset + PAGE >= max) throw new RangeError(`Troppi dati in ${table}: limite di sicurezza ${max} righe; elaborazione interrotta senza troncare l'elenco`);
  }
  return rows;
}

// upsert in blocchi da 500; con ignoreDuplicates e `columns` restituisce solo le righe nuove.
export async function upsertMany(admin, table, rows, options, columns) {
  const out = [];
  for (let i = 0; i < rows.length; i += 500) {
    let q = admin.from(table).upsert(rows.slice(i, i + 500), options);
    if (columns) q = q.select(columns);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...(data || []));
  }
  return out;
}

export const pairKey = (a, b) => `${a}:${b}`;
export const byKey = (rows, key) => { const map = new Map(); for (const r of rows) map.set(r[key], r); return map; };
export const groupBy = (rows, key) => { const map = new Map(); for (const r of rows) { const list = map.get(r[key]) || []; list.push(r); map.set(r[key], list); } return map; };

// Notifiche push mandate insieme: i servizi push (Google, Apple, Mozilla) reggono senza problemi
// molte richieste parallele; 20 tiene il lavoro notturno sotto il minuto anche con migliaia di invii.
export const PUSH_PARALLEL = 20;

// Esegue fn su ogni elemento, al massimo `limit` alla volta (per gli invii di notifiche: in fila
// uno per uno, con centinaia di persone, il lavoro notturno superava il minuto di Vercel).
export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => { while (next < items.length) { const i = next++; results[i] = await fn(items[i], i); } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

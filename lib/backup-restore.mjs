// Ripristino da un backup JSON di Casa in Ordine (scelta dell'utente, 23 novembre 2026).
//
// Regole:
// - si ripristina nello spazio attivo (casa o spazio personale), con i permessi di chi lo fa:
//   le regole di accesso del database decidono come per ogni altra scrittura;
// - si aggiunge solo ciò che manca: una voce con lo stesso identificativo non si tocca, niente
//   viene sovrascritto né cancellato;
// - le voci diventano di chi ripristina (user_id, created_by) e della casa di destinazione
//   (home_id); i collegamenti fra voci restano, perché gli identificativi sono gli stessi;
// - non si ripristina ciò che il backup non contiene per intero o che si crea solo dall'app con
//   controlli propri (RESTORE_SKIPPED, con il motivo);
// - spese divise e scadenze dell'auto passano dalle funzioni dell'app (add_home_expense,
//   v52_restore_vehicle_deadline), con i loro controlli: le spese solo se chi ha pagato e chi
//   divide sono ancora nella casa, le scadenze collegate a bolletta e utenza già ripristinate;
// - documenti e foto dei progetti tornano solo da un backup .zip con i file (lib/backup-files.mjs):
//   il file si ricarica nella cartella di chi ripristina; se nello spazio c'è già lo stesso file
//   (stessa impronta SHA-256) si ricollega quello. Senza file, i collegamenti ai documenti si tolgono.
// L'ordine segue i collegamenti: prima immobili, utenze, oggetti, professionisti, progetti…
import { STORAGE_QUOTA_BYTES } from './document-upload.mjs';

export const RESTORE_ORDER = Object.freeze([
  'home_properties', 'utilities', 'bills', 'home_documents', 'pagopa_notices', 'bill_security_reviews', 'payment_receipts', 'home_refund_expectations',
  'maintenance_assets', 'home_professionals', 'maintenance_events', 'home_professional_notes', 'home_replacement_plans', 'home_inventory_items',
  'meter_readings', 'meter_reminders', 'home_contracts',
  'house_tasks', 'home_budgets', 'home_expenses', 'home_shopping', 'home_vehicles', 'home_vehicle_deadlines', 'home_automations', 'home_seasonal_settings', 'home_seasonal_done', 'home_stock_items',
  'home_garden_plants', 'home_garden_tasks', 'home_garden_log',
  'home_pets', 'home_pet_tasks', 'home_pet_log',
  'health_people', 'health_therapies', 'health_doses', 'health_appointments', 'health_expenses',
  'home_projects', 'home_project_phases', 'home_project_quotes', 'home_project_expenses', 'home_project_photos', 'home_garden_photos', 'home_tax_items',
  'home_move_plans', 'home_move_steps', 'home_savings_goals', 'home_vacation_plans', 'home_decisions', 'home_emergency_cards', 'user_suppliers',
]);

// Tabelle del backup che non si ripristinano, con il motivo (un test controlla che ogni tabella
// del backup sia in RESTORE_ORDER o qui). Documenti e foto dei progetti senza il loro file
// contano come «files» anche se sono in RESTORE_ORDER.
export const RESTORE_SKIPPED = Object.freeze({
  home_lease_photos: 'files',
  home_leases: 'twoParties',
  home_lease_reports: 'twoParties',
  home_decision_votes: 'otherPeople',
  user_alert_preferences: 'settings',
  user_language_preferences: 'settings',
  user_home_preferences: 'settings',
});

// Tabelle che tornano insieme alla tabella madre, nello stesso passo.
export const RESTORE_WITH = Object.freeze({ home_expense_shares: 'home_expenses' });
// Voci che esistono solo in una casa: nello spazio personale non si ripristinano.
export const HOME_ONLY = Object.freeze(['home_budgets', 'home_decisions', 'home_expenses', 'home_shopping', 'home_vehicles', 'home_vehicle_deadlines']);
// Motivi per cui una voce non si ripristina, nell'ordine in cui l'anteprima li elenca.
export const SKIP_REASONS = Object.freeze(['files', 'homeOnly', 'formerMembers', 'confirmedReceipts', 'twoParties', 'otherPeople', 'settings', 'unknown']);

// Chiave di conflitto (la chiave primaria) quando non è «id».
const CONFLICT = { home_replacement_plans: 'asset_id', home_professional_notes: 'professional_id,user_id' };
// Tabelle personali: niente home_id.
const PERSONAL = new Set(['user_suppliers']);
// Tabelle collegate a una voce madre, senza la colonna home_id: la casa è quella della voce madre.
// Prima si aggiungeva home_id anche qui e il database rifiutava le righe (colonna sconosciuta):
// fasi, preventivi, spese e foto dei progetti, note sui professionisti e piani del fondo non tornavano.
export const NO_HOME = Object.freeze(['home_professional_notes', 'home_replacement_plans', 'home_project_phases', 'home_project_quotes',
  'home_project_expenses', 'home_project_photos', 'home_garden_tasks', 'home_garden_log', 'home_garden_photos', 'home_pet_tasks', 'home_pet_log',
  'health_therapies', 'health_doses', 'health_appointments', 'health_expenses']);
// Righe che senza il loro documento non esistono (foto): senza il file si saltano.
export const NEEDS_DOCUMENT = Object.freeze(['home_project_photos', 'home_garden_photos']);
// Nomi delle sezioni principali nel file (formato 1 e 2).
const MAIN_KEYS = { bills: 'bills', utilities: 'utilities', properties: 'home_properties', meters: 'meter_readings', meterReminders: 'meter_reminders',
  contracts: 'home_contracts', assets: 'maintenance_assets', events: 'maintenance_events', receipts: 'payment_receipts', documents: 'home_documents' };

export class RestoreFileError extends Error {}

// Legge il file e restituisce le tabelle con le righe; rifiuta ciò che non è un backup dell'app.
export function readBackup(text) {
  let bundle;
  try { bundle = JSON.parse(text); } catch { throw new RestoreFileError('notJson'); }
  if (!bundle || bundle.format !== 'casa-in-ordine-backup' || ![1, 2].includes(Number(bundle.version))) throw new RestoreFileError('notBackup');
  const tables = {};
  for (const [key, table] of Object.entries(MAIN_KEYS)) if (Array.isArray(bundle[key])) tables[table] = bundle[key];
  for (const [table, rows] of Object.entries(bundle.household || {})) if (Array.isArray(rows)) tables[table] = rows;
  return { tables, scope: bundle.scope || null, exportedAt: typeof bundle.exported_at === 'string' ? bundle.exported_at : '' };
}

const isObject = row => row && typeof row === 'object' && !Array.isArray(row);

// Collegamenti fra tabelle ripristinabili: colonna → tabella a cui punta.
export const LINKS = Object.freeze({ utility_id: 'utilities', property_id: 'home_properties', bill_id: 'bills', asset_id: 'maintenance_assets',
  professional_id: 'home_professionals', project_id: 'home_projects', quote_id: 'home_project_quotes', plan_id: 'home_move_plans',
  document_id: 'home_documents', vehicle_id: 'home_vehicles', plant_id: 'home_garden_plants', task_id: 'home_garden_tasks', stock_item_id: 'home_stock_items',
  pet_id: 'home_pets', food_stock_item_id: 'home_stock_items', log_id: 'home_garden_log', person_id: 'health_people', therapy_id: 'health_therapies',
  appointment_id: 'health_appointments' });
// Stessa colonna, tabella diversa: il registro di un animale cita una voce del piano dell'animale.
export const TABLE_LINKS = Object.freeze({ home_pet_log: { task_id: 'home_pet_tasks' } });
// Voce detraibile nata da un'altra voce: source dice in quale tabella sta source_id.
export const TAX_SOURCES = Object.freeze({ bill: 'bills', home_expense: 'home_expenses', project_expense: 'home_project_expenses', pet_log: 'home_pet_log', health_expense: 'health_expenses' });

// Nuovi identificativi per tutte le voci del file (ripristino in uno spazio diverso da quello del
// backup: le voci originali possono esistere ancora, e con gli stessi identificativi non si
// aggiungerebbe niente). I collegamenti fra voci seguono i nuovi identificativi.
export function newIds(tables, makeId = () => crypto.randomUUID()) {
  const map = {};
  for (const table of RESTORE_ORDER) {
    for (const row of tables[table] || []) if (isObject(row) && row.id) (map[table] ||= {})[row.id] = makeId();
  }
  return map;
}

// Identificativi stabili nei ripristini COPIA: SHA-256, primi 128 bit nel formato UUIDv8.
// Il file ricaricato nello stesso spazio e con lo stesso utente produce le stesse chiavi,
// anche se il browser è stato chiuso fra un tentativo e l'altro. Non è una firma del backup.
export async function stableCopyIds(backup, target) {
  const ids = {}, encoder = new TextEncoder();
  const namespace = ['casa-in-ordine-copy-v1', target.userId || '', target.homeId || '',
    backup.scope?.home_id || '', backup.exportedAt || ''].join('\u0000');
  for (const table of RESTORE_ORDER) {
    const rows = (backup.tables?.[table] || []).filter(isObject).filter(row => row.id);
    if (!rows.length) continue;
    ids[table] = {};
    // Non avviare migliaia di digest simultanei su telefoni con poca memoria.
    for (let i = 0; i < rows.length; i += 32) {
      await Promise.all(rows.slice(i, i + 32).map(async row => {
        const source = [namespace, table, String(row.id)].join('\u0000');
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(source)));
        digest[6] = (digest[6] & 15) | 0x80; // UUID versione 8: uso applicativo
        digest[8] = (digest[8] & 63) | 0x80; // variante RFC 9562
        const hex = Array.from(digest.slice(0, 16), b => b.toString(16).padStart(2, '0')).join('');
        ids[table][row.id] = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
      }));
    }
  }
  return ids;
}

// Righe pronte da scrivere per una tabella: spazio di destinazione, autore. Un collegamento a un
// documento resta solo se il documento c'è (documents: identificativi già nello spazio o che si
// ripristinano con il loro file); altrimenti si toglie.
export function prepareRows(table, rows, { homeId = null, userId, ids = null, documents = null }) {
  return (rows || []).filter(isObject).filter(row => table !== 'home_professional_notes' || row.user_id === userId).map(source => {
    const row = { ...source };
    if (ids) {
      if (row.id && ids[table]?.[row.id]) row.id = ids[table][row.id];
      const links = { ...LINKS, ...(TABLE_LINKS[table] || {}) };
      for (const [column, target] of Object.entries(links)) if (row[column] && ids[target]?.[row[column]]) row[column] = ids[target][row[column]];
      // Nella copia in un altro spazio, una scorta che non viene dal file non si può collegare (è dell'altro spazio).
      for (const column of ['stock_item_id', 'food_stock_item_id']) if (row[column] && !ids.home_stock_items?.[source[column]]) row[column] = null;
      // Voce detraibile: la voce d'origine segue i nuovi identificativi; se non è nel file resta una voce scritta a mano.
      if (table === 'home_tax_items' && row.source_id) {
        const origin = ids[TAX_SOURCES[row.source]]?.[source.source_id];
        if (origin) row.source_id = origin; else { row.source = 'manual'; row.source_id = null; }
      }
    }
    if ('user_id' in row) row.user_id = userId;
    if ('created_by' in row) row.created_by = userId;
    if ('confirmed_by' in row && row.confirmed_by) row.confirmed_by = userId;
    if ('document_id' in row && !(row.document_id && documents?.has(row.document_id))) row.document_id = null;
    if (NO_HOME.includes(table)) delete row.home_id;
    else if (!PERSONAL.has(table)) row.home_id = homeId;
    delete row.storage_path;
    delete row.former_user_id;
    return row;
  });
}

// Ripristino in uno spazio diverso da quello del backup?
export const isCopy = (backup, target) => Boolean(backup.scope) && (backup.scope.home_id || null) !== (target.homeId || null);

// Piano: per ogni tabella ripristinabile le righe del file; il resto in skipped (per motivo).
// Nello stesso spazio del backup si tengono gli identificativi (si aggiunge solo ciò che manca);
// in uno spazio diverso le voci si copiano con identificativi nuovi (copy: true).
// backup.files: Map(id del documento → byte del file), solo dai backup .zip.
// existingDocuments: documenti del file che sono ancora nello spazio (stesso spazio del backup).
// members: chi è ora nella casa di destinazione (per le spese divise); senza elenco decide il database.
export function restorePlan(backup, target, { makeId, copyIds = null, existingDocuments = [], members = null } = {}) {
  const steps = [], skipped = {};
  const skip = (reason, n) => { if (n > 0) skipped[reason] = (skipped[reason] || 0) + n; };
  const copy = isCopy(backup, target);
  const ids = copy ? (copyIds || newIds(backup.tables, makeId)) : null;
  const files = backup.files instanceof Map ? backup.files : new Map();
  const allDocuments = (backup.tables.home_documents || []).filter(isObject);
  const withFile = allDocuments.filter(d => d.id && files.get(d.id)?.length);
  skip('files', allDocuments.length - withFile.length);
  const documents = new Set(withFile.map(d => (ids?.home_documents?.[d.id]) || d.id));
  if (!copy) for (const id of existingDocuments) documents.add(id);
  for (const table of RESTORE_ORDER) {
    if (!target.homeId && HOME_ONLY.includes(table)) { skip('homeOnly', (backup.tables[table] || []).length); continue; }
    if (table === 'home_expenses') {
      const expenses = expenseRows(backup.tables.home_expenses, backup.tables.home_expense_shares);
      skip('unknown', (backup.tables.home_expenses || []).length - expenses.length); // senza quote o senza chi ha pagato
      const allowed = members ? expenses.filter(e => [e.payer, ...e.members].every(u => members.includes(u))) : expenses;
      skip('formerMembers', expenses.length - allowed.length);
      if (allowed.length) steps.push({ table, rows: allowed });
      continue;
    }
    const source = table === 'home_documents' ? withFile : backup.tables[table];
    let rows = prepareRows(table, source, { ...target, ids, documents });
    if (NEEDS_DOCUMENT.includes(table)) { skip('files', rows.filter(r => !r.document_id).length); rows = rows.filter(r => r.document_id); }
    // Una ricevuta confermata si conferma solo dall'app: la bolletta torna comunque pagata.
    if (table === 'payment_receipts') { const confirmed = rows.filter(r => r.status === 'confirmed' || r.confirmed_at); skip('confirmedReceipts', confirmed.length); rows = rows.filter(r => !confirmed.includes(r)); }
    if (!rows.length) continue;
    steps.push(table === 'home_documents' ? { table, rows, files: withFile.map(d => files.get(d.id)) } : { table, rows });
  }
  for (const [table, rows] of Object.entries(backup.tables)) {
    if (RESTORE_ORDER.includes(table) || RESTORE_WITH[table] || !rows?.length) continue;
    skip(RESTORE_SKIPPED[table] || 'unknown', rows.length);
  }
  return { steps, skipped, copy, target: { homeId: target.homeId || null, userId: target.userId } };
}

// Spese divise come le vuole add_home_expense: importo in centesimi, chi paga, chi divide. Le quote
// sono sempre uguali (centesimi in più ai primi): l'ordine dei partecipanti le rifà identiche.
export function expenseRows(expenses = [], shares = []) {
  const byExpense = new Map();
  for (const share of (shares || []).filter(isObject)) {
    if (!byExpense.has(share.expense_id)) byExpense.set(share.expense_id, []);
    byExpense.get(share.expense_id).push(share);
  }
  return (expenses || []).filter(isObject).filter(e => e.id && byExpense.has(e.id) && e.paid_by).map(e => ({
    id: e.id, title: e.title, category: e.category || 'Altro', cents: Math.round(Number(e.amount) * 100), date: e.incurred_on, payer: e.paid_by,
    members: byExpense.get(e.id).slice().sort((a, b) => Number(b.amount) - Number(a.amount) || String(a.user_id).localeCompare(String(b.user_id))).map(s => s.user_id),
  }));
}

// Funzione del database che manca (migrazione non ancora eseguita).
const missingFunction = error => ['PGRST202', '42883'].includes(error?.code);

// Spese divise: già presente (stesso identificativo, o stessa spesa: chi ha pagato, titolo,
// importo e data) oppure nuova con add_home_expense, che controlla permessi e partecipanti.
async function restoreExpenses(client, { rows }, { homeId }, { chunk }) {
  const counts = { added: 0, present: 0, failed: 0 };
  const key = (payer, title, cents, date) => [payer, title, cents, date].join('|');
  const seen = new Set();
  const dates = [...new Set(rows.map(r => r.date))];
  for (let i = 0; i < dates.length; i += chunk) {
    const { data, error } = await client.from('home_expenses').select('id,paid_by,title,amount,incurred_on').eq('home_id', homeId).in('incurred_on', dates.slice(i, i + chunk));
    if (error) throw error;
    for (const e of data || []) { seen.add(e.id); seen.add(key(e.paid_by, e.title, Math.round(Number(e.amount) * 100), e.incurred_on)); }
  }
  for (const row of rows) {
    const k = key(row.payer, String(row.title || '').trim(), row.cents, row.date);
    if (seen.has(row.id) || seen.has(k)) { counts.present++; continue; }
    const { error } = await client.rpc('add_home_expense', { target_home: homeId, expense_title: row.title, expense_category: row.category,
      expense_cents: row.cents, expense_date: row.date, payer: row.payer, split_members: row.members });
    if (error) { counts.failed++; if (missingFunction(error)) counts.needsUpdate = true; continue; }
    counts.added++; seen.add(k);
  }
  return counts;
}

// Scadenze dell'auto: v52_restore_vehicle_deadline le collega a bolletta e utenza già ripristinate
// (null = c'era già). Se bolletta o utenza non ci sono, la scadenza torna senza collegamento.
async function restoreDeadlines(client, { rows }, { homeId }) {
  const counts = { added: 0, present: 0, failed: 0 };
  for (const row of rows) {
    const args = { target_home: homeId, target_vehicle: row.vehicle_id, deadline_label: row.label, deadline_date: row.due_date,
      repeat_every_months: Number(row.repeat_months) || 0, linked_bill: row.bill_id || null, linked_utility: row.utility_id || null, deadline_id: row.id || null };
    let { data, error } = await client.rpc('v52_restore_vehicle_deadline', args);
    if (error && !missingFunction(error) && (args.linked_bill || args.linked_utility)) ({ data, error } = await client.rpc('v52_restore_vehicle_deadline', { ...args, linked_bill: null, linked_utility: null }));
    if (error) { counts.failed++; if (missingFunction(error)) counts.needsUpdate = true; continue; }
    if (data) counts.added++; else counts.present++;
  }
  return counts;
}

// Documenti del file ancora presenti nello spazio (solo ripristino nello stesso spazio): i
// collegamenti a questi restano anche se il backup non ha i file.
export async function existingDocumentIds(client, backup, target, { chunk = 100 } = {}) {
  if (isCopy(backup, target)) return [];
  const ids = [...new Set((backup.tables.home_documents || []).filter(isObject).map(d => d.id).filter(Boolean))];
  const found = [];
  for (let i = 0; i < ids.length; i += chunk) {
    const { data, error } = await client.from('home_documents').select('id').in('id', ids.slice(i, i + chunk));
    if (error) throw error;
    found.push(...(data || []).map(d => d.id));
  }
  return found;
}

// Impronta SHA-256 (esadecimale) dei byte di un file.
export async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const EXTENSION = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'text/plain': 'txt' };

// Documenti: per ognuno il file torna nella cartella di chi ripristina e poi si aggiunge la riga.
// Già presente (stesso identificativo) o stesso file già nello spazio (stessa impronta): non si
// ricarica, e i collegamenti puntano a quello. Restituisce i conteggi e remap: documento del
// piano → documento vero (null se non è stato possibile ripristinarlo).
async function restoreDocuments(client, { rows, files }, { homeId, userId }, { chunk }) {
  const counts = { added: 0, present: 0, failed: 0 }, remap = new Map();
  const bucket = client.storage.from('house-documents');
  const present = new Set();
  for (let i = 0; i < rows.length; i += chunk) {
    const { data, error } = await client.from('home_documents').select('id').in('id', rows.slice(i, i + chunk).map(r => r.id));
    if (error) throw error;
    for (const d of data || []) present.add(d.id);
  }
  const hashes = await Promise.all(files.map(bytes => sha256Hex(bytes)));
  const bySha = new Map();
  const unique = [...new Set(hashes)];
  for (let i = 0; i < unique.length; i += chunk) {
    const q = client.from('home_documents').select('id,sha256').in('sha256', unique.slice(i, i + chunk));
    const { data, error } = await (homeId ? q.eq('home_id', homeId) : q.is('home_id', null).eq('user_id', userId));
    if (error) throw error;
    for (const d of data || []) if (!bySha.has(d.sha256)) bySha.set(d.sha256, d.id);
  }
  let quotaFull = false;
  for (const [i, row] of rows.entries()) {
    const bytes = files[i], sha256 = hashes[i];
    if (present.has(row.id)) { counts.present++; remap.set(row.id, row.id); continue; }
    if (bySha.has(sha256)) { counts.present++; remap.set(row.id, bySha.get(sha256)); continue; }
    if (quotaFull) { counts.failed++; remap.set(row.id, null); continue; }
    const path = `${userId}/${crypto.randomUUID()}.${EXTENSION[row.mime_type] || 'bin'}`;
    const uploaded = await bucket.upload(path, new Blob([bytes], { type: row.mime_type }), { contentType: row.mime_type, upsert: false, cacheControl: '3600' });
    if (uploaded.error) {
      const { data: used } = await client.rpc('v36_my_storage_used');
      if (Number(used) >= STORAGE_QUOTA_BYTES) quotaFull = true;
      counts.failed++; remap.set(row.id, null); continue;
    }
    const saved = await client.from('home_documents').insert({ ...row, storage_path: path, sha256, file_size: bytes.length }).select('id');
    if (saved.error) {
      await bucket.remove([path]);
      if (saved.error.code === '23505') { counts.present++; remap.set(row.id, row.id); } else { counts.failed++; remap.set(row.id, null); }
      continue;
    }
    counts.added++; remap.set(row.id, row.id); bySha.set(sha256, row.id);
  }
  if (quotaFull) counts.quotaFull = true;
  return { counts, remap };
}

const keyOf = (table, row) => (CONFLICT[table] || 'id').split(',').map(k => row[k]).join('|');

// Quante voci di ogni tabella ci sono già in questo spazio (anteprima).
export async function existingCounts(client, plan, { chunk = 100 } = {}) {
  const out = {};
  if (plan.copy) return out; // identificativi nuovi: niente può esserci già
  for (const { table, rows } of plan.steps) {
    const column = (CONFLICT[table] || 'id').split(',')[0];
    const ids = [...new Set(rows.map(r => r[column]).filter(Boolean))];
    let found = 0;
    for (let i = 0; i < ids.length; i += chunk) {
      const { data, error } = await client.from(table).select(column).in(column, ids.slice(i, i + chunk));
      if (error) throw error;
      found += (data || []).length;
    }
    out[table] = found;
  }
  return out;
}

// Ripristino: per ogni tabella, nell'ordine, si aggiunge ciò che manca (ON CONFLICT DO NOTHING).
// Se un blocco viene rifiutato si riprova una riga alla volta, così una voce sbagliata non
// blocca le altre. Restituisce per tabella: aggiunte, già presenti, non riuscite.
export async function runRestore(client, plan, { chunk = 100, onProgress = () => {} } = {}) {
  const result = {};
  let remap = new Map();
  for (const [index, step] of plan.steps.entries()) {
    const { table } = step;
    if (table === 'home_documents') {
      const done = await restoreDocuments(client, step, plan.target || {}, { chunk });
      result[table] = done.counts; remap = done.remap;
      onProgress({ table, done: index + 1, total: plan.steps.length });
      continue;
    }
    if (table === 'home_expenses' || table === 'home_vehicle_deadlines') {
      result[table] = table === 'home_expenses' ? await restoreExpenses(client, step, plan.target || {}, { chunk }) : await restoreDeadlines(client, step, plan.target || {});
      onProgress({ table, done: index + 1, total: plan.steps.length });
      continue;
    }
    const counts = { added: 0, present: 0, failed: 0 };
    // I collegamenti ai documenti seguono quello che è successo ai documenti.
    let rows = remap.size ? step.rows.map(r => (r.document_id && remap.has(r.document_id) ? { ...r, document_id: remap.get(r.document_id) } : r)) : step.rows;
    if (NEEDS_DOCUMENT.includes(table)) { counts.failed += rows.filter(r => !r.document_id).length; rows = rows.filter(r => r.document_id); }
    const options = { onConflict: CONFLICT[table] || 'id', ignoreDuplicates: true };
    for (let i = 0; i < rows.length; i += chunk) {
      const part = rows.slice(i, i + chunk);
      const { data, error } = await client.from(table).upsert(part, options).select(CONFLICT[table] || 'id');
      if (!error) { counts.added += (data || []).length; counts.present += part.length - (data || []).length; continue; }
      for (const row of part) {
        const single = await client.from(table).upsert([row], options).select(CONFLICT[table] || 'id');
        if (!single.error) { if ((single.data || []).length) counts.added++; else counts.present++; }
        else if (single.error.code === '23505') counts.present++; // stessa voce già presente (altro vincolo unico)
        else counts.failed++;
      }
    }
    result[table] = counts;
    onProgress({ table, done: index + 1, total: plan.steps.length });
  }
  return result;
}


// Sezione dell'app in cui ogni tabella si vede (per l'anteprima): chiave del menu «nav.*».
export const RESTORE_SECTIONS = Object.freeze({
  home_properties: 'properties', utilities: 'utilities', bills: 'bills', pagopa_notices: 'pagopa', bill_security_reviews: 'fraud',
  payment_receipts: 'payments', home_refund_expectations: 'radar', maintenance_assets: 'maintenance', maintenance_events: 'maintenance',
  home_professionals: 'professionals', home_professional_notes: 'professionals', home_replacement_plans: 'replacement',
  home_inventory_items: 'inventory', meter_readings: 'insights', meter_reminders: 'insights', home_contracts: 'contracts',
  house_tasks: 'tasks', home_budgets: 'budget', home_shopping: 'shopping', home_vehicles: 'vehicles', home_automations: 'automations',
  home_seasonal_settings: 'seasonal', home_seasonal_done: 'seasonal', home_stock_items: 'stock', home_projects: 'projects',
  home_project_phases: 'projects', home_project_quotes: 'projects', home_project_expenses: 'projects', home_move_plans: 'moving',
  home_move_steps: 'moving', home_savings_goals: 'savings', home_vacation_plans: 'vacation', home_decisions: 'decisions',
  home_emergency_cards: 'sos', user_suppliers: 'connect', home_documents: 'archive', home_project_photos: 'projects',
  home_expenses: 'budget', home_vehicle_deadlines: 'vehicles', home_garden_plants: 'garden', home_garden_tasks: 'garden', home_garden_log: 'garden',
  home_garden_photos: 'garden', home_pets: 'pets', home_pet_tasks: 'pets', home_pet_log: 'pets', home_tax_items: 'taxes',
  health_people: 'health', health_therapies: 'health', health_doses: 'health', health_appointments: 'health', health_expenses: 'health',
});

// Righe dell'anteprima, una per sezione dell'app: quante voci nel file e quante già qui.
export function previewBySection(plan, existing = {}) {
  const sections = new Map();
  for (const { table, rows } of plan.steps) {
    const key = RESTORE_SECTIONS[table] || 'settings';
    const s = sections.get(key) || { section: key, total: 0, present: 0 };
    s.total += rows.length; s.present += existing[table] || 0;
    sections.set(key, s);
  }
  return [...sections.values()];
}

// Totali del risultato.
export function restoreTotals(result) {
  return Object.values(result || {}).reduce((t, c) => ({ added: t.added + c.added, present: t.present + c.present, failed: t.failed + c.failed }), { added: 0, present: 0, failed: 0 });
}

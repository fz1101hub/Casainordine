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
//   controlli propri (RESTORE_SKIPPED, con il motivo); i collegamenti ai documenti si tolgono,
//   perché i file non sono nel backup.
// L'ordine segue i collegamenti: prima immobili, utenze, oggetti, professionisti, progetti…
export const RESTORE_ORDER = Object.freeze([
  'home_properties', 'utilities', 'bills', 'pagopa_notices', 'bill_security_reviews', 'payment_receipts', 'home_refund_expectations',
  'maintenance_assets', 'home_professionals', 'maintenance_events', 'home_professional_notes', 'home_replacement_plans', 'home_inventory_items',
  'meter_readings', 'meter_reminders', 'home_contracts',
  'house_tasks', 'home_budgets', 'home_shopping', 'home_vehicles', 'home_automations', 'home_seasonal_settings', 'home_seasonal_done', 'home_stock_items',
  'home_projects', 'home_project_phases', 'home_project_quotes', 'home_project_expenses',
  'home_move_plans', 'home_move_steps', 'home_savings_goals', 'home_vacation_plans', 'home_decisions', 'home_emergency_cards', 'user_suppliers',
]);

// Tabelle del backup che non si ripristinano, con il motivo (un test controlla che ogni tabella
// del backup sia in RESTORE_ORDER o qui).
export const RESTORE_SKIPPED = Object.freeze({
  home_documents: 'files',
  home_project_photos: 'files',
  home_lease_photos: 'files',
  home_leases: 'twoParties',
  home_lease_reports: 'twoParties',
  home_decision_votes: 'otherPeople',
  home_expenses: 'appOnly',
  home_expense_shares: 'appOnly',
  home_vehicle_deadlines: 'appOnly',
  user_alert_preferences: 'settings',
  user_language_preferences: 'settings',
  user_home_preferences: 'settings',
});

// Chiave di conflitto (la chiave primaria) quando non è «id».
const CONFLICT = { home_replacement_plans: 'asset_id', home_professional_notes: 'professional_id,user_id' };
// Tabelle personali: niente home_id.
const PERSONAL = new Set(['user_suppliers']);
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
  professional_id: 'home_professionals', project_id: 'home_projects', quote_id: 'home_project_quotes', plan_id: 'home_move_plans' });

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

// Righe pronte da scrivere per una tabella: spazio di destinazione, autore, niente documenti.
export function prepareRows(table, rows, { homeId = null, userId, ids = null }) {
  return (rows || []).filter(isObject).filter(row => table !== 'home_professional_notes' || row.user_id === userId).map(source => {
    const row = { ...source };
    if (ids) {
      if (row.id && ids[table]?.[row.id]) row.id = ids[table][row.id];
      for (const [column, target] of Object.entries(LINKS)) if (row[column] && ids[target]?.[row[column]]) row[column] = ids[target][row[column]];
    }
    if ('user_id' in row) row.user_id = userId;
    if ('created_by' in row) row.created_by = userId;
    if ('confirmed_by' in row && row.confirmed_by) row.confirmed_by = userId;
    if ('document_id' in row) row.document_id = null;
    if (!PERSONAL.has(table)) row.home_id = homeId;
    delete row.storage_path;
    return row;
  });
}

// Piano: per ogni tabella ripristinabile le righe del file; il resto in skipped (per motivo).
// Nello stesso spazio del backup si tengono gli identificativi (si aggiunge solo ciò che manca);
// in uno spazio diverso le voci si copiano con identificativi nuovi (copy: true).
export function restorePlan(backup, target, { makeId } = {}) {
  const steps = [], skipped = {};
  const copy = Boolean(backup.scope) && (backup.scope.home_id || null) !== (target.homeId || null);
  const ids = copy ? newIds(backup.tables, makeId) : null;
  for (const table of RESTORE_ORDER) {
    const rows = prepareRows(table, backup.tables[table], { ...target, ids });
    if (rows.length) steps.push({ table, rows });
  }
  for (const [table, rows] of Object.entries(backup.tables)) {
    if (RESTORE_ORDER.includes(table) || !rows?.length) continue;
    const reason = RESTORE_SKIPPED[table] || 'unknown';
    skipped[reason] = (skipped[reason] || 0) + rows.length;
  }
  return { steps, skipped, copy };
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
  for (const [index, { table, rows }] of plan.steps.entries()) {
    const counts = { added: 0, present: 0, failed: 0 };
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
  home_emergency_cards: 'sos', user_suppliers: 'connect',
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

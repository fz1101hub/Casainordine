// Backup JSON di uno spazio («Notifiche e backup»): quali tabelle entrano e come si leggono.
//
// Ogni tabella del database sta in uno di tre elenchi: BACKUP_MAIN (le prime sezioni, già lette
// dalla pagina), BACKUP_TABLES (lette qui) o BACKUP_EXCLUDED (con il motivo). Il test
// tests/backup-completo.test.mjs controlla le migrazioni: una tabella nuova che non sta in nessun
// elenco fa fallire la CI, così il backup non resta indietro senza che nessuno se ne accorga.
// Le regole di accesso del database restano il filtro vero: si legge solo ciò che chi esporta
// può già vedere nell'app.
import { appError } from './friendly-error.mjs';

export const BACKUP_MAIN = Object.freeze(['bills', 'utilities', 'home_properties', 'home_documents', 'meter_readings',
  'meter_reminders', 'home_contracts', 'maintenance_assets', 'maintenance_events', 'payment_receipts']);

// scope: 'space' (righe della casa, o dello spazio personale), 'user' (impostazioni personali),
// oppure parent/key: righe collegate a quelle della tabella madre già lette.
export const BACKUP_TABLES = Object.freeze([
  { name: 'house_tasks' }, { name: 'home_budgets' }, { name: 'home_expenses' }, { name: 'home_shopping' },
  { name: 'home_vehicles' }, { name: 'home_vehicle_deadlines' },
  { name: 'home_automations' }, { name: 'home_professionals' }, { name: 'home_seasonal_settings' },
  { name: 'home_seasonal_done' }, { name: 'home_stock_items' }, { name: 'home_projects' }, { name: 'home_garden_plants' },
  { name: 'home_pets' }, { name: 'home_tax_items' }, { name: 'health_people' },
  // Nello spazio personale anche i contratti in cui si è l'inquilino (sono nella casa del locatore).
  { name: 'home_leases', tenant: true },
  { name: 'home_decisions' }, { name: 'home_inventory_items' }, { name: 'home_move_plans' }, { name: 'home_move_steps' },
  { name: 'home_savings_goals' }, { name: 'home_refund_expectations' }, { name: 'home_vacation_plans' },
  { name: 'pagopa_notices' }, { name: 'bill_security_reviews' },
  // Le schede SOS protette da una frase restano cifrate anche nel file.
  { name: 'home_emergency_cards' },
  { name: 'home_expense_shares', parent: 'home_expenses', key: 'expense_id' },
  { name: 'home_professional_notes', parent: 'home_professionals', key: 'professional_id', order: 'professional_id' },
  { name: 'home_project_phases', parent: 'home_projects', key: 'project_id' },
  { name: 'home_project_quotes', parent: 'home_projects', key: 'project_id' },
  { name: 'home_project_expenses', parent: 'home_projects', key: 'project_id' },
  { name: 'home_project_photos', parent: 'home_projects', key: 'project_id' },
  { name: 'home_lease_reports', parent: 'home_leases', key: 'lease_id' },
  { name: 'home_lease_photos', parent: 'home_lease_reports', key: 'report_id', strip: ['storage_path'] },
  { name: 'home_decision_votes', parent: 'home_decisions', key: 'decision_id', order: 'decision_id' },
  { name: 'home_replacement_plans', parent: 'maintenance_assets', key: 'asset_id', order: 'asset_id' },
  { name: 'home_garden_tasks', parent: 'home_garden_plants', key: 'plant_id' },
  { name: 'home_garden_log', parent: 'home_garden_plants', key: 'plant_id' },
  { name: 'home_garden_photos', parent: 'home_garden_plants', key: 'plant_id' },
  { name: 'home_pet_tasks', parent: 'home_pets', key: 'pet_id' },
  { name: 'home_pet_log', parent: 'home_pets', key: 'pet_id' },
  { name: 'health_therapies', parent: 'health_people', key: 'person_id' },
  { name: 'health_appointments', parent: 'health_people', key: 'person_id' },
  { name: 'health_expenses', parent: 'health_people', key: 'person_id' },
  { name: 'health_doses', parent: 'health_therapies', key: 'therapy_id' },
  { name: 'user_suppliers', scope: 'user' },
  { name: 'user_alert_preferences', scope: 'user', order: 'user_id' },
  { name: 'user_language_preferences', scope: 'user', order: 'user_id' },
  { name: 'user_home_preferences', scope: 'user', order: 'user_id' },
]);

export const BACKUP_EXCLUDED = Object.freeze({
  health_reminders_sent: 'promemoria delle visite già mandati (solo server)',
  homes: 'la casa è indicata in scope.home_id',
  profiles: 'il proprio profilo è nel campo profile',
  home_members: 'dati delle altre persone della casa',
  home_invites: 'inviti: codici e indirizzi di altre persone',
  home_former_members: 'dati delle persone uscite dalla casa',
  home_audit_log: 'registro delle modifiche (si consulta in Cronologia)',
  home_recycle_bin: 'elementi eliminati, recuperabili per 30 giorni in Cronologia',
  home_sos_keys: 'sale e controllo della frase SOS: nel file aiuterebbero a indovinarla',
  home_vacation_shares: 'link temporanei condivisi',
  reminders: 'registro dei promemoria inviati',
  reminder_email_log: 'registro delle email inviate (solo server)',
  push_delivery_log: 'registro delle notifiche inviate (solo server)',
  push_deferred: 'notifiche rinviate dall’orario silenzioso, valide un giorno (solo server)',
  push_subscriptions: 'dispositivi per le notifiche (solo server)',
  bill_summaries: 'registro dei riepiloghi inviati',
  user_alerts: 'avvisi già mostrati',
  calendar_feeds: 'link segreti del calendario (solo server)',
  integration_keys: 'chiavi d’integrazione (solo server)',
  offline_import_log: 'registro tecnico delle bozze offline (solo server)',
  account_cleanup_jobs: 'coda di pulizia degli account eliminati (solo server)',
  mail_connections: 'collegamenti e token delle caselle email (solo server)',
  mail_oauth_states: 'stati temporanei dell’accesso alle caselle (solo server)',
  mail_connection_attempts: 'tentativi di collegamento (solo server)',
  mail_documents: 'allegati letti dalle caselle (solo server)',
  mail_bill_senders: 'mittenti imparati (solo server)',
  mail_payment_evidence: 'prove di pagamento lette dalle email (solo server)',
  mail_payment_trusted_senders: 'mittenti fidati dei pagamenti (solo server)',
});

const missingTable = error => ['42P01', 'PGRST205', 'PGRST106'].includes(error?.code);
const strip = (rows, fields = []) => fields.length ? rows.map(row => { const out = { ...row }; for (const f of fields) delete out[f]; return out; }) : rows;

// Legge le tabelle di BACKUP_TABLES. `known` porta le righe già lette dalla pagina (per esempio
// maintenance_assets), che servono come tabelle madri. Una tabella che manca (migrazione non
// ancora applicata) si salta e finisce in `missing`.
export async function collectBackupTables(client, { homeId = null, userId, known = {} }, { pageSize = 500, maxRows = 10000, chunk = 80 } = {}) {
  const tables = {}, missing = [];
  const rowsOf = name => tables[name] || known[name] || [];
  async function pages(build, name) {
    const collected = [];
    for (let offset = 0; ;) {
      const { data, error } = await build().range(offset, offset + pageSize - 1);
      if (error) throw error;
      const page = data || [];
      collected.push(...page);
      offset += page.length;
      if (page.length < pageSize) return collected;
      if (offset >= maxRows) throw appError('extra.backup.tooManyRows', { table: name });
    }
  }
  for (const table of BACKUP_TABLES) {
    const order = table.order || 'id';
    try {
      let rows = [];
      if (table.parent) {
        const ids = [...new Set(rowsOf(table.parent).map(r => r.id).filter(Boolean))];
        for (let i = 0; i < ids.length; i += chunk) {
          const part = ids.slice(i, i + chunk);
          rows.push(...await pages(() => client.from(table.name).select('*').in(table.key, part).order(order), table.name));
        }
      } else if (table.scope === 'user') {
        rows = await pages(() => client.from(table.name).select('*').eq('user_id', userId).order(order), table.name);
      } else {
        rows = await pages(() => {
          const q = client.from(table.name).select('*');
          return (homeId ? q.eq('home_id', homeId) : q.is('home_id', null)).order(order);
        }, table.name);
        if (table.tenant && !homeId && userId) {
          const seen = new Set(rows.map(r => r.id));
          const rented = await pages(() => client.from(table.name).select('*').eq('tenant_id', userId).order(order), table.name);
          rows.push(...rented.filter(r => !seen.has(r.id)));
        }
      }
      tables[table.name] = strip(rows, table.strip);
    } catch (error) {
      if (missingTable(error)) { missing.push(table.name); continue; }
      throw error;
    }
  }
  return { tables, missing };
}

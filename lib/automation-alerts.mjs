// Controllo programmato delle automazioni personalizzate (lib/automations.mjs): per ogni regola
// attiva, le voci del suo spazio che oggi la fanno scattare diventano avvisi (tipo «automation»).
// La consegna è quella comune (deliverAlerts): un solo avviso per voce e data, push solo la prima volta.
import { addDaysISO } from './dates.mjs';
import { automationEventsToday, inScope, AUTOMATION_LIMITS } from './automations.mjs';
import { automationAlertCopy } from './extra-alert-copy.mjs';
import { deliverAlerts } from './extra-alerts.mjs';

// Tabella non ancora creata (migrate_v43_automazioni.sql non eseguita): niente da fare, nessun errore.
const MISSING_TABLE = new Set(['42P01', 'PGRST205']);

export async function processAutomations(admin, today, counts, options = {}) {
  const { data: rules, error } = await admin.from('home_automations')
    .select('id,user_id,home_id,kind,name,amount_threshold,category,supplier_match,service_match,days_before,every_months,next_on,notify_all,paused')
    .eq('paused', false).limit(2000);
  if (error) { if (!MISSING_TABLE.has(error.code)) counts.errors.push(`Automazioni: ${error.message}`); return; }
  if (!rules?.length) return;
  const homes = [...new Set(rules.filter(r => r.home_id).map(r => r.home_id))];
  const people = [...new Set(rules.filter(r => !r.home_id).map(r => r.user_id))];
  // Solo le voci degli spazi che hanno regole: case condivise e spazi personali di chi le ha create.
  async function scoped(table, columns, filter) {
    const rows = [];
    for (const [ids, personal] of [[homes, false], [people, true]]) {
      if (!ids.length) continue;
      let query = filter(admin.from(table).select(columns));
      query = personal ? query.is('home_id', null).in('user_id', ids) : query.in('home_id', ids);
      const { data, error: readError } = await query.limit(5000);
      if (readError) { counts.errors.push(`Automazioni (${table}): ${readError.message}`); return null; }
      rows.push(...(data || []));
    }
    return rows;
  }
  const needs = kind => rules.some(rule => rule.kind === kind);
  const bills = needs('bill_amount') ? await scoped('bills', 'id,user_id,home_id,title,supplier,category,amount,due_date,paid_at', q => q.is('paid_at', null).gte('due_date', today)) : [];
  const contracts = needs('contract_renewal') ? await scoped('home_contracts', 'id,user_id,home_id,supplier,service,renewal_on', q => q.gte('renewal_on', today).lte('renewal_on', addDaysISO(today, AUTOMATION_LIMITS.horizonDays))) : [];
  if (bills === null || contracts === null) return;
  const entries = [];
  for (const rule of rules) {
    const data = { bills: bills.filter(b => inScope(rule, b)), contracts: contracts.filter(c => inScope(rule, c)) };
    for (const item of automationEventsToday(rule, data, today)) {
      entries.push({
        item: { user_id: rule.user_id, home_id: rule.home_id },
        event: { kind: 'automation', reference_id: item.reference_id, event_date: item.event_date },
        copy: language => automationAlertCopy(rule.kind, item.source, language),
        // «Tutta la casa» avvisa ogni membro; altrimenti solo chi ha la regola (se è ancora nella casa).
        recipients: rule.notify_all && rule.home_id ? undefined : [rule.user_id],
      });
    }
  }
  counts.automation_matches = entries.length;
  await deliverAlerts(admin, entries, counts, { today, ...options });
}

// Controllo programmato delle automazioni personalizzate (lib/automations.mjs): per ogni regola
// attiva, le voci del suo spazio che oggi la fanno scattare diventano avvisi (tipo «automation»).
// La consegna è quella comune (deliverAlerts): un solo avviso per voce e data, push solo la prima volta.
import { addDaysISO } from './dates.mjs';
import { automationEventsToday, inScope, AUTOMATION_LIMITS } from './automations.mjs';
import { automationAlertCopy } from './extra-alert-copy.mjs';
import { deliverAlerts } from './extra-alerts.mjs';
import { readAll, readIn } from './batch.mjs';

// Tabella non ancora creata (migrate_v43_automazioni.sql non eseguita): niente da fare, nessun errore.
const MISSING_TABLE = new Set(['42P01', 'PGRST205']);

// Letture a pagine e a gruppi di id (readAll/readIn): prima c'era un tetto (2000 regole, 5000 voci,
// che Supabase riduce comunque a 1000 righe) e con molte persone una parte delle regole non
// scattava mai; con molti spazi l'elenco degli id nell'indirizzo diventava troppo lungo
// (tests/avvisi-molti-dati.test.mjs).
export async function processAutomations(admin, today, counts, options = {}) {
  let rules;
  try {
    rules = await readAll(admin, 'home_automations',
      'id,user_id,home_id,kind,name,amount_threshold,category,supplier_match,service_match,days_before,every_months,next_on,notify_all,paused',
      q => q.eq('paused', false).order('id'));
  } catch (error) { if (!MISSING_TABLE.has(error?.code)) counts.errors.push(`Automazioni: ${error?.message || error}`); return; }
  if (!rules?.length) return;
  const homes = [...new Set(rules.filter(r => r.home_id).map(r => r.home_id))];
  const people = [...new Set(rules.filter(r => !r.home_id).map(r => r.user_id))];
  // Solo le voci degli spazi che hanno regole: case condivise e spazi personali di chi le ha create.
  async function scoped(table, columns, filter) {
    try {
      return [
        ...await readIn(admin, table, columns, 'home_id', homes, q => filter(q).order('id')),
        ...await readIn(admin, table, columns, 'user_id', people, q => filter(q.is('home_id', null)).order('id')),
      ];
    } catch (readError) { counts.errors.push(`Automazioni (${table}): ${readError?.message || readError}`); return null; }
  }
  const needs = kind => rules.some(rule => rule.kind === kind);
  const bills = needs('bill_amount') ? await scoped('bills', 'id,user_id,home_id,title,supplier,category,amount,due_date,paid_at', q => q.is('paid_at', null).gte('due_date', today)) : [];
  const contracts = needs('contract_renewal') ? await scoped('home_contracts', 'id,user_id,home_id,supplier,service,renewal_on', q => q.gte('renewal_on', today).lte('renewal_on', addDaysISO(today, AUTOMATION_LIMITS.horizonDays))) : [];
  if (bills === null || contracts === null) return;
  // Voci raggruppate per spazio (come inScope): prima ogni regola scorreva tutte le voci lette.
  const scopeOf = x => (x.home_id ? `h:${x.home_id}` : `u:${x.user_id}`);
  const group = rows => { const map = new Map(); for (const r of rows) { const k = scopeOf(r); if (!map.has(k)) map.set(k, []); map.get(k).push(r); } return map; };
  const billsBy = group(bills), contractsBy = group(contracts);
  const entries = [];
  for (const rule of rules) {
    const k = scopeOf(rule);
    const data = { bills: (billsBy.get(k) || []).filter(b => inScope(rule, b)), contracts: (contractsBy.get(k) || []).filter(c => inScope(rule, c)) };
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

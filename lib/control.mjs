// Casa Control (Fase 2, 3.3): pannello facoltativo con indicatori calcolati da eventi registrati
// (bollette, attività, manutenzioni, garanzie, contratti). Ogni indicatore porta la sua formula
// con i numeri usati; se i dati non bastano lo dice invece di stimare. Nessun punteggio complessivo.
// Modulo senza testi: titoli e formule sono «control.<id>.*» nel dizionario.
import { addDaysISO } from './dates.mjs';

export const MIN_EVENTS = 3;
export const UTILITY_CATEGORIES = Object.freeze(['Luce', 'Gas', 'Acqua', 'Internet', 'Telefono', 'Rifiuti']);
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const dayOf = value => (typeof value === 'string' && value.length >= 10 ? value.slice(0, 10) : '');
const round1 = n => Math.round(n * 10) / 10;
const shiftYears = (iso, years) => `${Number(iso.slice(0, 4)) + years}${iso.slice(4)}`.replace(/-02-29$/, '-02-28');

// Quota su un totale: ok solo con almeno MIN_EVENTS eventi, altrimenti «missing» con quanti ce ne sono.
function share(id, tab, numerator, denominator) {
  if (denominator < MIN_EVENTS) return { id, tab, kind: 'percent', status: 'missing', numerator, denominator, need: MIN_EVENTS };
  return { id, tab, kind: 'percent', status: 'ok', value: Math.round((numerator / denominator) * 100), numerator, denominator };
}

export function controlIndicators({ bills = [], tasks = [], assets = [], contracts = [], today, assetsKnown = true, contractsKnown = true }) {
  const yearAgo = shiftYears(today, -1), twoYearsAgo = shiftYears(today, -2);
  const list = [];

  // 1. Bollette pagate entro la scadenza, tra quelle scadute negli ultimi 12 mesi.
  const dueLastYear = bills.filter(b => ISO.test(b.due_date || '') && b.due_date >= yearAgo && b.due_date < today);
  const onTime = dueLastYear.filter(b => b.paid_at && dayOf(b.paid_at) <= b.due_date);
  list.push(share('billsOnTime', 'bills', onTime.length, dueLastYear.length));

  // 2. Bollette scadute e non ancora pagate, oggi.
  const overdue = bills.filter(b => !b.paid_at && ISO.test(b.due_date || '') && b.due_date < today);
  list.push(bills.length ? { id: 'billsOverdue', tab: 'bills', kind: 'count', status: 'ok', value: overdue.length, total: overdue.reduce((s, b) => s + (Number(b.amount) || 0), 0) }
    : { id: 'billsOverdue', tab: 'bills', kind: 'count', status: 'missing', numerator: 0, denominator: 0, need: 1 });

  // 3. Attività di casa fatte entro la data, tra quelle con scadenza negli ultimi 90 giorni.
  const quarterAgo = addDaysISO(today, -90);
  const tasksDue = tasks.filter(t => ISO.test(t.due_date || '') && t.due_date >= quarterAgo && t.due_date < today);
  list.push(share('tasksOnTime', 'tasks', tasksDue.filter(t => t.done_at && dayOf(t.done_at) <= t.due_date).length, tasksDue.length));

  // 4. Oggetti con il prossimo intervento non ancora scaduto, tra quelli che hanno una data.
  if (!assetsKnown) list.push({ id: 'maintenanceOnTrack', tab: 'maintenance', kind: 'percent', status: 'unavailable' });
  else {
    const scheduled = assets.filter(a => ISO.test(a.next_service_on || ''));
    list.push(share('maintenanceOnTrack', 'maintenance', scheduled.filter(a => a.next_service_on >= today).length, scheduled.length));
  }

  // 5. Garanzie che scadono nei prossimi 90 giorni.
  if (!assetsKnown) list.push({ id: 'warrantiesEnding', tab: 'maintenance', kind: 'count', status: 'unavailable' });
  else {
    const withWarranty = assets.filter(a => ISO.test(a.warranty_until || ''));
    const ending = withWarranty.filter(a => a.warranty_until >= today && a.warranty_until <= addDaysISO(today, 90));
    list.push(withWarranty.length ? { id: 'warrantiesEnding', tab: 'maintenance', kind: 'count', status: 'ok', value: ending.length, of: withWarranty.length }
      : { id: 'warrantiesEnding', tab: 'maintenance', kind: 'count', status: 'missing', numerator: 0, denominator: 0, need: 1 });
  }

  // 6. Contratti che si rinnovano nei prossimi 60 giorni.
  if (!contractsKnown) list.push({ id: 'renewalsSoon', tab: 'contracts', kind: 'count', status: 'unavailable' });
  else {
    const withRenewal = contracts.filter(c => ISO.test(c.renewal_on || ''));
    const soon = withRenewal.filter(c => c.renewal_on >= today && c.renewal_on <= addDaysISO(today, 60));
    list.push(withRenewal.length ? { id: 'renewalsSoon', tab: 'contracts', kind: 'count', status: 'ok', value: soon.length, of: withRenewal.length }
      : { id: 'renewalsSoon', tab: 'contracts', kind: 'count', status: 'missing', numerator: 0, denominator: 0, need: 1 });
  }

  // 7. Spesa per le utenze: ultimi 12 mesi rispetto ai 12 precedenti (bollette per data di scadenza).
  const utility = bills.filter(b => UTILITY_CATEGORIES.includes(b.category) && ISO.test(b.due_date || '') && Number.isFinite(Number(b.amount)));
  const recent = utility.filter(b => b.due_date >= yearAgo && b.due_date < today);
  const previous = utility.filter(b => b.due_date >= twoYearsAgo && b.due_date < yearAgo);
  const sum = rows => Math.round(rows.reduce((s, b) => s + Number(b.amount), 0) * 100) / 100;
  if (recent.length < MIN_EVENTS || previous.length < MIN_EVENTS || sum(previous) <= 0)
    list.push({ id: 'utilitySpend', tab: 'insights', kind: 'change', status: 'missing', numerator: recent.length, denominator: previous.length, need: MIN_EVENTS });
  else list.push({ id: 'utilitySpend', tab: 'insights', kind: 'change', status: 'ok', value: round1(((sum(recent) - sum(previous)) / sum(previous)) * 100), recent: sum(recent), previous: sum(previous), recentCount: recent.length, previousCount: previous.length });

  return list;
}

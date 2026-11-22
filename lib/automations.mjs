// Automazioni personalizzate (Fase 2, 3.3): regole scelte dalla persona per farsi avvisare.
//   - bill_amount: una bolletta da pagare supera una soglia (anche solo di una categoria o di un fornitore);
//   - contract_renewal: un contratto si rinnova entro un certo numero di giorni;
//   - recurring: un promemoria ogni N mesi, da una data di partenza.
// Lo stesso calcolo serve alla prova nell'app («cosa farebbe questa regola») e al controllo
// programmato, così la prova dice il vero. Nessun testo qui: le etichette sono nel dizionario.
import { addDaysISO } from './dates.mjs';

export const AUTOMATION_KINDS = Object.freeze(['bill_amount', 'contract_renewal', 'recurring']);
export const AUTOMATION_LIMITS = Object.freeze({ perSpace: 30, maxAmount: 100000, maxDaysBefore: 180, maxEveryMonths: 24, horizonDays: 365 });

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const clean = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const wholeIn = (value, min, max) => { const n = Number(value); return Number.isInteger(n) && n >= min && n <= max ? n : null; };
const lower = value => String(value ?? '').toLocaleLowerCase('it');
const contains = (haystack, needle) => !needle || lower(haystack).includes(lower(needle));

// Controlla e ripulisce una regola prima di salvarla (il database ripete gli stessi controlli).
// Restituisce {value} con le sole colonne del tipo scelto, oppure {error:'automation.error.*'}.
export function normalizeAutomation(input = {}) {
  const kind = input.kind;
  if (!AUTOMATION_KINDS.includes(kind)) return { error: 'automation.error.kind' };
  const name = clean(input.name, 80);
  if (name.length < 2) return { error: 'automation.error.name' };
  const value = { kind, name, amount_threshold: null, category: null, supplier_match: null, service_match: null, days_before: null, every_months: null, next_on: null,
    notify_all: Boolean(input.notify_all), paused: Boolean(input.paused) };
  if (kind === 'bill_amount') {
    const amount = Math.round(Number(String(input.amount_threshold ?? '').replace(',', '.')) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0 || amount > AUTOMATION_LIMITS.maxAmount) return { error: 'automation.error.amount' };
    value.amount_threshold = amount;
    value.category = clean(input.category, 40) || null;
    value.supplier_match = clean(input.supplier_match, 80) || null;
  } else if (kind === 'contract_renewal') {
    value.days_before = wholeIn(input.days_before, 1, AUTOMATION_LIMITS.maxDaysBefore);
    if (value.days_before === null) return { error: 'automation.error.days' };
    value.service_match = clean(input.service_match, 80) || null;
  } else {
    value.every_months = wholeIn(input.every_months, 1, AUTOMATION_LIMITS.maxEveryMonths);
    if (value.every_months === null) return { error: 'automation.error.every' };
    if (!ISO.test(input.next_on || '')) return { error: 'automation.error.date' };
    value.next_on = input.next_on;
    value.days_before = wholeIn(input.days_before ?? 0, 0, AUTOMATION_LIMITS.maxDaysBefore);
    if (value.days_before === null) return { error: 'automation.error.days' };
  }
  return { value };
}

// Data a N mesi da quella di partenza, con il giorno tenuto quando il mese lo ha (31 gennaio →
// 28 febbraio → 31 marzo): si conta sempre dalla partenza, così il giorno non scivola.
export function addMonthsFrom(anchor, months) {
  const [y, m, d] = anchor.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}
// Prima scadenza del promemoria da oggi in poi.
export function nextOccurrence(anchor, everyMonths, today) {
  if (!ISO.test(anchor || '') || !(everyMonths >= 1)) return '';
  if (anchor >= today) return anchor;
  for (let k = 1; k <= 1200; k++) { const date = addMonthsFrom(anchor, k * everyMonths); if (date >= today) return date; }
  return '';
}

// Una voce appartiene allo spazio della regola: la stessa casa, oppure lo spazio personale di chi l'ha creata.
export function inScope(rule, row) {
  return rule.home_id ? row.home_id === rule.home_id : !row.home_id && row.user_id === rule.user_id;
}

const later = (a, b) => (a > b ? a : b);

// Cosa farebbe la regola: per ogni voce, la data in cui avviserebbe (fire_on, mai prima di oggi)
// e la data che identifica l'avviso (event_date): lo stesso avviso non si manda due volte.
// bills e contracts sono già quelli dello spazio della regola.
export function simulateAutomation(rule, { bills = [], contracts = [] } = {}, today) {
  const items = [];
  if (rule.kind === 'bill_amount') {
    const threshold = Number(rule.amount_threshold);
    for (const bill of bills) {
      if (bill.paid_at || !ISO.test(bill.due_date || '') || bill.due_date < today) continue;
      if (!(Number(bill.amount) >= threshold)) continue;
      if (rule.category && bill.category !== rule.category) continue;
      if (!contains(`${bill.supplier || ''} ${bill.title || ''}`, rule.supplier_match)) continue;
      items.push({ reference_id: bill.id, event_date: bill.due_date, fire_on: today,
        source: { name: clean(bill.supplier || bill.title, 120), amount: Number(bill.amount), date: bill.due_date, threshold } });
    }
  } else if (rule.kind === 'contract_renewal') {
    const horizon = addDaysISO(today, AUTOMATION_LIMITS.horizonDays);
    for (const contract of contracts) {
      if (!ISO.test(contract.renewal_on || '') || contract.renewal_on < today || contract.renewal_on > horizon) continue;
      if (!contains(`${contract.service || ''} ${contract.supplier || ''}`, rule.service_match)) continue;
      items.push({ reference_id: contract.id, event_date: contract.renewal_on, fire_on: later(today, addDaysISO(contract.renewal_on, -Number(rule.days_before))),
        source: { name: clean(contract.supplier, 120), service: clean(contract.service, 120), date: contract.renewal_on } });
    }
  } else if (rule.kind === 'recurring') {
    const next = nextOccurrence(rule.next_on, Number(rule.every_months), today);
    if (next) items.push({ reference_id: rule.id || null, event_date: next, fire_on: later(today, addDaysISO(next, -Number(rule.days_before || 0))),
      source: { name: clean(rule.name, 120), date: next } });
  }
  return items.sort((a, b) => a.fire_on.localeCompare(b.fire_on) || a.event_date.localeCompare(b.event_date));
}

// Gli avvisi da creare oggi; una regola sospesa non ne crea.
export function automationEventsToday(rule, data, today) {
  if (rule.paused) return [];
  return simulateAutomation(rule, data, today).filter(item => item.fire_on === today);
}

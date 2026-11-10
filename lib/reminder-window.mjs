import { addDaysISO, nextRecurringDue } from './dates.mjs';

// Promemoria: tutte le bollette non pagate che scadono da oggi a REMINDER_DAYS giorni.
// Se il cron salta un giorno, o una bolletta arriva con meno anticipo, il promemoria parte lo
// stesso; la deduplica per bolletta evita di mandarlo più volte.
export const REMINDER_DAYS = 3;
export function reminderWindow(today, days = REMINDER_DAYS) {
  return { from: today, to: addDaysISO(today, days) };
}
export function daysUntil(today, due) {
  const diff = Math.round((Date.parse(`${due}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000);
  return Number.isFinite(diff) ? Math.max(0, diff) : 0;
}
// Utenze ricorrenti: prima data utile da oggi in poi, senza creare stime per il passato.
export function firstRecurringFrom(date, today, frequency, billingDay = null, maxSteps = 400) {
  let current = date, steps = 0;
  while (current && current < today && steps < maxSteps) {
    current = nextRecurringDue(current, frequency, billingDay);
    steps++;
  }
  return current || null;
}

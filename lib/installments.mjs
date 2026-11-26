// Rate e scadenze (richiesta dell'utente del 26 novembre 2026, notte): impegni pagati a rate
// (università, scuola, nido, sport, attività), collaboratori domestici (stipendio e contributi INPS
// trimestrali) e liberi professionisti (contributi INPS fissi, imposte, IVA trimestrale).
// Usato dal browser (app/Installments.jsx) e dal lavoro giornaliero (lib/installment-alerts.mjs).
// Niente dizionari qui: i modelli ricevono t() per scrivere il nome delle rate.
import { addDaysISO as addDays } from './dates.mjs';

export const PLAN_KINDS = Object.freeze(['university', 'school', 'nursery', 'sport', 'activity', 'domestic_worker', 'freelance', 'other']);
// Categoria del 730 proposta per tipo (si può cambiare): istruzione, asilo nido, sport dei ragazzi,
// contributi del collaboratore domestico. Stipendi e tasse del professionista non vanno nel 730.
export const PLAN_TAX = Object.freeze({ university: 'education', school: 'education', nursery: 'nursery', sport: 'sport', activity: null, domestic_worker: null, freelance: null, other: null });
export const TAX_CHOICES = Object.freeze(['education', 'nursery', 'sport', 'domestic_worker']);
export const TEMPLATES = Object.freeze(['custom', 'monthly', 'school_year', 'domestic_pay', 'domestic_inps', 'artisans_inps', 'income_taxes', 'vat_quarterly']);
// Modelli proposti per primi secondo il tipo d'impegno.
export const KIND_TEMPLATES = Object.freeze({ university: ['custom'], school: ['school_year', 'monthly', 'custom'], nursery: ['school_year', 'monthly', 'custom'],
  sport: ['monthly', 'custom'], activity: ['monthly', 'custom'], domestic_worker: ['domestic_pay', 'domestic_inps', 'custom'],
  freelance: ['income_taxes', 'artisans_inps', 'vat_quarterly', 'custom'], other: ['custom', 'monthly'] });
export const REMIND_CHOICES = Object.freeze([0, 1, 3, 5, 7, 10, 15, 30]);
export const INST_LIMITS = Object.freeze({ title: 120, payee: 120, person: 80, notes: 1000, label: 120, maxCents: 100000000, plansPerSpace: 200, perPlan: 600, maxCount: 60, lateDays: 30 });

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const validDate = value => ISO.test(value || '') && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
const text = (value, max) => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
const pad = n => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const daysBetween = (from, to) => Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000);
// Giorno del mese che non esiste (31 aprile) → ultimo giorno del mese.
const clampDay = (y, m, d) => iso(y, m, Math.min(d, new Date(Date.UTC(y, m, 0)).getUTCDate()));
const addMonth = (y, m, n) => { const t = (y * 12 + (m - 1)) + n; return [Math.floor(t / 12), (t % 12) + 1]; };

// ===== Giorni lavorativi in Italia =====
// Pasqua (calendario gregoriano, algoritmo anonimo): serve per il lunedì dell'Angelo.
export function easter(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(year, month, day);
}
export function isHoliday(dateISO) {
  const md = dateISO.slice(5);
  if (['01-01', '01-06', '04-25', '05-01', '06-02', '08-15', '11-01', '12-08', '12-25', '12-26'].includes(md)) return true;
  return dateISO === addDays(easter(Number(dateISO.slice(0, 4))), 1);
}
// Una scadenza che cade di sabato, domenica o in un giorno festivo slitta al primo giorno lavorativo.
export function nextWorkingDay(dateISO) {
  let d = dateISO;
  for (let n = 0; n < 10; n++) {
    const wd = new Date(d + 'T12:00:00Z').getUTCDay();
    if (wd !== 0 && wd !== 6 && !isHoliday(d)) return d;
    d = addDays(d, 1);
  }
  return d;
}

// ===== Controlli =====
export function normalizePlan(input = {}) {
  const title = text(input.title, INST_LIMITS.title);
  if (title.length < 2) return { error: 'inst.error.title' };
  const kind = PLAN_KINDS.includes(input.kind) ? input.kind : 'other';
  const remind = Number(input.remind_days ?? 3);
  if (!Number.isInteger(remind) || remind < 0 || remind > 60) return { error: 'inst.error.remind' };
  return { value: { title, kind, payee: text(input.payee, INST_LIMITS.payee), person: text(input.person, INST_LIMITS.person),
    tax_category: TAX_CHOICES.includes(input.tax_category) ? input.tax_category : null, remind_days: remind, notes: text(input.notes, INST_LIMITS.notes) } };
}
const cents = value => (value === '' || value === null || value === undefined ? null : Math.round(Number(value) * 100));
export function normalizeInstallment(input = {}) {
  const label = text(input.label, INST_LIMITS.label);
  if (!label) return { error: 'inst.error.label' };
  if (!validDate(input.due_on)) return { error: 'inst.error.date' };
  const amount = input.amount_cents !== undefined ? input.amount_cents : cents(input.amount);
  if (amount !== null && !(Number.isInteger(amount) && amount >= 1 && amount <= INST_LIMITS.maxCents)) return { error: 'inst.error.amount' };
  return { value: { label, due_on: input.due_on, amount_cents: amount, notes: text(input.notes, 500) } };
}

// ===== Modelli: le rate di un impegno =====
// options: from (prima data), count (quante), every (ogni quanti mesi), day (giorno del mese),
// amount_cents, thirteenth (tredicesima a dicembre), today (per le scadenze di legge: le prossime).
// t(key, params): nomi delle rate nella lingua dell'app («inst.gen.*»); monthName(m): nome del mese.
export function generateInstallments(template, options = {}, t = k => k, monthName = m => String(m)) {
  const amount = Number.isInteger(options.amount_cents) && options.amount_cents > 0 ? options.amount_cents : null;
  const out = [], today = options.today;
  const push = (label, due_on, value = amount) => out.push({ label, due_on, amount_cents: value });
  const count = Math.max(1, Math.min(INST_LIMITS.maxCount, Number(options.count) || 1));
  const startY = Number(String(options.from || today).slice(0, 4)), startM = Number(String(options.from || today).slice(5, 7));
  const day = Math.max(1, Math.min(31, Number(options.day) || Number(String(options.from || today).slice(8, 10)) || 1));
  // Scadenze di legge: le prossime da oggi (anche quella di oggi), slittate al primo giorno lavorativo.
  const upcoming = (list, n) => list.filter(x => x.due_on >= today).sort((a, b) => a.due_on.localeCompare(b.due_on)).slice(0, n).forEach(x => push(x.label, x.due_on));
  const year = Number(String(today).slice(0, 4));
  if (template === 'custom') {
    if (!validDate(options.from)) return [];
    const every = Math.max(0, Math.min(12, Number(options.every) || 0));
    for (let i = 0; i < (every ? count : 1); i++) { const [y, m] = addMonth(startY, startM, i * every); push(t('inst.gen.rate', { number: i + 1 }), clampDay(y, m, day)); }
  } else if (template === 'monthly') {
    if (!validDate(options.from)) return [];
    for (let i = 0; i < count; i++) { const [y, m] = addMonth(startY, startM, i); push(t('inst.gen.month', { month: monthName(m), year: y }), clampDay(y, m, day)); }
  } else if (template === 'school_year') {
    // Da settembre a giugno dell'anno scolastico che comincia nell'anno scelto.
    const first = Number(options.schoolYear) || (startM >= 7 ? startY : startY - 1);
    for (let i = 0; i < 10; i++) { const [y, m] = addMonth(first, 9, i); push(t('inst.gen.fee', { month: monthName(m), year: y }), clampDay(y, m, day)); }
  } else if (template === 'domestic_pay') {
    if (!validDate(options.from)) return [];
    for (let i = 0; i < count; i++) {
      const [y, m] = addMonth(startY, startM, i);
      push(t('inst.gen.salary', { month: monthName(m), year: y }), clampDay(y, m, day));
      if (options.thirteenth && m === 12) push(t('inst.gen.thirteenth', { year: y }), clampDay(y, m, day));
    }
  } else if (template === 'domestic_inps') {
    // Contributi del lavoro domestico: entro il 10 del mese dopo ogni trimestre.
    const list = [];
    for (const y of [year - 1, year, year + 1]) for (const q of [1, 2, 3, 4]) {
      const [dy, dm] = addMonth(y, q * 3, 1);
      list.push({ label: t('inst.gen.inpsQuarter', { quarter: q, year: y }), due_on: nextWorkingDay(iso(dy, dm, 10)) });
    }
    upcoming(list, 4);
  } else if (template === 'artisans_inps') {
    // Contributi fissi di artigiani e commercianti: 16 maggio, 20 agosto, 16 novembre, 16 febbraio.
    const list = [];
    for (const y of [year - 1, year, year + 1]) [[5, 16], [8, 20], [11, 16], [14, 16]].forEach(([m, d], i) => {
      const [dy, dm] = addMonth(y, m, 0);
      list.push({ label: t('inst.gen.fixedInps', { number: i + 1, year: y }), due_on: nextWorkingDay(iso(dy, dm, d)) });
    });
    upcoming(list, 4);
  } else if (template === 'income_taxes') {
    // Imposte e contributi sul reddito: saldo e primo acconto il 30 giugno, secondo acconto il 30 novembre.
    const list = [];
    for (const y of [year - 1, year, year + 1]) {
      list.push({ label: t('inst.gen.balance', { prev: y - 1, year: y }), due_on: nextWorkingDay(iso(y, 6, 30)) });
      list.push({ label: t('inst.gen.secondAdvance', { year: y }), due_on: nextWorkingDay(iso(y, 11, 30)) });
    }
    upcoming(list, 2);
  } else if (template === 'vat_quarterly') {
    // IVA trimestrale: 16 maggio, 20 agosto, 16 novembre; il quarto trimestre con il saldo annuale il 16 marzo.
    const list = [];
    for (const y of [year - 1, year, year + 1]) {
      [[5, 16, 1], [8, 20, 2], [11, 16, 3]].forEach(([m, d, q]) => list.push({ label: t('inst.gen.vatQuarter', { quarter: q, year: y }), due_on: nextWorkingDay(iso(y, m, d)) }));
      list.push({ label: t('inst.gen.vatYear', { year: y }), due_on: nextWorkingDay(iso(y + 1, 3, 16)) });
    }
    upcoming(list, 4);
  }
  return out;
}

// ===== Stato e agenda =====
// paid (pagata), late (scaduta e non pagata), due (oggi), soon (entro il preavviso o una settimana), later.
export function installmentState(inst, today, remindDays = 3) {
  if (inst.paid_on) return 'paid';
  if (inst.due_on < today) return 'late';
  if (inst.due_on === today) return 'due';
  return daysBetween(today, inst.due_on) <= Math.max(7, Number(remindDays) || 0) ? 'soon' : 'later';
}

// Prossime rate non pagate (e quelle scadute), prima le più vicine.
export function installmentAgenda(installments = [], plans = [], today, days = 60) {
  const byId = new Map(plans.filter(p => !p.ended_on).map(p => [p.id, p]));
  const until = addDays(today, days);
  return installments.filter(i => !i.paid_on && byId.has(i.plan_id) && i.due_on <= until)
    .map(inst => ({ inst, plan: byId.get(inst.plan_id), state: installmentState(inst, today, byId.get(inst.plan_id).remind_days) }))
    .sort((a, b) => a.inst.due_on.localeCompare(b.inst.due_on) || a.plan.title.localeCompare(b.plan.title));
}

// Totali (centesimi) delle rate non pagate in un mese («YYYY-MM») e di quelle senza importo.
export function monthTotal(installments = [], plans = [], month) {
  const active = new Set(plans.filter(p => !p.ended_on).map(p => p.id));
  const list = installments.filter(i => !i.paid_on && active.has(i.plan_id) && i.due_on.slice(0, 7) === month);
  return { cents: list.reduce((s, i) => s + (Number(i.amount_cents) || 0), 0), count: list.length, unknown: list.filter(i => !i.amount_cents).length };
}

// Riassunto di un impegno: prossima rata, rate scadute, pagato nell'anno.
export function planSummary(plan, installments = [], today) {
  const mine = installments.filter(i => i.plan_id === plan.id).sort((a, b) => a.due_on.localeCompare(b.due_on));
  const year = today.slice(0, 4);
  return { next: mine.find(i => !i.paid_on && i.due_on >= today) || null, late: mine.filter(i => !i.paid_on && i.due_on < today).length,
    paidYear: mine.filter(i => i.paid_on && i.paid_on.slice(0, 4) === year).reduce((s, i) => s + (Number(i.paid_cents ?? i.amount_cents) || 0), 0), count: mine.length };
}

// Avvisi del lavoro giornaliero: quando comincia il preavviso (data: la scadenza) e, se non è
// pagata, il giorno dopo la scadenza (data: quel giorno), per un mese.
export function installmentNotices(installments = [], plans = [], today) {
  const byId = new Map(plans.filter(p => !p.ended_on).map(p => [p.id, p]));
  const out = [];
  for (const inst of installments) {
    const plan = byId.get(inst.plan_id);
    if (!plan || inst.paid_on) continue;
    const days = daysBetween(today, inst.due_on);
    if (days >= 0 && days <= (Number(plan.remind_days) || 0)) out.push({ inst, plan, type: 'soon', event_date: inst.due_on, days });
    else if (days < 0 && -days <= INST_LIMITS.lateDays) out.push({ inst, plan, type: 'late', event_date: addDays(inst.due_on, 1), days });
  }
  return out;
}

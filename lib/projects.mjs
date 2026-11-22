// Progetti e lavori (Fase 2, 3.3): scheda del lavoro, fasi, preventivi, spese e foto prima/dopo.
// Modulo senza testi: stati e tipi sono chiavi del dizionario («project.status.<chiave>»…).

export const PROJECT_STATUSES = Object.freeze(['idea', 'planning', 'in_progress', 'paused', 'done']);
export const QUOTE_STATUSES = Object.freeze(['pending', 'accepted', 'rejected']);
export const PHOTO_KINDS = Object.freeze(['before', 'during', 'after']);
export const PROJECT_LIMITS = Object.freeze({ title: 120, notes: 3000, phase: 160, supplier: 120, quoteNotes: 1000, expense: 200, caption: 200, maxAmount: 100000000, perSpace: 100 });

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const clean = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const money = value => {
  if (value === '' || value === null || value === undefined) return null;
  const n = Math.round(Number(String(value).replace(',', '.')) * 100) / 100;
  return Number.isFinite(n) && n >= 0 && n <= PROJECT_LIMITS.maxAmount ? n : NaN;
};
const day = value => (ISO.test(value || '') ? value : null);

export function normalizeProject(input = {}) {
  const title = clean(input.title, PROJECT_LIMITS.title);
  if (title.length < 2) return { error: 'project.error.title' };
  const budget = money(input.budget);
  if (Number.isNaN(budget)) return { error: 'project.error.amount' };
  const start_on = day(input.start_on), end_on = day(input.end_on);
  if (start_on && end_on && end_on < start_on) return { error: 'project.error.dates' };
  return { value: { title, status: PROJECT_STATUSES.includes(input.status) ? input.status : 'planning', budget, start_on, end_on,
    notes: String(input.notes ?? '').trim().slice(0, PROJECT_LIMITS.notes) } };
}

export function normalizePhase(input = {}) {
  const title = clean(input.title, PROJECT_LIMITS.phase);
  if (title.length < 2) return { error: 'project.error.phase' };
  return { value: { title, due_on: day(input.due_on) } };
}

export function normalizeQuote(input = {}) {
  const professional_id = input.professional_id || null;
  const supplier = clean(input.supplier, PROJECT_LIMITS.supplier);
  if (!professional_id && supplier.length < 2) return { error: 'project.error.supplier' };
  const amount = money(input.amount);
  if (amount === null || Number.isNaN(amount)) return { error: 'project.error.amount' };
  return { value: { professional_id, supplier, amount, received_on: day(input.received_on),
    status: QUOTE_STATUSES.includes(input.status) ? input.status : 'pending', notes: String(input.notes ?? '').trim().slice(0, PROJECT_LIMITS.quoteNotes) } };
}

export function normalizeExpense(input = {}) {
  const description = clean(input.description, PROJECT_LIMITS.expense);
  if (description.length < 2) return { error: 'project.error.expense' };
  const amount = money(input.amount);
  if (amount === null || Number.isNaN(amount)) return { error: 'project.error.amount' };
  const paid_on = day(input.paid_on);
  if (!paid_on) return { error: 'project.error.date' };
  return { value: { description, amount, paid_on, quote_id: input.quote_id || null } };
}

const sum = (rows, pick = row => row.amount) => Math.round(rows.reduce((total, row) => total + (Number(pick(row)) || 0), 0) * 100) / 100;

// Fasi in ordine: prima per posizione, poi per data prevista (senza data in fondo), poi per nome.
export function sortPhases(phases = []) {
  return [...phases].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)
    || String(a.due_on || '9999').localeCompare(String(b.due_on || '9999')) || String(a.title).localeCompare(String(b.title)));
}

// Riepilogo di un progetto: avanzamento delle fasi e conti (budget, preventivi accettati, speso, residuo).
// Il residuo è il budget meno lo speso; «oltre il budget» se speso o preventivi accettati lo superano.
export function projectSummary(project = {}, { phases = [], quotes = [], expenses = [] } = {}) {
  const done = phases.filter(phase => phase.done_at).length;
  const accepted = sum(quotes.filter(quote => quote.status === 'accepted'));
  const spent = sum(expenses);
  const budget = project.budget === null || project.budget === undefined || project.budget === '' ? null : Number(project.budget);
  const next = sortPhases(phases).find(phase => !phase.done_at) || null;
  return {
    phasesDone: done, phasesTotal: phases.length, progress: phases.length ? done / phases.length : 0,
    accepted, spent, budget,
    remaining: budget === null ? null : Math.round((budget - spent) * 100) / 100,
    overBudget: budget !== null && (spent > budget || accepted > budget),
    nextPhase: next,
  };
}

// Foto raggruppate per momento (prima, durante, dopo), nell'ordine di caricamento.
export function photosByKind(photos = []) {
  const groups = Object.fromEntries(PHOTO_KINDS.map(kind => [kind, []]));
  for (const photo of [...photos].sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || ''))))
    (groups[photo.kind] || groups.before).push(photo);
  return groups;
}

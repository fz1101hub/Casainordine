// Spese detraibili per il 730 (scelta dell'utente del 25 novembre 2026, sera): voci per anno e
// categoria, collegate alle bollette, alle spese di casa, ai lavori o al veterinario, con il modo di
// pagamento e il documento; riepilogo ed esportazione per il commercialista.
// L'app NON calcola quanto si recupera: mostra le regole principali (in vigore a novembre 2026, da
// fonti pubbliche) e segnala cosa può mancare (pagamento, documento, codice fiscale del fornitore).
// Usato dal browser (app/Taxes.jsx): niente dizionari qui, solo chiavi («taxes.…») o t.
export const TAX_CATEGORIES = Object.freeze(['renovation', 'energy', 'furniture', 'medical', 'veterinary', 'mortgage', 'rent', 'insurance', 'other']);
export const PAYMENT_METHODS = Object.freeze(['tax_transfer', 'traceable', 'cash', 'other']);
export const TAX_SOURCES = Object.freeze(['manual', 'bill', 'home_expense', 'project_expense', 'pet_log', 'health_expense']);
export const TAX_LIMITS = Object.freeze({ description: 200, supplier: 120, taxCode: 20, notes: 1000, maxCents: 100000000, perSpace: 5000, minYear: 2000, maxYear: 2100 });

// Pagamento richiesto: bonifico «parlante» per i lavori sulla casa; tracciabile (bonifico, carta,
// bancomat) per mobili, spese sanitarie e veterinarie; nessuno per le altre. Per farmaci, dispositivi
// medici e prestazioni del Servizio sanitario (pubbliche o accreditate) vanno bene anche i contanti:
// la voce lo dice con cash_ok (legge 160/2019, art. 1 commi 679-680).
export const PAYMENT_NEEDED = Object.freeze({ renovation: 'tax_transfer', energy: 'tax_transfer', furniture: 'traceable', medical: 'traceable', veterinary: 'traceable' });

// Regola indicativa per categoria e anno: chiave del testo (con percentuali e tetti) o «unknown».
// Lavori e risparmio energetico: 50% prima casa / 36% altre per le spese 2025 e 2026, poi 36% / 30%
// nel 2027 (legge di bilancio 2026). Bonus mobili: 50% su 5.000 € per il 2025 e il 2026.
// Spese sanitarie, veterinarie e interessi del mutuo: 19% con le loro franchigie e i loro tetti.
export function taxRuleKey(category, year) {
  const y = Number(year);
  if (category === 'renovation' || category === 'energy') {
    if (y === 2025 || y === 2026) return `taxes.rule.${category}.2026`;
    if (y === 2027) return `taxes.rule.${category}.2027`;
    return 'taxes.rule.unknown';
  }
  if (category === 'furniture') return y === 2025 || y === 2026 ? 'taxes.rule.furniture.2026' : 'taxes.rule.unknown';
  if (['medical', 'veterinary', 'mortgage'].includes(category)) return y >= 2020 && y <= 2027 ? `taxes.rule.${category}` : 'taxes.rule.unknown';
  return `taxes.rule.${TAX_CATEGORIES.includes(category) ? category : 'other'}`;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const validDate = value => ISO.test(value || '') && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
const text = (value, max) => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);

// Codice fiscale (16 caratteri) o partita IVA (11 cifre) del fornitore: solo la forma.
export function normalizeTaxCode(value) { return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, TAX_LIMITS.taxCode); }
export function validTaxCode(value) {
  const code = normalizeTaxCode(value);
  if (/^\d{11}$/.test(code)) {
    // Partita IVA: cifra di controllo (algoritmo di Luhn come per le partite IVA italiane).
    let sum = 0;
    for (let i = 0; i < 10; i++) { let n = Number(code[i]); if (i % 2) { n *= 2; if (n > 9) n -= 9; } sum += n; }
    return (10 - (sum % 10)) % 10 === Number(code[10]);
  }
  return /^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/.test(code);
}

// Importo in euro (stringa con il punto, da DecimalInput) → centesimi.
export function toCents(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

export function normalizeTaxItem(input = {}) {
  const description = text(input.description, TAX_LIMITS.description);
  if (description.length < 2) return { error: 'taxes.error.description' };
  const amount_cents = input.amount_cents !== undefined ? Number(input.amount_cents) : toCents(input.amount);
  if (!Number.isInteger(amount_cents) || amount_cents < 1 || amount_cents > TAX_LIMITS.maxCents) return { error: 'taxes.error.amount' };
  const tax_year = Number(input.tax_year);
  if (!Number.isInteger(tax_year) || tax_year < TAX_LIMITS.minYear || tax_year > TAX_LIMITS.maxYear) return { error: 'taxes.error.year' };
  const paid_on = input.paid_on ? String(input.paid_on) : null;
  if (paid_on && !validDate(paid_on)) return { error: 'taxes.error.date' };
  const category = TAX_CATEGORIES.includes(input.category) ? input.category : 'other';
  const payment_method = PAYMENT_METHODS.includes(input.payment_method) ? input.payment_method : null;
  return { value: { tax_year, category, description, amount_cents, paid_on, payment_method,
    supplier: text(input.supplier, TAX_LIMITS.supplier), supplier_tax_code: normalizeTaxCode(input.supplier_tax_code),
    document_id: input.document_id || null, notes: text(input.notes, TAX_LIMITS.notes), cash_ok: category === 'medical' && input.cash_ok === true } };
}

// Cosa può mancare a una voce (chiavi «taxes.warning.…»): non blocca, avvisa.
export function itemWarnings(item) {
  const out = [];
  const needed = PAYMENT_NEEDED[item.category];
  if (needed === 'tax_transfer' && item.payment_method !== 'tax_transfer') out.push('transfer');
  if (needed === 'traceable' && !(item.category === 'medical' && item.cash_ok) && (!item.payment_method || item.payment_method === 'cash')) out.push('traceable');
  if (needed === 'tax_transfer' && !validTaxCode(item.supplier_tax_code)) out.push('taxCode');
  if (!item.document_id) out.push('document');
  if (item.paid_on && Number(String(item.paid_on).slice(0, 4)) !== Number(item.tax_year)) out.push('year');
  return out;
}

// Riepilogo di un anno: per categoria totale, numero di voci e voci con qualcosa da controllare.
export function yearSummary(items = [], year) {
  const rows = new Map();
  for (const item of items.filter(i => Number(i.tax_year) === Number(year))) {
    const row = rows.get(item.category) || { category: item.category, total_cents: 0, count: 0, warnings: 0 };
    row.total_cents += Number(item.amount_cents) || 0; row.count++; if (itemWarnings(item).length) row.warnings++;
    rows.set(item.category, row);
  }
  return TAX_CATEGORIES.filter(c => rows.has(c)).map(c => rows.get(c));
}

// Anni da mostrare: quelli con voci, quello corrente e il precedente (la dichiarazione si fa l'anno dopo).
export function taxYears(items = [], today) {
  const current = Number(String(today).slice(0, 4));
  return [...new Set([current, current - 1, ...items.map(i => Number(i.tax_year))])].filter(Number.isInteger).sort((a, b) => b - a);
}

// Spese dell'anno che si possono segnare come detraibili (non ancora segnate): bollette pagate, spese
// di casa, spese dei lavori, spese del veterinario, spese sanitarie. Anno = anno del pagamento
// («principio di cassa»). Le spese sanitarie portano con sé il pagamento e cash_ok.
const CASH_OK_HEALTH = new Set(['pharmacy', 'device', 'ssn']);
export function taxCandidates({ bills = [], expenses = [], projectExpenses = [], projects = [], petLog = [], pets = [], billDocuments = [], healthExpenses = [], healthPeople = [] } = {}, year, marked = []) {
  const done = new Set(marked.filter(m => m.source_id).map(m => `${m.source}:${m.source_id}`));
  const inYear = date => String(date || '').slice(0, 4) === String(year);
  const projectTitle = new Map(projects.map(p => [p.id, p.title])), petName = new Map(pets.map(p => [p.id, p.name])), personName = new Map(healthPeople.map(p => [p.id, p.name]));
  const billDoc = new Map(billDocuments.map(d => [d.bill_id, d.id]));
  const out = [];
  for (const b of bills) {
    const date = b.paid_at ? String(b.paid_at).slice(0, 10) : null;
    if (!date || !inYear(date) || !(Number(b.amount) > 0)) continue;
    out.push({ source: 'bill', source_id: b.id, description: [b.supplier, b.title].filter(Boolean).join(' · ') || b.title || '', amount_cents: Math.round(Number(b.amount) * 100), paid_on: date, category: 'other', document_id: billDoc.get(b.id) || null });
  }
  for (const e of expenses) if (inYear(e.incurred_on) && Number(e.amount) > 0) out.push({ source: 'home_expense', source_id: e.id, description: e.title, amount_cents: Math.round(Number(e.amount) * 100), paid_on: e.incurred_on, category: 'other', document_id: null });
  for (const e of projectExpenses) if (inYear(e.paid_on) && Number(e.amount) > 0) out.push({ source: 'project_expense', source_id: e.id, description: [projectTitle.get(e.project_id), e.description].filter(Boolean).join(' · '), amount_cents: Math.round(Number(e.amount) * 100), paid_on: e.paid_on, category: 'renovation', document_id: e.document_id || null });
  for (const l of petLog) if (inYear(l.done_on) && Number(l.cost_cents) > 0) out.push({ source: 'pet_log', source_id: l.id, description: [petName.get(l.pet_id), l.title].filter(Boolean).join(' · '), amount_cents: Number(l.cost_cents), paid_on: l.done_on, category: 'veterinary', document_id: l.document_id || null });
  for (const e of healthExpenses) if (inYear(e.spent_on) && Number(e.amount_cents) > 0) out.push({ source: 'health_expense', source_id: e.id, description: [personName.get(e.person_id), e.description].filter(Boolean).join(' · '),
    amount_cents: Number(e.amount_cents), paid_on: e.spent_on, category: 'medical', payment_method: e.payment_method || null, cash_ok: CASH_OK_HEALTH.has(e.kind) });
  return out.filter(c => !done.has(`${c.source}:${c.source_id}`) && String(c.description).trim().length >= 2)
    .map(c => ({ ...c, description: c.description.slice(0, TAX_LIMITS.description) }))
    .sort((a, b) => b.paid_on.localeCompare(a.paid_on) || a.description.localeCompare(b.description));
}

// CSV per il commercialista (Excel in italiano: punto e virgola, virgola per i decimali, BOM).
export function taxCsv(items = [], year, t) {
  const cell = value => { const s = String(value ?? ''); return /[;"\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""')}"` : s; };
  const euros = cents => (Number(cents) / 100).toFixed(2).replace('.', ',');
  const head = ['date', 'category', 'description', 'amount', 'payment', 'supplier', 'taxCode', 'document', 'notes'].map(k => t('taxes.csv.' + k));
  const rows = items.filter(i => Number(i.tax_year) === Number(year)).sort((a, b) => String(a.paid_on || '').localeCompare(String(b.paid_on || '')))
    .map(i => [i.paid_on || '', t('taxes.category.' + i.category), i.description, euros(i.amount_cents), i.payment_method ? t('taxes.payment.' + i.payment_method) : '',
      i.supplier, i.supplier_tax_code, i.document_name || (i.document_id ? t('taxes.csv.yes') : ''), i.notes]);
  return '﻿' + [head, ...rows].map(r => r.map(cell).join(';')).join('\r\n') + '\r\n';
}

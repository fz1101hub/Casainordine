export function addDaysISO(iso, days) {
  const d = new Date(`${iso}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new Error('Data non valida');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function todayRome(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function nextRecurringDue(iso, frequency, billingDay = null) {
  if (!['monthly', 'bimonthly', 'quarterly', 'yearly', 'biennial'].includes(frequency)) return null;
  const months = { monthly: 1, bimonthly: 2, quarterly: 3, yearly: 12, biennial:24 }[frequency];
  const [year, month, day] = iso.split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1, 12));
  const y = target.getUTCFullYear(), m = target.getUTCMonth();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const d = Math.min(Number(billingDay || day), last);
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function parseMoney(value) {
  if (typeof value === 'number') return value;
  const raw = String(value ?? '').replace(/[€\s]/g, '');
  if (!raw) return NaN;
  // Italian: 1.234,56; international: 1234.56; integers: 120
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  const num = Number(normalized);
  return Number.isFinite(num) && num >= 0 ? Math.round(num * 100) / 100 : NaN;
}

export function normalizeDate(value) {
  const s = String(value ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T12:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : null;
  }
  const match = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
  if (!match) return null;
  return normalizeDate(`${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`);
}

export function euro(num) {
  return new Intl.NumberFormat('it-IT', { style:'currency', currency:'EUR' }).format(Number(num || 0));
}

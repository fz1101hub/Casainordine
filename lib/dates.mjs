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

// Thousands groups: first group 1-3 digits without a leading zero, then groups of exactly 3.
function validThousandsGroups(groups) {
  return /^[1-9]\d{0,2}$/.test(groups[0]) && groups.slice(1).every(g => /^\d{3}$/.test(g));
}
// Returns a plain decimal string ("1234.56") or null when the separators are not a money format.
function normalizeMoneyText(raw) {
  if (!/^\d+(?:[.,]\d+)*$/.test(raw)) return null; // no sign, exponent, hex, Infinity…
  const dot = raw.lastIndexOf('.'), comma = raw.lastIndexOf(',');
  if (dot >= 0 && comma >= 0) {
    // Both present: the last one is the decimal separator (1.234,56 or 1,234.56).
    const decimal = dot > comma ? '.' : ',', group = decimal === '.' ? ',' : '.';
    const parts = raw.split(decimal);
    if (parts.length !== 2) return null;
    const groups = parts[0].split(group);
    return validThousandsGroups(groups) ? `${groups.join('')}.${parts[1]}` : null;
  }
  if (dot < 0 && comma < 0) return raw;
  const parts = raw.split(dot >= 0 ? '.' : ',');
  // The same separator several times can only group thousands (1.234.567).
  if (parts.length > 2) return validThousandsGroups(parts) ? parts.join('') : null;
  // Once and followed by exactly 3 digits: thousands (1.200); otherwise decimal (12,50).
  if (parts[1].length === 3 && validThousandsGroups(parts)) return parts.join('');
  return `${parts[0]}.${parts[1]}`;
}

export function parseMoney(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : NaN;
  const raw = String(value ?? '').replace(/[€\s]/g, '');
  if (!raw) return NaN;
  // Italian: 1.234,56; international: 1,234.56 or 1234.56; integers: 120
  const normalized = normalizeMoneyText(raw);
  if (normalized === null) return NaN;
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

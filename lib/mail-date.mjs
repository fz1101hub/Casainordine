// Date-only values represent calendar days, not instants: pin them to UTC
// to avoid displaying the previous day in time zones west of Greenwich.
export function formatMailDate(value, locale, fallback) {
  if (value == null || value === '') return fallback;
  const raw = String(value);
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
  const parsed = dateOnly ? new Date(raw + 'T12:00:00Z') : new Date(raw);
  if (!Number.isFinite(parsed.getTime())) return fallback;
  if (dateOnly && parsed.toISOString().slice(0, 10) !== raw) return fallback;
  try {
    return new Intl.DateTimeFormat(locale, {
      day: '2-digit', month: 'short', year: 'numeric',
      ...(dateOnly ? { timeZone: 'UTC' } : {})
    }).format(parsed);
  } catch {
    return fallback;
  }
}

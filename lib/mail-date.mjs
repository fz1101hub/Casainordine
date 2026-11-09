// Date-only values represent calendar days, not instants: pin them to UTC
// to avoid displaying the previous day in time zones west of Greenwich.
export function formatMailDate(value, locale, fallback) {
  if (value == null || value === '') return fallback;
  const raw = String(value).trim();
  if (!raw) return fallback;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
  // Date.parse normalizes impossible days in some ISO timestamps (e.g. Feb 30).
  // Validate the calendar component before parsing either a day or an instant.
  const isoCalendar = /^(\d{4}-\d{2}-\d{2})(?:$|[Tt ])/.exec(raw);
  if (isoCalendar) {
    const calendar = new Date(isoCalendar[1] + 'T12:00:00Z');
    if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== isoCalendar[1]) return fallback;
  }
  const parsed = dateOnly ? new Date(raw + 'T12:00:00Z') : new Date(raw);
  if (!Number.isFinite(parsed.getTime())) return fallback;
  try {
    return new Intl.DateTimeFormat(locale, {
      day: '2-digit', month: 'short', year: 'numeric',
      ...(dateOnly ? { timeZone: 'UTC' } : {})
    }).format(parsed);
  } catch {
    return fallback;
  }
}

// Format provider timestamps in the account locale without exposing Invalid Date.
export function formatV20Timestamp(value, locale, fallback = '—', dateOnly = false) {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  // Date.parse normalizes impossible ISO calendar dates (e.g. February 30).
  // Reject those before formatting, without changing stored provider values.
  const isoDay = /^(\\d{4})-(\\d{2})-(\\d{2})(?=$|[Tt ])/.exec(value.trim());
  if (isoDay) {
    const year = Number(isoDay[1]), month = Number(isoDay[2]), day = Number(isoDay[3]);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) return fallback;
  }
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) return fallback;
  try {
    return (dateOnly ? timestamp.toLocaleDateString(locale, {timeZone: 'Europe/Rome'}) : timestamp.toLocaleString(locale, {timeZone: 'Europe/Rome'}));
  } catch {
    return fallback;
  }
}

export function formatV20Date(value, locale, fallback = '—') {
  return formatV20Timestamp(value, locale, fallback, true);
}

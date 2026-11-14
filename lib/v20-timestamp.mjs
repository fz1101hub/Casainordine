// Format provider timestamps in the account locale without exposing Invalid Date.
export function formatV20Timestamp(value, locale, fallback = '—', dateOnly = false) {
  if (typeof value !== 'string' || !value.trim()) return fallback;
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

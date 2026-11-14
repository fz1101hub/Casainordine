// Format provider timestamps in the account locale without exposing Invalid Date.
export function formatV20Timestamp(value, locale, fallback = '—') {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) return fallback;
  try {
    return timestamp.toLocaleString(locale, {timeZone: 'Europe/Rome'});
  } catch {
    return fallback;
  }
}

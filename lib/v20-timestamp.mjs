// Format provider timestamps in the account locale without exposing Invalid Date.
export function formatV20Timestamp(value, locale, fallback = '—', dateOnly = false) {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  // Date.parse normalizes impossible ISO calendar dates (e.g. February 30).
  // Reject those before formatting, without changing stored provider values.
  const isoDay = /^(\d{4})-(\d{2})-(\d{2})(?=$|[Tt ])/.exec(value.trim());
  if (isoDay) {
    const year = Number(isoDay[1]), month = Number(isoDay[2]), day = Number(isoDay[3]);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) return fallback;
  }
  // Provider and database dates must be ISO; ambiguous slash dates depend on the runtime locale.
  // Do not guess whether 03/04/2026 means March 4 or April 3.
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}(?:$|[Tt ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|z|[+-]\d{2}:\d{2})?)$/.test(trimmed)) return fallback;
  // A timestamp without an explicit offset is interpreted in the runtime's timezone.\n  // Reject it rather than displaying different instants on clients and CI runners.\n  if (/^\\d{4}-\\d{2}-\\d{2}[Tt ]/.test(trimmed) && !/(?:[Zz]|[+-]\\d{2}:\\d{2})$/.test(trimmed)) return fallback;\n  // Reject clock values that JavaScript may normalize (notably 24:00).
  // Keep the source timestamp untouched; never silently move it to another day.
  const clock = /^\d{4}-\d{2}-\d{2}[Tt ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:[Zz]|([+-])(\d{2}):(\d{2}))?$/.exec(trimmed);
  if (clock) {
    const hour = Number(clock[1]), minute = Number(clock[2]);
    const second = clock[3] === undefined ? 0 : Number(clock[3]);
    if (hour > 23 || minute > 59 || second > 59) return fallback;
    if (clock[5] !== undefined && (Number(clock[5]) > 23 || Number(clock[6]) > 59)) return fallback;
  }
  const timestamp = new Date(trimmed);
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

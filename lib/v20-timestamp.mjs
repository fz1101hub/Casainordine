const ITALY = 'Europe/Rome';

// Parse a provider/database ISO timestamp; null when it is missing, ambiguous or impossible.
function parseV20Timestamp(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  // Date.parse normalizes impossible ISO calendar dates (e.g. February 30).
  // Reject those before formatting, without changing stored provider values.
  const isoDay = /^(\d{4})-(\d{2})-(\d{2})(?=$|[Tt ])/.exec(value.trim());
  if (isoDay) {
    const year = Number(isoDay[1]), month = Number(isoDay[2]), day = Number(isoDay[3]);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) return null;
  }
  // Provider and database dates must be ISO; ambiguous slash dates depend on the runtime locale.
  // Do not guess whether 03/04/2026 means March 4 or April 3.
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}(?:$|[Tt ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|z|[+-]\d{2}:\d{2})?)$/.test(trimmed)) return null;
  // A timestamp without an explicit offset is interpreted in the runtime's timezone.
  // Reject it rather than displaying different instants on clients and CI runners.
  if (/^\d{4}-\d{2}-\d{2}[Tt ]/.test(trimmed) && !/(?:[Zz]|[+-]\d{2}:\d{2})$/.test(trimmed)) return null;
  // Reject clock values that JavaScript may normalize (notably 24:00).
  // Keep the source timestamp untouched; never silently move it to another day.
  const clock = /^\d{4}-\d{2}-\d{2}[Tt ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:[Zz]|([+-])(\d{2}):(\d{2}))?$/.exec(trimmed);
  if (clock) {
    const hour = Number(clock[1]), minute = Number(clock[2]);
    const second = clock[3] === undefined ? 0 : Number(clock[3]);
    if (hour > 23 || minute > 59 || second > 59) return null;
    if (clock[5] !== undefined && (Number(clock[5]) > 14 || Number(clock[6]) > 59 || (Number(clock[5]) === 14 && Number(clock[6]) !== 0))) return null;
  }
  // Normalize accepted ISO separators before parsing: Date.parse support for lowercase
  // t/z and a space separator varies between JavaScript engines.
  const canonical = trimmed.replace(/^(\d{4}-\d{2}-\d{2})[t ]/, '$1T').replace(/z$/, 'Z');
  const timestamp = new Date(canonical);
  return Number.isFinite(timestamp.getTime()) ? timestamp : null;
}

// Format provider timestamps in the account locale (Italian time) without exposing Invalid Date.
export function formatV20Timestamp(value, locale, fallback = '—', dateOnly = false) {
  const timestamp = parseV20Timestamp(value);
  if (!timestamp) return fallback;
  try {
    return (dateOnly ? timestamp.toLocaleDateString(locale, {timeZone: ITALY}) : timestamp.toLocaleString(locale, {timeZone: ITALY}));
  } catch {
    return fallback;
  }
}

export function formatV20Date(value, locale, fallback = '—') {
  return formatV20Timestamp(value, locale, fallback, true);
}

// Fuso orario del dispositivo (null se il browser non lo dichiara).
export function deviceTimeZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { return null; }
}

// Ora italiana; se il dispositivo segna un'ora diversa (per esempio all'estero) aggiunge anche
// quella del dispositivo, con un'etichetta su ciascuna. Se le due ore coincidono resta una sola,
// senza etichette. Le date senza ora restano come sono.
export function formatTimestampForDevice(value, locale, {fallback = '—', italyLabel = '', deviceLabel = '', timeZone = deviceTimeZone()} = {}) {
  const italian = formatV20Timestamp(value, locale, fallback);
  const timestamp = parseV20Timestamp(value);
  if (!timestamp || italian === fallback || !timeZone || !italyLabel || !deviceLabel) return italian;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return italian;
  try {
    const device = timestamp.toLocaleString(locale, {timeZone});
    if (device === italian) return italian;
    const sameDay = timestamp.toLocaleDateString(locale, {timeZone}) === timestamp.toLocaleDateString(locale, {timeZone: ITALY});
    const local = sameDay ? timestamp.toLocaleTimeString(locale, {timeZone}) : device;
    return `${italian} (${italyLabel}) · ${local} (${deviceLabel})`;
  } catch {
    // Fuso del dispositivo non riconosciuto: resta l'ora italiana.
    return italian;
  }
}

// Messaggio per chi usa l'app al posto dell'errore tecnico (secondo audit, S11). Una sola
// classificazione per tutta l'app, dai codici di Postgres/PostgREST e dagli stati HTTP.
// Il dettaglio resta nella console del browser. Modulo per il browser: niente dizionario intero.
// Testo italiano di errors.generic (un test controlla che sia uguale a quello del dizionario).
export const ITALIAN_GENERIC = 'Operazione non riuscita: riprova.';

const BY_STATUS = { 401: 'auth', 403: 'permission', 404: 'notFound', 408: 'timeout', 409: 'conflict', 410: 'notFound', 412: 'conflict',
  413: 'size', 415: 'format', 422: 'invalidData', 400: 'invalidData', 423: 'locked', 424: 'unavailable', 428: 'conflict', 429: 'rate',
  501: 'migration', 502: 'unavailable', 503: 'unavailable', 504: 'timeout', 507: 'storage' };
const BY_CODE = { 42501: 'permission', 23505: 'duplicate', 23503: 'dependency', 23502: 'invalidData', 23514: 'invalidData',
  '22P02': 'invalidData', 22001: 'invalidData', 22003: 'invalidData', 22007: 'invalidData', '42P01': 'migration', 42703: 'migration',
  42883: 'migration', PGRST202: 'migration', PGRST204: 'migration', PGRST205: 'migration', PGRST116: 'notFound', '55P03': 'locked',
  57014: 'timeout', NETWORK_ERROR: 'network', FETCH_ERROR: 'network' };

export function friendlyErrorKey(error) {
  const code = String(error?.code || ''), status = Number(error?.status), text = `${error?.message || ''} ${error?.details || ''}`;
  if (Object.hasOwn(BY_CODE, code)) return 'errors.' + BY_CODE[code];
  if (Object.hasOwn(BY_STATUS, status)) return 'errors.' + BY_STATUS[status];
  if (/row-level security|permission denied/i.test(text)) return 'errors.permission';
  if (status === 0 || /failed to fetch|networkerror|load failed|network request failed/i.test(text)) return 'errors.network';
  return 'errors.generic';
}

// Testo da mostrare per un errore qualsiasi: gli errori dell'app con una chiave del dizionario
// (i18nKey) si traducono; gli altri diventano un messaggio comprensibile.
export function friendlyError(error, tr) {
  if (error?.shown) return error.message;
  if (error?.i18nKey) return tr(error.i18nKey, error.params);
  // I controlli del database (raise exception, codice P0001) spiegano il problema in italiano:
  // con l'app in italiano si mostrano così come sono, nelle altre lingue il messaggio generico.
  if (error?.code === 'P0001' && error.message && tr('errors.generic') === ITALIAN_GENERIC) return error.message;
  try { console.error('[errore]', error?.code || '', error?.message || error); } catch {}
  return tr(friendlyErrorKey(error));
}

// Errore con un testo già tradotto (per esempio da apiErrorText): friendlyError lo mostra così com'è.
export function shownError(text) {
  return Object.assign(new Error(text), { shown: true });
}
// Errore dell'app con un testo del dizionario: friendlyError lo mostra tradotto.
export function appError(key, params) {
  return Object.assign(new Error(key), { i18nKey: key, params });
}

// Errore restituito dalle nostre API: {error: '<codice>'} → testo del dizionario («api.<codice>»).
// Un codice sconosciuto (o un testo qualsiasi) non si mostra: al suo posto il messaggio `fallback`.
export function apiErrorText(body, tr, fallback = 'errors.generic') {
  const code = typeof body?.error === 'string' && /^[a-zA-Z][a-zA-Z0-9]{1,40}$/.test(body.error) ? body.error : '';
  return apiText(code, tr) || tr(fallback);
}
export function apiText(code, tr) {
  if (!code) return '';
  const key = 'api.' + code, text = tr(key);
  return text !== key ? text : '';
}

// Errori di accesso di Supabase Auth (codici stabili) → testo del dizionario.
const AUTH = { invalid_credentials: 'invalidCredentials', user_already_exists: 'userExists', email_exists: 'userExists',
  weak_password: 'weakPassword', email_not_confirmed: 'emailNotConfirmed', over_request_rate_limit: 'rateLimit',
  over_email_send_rate_limit: 'rateLimit' };
export function authErrorKey(error) {
  if (Object.hasOwn(AUTH, error?.code)) return 'auth.error.' + AUTH[error.code];
  if (error?.status === 429) return 'auth.error.rateLimit';
  if (friendlyErrorKey(error) === 'errors.network') return 'errors.network';
  return 'auth.error.generic';
}

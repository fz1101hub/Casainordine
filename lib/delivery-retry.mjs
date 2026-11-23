// Contratti di recupero per le email: la riga del DB è anche una lease a durata limitata.
// Una consegna già registrata non si ripete; un worker interrotto si può recuperare.
export const EMAIL_LEASE_MS = 30 * 60_000;
export const emailLease = (now = new Date()) => `sending:${now.toISOString()}`;

export function eligibleForEmailRetry(row, { errorColumn = 'error', sentColumn = 'sent_at', dateColumn = 'reminder_date', today = '', now = Date.now() } = {}) {
  if (!row || row[sentColumn]) return false;
  const state = row[errorColumn];
  if (state == null || state === '') return Boolean(today && row[dateColumn] && row[dateColumn] < today);
  if (!String(state).startsWith('sending:')) return true;
  const started = Date.parse(String(state).slice('sending:'.length));
  return !Number.isFinite(started) || now - started >= EMAIL_LEASE_MS;
}

// Il compare-and-set acquisisce la lease solo se un altro cron non l'ha già presa.
// Le chiavi sono valori verificati dal codice chiamante, mai input inserito in una query SQL.
export async function claimEmailRetry(admin, table, row, { keys, errorColumn = 'error', sentColumn = 'sent_at', lease }) {
  let q = admin.from(table).update({ [errorColumn]: lease });
  for (const key of keys) q = q.eq(key, row[key]);
  q = q.is(sentColumn, null);
  q = row[errorColumn] == null ? q.is(errorColumn, null) : q.eq(errorColumn, row[errorColumn]);
  const { data, error } = await q.select(keys.join(','));
  if (error) throw error;
  return Boolean(data?.length);
}

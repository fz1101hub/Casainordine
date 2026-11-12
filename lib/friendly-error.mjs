// Messaggio per chi usa l'app al posto dell'errore tecnico del database (secondo audit, S11).
// Il dettaglio resta nella console del browser. Gli errori dell'app (publicError) passano.
// Modulo per il browser: niente dipendenze dal server.
// Testo italiano di errors.generic (un test controlla che sia uguale a quello del dizionario): così
// questo modulo non porta nel browser il dizionario delle 6 lingue.
export const ITALIAN_GENERIC = 'Operazione non riuscita: riprova.';
export function friendlyErrorKey(error) {
  const code = String(error?.code || ''), text = `${error?.message || ''} ${error?.details || ''}`;
  if (code === '42501' || /row-level security|permission denied/i.test(text)) return 'errors.permission';
  if (code === '23505') return 'errors.duplicate';
  if (['23514', '23502', '22P02', '22001', '22007', '22003'].includes(code)) return 'errors.invalidData';
  if (['42P01', '42703', '42883', 'PGRST202', 'PGRST204', 'PGRST205'].includes(code)) return 'errors.migration';
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(text)) return 'errors.network';
  return 'errors.generic';
}
export function friendlyError(error, tr) {
  if (error?.public && error.message) return error.message;
  // I controlli del database (raise exception, codice P0001) spiegano il problema in italiano:
  // con l'app in italiano si mostrano così come sono, nelle altre lingue il messaggio generico.
  if (error?.code === 'P0001' && error.message && tr('errors.generic') === ITALIAN_GENERIC) return error.message;
  try { console.error('[errore]', error?.code || '', error?.message || error); } catch {}
  return tr(friendlyErrorKey(error));
}

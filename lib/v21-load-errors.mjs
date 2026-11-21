/** Classifica gli errori di lettura V21 senza esporre dettagli del provider. */
export function v21LoadErrorKind(results){
  const failures=Array.isArray(results)?results.filter(result=>result?.error):[];
  if(!failures.length)return null;
  // PostgreSQL 42P01 and PostgREST PGRST205 both mean a missing table.
  // Only classify as a missing migration if every failed request has this code.
  const missingTableCodes=new Set(['42P01','PGRST205']);
  return failures.every(result=>missingTableCodes.has(result.error?.code))?'migrationRequired':'operationFailed';
}

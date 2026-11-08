/** Classifica gli errori di lettura V21 senza esporre dettagli del provider. */
export function v21LoadErrorKind(results){
  const failures=Array.isArray(results)?results.filter(result=>result?.error):[];
  if(!failures.length)return null;
  return failures.every(result=>result.error.code==='42P01')?'migrationRequired':'operationFailed';
}

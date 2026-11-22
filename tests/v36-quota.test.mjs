import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LANGUAGES, translate } from '../lib/i18n.mjs';
const source=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('Quota documenti: 200 MB per utente, controllati nella regola di caricamento',()=>{
  const sql=source('supabase/migrate_v36_quota.sql');
  assert.match(sql,/select 200::bigint \* 1024 \* 1024/);
  assert.match(sql,/create policy v19_upload_own on storage\.objects for insert to authenticated/);
  assert.match(sql,/public\.v36_my_storage_used\(\) < public\.v36_storage_quota_bytes\(\)/);
  assert.match(sql,/\(storage\.foldername\(o\.name\)\)\[1\] = \(select auth\.uid\(\)\)::text/,'conta solo i file propri');
  assert.match(sql,/revoke all on function public\.v36_my_storage_used\(\) from public, anon;/);
});
test('Quota documenti: messaggio chiaro nelle sei lingue quando lo spazio è finito',()=>{
  // Il caricamento è in lib/document-upload.mjs (archivio, acquisizione unica e progetti): lì si
  // riconosce lo spazio pieno; chi carica mostra il messaggio.
  const upload=source('lib/document-upload.mjs');
  assert.match(upload,/client\.rpc\('v36_my_storage_used'\)/);
  assert.match(upload,/throw appError\('extra\.archive\.quotaFull'\)/);
  assert.match(source('app/HomeExtra.jsx'),/if\(e\?\.i18nKey==='extra\.archive\.invalidFile'\|\|e\?\.i18nKey==='extra\.archive\.quotaFull'\)onNotify\(tr\(e\.i18nKey\)\);/);
  for(const {code} of LANGUAGES){const text=translate(code,'extra.archive.quotaFull');assert.ok(text&&text!=='extra.archive.quotaFull'&&/200/.test(text),code);}
});

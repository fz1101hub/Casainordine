import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrate_v38_rifiniture.sql',import.meta.url),'utf8');
const code=sql.replace(/--[^\n]*/g,'');

test('v38: la ricerca della casa di un documento non è più chiamabile dall API', () => {
  assert.match(code,/^begin;/m); assert.match(code,/^commit;/m);
  assert.match(code,/drop function if exists public\.v33_shared_document_home\(text\);/);
  assert.match(code,/create or replace function private\.v33_shared_document_home\(path text\)[^;]*security definer set search_path=''/);
  assert.match(code,/revoke all on schema private from public, anon, authenticated;/);
  assert.doesNotMatch(code,/grant usage on schema private/);
  assert.match(code,/grant execute on function private\.v33_shared_document_home\(text\) to authenticated;/);
  // Le due regole del bucket sono ricreate e usano la funzione nello schema privato.
  for(const policy of ['v19_download_allowed','v19_delete_allowed']){
    assert.match(code,new RegExp(`drop policy if exists ${policy} on storage\\.objects;`));
    const body=code.split(`create policy ${policy}`)[1].split(';')[0];
    assert.match(body,/private\.v33_shared_document_home\(objects\.name\)/);
    assert.doesNotMatch(body,/public\.v33_shared_document_home/);
  }
  assert.ok(code.indexOf('drop policy if exists v19_delete_allowed')<code.indexOf('drop function if exists public.v33_shared_document_home'),'prima le regole, poi la funzione');
});

test('v38: indici per tutte le chiavi esterne composte segnalate da Supabase', () => {
  for(const [table,cols] of [['bills','utility_id, user_id'],['mail_documents','connection_id, user_id'],['mail_payment_evidence','bill_id, user_id'],['mail_payment_evidence','connection_id, user_id'],['reminders','bill_id, user_id']])
    assert.match(code,new RegExp(`create index if not exists idx_v38_\\w+ on public\\.${table}\\(${cols}\\);`),`${table}(${cols})`);
});

test('v39: nella lista della spesa si cambiano solo testo, quantità e spunta', () => {
  const v39=readFileSync(new URL('../supabase/migrate_v39_lista_spesa.sql',import.meta.url),'utf8').replace(/--[^\n]*/g,'');
  assert.match(v39,/^begin;/m); assert.match(v39,/^commit;/m);
  assert.match(v39,/revoke update on public\.home_shopping from anon, authenticated;/);
  assert.match(v39,/grant update \(title, quantity, checked\) on public\.home_shopping to authenticated;/);
  assert.doesNotMatch(v39,/grant update \([^)]*(created_by|home_id)/);
  // L'app modifica solo la spunta: nessun update su altre colonne della lista spesa.
  for(const file of ['app/HouseholdHub.jsx','app/PersonalizedHome.jsx']){
    const src=readFileSync(new URL(`../${file}`,import.meta.url),'utf8');
    for(const m of src.matchAll(/from\('home_shopping'\)\.update\(\{([^}]*)\}/g))
      for(const key of m[1].split(',').map(p=>p.split(':')[0].trim()))assert.ok(['title','quantity','checked'].includes(key),`${file}: ${key}`);
  }
});

test('v33 rieseguita dopo la v38 non rimette la funzione dei documenti nell API', () => {
  const v33=readFileSync(new URL('../supabase/migrate_v33_audit.sql',import.meta.url),'utf8').replace(/--[^\n]*/g,'');
  assert.match(v33,/create or replace function private\.v33_shared_document_home\(path text\)/);
  assert.doesNotMatch(v33,/create or replace function public\.v33_shared_document_home/);
  assert.doesNotMatch(v33,/grant usage on schema private/);
  for(const policy of ['v19_download_allowed','v19_delete_allowed']){
    const body=v33.split(`create policy ${policy}`)[1].split(';')[0];
    assert.match(body,/private\.v33_shared_document_home\(objects\.name\)/);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('Saldi: calcolati nel database su tutte le spese, con le regole di accesso attive',()=>{
  const sql=source('supabase/migrate_v34_saldi.sql');
  assert.match(sql,/create or replace function public\.v33_home_balances\(home uuid\)/);
  assert.match(sql,/security invoker set search_path=''/);
  assert.match(sql,/public\.is_home_member\(home\)/);
  assert.match(sql,/sum\(round\(e\.amount\*100\)\)::bigint/);
  assert.match(sql,/revoke all on function public\.v33_home_balances\(uuid\) from public, anon;/);
  assert.doesNotMatch(sql,/limit 250/i);
});
test('Saldi: l’app usa la funzione e ripiega sul calcolo precedente se la migrazione manca',()=>{
  const hub=source('app/HouseholdHub.jsx');
  assert.match(hub,/client\.rpc\('v33_home_balances',\{home:homeId\}\)/);
  assert.match(hub,/const balanceCents=totals\.error\?null:/);
  // Dalla v4.1 il calcolo passa da balanceRows (lib/member-names.mjs), che aggiunge gli ex membri.
  assert.match(hub,/balanceRows\(\{members:rows\.members,former:rows\.former,balanceCents:rows\.balanceCents,fallback:userId=>signedMemberBalance\(/);
  assert.ok(hub.indexOf("client.rpc('v33_home_balances'")<hub.indexOf('if(seq!==loadSeq.current)return;'),'anche la risposta dei saldi passa dal controllo delle risposte superate');
});

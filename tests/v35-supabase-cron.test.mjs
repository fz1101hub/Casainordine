import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { supabaseCronAuthorized, scheduledCallAuthorized } from '../lib/server.mjs';
const source=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const req=headers=>({headers:{get:name=>headers[name.toLowerCase()]??null}});
const token='a'.repeat(64);
function admin(result){const calls=[];return {calls,rpc:async(name,args)=>{calls.push([name,args]);if(result instanceof Error)throw result;return result;}};}

test('Supabase Cron: la chiave si verifica nel database con la chiave di servizio',async()=>{
  const ok=admin({data:true,error:null});
  assert.equal(await supabaseCronAuthorized(req({'x-casa-cron-token':token}),ok),true);
  assert.deepEqual(ok.calls,[['v35_cron_token_valid',{token}]]);
  assert.equal(await supabaseCronAuthorized(req({'x-casa-cron-token':token}),admin({data:false,error:null})),false);
  assert.equal(await supabaseCronAuthorized(req({'x-casa-cron-token':token}),admin({data:null,error:{message:'manca la funzione'}})),false);
  assert.equal(await supabaseCronAuthorized(req({'x-casa-cron-token':token}),admin(new Error('rete'))),false);
});
test('Supabase Cron: chiavi malformate rifiutate senza interrogare il database',async()=>{
  for(const bad of [undefined,'','abc','A'.repeat(64),'a'.repeat(63),'a'.repeat(65),`${'a'.repeat(63)}'`]){
    const a=admin({data:true,error:null});
    assert.equal(await supabaseCronAuthorized(req(bad===undefined?{}:{'x-casa-cron-token':bad}),a),false,String(bad));
    assert.equal(a.calls.length,0);
  }
});
test('Cron: vale ancora il segreto di Vercel, senza chiamare il database',async()=>{
  const prev=process.env.CRON_SECRET;
  try{
    process.env.CRON_SECRET='segreto-vercel';
    const a=admin({data:false,error:null});
    assert.equal(await scheduledCallAuthorized(req({authorization:'Bearer segreto-vercel'}),a),true);
    assert.equal(a.calls.length,0);
    assert.equal(await scheduledCallAuthorized(req({authorization:'Bearer sbagliato'}),a),false);
    delete process.env.CRON_SECRET;
    assert.equal(await scheduledCallAuthorized(req({'x-casa-cron-token':token}),admin({data:true,error:null})),true,'Supabase Cron funziona anche senza CRON_SECRET');
  }finally{if(prev===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=prev;}
});
test('Supabase Cron: migrazione con chiave nel Vault, job giornaliero e ogni 3 ore, funzioni chiuse ai client',()=>{
  const sql=source('supabase/migrate_v35_cron.sql');
  assert.match(sql,/create extension if not exists pg_cron with schema pg_catalog;/);
  assert.match(sql,/create extension if not exists pg_net with schema extensions;/);
  assert.match(sql,/vault\.create_secret\(encode\(extensions\.gen_random_bytes\(32\), 'hex'\), 'casa_cron_token'/);
  assert.match(sql,/revoke all on function public\.v35_cron_token_valid\(text\) from public, anon, authenticated;/);
  assert.match(sql,/grant execute on function public\.v35_cron_token_valid\(text\) to service_role;/);
  assert.match(sql,/revoke all on function public\.v35_call_app\(text, int\) from public, anon, authenticated;/);
  assert.match(sql,/cron\.schedule\('casa-promemoria', '7 7 \* \* \*'/);
  assert.match(sql,/cron\.schedule\('casa-email', '17 \*\/3 \* \* \*', \$job\$select public\.v35_call_app\('\/api\/mail\/cron', 300000\)/);
  assert.doesNotMatch(sql,/[0-9a-f]{64}/,'nessuna chiave scritta nel file');
  for(const path of ['app/api/cron/route.js','app/api/mail/cron/route.js'])
  {const s=source(path);assert.ok(s.indexOf('getAdmin()')<s.indexOf('scheduledCallAuthorized(request'),path);assert.match(s,/catch\s*\{\s*return json\(\{error:'Configurazione del database incompleta'\},503\);\s*\}/,path);}
  assert.ok(JSON.parse(source('vercel.json')).crons.length===2,'i cron di Vercel restano come riserva');
});

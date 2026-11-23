import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {deliverAlerts} from '../lib/extra-alerts.mjs';

// Dal 23 novembre gli avvisi extra e v20 passano dalla stessa consegna a blocchi (deliverAlerts):
// se preferenze o dispositivi non si leggono, l'avviso resta nell'app ma la push non parte e
// l'errore finisce nel resoconto del cron.
function admin({failing}) {
 const alerts=[];
 return {alerts,from(table){
  const q={select(){return q;},in(){return q;},range:async()=>table===failing?{data:null,error:{message:`${table} non disponibile`}}:{data:table==='home_members'?[]:[],error:null},
   upsert(rows){return {select:async()=>{alerts.push(...rows);return {data:rows,error:null};}};}};
  return q;
 }};
}
const entry={item:{user_id:'anna',home_id:null},event:{kind:'contract',reference_id:'k1',event_date:'2026-11-23'},copy:()=>({title:'t',body:'b'})};

for(const [failing,label] of [['user_alert_preferences','preferenze'],['push_subscriptions','dispositivi']]){
 test(`senza ${label} niente push, ma l’avviso resta e l’errore si vede`,async()=>{
  const db=admin({failing}),counts={errors:[]},sent=[];
  await deliverAlerts(db,[entry],counts,{configuredPush:()=>true,sendPush:async(...a)=>sent.push(a)});
  assert.equal(db.alerts.length,1);
  assert.equal(counts.extra_alerts_created,1);
  assert.deepEqual(sent,[]);
  assert.match(counts.errors[0],new RegExp(`^Push avviso: ${failing} non disponibile`));
 });
}

test('avvisi v20 e automazioni usano la stessa consegna',()=>{
 for(const file of ['v20-alerts.mjs','automation-alerts.mjs'])
  assert.match(readFileSync(new URL('../lib/'+file,import.meta.url),'utf8'),/await deliverAlerts\(admin,/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reminderWindow, daysUntil, firstRecurringFrom } from '../lib/reminder-window.mjs';
import { billDuePushCopy } from '../lib/notification-push-copy.mjs';
const source=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('Promemoria: finestra da oggi a 3 giorni, anche a cavallo di mese e anno',()=>{
  assert.deepEqual(reminderWindow('2026-11-10'),{from:'2026-11-10',to:'2026-11-13'});
  assert.deepEqual(reminderWindow('2026-12-30'),{from:'2026-12-30',to:'2027-01-02'});
  assert.equal(daysUntil('2026-11-10','2026-11-10'),0);
  assert.equal(daysUntil('2026-11-10','2026-11-13'),3);
  assert.equal(daysUntil('2026-03-28','2026-03-30'),2,'cambio dell’ora legale');
  assert.equal(daysUntil('2026-11-10','2026-11-01'),0);
});
test('Utenze ricorrenti: niente stime per date passate',()=>{
  assert.equal(firstRecurringFrom('2026-07-15','2026-11-10','monthly'),'2026-11-15');
  assert.equal(firstRecurringFrom('2026-11-20','2026-11-10','monthly'),'2026-11-20','data futura invariata');
  assert.equal(firstRecurringFrom('2026-11-10','2026-11-10','monthly'),'2026-11-10','oggi resta');
  assert.equal(firstRecurringFrom('2026-01-31','2026-11-10','quarterly',31),'2027-01-31','fine mese mantenuta (30/4, 31/7, 31/10, 31/1)');
  assert.equal(firstRecurringFrom('2020-02-29','2026-11-10','yearly'),'2027-02-28');
  assert.equal(firstRecurringFrom('2026-01-01','2026-11-10','none'),null);
});
test('Notifica push: oggi, domani, tra N giorni nelle sei lingue',()=>{
  assert.equal(billDuePushCopy({language:'it',name:'Luce',days:0}).body,'Luce scade oggi. Hai già pagato?');
  assert.equal(billDuePushCopy({language:'it',name:'Luce',days:1}).body,'Luce scade domani. Hai già pagato?');
  assert.equal(billDuePushCopy({language:'it',name:'Luce',days:2}).body,'Luce scade tra 2 giorni. Hai già pagato?');
  assert.equal(billDuePushCopy({language:'it',name:'Luce'}).body,'Luce scade tra 3 giorni. Hai già pagato?','senza giorni il testo di prima');
  for(const lang of ['en','es','fr','de','pt']){
    const texts=[0,1,2,3].map(days=>billDuePushCopy({language:lang,name:'Gas',days}).body);
    assert.equal(new Set(texts).size,4,lang);
    for(const t of texts)assert.ok(t.startsWith('Gas ')&&!t.includes('{'),lang+': '+t);
  }
  assert.throws(()=>billDuePushCopy({name:'Luce',days:-1}),/days/);
  assert.throws(()=>billDuePushCopy({name:'Luce',days:1.5}),/days/);
});
test('Cron: finestra, un solo promemoria per bolletta e persona, niente stime passate',()=>{
  const s=source('app/api/cron/route.js');
  assert.match(s,/\.gte\('due_date',reminderRange\.from\)\.lte\('due_date',reminderRange\.to\)\.is\('paid_at',null\)/);
  assert.doesNotMatch(s,/\.eq\('due_date',target\)/);
  assert.match(s,/from\('reminders'\)\.select\('bill_id'\)\.in\('bill_id',billIds\)\.neq\('reminder_date',today\)/);
  assert.match(s,/if \(alreadyReminded\.has\(bill\.id\)\) continue;/);
  assert.match(s,/from\('push_delivery_log'\)\.select\('reminder_date'\)\.eq\('bill_id',bill\.id\)\.eq\('user_id',userId\)\.not\('sent_at','is',null\)\.neq\('reminder_date',today\)/);
  assert.match(s,/days:daysUntil\(today,bill\.due_date\)/);
  assert.match(s,/let date = firstRecurringFrom\(u\.next_due_date,today,u\.frequency,u\.billing_day\)/);
});

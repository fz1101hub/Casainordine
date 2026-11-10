import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFiveMinuteBriefing,VACATION_CHECKLIST} from '../lib/v21-core.mjs';
import {v21BriefingCopy} from '../lib/v21-briefing-copy.mjs';

const input={
 today:'2026-11-04',
 bills:[{id:'b1',title:'Energy',supplier:'Supplier',due_date:'2026-11-03'},{id:'b2',title:'Internet',supplier:'Supplier',due_date:'2026-11-06'}],
 assets:[{id:'a1',name:'Boiler',next_service_on:'2026-11-05'}],
 contracts:[{id:'c1',supplier:'Example',renewal_on:'2026-11-06'}],
 tasks:[{id:'t1',title:'Inspection',due_date:'2026-11-05'}],
 decisions:[{id:'d1',title:'Repairs',status:'open',closes_on:'2026-11-05'}],
 inventory:[{id:'i1',name:'Laptop',estimated_value:900,document_id:null}]
};
test('briefing translates actual generated text across all six languages without changing priorities',()=>{
 const base=buildFiveMinuteBriefing(input);
 for(const lang of ['it','en','es','fr','de','pt']){
  const copy=v21BriefingCopy(lang);
  const items=buildFiveMinuteBriefing({...input,copy});
  assert.deepEqual(items.map(x=>x.id),base.map(x=>x.id));
  assert.equal(items.length,5);
  assert.ok(items.some(x=>x.label.startsWith(copy.briefingOverdueBill)),lang);
  assert.ok(items.some(x=>x.label.startsWith(copy.briefingPaymentDue.replace('{days}','2'))),lang);
  assert.ok(items.some(x=>x.label.startsWith(copy.briefingMaintenance)),lang);
 }
});
test('vacation checklist canonical persistence remains stable and localized copy has all entries',()=>{
 assert.equal(VACATION_CHECKLIST.length,6);
 for(const lang of ['it','en','es','fr','de','pt']){
  const c=v21BriefingCopy(lang);
  assert.equal([c.checkDoors,c.checkPayments,c.checkContacts,c.checkShutoffs,c.checkMailPets,c.checkReturn].length,VACATION_CHECKLIST.length);
 }
});

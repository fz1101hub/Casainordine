import test from 'node:test';
import assert from 'node:assert/strict';
import {detectBillingInconsistencies} from '../lib/v21-core.mjs';
import {v21BriefingCopy} from '../lib/v21-briefing-copy.mjs';

const bills=[
 {id:'a',supplier:'Internet Co',category:'internet',amount:30,period_start:'2026-09-01',period_end:'2026-09-30',home_id:'h',paid_at:'2026-10-01'},
 {id:'b',supplier:'Internet Co',category:'internet',amount:30,period_start:'2026-09-01',period_end:'2026-09-30',home_id:'h'},
 {id:'c',supplier:'Internet Co',category:'internet',amount:45,period_start:'2026-09-01',period_end:'2026-09-30',home_id:'h'}
];
const contracts=[{supplier:'Internet Co',service:'internet',offer_price:20,home_id:'h'}];
const refunds=[{status:'expected',label:'Refund A',expected_on:'2020-01-01'}];

test('radar keeps identical anomaly codes and severity in all six languages',()=>{
 const input={bills,contracts,refunds};
 const baseline=detectBillingInconsistencies(input);
 assert.ok(baseline.some(x=>x.code==='duplicate'));
 assert.ok(baseline.some(x=>x.code==='contract_difference'));
 assert.ok(baseline.some(x=>x.code==='refund_late'));
 for(const lang of ['it','en','es','fr','de','pt']){
  const copy=v21BriefingCopy(lang);
  const actual=detectBillingInconsistencies({...input,copy});
  assert.deepEqual(actual.map(x=>[x.code,x.bill_id,x.severity]),baseline.map(x=>[x.code,x.bill_id,x.severity]),lang);
  assert.ok(actual.some(x=>x.detail===copy.radarRefundLate),lang);
  assert.ok(actual.some(x=>x.detail.includes(copy.radarDuplicate.split('{reference}')[0])),lang);
  assert.ok(actual.some(x=>x.detail.includes(copy.radarContractDifference.split('{price}')[0])),lang);
 }
});

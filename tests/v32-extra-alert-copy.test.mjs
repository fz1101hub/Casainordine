import test from 'node:test';
import assert from 'node:assert/strict';
import {extraAlertCopy} from '../lib/extra-alert-copy.mjs';

const cases=[
 {kind:'contract',source:{supplier:'Energy',service:'Electricity',renewal_on:'2026-12-03'}},
 {kind:'meter',source:{meter_name:'Water',next_due_on:'2026-12-03'}},
 {kind:'maintenance',source:{name:'Boiler',next_service_on:'2026-12-03'}},
 {kind:'warranty',source:{name:'Boiler',warranty_until:'2026-12-03'}}
];
test('four household alert types produce distinct recipient-localized copy in six languages',()=>{
 for(const event of cases){
  const translations=['it','en','es','fr','de','pt'].map(language=>extraAlertCopy(event,language));
  assert.equal(new Set(translations.map(x=>x.title.split(':')[0])).size,6);
  for(const copy of translations){assert.ok(copy.body);assert.doesNotMatch(copy.body,/undefined|\{date\}|\{service\}/);}
 }
});
test('unknown locale falls back to Italian without changing source',()=>{
 const event=cases[0];
 assert.deepEqual(extraAlertCopy(event,'xx'),extraAlertCopy(event,'it'));
 assert.equal(event.source.renewal_on,'2026-12-03');
});
test('invalid dates and names fail closed; bidi and newline controls are removed',()=>{
 assert.throws(()=>extraAlertCopy({kind:'meter',source:{meter_name:'A',next_due_on:'2026-02-30'}}),TypeError);
 assert.throws(()=>extraAlertCopy({kind:'warranty',source:{name:'\u202e',warranty_until:'2026-12-03'}}),TypeError);
 const copy=extraAlertCopy({kind:'meter',source:{meter_name:'Water\n\u202eBill',next_due_on:'2026-12-03'}},'en');
 assert.match(copy.title,/Water Bill/);
 assert.doesNotMatch(copy.title,/[\n\u202e]/);
});

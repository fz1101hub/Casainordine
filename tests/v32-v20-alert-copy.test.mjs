import test from 'node:test';
import assert from 'node:assert/strict';
import {v20AlertCopy} from '../lib/v20-alert-copy.mjs';
import {mailHealth} from '../lib/v20-core.mjs';
import {translate} from '../lib/i18n.mjs';

const events=[
 {kind:'missing_bill',source:{supplier:'Water',expected_on:'2026-12-03'}},
 {kind:'fraud',source:{supplier:'Electricity'}},
 {kind:'mail_sync',source:{mail_status:'stale'}},
 {kind:'move',source:{title:'New home',move_on:'2026-12-03'}},
 {kind:'savings',source:{label:'Emergency fund',deadline:'2026-12-03'}}
];
test('five v20 alerts are localized for six languages',()=>{
 for(const event of events){
  const copies=['it','en','es','fr','de','pt'].map(language=>v20AlertCopy(event,language));
  assert.equal(new Set(copies.map(c=>c.title)).size,6);
  for(const copy of copies){assert.ok(copy.body);assert.doesNotMatch(copy.body,/undefined|\{name\}|\{date\}|\{status\}/);}
 }
});
test('mailbox states are differentiated',()=>{
 const bodies=['reconnect','error','never','stale'].map(mail_status=>v20AlertCopy({kind:'mail_sync',source:{mail_status}},'en').body);
 assert.equal(new Set(bodies).size,4);
 assert.throws(()=>v20AlertCopy({kind:'mail_sync',source:{mail_status:'unexpected'}},'en'),TypeError);
});
test('invalid dates and missing names fail closed; unsupported locale falls back',()=>{
 assert.throws(()=>v20AlertCopy({kind:'move',source:{title:'X',move_on:'2026-02-30'}}),TypeError);
 assert.throws(()=>v20AlertCopy({kind:'fraud',source:{supplier:' '}}),TypeError);
 assert.deepEqual(v20AlertCopy(events[0],'xx'),v20AlertCopy(events[0],'it'));
});

test('mail connection health: five states, each with its text in six languages',()=>{
 const now=new Date('2026-11-04T12:00:00Z');
 const samples=[{status:'reconnect'},{status:'error'},{status:'active'},{status:'active',last_sync_at:'2026-11-01T12:00:00Z'},{status:'active',last_sync_at:'2026-11-04T11:00:00Z'}];
 assert.deepEqual(samples.map(sample=>mailHealth(sample,now).status),['reconnect','error','never','stale','recent']);
 for(const sample of samples){
  const labels=['it','en','es','fr','de','pt'].map(lang=>translate(lang,'v20.mail.'+mailHealth(sample,now).status));
  assert.equal(new Set(labels).size,6);
 }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {localizedFraudFlag} from '../lib/v20-fraud-i18n.mjs';
const langs=['it','en','es','fr','de','pt'];
test('all V20 fraud signals render localized text in six languages',()=>{
 for(const id of ['high_amount','failed_auth','new_sender','iban_change']){
  for(const lang of langs){
   const result=localizedFraudFlag({id,label:'Original Italian label'},lang,1234.5,lang==='en'?'en-GB':lang);
   assert.ok(result.length>8,lang+':'+id);
   assert.ok(!result.includes('{amount}'),lang+':'+id);
   assert.notEqual(result,'Original Italian label',lang+':'+id);
  }
 }
});
test('historical signals keep unknown labels and never invent missing baseline',()=>{
 assert.equal(localizedFraudFlag({id:'future_signal',label:'Historical note'},'fr'),'Historical note');
 assert.ok(!localizedFraudFlag({id:'high_amount',label:'Old text'},'de').includes('{amount}'));
 assert.match(localizedFraudFlag({id:'high_amount'},'en',1234.5,'en-GB'),/1,234\\.50/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LANGUAGES,TRANSLATIONS,translate} from '../lib/i18n.mjs';
const page=readFileSync(new URL('../app/page.jsx',import.meta.url),'utf8');
const keys=['duplicate','saved','fraudReview','ibanFailure','reopened','paid'];
test('bill payment and IBAN-check messages exist in all six locales',()=>{
 for(const {code} of LANGUAGES){
  for(const key of keys){
   const full='v32.payment.'+key;
   assert.equal(typeof TRANSLATIONS[code][full],'string',code+' '+full);
   assert.ok(TRANSLATIONS[code][full].trim());
   assert.ok(page.includes("tr('"+full+"'"),full);
  }
  assert.ok(translate(code,'v32.payment.ibanFailure',{error:'E42'}).includes('E42'));
  assert.ok(TRANSLATIONS[code]['v32.payment.ibanFailure'].includes('{error}'));
 }
});
test('no Italian-only payment feedback remains in live expressions',()=>{
 assert.doesNotMatch(page,/notify\(bill\.paid_at\\?'Riaperta come da pagare\.'/);
 assert.doesNotMatch(page,/postSaveWarning='Bolletta salvata/);
 assert.doesNotMatch(page,/notify\(postSaveWarning\|\|'Bolletta salvata\.'/);
});

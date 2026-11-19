import test from 'node:test';
import assert from 'node:assert/strict';
import {formatDate,formatMoney,localeFor,LANGUAGES} from '../lib/i18n-core.mjs';

test('v3.2 dates use six explicit locales and remain calendar-day stable',()=>{
 const expected={it:'it-IT',en:'en-GB',es:'es-ES',fr:'fr-FR',de:'de-DE',pt:'pt-PT'};
 assert.deepEqual(Object.fromEntries(LANGUAGES.map(({code})=>[code,localeFor(code)])),expected);
 for(const {code,locale} of LANGUAGES){
  const date=formatDate('2024-02-29',code,{day:'2-digit',month:'2-digit',year:'numeric'});
  const reference=new Intl.DateTimeFormat(locale,{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'UTC'}).format(new Date('2024-02-29T12:00:00Z'));
  assert.equal(date,reference);
  assert.notEqual(date,'—');
  assert.equal(formatDate('2023-02-29',code),'—');
  assert.equal(formatDate('2024-13-01',code),'—');
  assert.equal(formatDate('2024-02-30',code),'—');
  assert.equal(formatDate('29/02/2024',code),'—');
 }
});

test('v3.2 monetary values use each locale, preserve zero and reject missing data',()=>{
 for(const {code,locale} of LANGUAGES){
  for(const amount of [0,12.5,-1234.56,'1234.56']){
   assert.equal(formatMoney(amount,code),new Intl.NumberFormat(locale,{style:'currency',currency:'EUR'}).format(Number(amount)));
  }
  for(const invalid of [null,undefined,'','12,50','1 234',NaN,Infinity,{},'€12']){
   assert.equal(formatMoney(invalid,code),'—');
  }
 }
 assert.equal(formatMoney(null,'it'),'—');
 assert.notEqual(formatMoney(0,'it'),'—');
});

test('v3.2 invalid currency identifiers fail safely without masking valid currency formatting',()=>{
 for(const {code,locale} of LANGUAGES){
  assert.equal(formatMoney(12.5,code,'INVALID-CURRENCY'),'—');
  assert.equal(formatMoney(12.5,code,''),'—');
  assert.equal(formatMoney(12.5,code,'USD'),new Intl.NumberFormat(locale,{style:'currency',currency:'USD'}).format(12.5));
 }
});

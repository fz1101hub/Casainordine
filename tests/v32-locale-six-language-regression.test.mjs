import test from 'node:test';
import assert from 'node:assert/strict';
import {LANGUAGES,formatMoney,formatDate,normalizeLanguage,acceptedLanguage} from '../lib/i18n-core.mjs';

test('six supported languages retain their locale-specific currency and date formatting',()=>{
 assert.deepEqual(LANGUAGES.map(x=>x.code),['it','en','es','fr','de','pt']);
 for(const {code,locale} of LANGUAGES){
  assert.equal(normalizeLanguage(locale),code);
  for(const amount of [0,1.25,-1234.5,1234567.89]){
   assert.equal(formatMoney(amount,code),new Intl.NumberFormat(locale,{style:'currency',currency:'EUR'}).format(amount),code);
  }
  const expected=new Intl.DateTimeFormat(locale,{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date('2028-02-29T12:00:00Z'));
  assert.equal(formatDate('2028-02-29',code),expected,code);
 }
});
test('invalid or missing money/date values never become plausible zeroes or dates',()=>{
 for(const {code} of LANGUAGES){
  for(const amount of [null,undefined,'', '1,20','1e3','NaN',Infinity,{},[]]){
   assert.equal(formatMoney(amount,code),'—',code+': '+String(amount));
  }
  for(const date of [null,'','2027-02-29','2028-02-30','2028-13-01','2028-2-9']){
   assert.equal(formatDate(date,code),'—',code+': '+String(date));
  }
 }
});
test('Accept-Language respects q=0 exclusion and regional preferences',()=>{
 assert.equal(acceptedLanguage('fr-FR;q=0, de-DE;q=0.8, en-GB;q=0.5'),'de');
 assert.equal(acceptedLanguage('es-ES;q=0, pt-PT;q=0.7'),'pt');
 assert.equal(acceptedLanguage('en-GB;q=0, fr-FR;q=0'),'it');
 assert.equal(acceptedLanguage('en-GB;q=1e0, de-DE;q=0.6'),'de');
});

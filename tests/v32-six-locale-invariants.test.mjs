import test from 'node:test';
import assert from 'node:assert/strict';
import {LANGUAGES, formatDate, formatMoney, localeFor} from '../lib/i18n-core.mjs';

// Regression: changing the display language must never change the calendar day
// or the underlying monetary value (and must not imply FX conversion).
test('six languages preserve leap-day identity and EUR amount', () => {
 const day='2028-02-29';
 const amount=-1234.5;
 for(const {code,locale} of LANGUAGES){
  assert.equal(localeFor(code),locale);
  assert.equal(
   formatDate(day,code,{year:'numeric',month:'2-digit',day:'2-digit'}),
   new Intl.DateTimeFormat(locale,{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'UTC'}).format(new Date('2028-02-29T12:00:00Z'))
  );
  assert.equal(
   formatMoney(amount,code),
   new Intl.NumberFormat(locale,{style:'currency',currency:'EUR'}).format(amount)
  );
 }
});

test('invalid dates are not normalized into another day in any language',()=>{
 for(const {code} of LANGUAGES){
  for(const date of ['2027-02-29','2028-02-30','2028-04-31','2028-13-01','2028-00-01','2028-01-00','2028-01-01T00:00:00Z']){
   assert.equal(formatDate(date,code),'—',`${code}: ${date}`);
  }
 }
});

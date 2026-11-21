import test from 'node:test';
import assert from 'node:assert/strict';
import {LANGUAGES,localeFor,formatMoney,formatDate,formatCount} from '../lib/i18n-core.mjs';

// Regression coverage for the exact six v3.2 locales, without assuming a
// particular ICU whitespace character in formatted currency.
for(const {code,locale} of LANGUAGES){
 test(`v3.2 locale ${code}: currency, dates and counts use ${locale}`,()=>{
  assert.equal(localeFor(code),locale);
  const expectedMoney=new Intl.NumberFormat(locale,{style:'currency',currency:'EUR'}).format(1234.5);
  assert.equal(formatMoney(1234.5,code),expectedMoney);
  const expectedDate=new Intl.DateTimeFormat(locale,{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date('2024-02-29T12:00:00Z'));
  assert.equal(formatDate('2024-02-29',code),expectedDate);
  assert.equal(formatCount(1234,code),new Intl.NumberFormat(locale,{maximumFractionDigits:0}).format(1234));
 });
}
test('v3.2 formatters reject missing and invalid values rather than displaying false zeros',()=>{
 for(const {code} of LANGUAGES){
  assert.equal(formatDate('2025-02-29',code),'—');
  assert.equal(formatDate('2024-13-01',code),'—');
  assert.equal(formatMoney(null,code),'—');
  assert.equal(formatMoney('not a number',code),'—');
  assert.equal(formatCount(Infinity,code),'—');
 }
});

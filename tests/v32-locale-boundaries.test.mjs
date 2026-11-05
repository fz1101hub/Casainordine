import test from 'node:test';
import assert from 'node:assert/strict';
import {LANGUAGES,formatDate,formatMoney,localeFor} from '../lib/i18n.mjs';

test('six locales format leap-day and year-boundary dates without timezone drift',()=>{
 for(const {code,locale} of LANGUAGES){
  assert.equal(localeFor(code),locale);
  for(const iso of ['2024-02-29','2026-01-01','2026-12-31']){
   const expected=new Intl.DateTimeFormat(locale,{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(iso+'T12:00:00Z'));
   assert.equal(formatDate(iso,code),expected,code+' '+iso);
  }
  for(const invalid of ['2025-02-29','2026-04-31','2026-00-01','2026-13-01','2026-1-1','']){
   assert.equal(formatDate(invalid,code),'—',code+' '+invalid);
  }
 }
});

test('six locales format EUR without currency conversion or missing-value coercion',()=>{
 for(const {code,locale} of LANGUAGES){
  for(const amount of [0,12.5,-19.99,1234567.89]){
   const expected=new Intl.NumberFormat(locale,{style:'currency',currency:'EUR'}).format(amount);
   assert.equal(formatMoney(amount,code),expected,code+' '+amount);
   assert.equal(formatMoney(String(amount),code),expected,code+' '+amount+' string');
  }
  for(const missing of [null,undefined,'',false,NaN,Infinity])assert.equal(formatMoney(missing,code),'—');
 }
});

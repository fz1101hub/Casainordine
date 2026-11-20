import test from 'node:test';
import assert from 'node:assert/strict';
import {formatDate,formatMoney,formatCount,localeFor,LANGUAGES} from '../lib/i18n-core.mjs';

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


test('v3.2 locale rendering is independent of host timezone at year boundaries',()=>{
 for(const {code,locale} of LANGUAGES){
  for(const iso of ['2024-01-01','2024-12-31','2024-02-29']){
   const expected=new Intl.DateTimeFormat(locale,{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(iso+'T12:00:00Z'));
   assert.equal(formatDate(iso,code,{day:'numeric',month:'long',year:'numeric'}),expected);
  }
  for(const invalid of ['2024-00-01','2024-01-00','2024-04-31','2024-11-31','2024-12-32','2024-01-01T00:00:00Z']){
   assert.equal(formatDate(invalid,code),'—');
  }
 }
});

test('v3.2 locale money rejects non-finite and non-decimal representations',()=>{
 for(const {code} of LANGUAGES){
  for(const invalid of ['1e3','0x10','Infinity','NaN','1_000','1,000','--1',true,false,[],[12],-Infinity]){
   assert.equal(formatMoney(invalid,code),'—');
  }
  assert.notEqual(formatMoney('-0.01',code),'—');
  assert.notEqual(formatMoney('.5',code),'—');
 }
});

test('v3.2 counts in advanced modules are localized and reject absent or invalid values',()=>{
 for(const {code,locale} of LANGUAGES){
  for(const count of [0,1,1234,1234.5,'1234']){
   assert.equal(formatCount(count,code),new Intl.NumberFormat(locale,{maximumFractionDigits:0}).format(Number(count)));
  }
  for(const invalid of [null,undefined,'',' ',NaN,Infinity,-Infinity,'NaN','Infinity','1e3','1,000',{},[],true,Number.MAX_SAFE_INTEGER+1,'9007199254740993']){
   assert.equal(formatCount(invalid,code),'—');
  }
 }
});


test('v3.2 monetary formatter rejects unsafe integer amounts in every locale',()=>{
 for(const {code,locale} of LANGUAGES){
  for(const invalid of [Number.MAX_SAFE_INTEGER+1,'9007199254740993','-9007199254740993']){
   assert.equal(formatMoney(invalid,code),'—');
  }
  assert.equal(formatMoney(Number.MAX_SAFE_INTEGER,code),new Intl.NumberFormat(locale,{style:'currency',currency:'EUR'}).format(Number.MAX_SAFE_INTEGER));
 }
});

test('v3.2 money rejects fractional strings rounded to a safe integer boundary',()=>{
 for(const {code} of LANGUAGES){
  for(const invalid of ['9007199254740991.1','-9007199254740991.9','9007199254740992.01']){
   assert.equal(formatMoney(invalid,code),'—');
  }
  assert.equal(formatMoney('9007199254740990.5',code),'—');
 }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {LANGUAGES,languageStorageKey,normalizeLanguage,localeFor,formatDate,formatMoney,formatCount} from '../lib/i18n-core.mjs';

const codes=['it','en','es','fr','de','pt'];

test('v3.2 has exactly six distinct supported languages and account-scoped preference keys',()=>{
 assert.deepEqual(LANGUAGES.map(x=>x.code),codes);
 assert.equal(new Set(LANGUAGES.map(x=>x.locale)).size,6);
 assert.equal(languageStorageKey(), 'casainordine-language-v32');
 for(const id of ['account-a','account-b']){
  assert.equal(languageStorageKey(id),'casainordine-language-v32:user:'+id);
 }
 assert.notEqual(languageStorageKey('account-a'),languageStorageKey('account-b'));
});

test('v3.2 locale fallback and formatting across six languages',()=>{
 for(const code of codes){
  const locale=localeFor(code);
  assert.equal(normalizeLanguage(code.toUpperCase()+'-'+locale.split('-')[1]),code);
  assert.equal(formatDate('2024-02-29',code),new Intl.DateTimeFormat(locale,{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date('2024-02-29T12:00:00Z')));
  assert.equal(formatMoney(1234.5,code),new Intl.NumberFormat(locale,{style:'currency',currency:'EUR'}).format(1234.5));
  assert.equal(formatCount(1234,code),new Intl.NumberFormat(locale,{maximumFractionDigits:0}).format(1234));
 }
 assert.equal(normalizeLanguage('xx-XX'),'it');
 assert.equal(localeFor('xx-XX'),'it-IT');
});

test('v3.2 never displays invalid date or amount as valid data',()=>{
 for(const code of codes){
  for(const date of ['2025-02-29','2026-04-31','2026-13-01','not-a-date',''])assert.equal(formatDate(date,code),'—');
  for(const amount of [null,undefined,'1,234.50','NaN',Infinity,'9007199254740993'])assert.equal(formatMoney(amount,code),'—');
  assert.equal(formatCount('9007199254740993',code),'—');
 }
});

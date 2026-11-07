import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {LANGUAGES,localeFor,formatDate,formatMoney} from '../lib/i18n.mjs';

// Regression coverage for the advanced modules excluded from the original UI key scan.
test('advanced V20/V21 modules use the active language for date formatting',()=>{
 for(const name of ['V20Hub.jsx','V21Hub.jsx']){
  const source=readFileSync(fileURLToPath(new URL('../app/'+name,import.meta.url)),'utf8');
  assert.match(source,/date\s*:\s*formatDate/,`${name} must read date from useLanguage`);
  assert.doesNotMatch(source,/toLocaleDateString\(\s*['"]it-IT['"]/,`${name} must not force Italian dates`);
 }
});
test('advanced-module locale contract keeps EUR and validates calendar dates',()=>{
 for(const {code,locale} of LANGUAGES){
  assert.equal(localeFor(code),locale);
  assert.equal(formatDate('2026-02-30',code),'—');
  assert.notEqual(formatDate('2024-02-29',code),'—');
  const formatted=formatMoney(1234.5,code);
  assert.notEqual(formatted,'—');
  assert.match(formatted,/€/);
 }
});

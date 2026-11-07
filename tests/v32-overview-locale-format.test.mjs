import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LANGUAGES,localeFor,formatDate,formatMoney} from '../lib/i18n.mjs';
const page=readFileSync(new URL('../app/page.jsx',import.meta.url),'utf8');
test('overview month chart follows selected locale rather than Italian',()=>{
 assert.match(page,/toLocaleDateString\(locale,\{month:'short',timeZone:'UTC'\}\)/);
 assert.doesNotMatch(page,/toLocaleDateString\('it-IT',\{month:'short'/);
});
test('all supported locales format dates and amounts without shifting ISO day',()=>{
 for(const {code,locale} of LANGUAGES){
  assert.equal(localeFor(code),locale);
  const d=formatDate('2026-03-01',code,{day:'numeric',month:'long',year:'numeric'});
  assert.notEqual(d,'—');
  assert.ok(d.includes('2026'),code);
  const money=formatMoney(1234.5,code);
  assert.ok(money.includes('€'),code);
  assert.equal(formatDate('2026-02-30',code),'—');
  assert.equal(formatMoney('not-a-number',code),'—');
 }
});

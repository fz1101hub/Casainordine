import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {formatDate} from '../lib/i18n.mjs';

const source=readFileSync(new URL('../app/V20Hub.jsx',import.meta.url),'utf8');
test('V20 uses account locale for date and timestamp rendering',()=>{
 assert.match(source,/date:formatDate,locale(?:,language)?\}=useLanguage\(\)/);
 assert.doesNotMatch(source,/toLocale(?:Date)?String\('it-IT'/);
 assert.match(source,/toLocaleString\(locale\)/);
 assert.match(source,/toLocaleDateString\(locale\)/);
});
test('date formats are distinct across six supported locales',()=>{
 const values=['it','en','es','fr','de','pt'].map(lang=>formatDate('2026-12-03',lang));
 assert.ok(new Set(values).size>=3);
 for(const value of values)assert.notEqual(value,'—');
});

test('V20 alert inbox is explicitly restricted to the authenticated recipient',()=>{
 assert.match(source,/from\('user_alerts'\)\.select\('\*'\)\.eq\('user_id',user\.id\)/);
});

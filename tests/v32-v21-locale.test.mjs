import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/V21Hub.jsx',import.meta.url),'utf8');
test('V21 renders dates using the active account language',()=>{
 assert.match(source,/date:formatDate,locale\}=useLanguage\(\)/);
 assert.match(source,/const asDate=d=>formatDate\(d\)/);
 assert.doesNotMatch(source,/toLocale(?:Date)?String\('it-IT'/);
 assert.match(source,/expires_at\)\.toLocaleString\(locale\)/);
});

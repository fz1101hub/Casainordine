import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Static guard for the V21 export filename locale mapping; browser download is not tested here.
const source=readFileSync(new URL('../app/V21Hub.jsx',import.meta.url),'utf8');

test('V21 JSON exports normalize regional locale tags before choosing a translated filename',()=>{
 assert.match(source,/const baseLanguage=normalizeLanguage\(language\)/);
 assert.match(source,/Object\.hasOwn\(exportNames,baseLanguage\)\?exportNames\[baseLanguage\]:exportNames\.it/);
 for(const language of ['it','en','es','fr','de','pt']){
  assert.ok(source.includes(language+':{property:'),language+' export mapping missing');
 }
});

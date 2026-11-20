import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeLanguage} from '../lib/i18n-core.mjs';

const source=readFileSync(new URL('../app/V21Hub.jsx',import.meta.url),'utf8');

test('V21 export filenames use shared validated locale normalization',()=>{
 assert.match(source,/import\s*\{normalizeLanguage\s*,\s*formatCount\s+as\s+formatLocalizedCount\}\s*from\s*['"]\.\.\/lib\/i18n-core\.mjs['"]/);
 assert.match(source,/const baseLanguage=normalizeLanguage\(language\)/);
 assert.doesNotMatch(source,/language\.toLowerCase\(\)\.split\(/);
 for(const [input,expected] of [[' EN_gb ','en'],['fr-FR','fr'],['pt_PT','pt'],['de-DE','de'],['es-ES','es']]){
  assert.equal(normalizeLanguage(input),expected);
 }
 for(const invalid of ['en--GB','fr!','pt/../../secret','en GB','xx-YY']){
  assert.equal(normalizeLanguage(invalid),'it');
 }
});

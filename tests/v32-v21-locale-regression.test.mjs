import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/V21Hub.jsx',import.meta.url),'utf8');

test('V21 uses the active language provider for amounts, dates and counts',()=>{
 assert.match(source,/const \{money,date:formatDate,locale,language,t:tr\}=useLanguage\(\)/);
 assert.match(source,/new Intl\.NumberFormat\(locale,\{maximumFractionDigits:0\}\)/);
 assert.match(source,/const asDate=d=>formatDate\(d\)/);
 assert.match(source,/formatV20Timestamp\(s\.expires_at,locale\)/);
});

test('V21 export filenames support six languages without leaking user titles',()=>{
 for(const code of ['it','en','es','fr','de','pt']){
  assert.match(source,new RegExp('\\b'+code+':\\{property:'));
 }
 assert.match(source,/Object\.hasOwn\(exportNames,language\)/);
 assert.match(source,/validExportDate\(date\)/);
 assert.match(source,/JSON\.stringify\(object,null,2\)/);
});

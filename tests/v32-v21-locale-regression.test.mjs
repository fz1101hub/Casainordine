import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/V21Hub.jsx',import.meta.url),'utf8');

test('V21 uses the active language provider for amounts, dates and counts',()=>{
 assert.match(source,/const \{money,date:formatDate,locale,language,t:tr\}=useLanguage\(\)/);
 assert.match(source,/const formatCount=value=>formatLocalizedCount\(value,language\)/);
 assert.match(source,/const asDate=d=>formatDate\(d\)/);
 assert.match(source,/stamp\(s\.expires_at\)/);
});

test('V21 export filenames support six languages without leaking user titles',()=>{
 for(const code of ['it','en','es','fr','de','pt']){
  assert.match(source,new RegExp('\\b'+code+':\\{property:'));
 }
 assert.match(source,/Object\.hasOwn\(exportNames,baseLanguage\)/);
 assert.match(source,/validExportDate\(date\)/);
 assert.match(source,/JSON\.stringify\(object,null,2\)/);
});


test('V21 clears prior account/home rows before asynchronous reload',()=>{
 assert.match(source,/if\(!client\|\|!user\?\.id\)\{setRows\(\{\.\.\.initial\}\);setLoading\(false\);return;\}setRows\(\{\.\.\.initial\}\);setLoading\(true\);/);
 assert.match(source,/if\(seq!==loadSeq\.current\)return;/);
});

test('V21 discards stale loads before fetching votes and vacation shares',()=>{
 const guard=source.indexOf('if(seq!==loadSeq.current)return;',source.indexOf('const results=await Promise.all'));
 const votes=source.indexOf("client.from('home_decision_votes')");
 const shares=source.indexOf("client.from('home_vacation_shares')");
 assert.ok(guard>0&&votes>guard&&shares>guard,'stale guard must precede dependent queries');
});

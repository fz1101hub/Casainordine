import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/V21Hub.jsx',import.meta.url),'utf8');

test('V21 export defaults have all six languages and keep JSON format',()=>{
 for(const language of ['it','en','es','fr','de','pt']){
  assert.match(source,new RegExp('\\b'+language+':\\{property:\\x27[^\\x27]+\\x27,inventory:\\x27[^\\x27]+\\x27,briefing:\\x27[^\\x27]+\\x27\\}'));
 }
 assert.match(source,/const v21ExportName=/);
 assert.match(source,/name=\{v21ExportName\(language,'property'\)\}/);
 assert.match(source,/name=\{v21ExportName\(language,'inventory'\)\}/);
 assert.match(source,/name=\{v21ExportName\(language,'briefing',todayRome\(\)\)\}/);
 assert.doesNotMatch(source,/name="passaporto-immobile\.json"/);
 assert.doesNotMatch(source,/name="inventario-assicurativo\.json"/);
});

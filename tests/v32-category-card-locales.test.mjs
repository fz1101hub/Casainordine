import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {translate,LANGUAGES} from '../lib/i18n.mjs';

const source=readFileSync(new URL('../app/page.jsx',import.meta.url),'utf8');
const categories=['Luce','Gas','Acqua','Internet','Telefono','Rifiuti','Condominio','Affitto / Mutuo','Assicurazione','Tasse','Auto','Altro'];

test('all persisted bill category codes have a localized display label',()=>{
 for(const {code} of LANGUAGES){
  for(const category of categories){
   const key='billCategory.'+category;
   const value=translate(code,key);
   assert.ok(typeof value==='string'&&value.length>0&&value!==key,code+': '+key);
  }
 }
});

test('bill cards and utility cards display translated categories without changing stored codes',()=>{
 assert.equal(source.split("b.supplier||tr('billCategory.'+b.category)").length-1,2);
 assert.ok(source.includes("<p>{tr('billCategory.'+u.category)} {u.account_reference"));
 assert.ok(!source.includes('{b.supplier||b.category}'));
 assert.ok(!source.includes('<p>{u.category} {u.account_reference'));
});

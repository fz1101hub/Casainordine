import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {translate, LANGUAGES} from '../lib/i18n.mjs';

const page=readFileSync(new URL('../app/page.jsx',import.meta.url),'utf8');
const keys=['title','help','supplier','supplierPlaceholder','unit','unitPlaceholder','upload','localPrivacy','paste','recognize','pastedSource'];
test('condominium installment import has all six translations',()=>{
 for(const language of LANGUAGES){
  for(const key of keys){
   const value=translate(language.code,'rateImport.'+key);
   assert.equal(typeof value,'string');
   assert.ok(value.trim().length>0,language.code+' '+key);
  }
 }
});
test('condominium import UI uses localized labels',()=>{
 for(const key of keys)assert.ok(page.includes("tr('rateImport."+key+"')"),key);
 assert.ok(!page.includes('>Riconosci le rate</button>'));
});

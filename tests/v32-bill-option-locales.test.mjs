import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {translate} from '../lib/i18n.mjs';

const page=readFileSync(new URL('../app/page.jsx',import.meta.url),'utf8');
const languages=['it','en','es','fr','de','pt'];
const categories=['Luce','Gas','Acqua','Internet','Telefono','Rifiuti','Condominio','Affitto / Mutuo','Assicurazione','Tasse','Auto','Altro'];
const frequencies=['none','monthly','bimonthly','quarterly','yearly','biennial'];

test('stored category and frequency codes have six localized display labels',()=>{
 for(const lang of languages){
  for(const category of categories){const key='billCategory.'+category;assert.notEqual(translate(lang,key),key,lang+' '+key);}
  for(const frequency of frequencies){const key='billFrequency.'+frequency;assert.notEqual(translate(lang,key),key,lang+' '+key);}
 }
});

test('supplier and bill forms render translated labels without changing persisted codes',()=>{
 assert.ok(page.includes("value={cat}>{tr('billCategory.'+cat)}"));
 assert.ok(page.includes("value={f.value}>{tr('billFrequency.'+f.value)}"));
});

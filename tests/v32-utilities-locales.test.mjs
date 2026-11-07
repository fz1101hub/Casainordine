import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TRANSLATIONS} from '../lib/i18n.mjs';

const source=readFileSync(new URL('../app/page.jsx',import.meta.url),'utf8');
const keys=['eyebrow','heading','help','new','supplierHeading','supplierHelp','supplier','service','sender','add','noSuppliers','supplierPrivacy','active','paused','estimated','frequency','next','pause','resume','empty','addUtility','disclaimer'];

test('utilities screen catalogue has all six complete locale variants',()=>{
 for(const lang of ['it','en','es','fr','de','pt']){
  for(const key of keys){
   const value=TRANSLATIONS[lang]['utilities.'+key];
   assert.equal(typeof value,'string',lang+' utilities.'+key);
   assert.ok(value.trim().length>0,lang+' utilities.'+key);
  }
 }
});

test('utilities screen uses translated labels and privacy notice',()=>{
 for(const key of keys)assert.ok(source.includes("tr('utilities."+key+"')"),'missing utilities.'+key);
 assert.doesNotMatch(source,/Il nome del fornitore è solo un indizio di ricerca/);
 assert.doesNotMatch(source,/Non hai ancora indicato fornitori/);
});

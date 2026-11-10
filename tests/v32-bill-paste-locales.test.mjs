import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {translate} from '../lib/i18n.mjs';

const page=readFileSync(new URL('../app/page.jsx',import.meta.url),'utf8');
const keys=['billPaste.title','billPaste.help','billPaste.placeholder','billPaste.recognize'];

test('bill paste flow has six complete localized labels',()=>{
 for(const lang of ['it','en','es','fr','de','pt']){
  for(const key of keys){
   const value=translate(lang,key);
   assert.ok(value.trim().length>5,lang+' '+key);
   assert.notEqual(value,key);
   assert.ok(page.includes("tr('"+key+"')"),key);
  }
 }
 assert.ok(!page.includes('>Riconosci importo e scadenza</button>'));
});

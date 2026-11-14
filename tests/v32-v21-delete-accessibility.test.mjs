import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/V21Hub.jsx',import.meta.url),'utf8');

test('V21 icon-only deletion controls have localized accessible names',()=>{
 for(const table of ['home_emergency_cards','home_inventory_items']){
  const expression=new RegExp('aria-label=\\{briefingCopy\\.confirmDeletePermanent\\}[^>]*onClick=\\{\\(\\)=>remove\\(\\x27'+table+'\\x27,x\\.id\\)\\}');
  assert.match(source,expression,table+' delete button must have a localized accessible name');
 }
});

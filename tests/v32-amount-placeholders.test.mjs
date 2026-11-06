import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LANGUAGES} from '../lib/i18n.mjs';

const page=readFileSync(new URL('../app/page.jsx',import.meta.url),'utf8');

test('amount input placeholders follow the selected locale, not a fixed Italian decimal separator',()=>{
 const expression='placeholder={new Intl.NumberFormat(locale,{minimumFractionDigits:2,maximumFractionDigits:2}).format(0)}';
 assert.equal(page.split(expression).length-1,2,'both amount fields must use locale formatting');
 assert.doesNotMatch(page,/placeholder="0,00"/);
 for(const {code} of LANGUAGES){
  const formatted=new Intl.NumberFormat(code,{minimumFractionDigits:2,maximumFractionDigits:2}).format(0);
  assert.match(formatted,/0[,.]00/);
  if(code==='en')assert.equal(formatted,'0.00');
  if(code==='it')assert.equal(formatted,'0,00');
 }
});

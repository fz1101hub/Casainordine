import test from 'node:test';
import assert from 'node:assert/strict';
import {formatMoney,LANGUAGES} from '../lib/i18n.mjs';

test('currency formatting rejects non-monetary types in all six languages',()=>{
 for(const {code} of LANGUAGES){
  for(const invalid of [null,undefined,false,true,[],[0],{}, {value:0},'', '  ',NaN,Infinity,-Infinity,'not a number']){
   assert.equal(formatMoney(invalid,code),'—',`unexpected value for ${code}: ${String(invalid)}`);
  }
  assert.notEqual(formatMoney(0,code),'—');
  assert.notEqual(formatMoney('0',code),'—');
  assert.notEqual(formatMoney('12.50',code),'—');
 }
});

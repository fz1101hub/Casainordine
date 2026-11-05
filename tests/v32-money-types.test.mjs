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

test('currency formatting accepts only canonical decimal strings, never JS numeric syntax',()=>{
 for(const {code} of LANGUAGES){
  for(const invalid of ['0x10','0b10','0o10','1e3','1_000','1,25','12 EUR','+','.', '1.2.3']){
   assert.equal(formatMoney(invalid,code),'—',`${code}: ${invalid}`);
  }
  for(const valid of [' 12.50 ','-0.50','+.75','0.','00012.50']){
   assert.notEqual(formatMoney(valid,code),'—',`${code}: ${valid}`);
  }
 }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {LANGUAGES,formatMoney,formatCount} from '../lib/i18n-core.mjs';

test('fractional decimal strings near the safe-integer limit are never shown as exact',()=>{
 for(const {code} of LANGUAGES){
  for(const value of ['9007199254740990.1','9007199254740990.9','-9007199254740990.9','9007199254740991.1']){
   assert.equal(formatMoney(value,code),'—',code+' money '+value);
   assert.equal(formatCount(value,code),'—',code+' count '+value);
  }
  assert.notEqual(formatMoney('9007199254740989.5',code),'—',code+' money below boundary');
  assert.notEqual(formatCount('9007199254740989.5',code),'—',code+' count below boundary');
  assert.notEqual(formatMoney('9007199254740990',code),'—',code+' exact integer');
 }
});

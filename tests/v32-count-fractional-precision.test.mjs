import test from 'node:test';
import assert from 'node:assert/strict';
import {LANGUAGES,formatCount} from '../lib/i18n-core.mjs';

test('fractional count strings at safe integer boundary do not silently round',()=>{
 for(const {code} of LANGUAGES){
  for(const value of ['9007199254740991.1','-9007199254740991.5','9007199254740992.25']){
   assert.equal(formatCount(value,code),'—',code+': '+value);
  }
  assert.notEqual(formatCount('9007199254740990',code),'—',code);
  assert.notEqual(formatCount('1234.5',code),'—',code);
 }
});

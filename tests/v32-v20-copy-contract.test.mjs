import test from 'node:test';
import assert from 'node:assert/strict';
import {v20UiCopy} from '../lib/v20-ui-copy.mjs';

const LANGUAGES=['it','en','es','fr','de','pt'];

test('V20 UI exposes the same complete non-empty copy contract in six languages',()=>{
 const reference=Object.keys(v20UiCopy('it'));
 assert.ok(reference.length>100,'V20 contract should cover the advanced module');
 for(const language of LANGUAGES){
  const copy=v20UiCopy(language);
  assert.deepEqual(Object.keys(copy),reference,language+' keys');
  for(const [key,value] of Object.entries(copy)){
   assert.equal(typeof value,'string',language+': '+key);
   assert.ok(value.trim().length>0,language+': '+key+' is blank');
   assert.doesNotMatch(value,/\bundefined\b|\bnull\b/,language+': '+key);
  }
 }
});

test('V20 UI locale variants and unknown languages are deterministic',()=>{
 for(const language of LANGUAGES){
  assert.deepEqual(v20UiCopy(language.toUpperCase()+'-XX'),v20UiCopy(language));
  assert.deepEqual(v20UiCopy(' '+language+'_XX '),v20UiCopy(language));
 }
 for(const language of ['xx',null,undefined,{},'']){
  assert.deepEqual(v20UiCopy(language),v20UiCopy('it'));
 }
});

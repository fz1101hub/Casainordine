import test from 'node:test';
import assert from 'node:assert/strict';
import {LANGUAGES,translate,TRANSLATIONS} from '../lib/i18n.mjs';

// A translated error must preserve the interpolation contract in every locale.
// In particular, losing {error} hides diagnostics from the user.
const contracts={
 'extra.archive.uploadError':['error'],
 'extra.archive.unavailable':['error'],
 'extra.backup.tooManyRows':['table']
};
const tokens=s=>[...s.matchAll(/\{([a-zA-Z][\w]*)\}/g)].map(m=>m[1]).sort();

test('error and export messages preserve placeholder contracts in all six languages',()=>{
 for(const [key,expected] of Object.entries(contracts)){
  for(const {code} of LANGUAGES){
   assert.deepEqual(tokens(TRANSLATIONS[code][key]),expected,code+' '+key);
   const values=Object.fromEntries(expected.map(p=>[p,'TEST_'+p]));
   const rendered=translate(code,key,values);
   for(const p of expected)assert.ok(rendered.includes('TEST_'+p),code+' '+key+' '+p);
   assert.deepEqual(tokens(rendered),[],code+' '+key);
  }
 }
});

test('regional tags retain translation semantics and unsupported tags fall back to Italian',()=>{
 for(const {code,locale} of LANGUAGES){
  for(const key of Object.keys(contracts)){
   assert.equal(translate(locale,key,{error:'X',table:'Y'}),translate(code,key,{error:'X',table:'Y'}));
  }
 }
 for(const key of Object.keys(contracts)){
  assert.equal(translate('ja-JP',key,{error:'X',table:'Y'}),translate('it',key,{error:'X',table:'Y'}));
 }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {v21BriefingCopy} from '../lib/v21-briefing-copy.mjs';

const languages=['it','en','es','fr','de','pt'];
const italian=v21BriefingCopy('it');
const keys=Object.keys(italian);

test('V21: all six languages have a non-empty translation for every copy key',()=>{
  assert.ok(keys.length>100,'Expected the full V21 catalogue');
  for(const language of languages){
    const copy=v21BriefingCopy(language);
    assert.deepEqual(Object.keys(copy),keys,`Missing V21 keys in ${language}`);
    for(const key of keys){
      assert.equal(typeof copy[key],'string',`${language}.${key} must be text`);
      assert.ok(copy[key].trim(),`${language}.${key} is empty`);
    }
  }
});

test('V21: placeholders stay identical across translations',()=>{
  const tokens=text=>[...text.matchAll(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g)].map(match=>match[1]).sort();
  for(const key of keys){
    const expected=tokens(italian[key]);
    for(const language of languages){
      assert.deepEqual(tokens(v21BriefingCopy(language)[key]),expected,`V21 placeholder mismatch: ${language}.${key}`);
    }
  }
});

test('V21: unsupported language falls back to Italian without changing the catalogue',()=>{
  assert.deepEqual(v21BriefingCopy('xx'),italian);
});

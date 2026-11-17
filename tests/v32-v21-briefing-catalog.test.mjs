import test from 'node:test';
import assert from 'node:assert/strict';
import {v21BriefingCopy} from '../lib/v21-briefing-copy.mjs';

const languages=['it','en','es','fr','de','pt'];
const reference=v21BriefingCopy('it');
const keys=Object.keys(reference);

test('V21 briefing translations are complete and nonempty in all six languages',()=>{
 assert.ok(keys.length>100,'Expected the complete V21 copy catalog');
 for(const language of languages){
  const copy=v21BriefingCopy(language);
  assert.deepEqual(Object.keys(copy),keys,`Key mismatch for ${language}`);
  for(const key of keys){
   assert.equal(typeof copy[key],'string',`${language}.${key} must be text`);
   assert.ok(copy[key].trim(),`${language}.${key} must not be blank`);
   assert.equal(copy[key],copy[key].trimStart(),`${language}.${key} has leading whitespace`);
  }
 }
});

test('V21 translated interpolation tokens match Italian source',()=>{
 const tokens=text=>[...text.matchAll(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g)].map(m=>m[1]).sort();
 for(const language of languages){
  const copy=v21BriefingCopy(language);
  for(const key of keys)assert.deepEqual(tokens(copy[key]),tokens(reference[key]),`Placeholder mismatch for ${language}.${key}`);
 }
});

test('V21 language variants and unknown locales resolve predictably',()=>{
 assert.deepEqual(v21BriefingCopy('pt-PT'),v21BriefingCopy('pt'));
 assert.deepEqual(v21BriefingCopy('EN_gb'),v21BriefingCopy('en'));
 assert.deepEqual(v21BriefingCopy('xx-XX'),reference);
 assert.deepEqual(v21BriefingCopy(null),reference);
});

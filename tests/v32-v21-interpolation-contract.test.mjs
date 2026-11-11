import test from 'node:test';
import assert from 'node:assert/strict';
import {v21BriefingCopy} from '../lib/v21-briefing-copy.mjs';

// An untranslated or missing token can silently break an otherwise translated warning.
const locales=['it','en','es','fr','de','pt'];
const tokens=text=>[...String(text).matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g)]
  .map(match=>match[1]).sort();

test('V21 interpolation tokens agree with Italian across six languages',()=>{
 const reference=v21BriefingCopy('it');
 const parameterized=Object.keys(reference).filter(key=>tokens(reference[key]).length);
 assert.ok(parameterized.length>=3,'expected parameterized V21 copy');
 for(const lang of locales.slice(1)){
  const translated=v21BriefingCopy(lang);
  for(const key of parameterized){
   assert.deepEqual(tokens(translated[key]),tokens(reference[key]),lang+': '+key);
  }
 }
});

test('V21 translated copy has no stray interpolation tokens',()=>{
 const reference=v21BriefingCopy('it');
 for(const lang of locales.slice(1)){
  const translated=v21BriefingCopy(lang);
  for(const key of Object.keys(reference)){
   assert.deepEqual(tokens(translated[key]),tokens(reference[key]),lang+': '+key);
  }
 }
});

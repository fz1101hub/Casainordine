import test from 'node:test';
import assert from 'node:assert/strict';
import {v21BriefingCopy} from '../lib/v21-briefing-copy.mjs';

// High-impact warnings must not silently fall back to Italian for supported locales.
// This is a regression guard, not a linguistic or accessibility certification.
const criticalKeys=[
 'permissionNotice',
 'sharingPrivacy',
 'confirmShareLink',
 'inventoryDisclaimer',
 'qrAccessNotice',
 'sosEncrypted',
 'demoMode',
 'readOnlyHome'
];
const locales=['en','es','fr','de','pt'];
const italian=v21BriefingCopy('it');

test('V21 privacy, access and sharing warnings have localized copy in every supported language',()=>{
 for(const language of locales){
  const copy=v21BriefingCopy(language);
  for(const key of criticalKeys){
   assert.equal(typeof copy[key],'string',`${language}.${key} must be text`);
   assert.ok(copy[key].trim().length>=12,`${language}.${key} is suspiciously short`);
   assert.notEqual(copy[key],italian[key],`${language}.${key} unexpectedly uses Italian fallback`);
  }
 }
});

test('V21 privacy warnings resolve regional locale variants without losing translation',()=>{
 for(const language of ['en-GB','es-ES','fr-FR','de-DE','pt-PT']){
  const base=language.slice(0,2);
  const localized=v21BriefingCopy(language);
  for(const key of criticalKeys)assert.equal(localized[key],v21BriefingCopy(base)[key],`${language}.${key}`);
 }
});

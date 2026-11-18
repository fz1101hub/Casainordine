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

test('V21 sensitive warnings contain no hidden direction controls, markup or unresolved placeholders',()=>{
 const forbidden=/[\u202a-\u202e\u2066-\u2069\u200e\u200f\u061c\u0000-\u0008\u000b\u000c\u000e-\u001f]/u;
 for(const language of ['it',...locales]){
  const copy=v21BriefingCopy(language);
  for(const key of criticalKeys){
   const value=copy[key];
   assert.ok(!forbidden.test(value),`${language}.${key} contains invisible control characters`);
   assert.ok(!/<[^>]*>/.test(value),`${language}.${key} unexpectedly contains HTML-like markup`);
   assert.ok(!/\\{[a-zA-Z][\w]*\\}/.test(value),`${language}.${key} has unresolved placeholders`);
  }
 }
});

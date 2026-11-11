import test from 'node:test';
import assert from 'node:assert/strict';
import {v20UiCopy} from '../lib/v20-ui-copy.mjs';

const languages=['en','es','fr','de','pt'];
const safetyKeys=[
 'fraudCheckDisclaimer',
 'fraudPrivacyDescription',
 'pagopaDebtWarning',
 'moveProviderDisclaimer',
 'offlinePrivacyNotice',
 'missingBillsCaveat',
 'noLiveComparison',
];
test('V20 safety and privacy guidance is explicitly translated, not silently inherited',()=>{
 const italian=v20UiCopy('it');
 for(const lang of languages){
  const copy=v20UiCopy(lang);
  for(const key of safetyKeys){
   assert.ok(Object.hasOwn(copy,key),lang+': missing '+key);
   assert.ok(copy[key].trim().length>=20,lang+': suspiciously short '+key);
   assert.notEqual(copy[key],italian[key],lang+': untranslated '+key);
  }
 }
});
test('V20 notices never promise an actual payment, provider switch or automatic document upload',()=>{
 for(const lang of ['it',...languages]){
  const copy=v20UiCopy(lang);
  for(const key of safetyKeys){
   assert.doesNotMatch(copy[key],/https?:\/\/|<script|<iframe/i,lang+': unexpected markup or URL in '+key);
  }
 }
});

test('V20 safety notices are stable across locale variants and isolated from caller mutations',()=>{
 for(const lang of ['it',...languages]){
  const baseline=v20UiCopy(lang);
  for(const variant of [lang.toUpperCase()+'-XX',' '+lang+'_XX ']){
   const localized=v20UiCopy(variant);
   for(const key of safetyKeys){
    assert.equal(localized[key],baseline[key],variant+': '+key);
   }
  }
  const mutable=v20UiCopy(lang);
  mutable.offlinePrivacyNotice='changed by caller';
  assert.equal(v20UiCopy(lang).offlinePrivacyNotice,baseline.offlinePrivacyNotice,lang);
 }
});

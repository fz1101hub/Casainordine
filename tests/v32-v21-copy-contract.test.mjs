import test from 'node:test';
import assert from 'node:assert/strict';
import {v21BriefingCopy} from '../lib/v21-briefing-copy.mjs';

const locales=['it','en','es','fr','de','pt'];
const sensitiveKeys=[
 'qrPrivacy','dossierPrivacy','informationalDocument','voteNotPayment',
 'emergencyDisclaimer','sosEncryptionNotice','sharingPrivacy',
 'confirmShareLink','inventoryDisclaimer','permissionNotice',
 'radarDuplicate','radarContractDifference'
];

test('V21 exposes complete nonempty copy in every supported language',()=>{
 const reference=Object.keys(v21BriefingCopy('it'));
 assert.ok(reference.length>100,'unexpectedly small V21 catalogue');
 for(const lang of locales){
  const copy=v21BriefingCopy(lang);
  assert.deepEqual(Object.keys(copy),reference,lang+': key order or coverage differs');
  for(const key of reference){
   assert.equal(typeof copy[key],'string',lang+': '+key);
   assert.ok(copy[key].trim(),lang+': empty '+key);
  }
 }
});

test('V21 privacy and consequential warnings are explicitly localized',()=>{
 const italian=v21BriefingCopy('it');
 for(const lang of locales.slice(1)){
  const copy=v21BriefingCopy(lang);
  for(const key of sensitiveKeys){
   assert.ok(copy[key].trim().length>=15,lang+': short warning '+key);
   assert.notEqual(copy[key],italian[key],lang+': Italian fallback '+key);
   assert.doesNotMatch(copy[key],/<script|<iframe|https?:\/\//i,lang+': unexpected active content '+key);
  }
 }
});

test('V21 unsupported language falls back to Italian without sharing mutable state',()=>{
 const original=v21BriefingCopy('it');
 assert.deepEqual(v21BriefingCopy('xx'),original);
 const altered=v21BriefingCopy('fr');
 altered.permissionNotice='modified';
 assert.deepEqual(v21BriefingCopy('fr').permissionNotice=== 'modified',false);
 assert.deepEqual(v21BriefingCopy('it'),original);
});

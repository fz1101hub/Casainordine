import test from 'node:test';
import assert from 'node:assert/strict';
import { v21BriefingCopy } from '../lib/v21-briefing-copy.mjs';

const languages=['it','en','es','fr','de','pt'];
const required=['loadingData','operationFailed','readOnlyHome','confirmDeletePermanent','qrPrivacy','sharingPrivacy','sosEncryptionNotice','photoUploadFailed','confirmShareLink','radarDuplicate','briefingPaymentDue','tabBriefing','defaultSosTitle'];

test('V21: all six locales expose usable text for critical dialogs, privacy and errors',()=>{
 for(const language of languages){
  const copy=v21BriefingCopy(language);
  for(const key of required){
   assert.equal(typeof copy[key],'string',`${language}.${key}`);
   assert.ok(copy[key].trim().length>0,`${language}.${key} is blank`);
  }
  assert.deepEqual(Object.keys(copy).sort(),Object.keys(v21BriefingCopy('it')).sort());
 }
});

test('V21: interpolation parameters stay consistent across translations',()=>{
 const reference=v21BriefingCopy('it');
 const placeholders=s=>[...s.matchAll(/\\{([a-zA-Z][a-zA-Z0-9_]*)\\}/g)].map(x=>x[1]).sort();
 for(const language of languages.slice(1)){
  const translated=v21BriefingCopy(language);
  for(const [key,value] of Object.entries(reference)){
   assert.deepEqual(placeholders(translated[key]),placeholders(value),`placeholder mismatch: ${language}.${key}`);
  }
 }
});

test('V21: regional language codes and unsupported codes resolve predictably',()=>{
 assert.deepEqual(v21BriefingCopy('en-GB'),v21BriefingCopy('en'));
 assert.deepEqual(v21BriefingCopy('pt_PT'),v21BriefingCopy('pt'));
 assert.deepEqual(v21BriefingCopy('xx'),v21BriefingCopy('it'));
 assert.deepEqual(v21BriefingCopy(null),v21BriefingCopy('it'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {billReminderCopy} from '../lib/notification-copy.mjs';
import {formatDate,localeFor} from '../lib/i18n-core.mjs';

const languages=['it','en','es','fr','de','pt'];
test('bill reminders render recipient-local dates and regional tags consistently',()=>{
 for(const language of languages){
  const expectedDate=formatDate('2028-02-29',language);
  const base=billReminderCopy({language,name:'Acqua',dueDate:'2028-02-29'});
  const regional=billReminderCopy({language:localeFor(language),name:'Acqua',dueDate:'2028-02-29'});
  assert.notEqual(expectedDate,'—',language);
  assert.ok(base.text.includes(expectedDate),language);
  assert.deepEqual(regional,base,language);
  assert.ok(!base.text.includes('{date}'),language);
  assert.ok(!base.text.includes('{name}'),language);
 }
});
test('bill reminders reject malformed dates and do not turn missing amounts into zero',()=>{
 for(const language of languages){
  for(const dueDate of ['2028-02-30','2027-02-29','2028-13-01','2028-2-9',null,'']){
   assert.throws(()=>billReminderCopy({language,name:'Acqua',dueDate}),TypeError,language+': '+dueDate);
  }
 }
});
test('bill reminder names are bounded by grapheme count without splitting emoji',()=>{
 const emoji='👩‍🔧';
 const name=emoji.repeat(161);
 for(const language of languages){
  const copy=billReminderCopy({language,name,dueDate:'2028-02-29'});
  assert.ok(copy.text.includes(emoji.repeat(160)),language);
  assert.ok(!copy.text.includes(emoji.repeat(161)),language);
 }
});

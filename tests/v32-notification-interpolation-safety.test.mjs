import test from 'node:test';
import assert from 'node:assert/strict';
import {billReminderCopy} from '../lib/notification-copy.mjs';

const languages=['it','en','es','fr','de','pt'];
test('bill reminder interpolates untrusted names literally in every language',()=>{
 for(const language of languages){
  const name="$& $$ $' {date} <img src=x onerror=alert(1)>";
  const copy=billReminderCopy({language,name,dueDate:'2028-02-29'});
  assert.ok(copy.text.includes(name),language);
  assert.ok(!copy.text.includes('undefined'),language);
  assert.equal(copy.text.split('\n\n').length,2,language);
 }
});
test('bill reminder rejects invisible-only names and impossible dates',()=>{
 for(const language of languages){
  assert.throws(()=>billReminderCopy({language,name:'\u202e\u200b\u0000',dueDate:'2028-02-29'}),TypeError);
  assert.throws(()=>billReminderCopy({language,name:'Valid',dueDate:'2027-02-29'}),TypeError);
 }
});
test('bill reminder removes line breaks and direction overrides without changing input',()=>{
 const name='Acqua\n\t\u202e 2028';
 for(const language of languages){
  const copy=billReminderCopy({language,name,dueDate:'2028-02-29'});
  assert.ok(copy.text.includes('Acqua 2028'),language);
  assert.ok(!copy.text.includes('\u202e'),language);
 }
 assert.equal(name,'Acqua\n\t\u202e 2028');
});

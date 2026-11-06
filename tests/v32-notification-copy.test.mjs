import test from 'node:test';
import assert from 'node:assert/strict';
import {billReminderCopy} from '../lib/notification-copy.mjs';
test('bill reminder copy is localized for each recipient',()=>{
 const names=['it','en','es','fr','de','pt'];
 const results=names.map(language=>billReminderCopy({language,name:'Luce',dueDate:'2026-11-04'}));
 assert.equal(new Set(results.map(x=>x.subject)).size,6);
 for(const result of results){assert.match(result.text,/Luce/);assert.doesNotMatch(result.text,/\\{date\\}|undefined/);}
 assert.match(results[1].text,/Nov/);
});
test('invalid dates and missing names fail closed',()=>{
 assert.throws(()=>billReminderCopy({language:'en',name:'Test',dueDate:'2026-02-30'}),TypeError);
 assert.throws(()=>billReminderCopy({language:'it',name:' ',dueDate:'2026-11-04'}),TypeError);
});
test('unsupported recipient language falls back to Italian',()=>{
 assert.deepEqual(billReminderCopy({language:'xx',name:'Test',dueDate:'2026-11-04'}),billReminderCopy({language:'it',name:'Test',dueDate:'2026-11-04'}));
});

test('email reminder names cannot inject lines or invisible formatting',()=>{
 const result=billReminderCopy({language:'en',name:'  Electricity\r\n\turgent\u202e\u200b  ',dueDate:'2026-11-04'});
 assert.match(result.text,/Electricity urgent/);
 assert.doesNotMatch(result.text,/\r|\u202e|\u200b/);
 assert.equal(result.text.split('\n').length,3);
 assert.throws(()=>billReminderCopy({language:'en',name:'\n\u200b\t',dueDate:'2026-11-04'}),TypeError);
});

test('missing nullable names are rejected and source names stay unchanged',()=>{
 for(const name of [null,undefined])assert.throws(()=>billReminderCopy({language:'en',name,dueDate:'2026-11-04'}),TypeError);
 const name='Invoice\u202e'+('x'.repeat(200));
 const result=billReminderCopy({language:'en',name,dueDate:'2026-11-04'});
 assert.doesNotMatch(result.text,/\u202e/);
 assert.equal(name.length,208);
 assert.match(result.text,/Invoice /);
 assert.equal(result.text.split('\n')[0].split(' is due')[0].replace('The bill ','').length,160);
});

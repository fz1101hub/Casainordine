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

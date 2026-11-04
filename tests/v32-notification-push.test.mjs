import test from 'node:test';
import assert from 'node:assert/strict';
import {billDuePushCopy,billSummaryPushCopy} from '../lib/notification-push-copy.mjs';

const languages=['it','en','es','fr','de','pt'];
test('push reminders are localized in all six languages',()=>{
 const copies=languages.map(language=>billDuePushCopy({language,name:'Electricity'}));
 assert.equal(new Set(copies.map(c=>c.title)).size,6);
 for(const c of copies){assert.match(c.body,/Electricity/);assert.doesNotMatch(c.body,/undefined|\{name\}/);}
});
test('monthly push amounts are EUR formatted per locale, not converted',()=>{
 const copies=languages.map(language=>billSummaryPushCopy({language,count:2,total:1234.5}));
 assert.equal(new Set(copies.map(c=>c.title)).size,6);
 for(const c of copies){assert.match(c.body,/2/);assert.match(c.body,/1[.,\s\u00a0\u202f]?234/);assert.match(c.body,/€/);}
});
test('invalid inputs fail closed and unsupported language falls back to Italian',()=>{
 assert.throws(()=>billDuePushCopy({name:'  '}),TypeError);
 for(const total of [null,undefined,NaN,Infinity,-1,'10'])assert.throws(()=>billSummaryPushCopy({count:1,total}),TypeError);
 assert.throws(()=>billSummaryPushCopy({count:0,total:1}),TypeError);
 assert.deepEqual(billDuePushCopy({language:'xx',name:'Test'}),billDuePushCopy({language:'it',name:'Test'}));
});

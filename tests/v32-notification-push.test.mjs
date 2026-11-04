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

test('push bill names cannot inject line breaks or invisible controls',()=>{
 const copy=billDuePushCopy({language:'en',name:'  Water\n\tBill\u200b  '});
 assert.match(copy.body,/Water Bill/);
 assert.doesNotMatch(copy.body,/[\r\n\t\u200b]/);
 assert.throws(()=>billDuePushCopy({name:'\u200b\u0000'}),TypeError);
});

test('push names are limited without changing stored bill names',()=>{
 const name='A'.repeat(200);
 const copy=billDuePushCopy({language:'it',name});
 assert.equal(name.length,200);
 assert.match(copy.body,/A{160}/);
 assert.doesNotMatch(copy.body,/A{161}/);
});

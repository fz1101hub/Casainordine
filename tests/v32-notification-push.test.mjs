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

// Directionality controls can spoof the visible order of a bill name in notifications.
test('push names remove bidi overrides and isolates without changing source',()=>{
 const name='Invoice\u202e321\u202c\u2067\u2069\u200e';
 const copy=billDuePushCopy({language:'en',name});
 assert.match(copy.body,/Invoice 321/);
 assert.doesNotMatch(copy.body,/[\u202a-\u202e\u2066-\u2069\u200e\u200f]/);
 assert.match(name,/\u202e/);
 assert.throws(()=>billDuePushCopy({name:'\u202e\u2067\u2069'}),TypeError);
});

test('push truncation preserves emoji and combining grapheme clusters',()=>{
 const family='👨‍👩‍👧‍👦';
 const name='a'.repeat(159)+family+'z';
 const rendered=billDuePushCopy({language:'en',name}).body.split(' is due')[0];
 if(typeof Intl.Segmenter==='function')assert.equal(rendered,'a'.repeat(159)+family);
 else assert.equal(rendered,'a'.repeat(159)+'👨');
 const accented=billDuePushCopy({language:'en',name:'a'.repeat(159)+'e\u0301z'}).body.split(' is due')[0];
 if(typeof Intl.Segmenter==='function')assert.equal(accented,'a'.repeat(159)+'e\u0301');
 assert.equal(name,'a'.repeat(159)+family+'z');
});
test('push removes isolated joiners and rejects invisible-only names',()=>{
 const family='👨‍👩‍👧‍👦';
 const body=billDuePushCopy({language:'fr',name:'Eau '+family+'\u200d texte \u200d seul'}).body;
 assert.match(body,/Eau 👨‍👩‍👧‍👦/);
 assert.doesNotMatch(body,/👦\u200d texte|\u200d seul/);
 assert.throws(()=>billDuePushCopy({name:'\u200d\u200b\ufeff'}),TypeError);
});

test('monthly push counts use recipient locale grouping without changing values',()=>{
 for(const language of languages){
  const copy=billSummaryPushCopy({language,count:12345,total:12.5});
  const formatted=new Intl.NumberFormat(({it:'it-IT',en:'en-GB',es:'es-ES',fr:'fr-FR',de:'de-DE',pt:'pt-PT'})[language]).format(12345);
  assert.ok(copy.body.includes(formatted),language);
  assert.doesNotMatch(copy.body,/\{count\}|\{total\}/);
 }
});

test('monthly push locale follows shared language normalization for regional and unknown tags',()=>{
 for(const [tag,language] of [['en-US','en'],['pt-BR','pt'],['de-AT','de'],['xx-XX','it']]){
  assert.deepEqual(billSummaryPushCopy({language:tag,count:12345,total:1234.5}),billSummaryPushCopy({language,count:12345,total:1234.5}));
 }
});

test('push reminders reject missing and non-text bill names instead of displaying coerced values',()=>{
 for(const name of [null,undefined,42,true,{},['Electricity']]){
  assert.throws(()=>billDuePushCopy({language:'en',name}),TypeError);
 }
 assert.match(billDuePushCopy({language:'en',name:'Electricity'}).body,/Electricity/);
});

test('monthly push rejects fractional, unsafe and nonnumeric counts in every locale',()=>{
 for(const language of languages){
  for(const count of [-1,0,1.5,Number.MAX_SAFE_INTEGER+1,NaN,Infinity,'2',null,undefined]){
   assert.throws(()=>billSummaryPushCopy({language,count,total:12.5}),TypeError,language+': '+String(count));
  }
  const result=billSummaryPushCopy({language,count:1,total:0});
  assert.ok(result.body.includes('€'),language);
 }
});

test('push rejects names containing only combining or variation marks',()=>{
 for(const name of ['\u0301','\u034f','\ufe0f',' \u0301\ufe0f ']){
  assert.throws(()=>billDuePushCopy({language:'en',name}),TypeError);
 }
 assert.match(billDuePushCopy({language:'en',name:'Électricité'}).body,/Électricité/);
 assert.match(billDuePushCopy({language:'en',name:'⚡'}).body,/⚡/);
});

test('monthly push uses singular grammar for one bill in all six languages',()=>{
 const expected={
  it:/1 scadenza ancora aperta/,en:/1 upcoming bill remains unpaid/,
  es:/1 factura pendiente/,fr:/1 facture reste à payer/,
  de:/1 Rechnung ist noch offen/,pt:/1 fatura por pagar/
 };
 for(const language of languages){
  const singular=billSummaryPushCopy({language,count:1,total:12.5});
  const plural=billSummaryPushCopy({language,count:2,total:12.5});
  assert.match(singular.body,expected[language],language);
  assert.doesNotMatch(plural.body,expected[language],language);
  assert.match(singular.body,/€/);
 }
});

test('push names replace malformed UTF-16 without damaging valid emoji pairs',()=>{
 const high=String.fromCharCode(0xD800),low=String.fromCharCode(0xDC00);
 const rocket=String.fromCodePoint(0x1F680);
 const name='Water'+high+' bill '+low+' ⚡ '+rocket;
 const body=billDuePushCopy({language:'en',name}).body;
 assert.match(body,/Water bill ⚡ 🚀/);
 assert.equal([...body].some(ch=>{const n=ch.charCodeAt(0);return n>=0xD800&&n<=0xDFFF;}),false);
 assert.ok(name.includes(high));
 assert.throws(()=>billDuePushCopy({name:high}),TypeError);
 assert.throws(()=>billDuePushCopy({name:low}),TypeError);
});

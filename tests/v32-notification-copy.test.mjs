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

test('reminder truncation preserves complete Unicode code points',()=>{
 const name='a'.repeat(159)+'😀'+'z';
 const result=billReminderCopy({language:'en',name,dueDate:'2026-11-04'});
 const rendered=result.text.split(' is due')[0].replace('The bill ','');
 assert.equal(Array.from(rendered).length,160);
 assert.equal(rendered,'a'.repeat(159)+'😀');
 assert.doesNotMatch(rendered,/\uFFFD/);
});

test('reminder truncation does not split grapheme clusters',()=>{
 const family='👨‍👩‍👧‍👦';
 const name='a'.repeat(159)+family+'z';
 const rendered=billReminderCopy({language:'en',name,dueDate:'2026-11-04'}).text.split(' is due')[0].replace('The bill ','');
 if(typeof Intl.Segmenter==='function')assert.equal(rendered,'a'.repeat(159)+family);
 else assert.equal(rendered,'a'.repeat(159)+'👨');
 const combined='a'.repeat(159)+'e\u0301'+'z';
 const combinedRendered=billReminderCopy({language:'en',name:combined,dueDate:'2026-11-04'}).text.split(' is due')[0].replace('The bill ','');
 if(typeof Intl.Segmenter==='function')assert.equal(combinedRendered,'a'.repeat(159)+'e\u0301');
});

test('email reminder preserves emoji joins but removes isolated joiners',()=>{
 const family='👨‍👩‍👧‍👦';
 const result=billReminderCopy({language:'fr',name:'Énergie '+family+'\u200d broken \u200d text',dueDate:'2026-11-04'});
 assert.match(result.text,/Énergie 👨‍👩‍👧‍👦/);
 assert.doesNotMatch(result.text,/👦\u200d broken|\u200d text/);
 assert.equal(result.text.split('\n').length,3);
});
test('email reminder rejects names made only of direction controls and joiners',()=>{
 for(const name of ['\u202e\u2066\u2069','\u200d\u200b\ufeff']){
  assert.throws(()=>billReminderCopy({language:'de',name,dueDate:'2026-11-04'}),TypeError);
 }
});


test('recipient locale changes the rendered due date without changing the stored ISO date',()=>{
 const dueDate='2026-12-31';
 const locales={it:'it-IT',en:'en-GB',es:'es-ES',fr:'fr-FR',de:'de-DE',pt:'pt-PT'};
 for(const [language,locale] of Object.entries(locales)){
  const {text}=billReminderCopy({language,name:'Acqua',dueDate});
  const formatted=new Intl.DateTimeFormat(locale,{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date('2026-12-31T12:00:00Z'));
  assert.ok(text.includes(formatted),language+' should use '+locale+' date');
  assert.match(text,/Acqua/,language);
 }
 assert.equal(dueDate,'2026-12-31');
});

test('pt-PT reminder uses a natural preposition before the localized date',()=>{
 const {text}=billReminderCopy({language:'pt',name:'Água',dueDate:'2026-12-31'});
 assert.match(text,/A fatura Água vence em 31/);
 assert.doesNotMatch(text,/vence a 31/);
});

test('reminder rejects non-string names instead of exposing object coercion',()=>{
 for(const name of [42,0,true,{},['Invoice'],{toString(){throw new Error('should not execute');}}]){
  assert.throws(()=>billReminderCopy({language:'en',name,dueDate:'2026-11-04'}),TypeError);
 }
 assert.match(billReminderCopy({language:'en',name:'Invoice 42',dueDate:'2026-11-04'}).text,/Invoice 42/);
});

test('long reminder names are capped without changing the source',()=>{
 const name='🧾'.repeat(10000);
 const rendered=billReminderCopy({language:'en',name,dueDate:'2026-11-04'}).text.split(' is due')[0].replace('The bill ','');
 assert.equal(Array.from(rendered).length,160);
 assert.equal(name.length,20000);
 assert.equal(rendered,'🧾'.repeat(160));
});


test('reminder bounds oversized inputs before normalization without mutating source',()=>{
 const maxName='A'.repeat(32768);
 assert.match(billReminderCopy({language:'en',name:maxName,dueDate:'2026-11-04'}).text,/The bill A/);
 const oversized='B'.repeat(32769);
 assert.throws(()=>billReminderCopy({language:'en',name:oversized,dueDate:'2026-11-04'}),/Bill name too long/);
 assert.equal(oversized.length,32769);
});


test('reminder names remove soft hyphen, Arabic letter mark and invisible separators',()=>{
 const name='Ener\u00adgia\u061c \u034f\u180eLuce';
 const {text}=billReminderCopy({language:'it',name,dueDate:'2026-11-04'});
 assert.doesNotMatch(text,/[\u00ad\u061c\u034f\u180e]/u);
 assert.match(text,/Ener gia Luce/);
 assert.equal(name.includes('\u061c'),true);
 for(const invisible of ['\u00ad','\u061c','\u034f','\u180e']){
  assert.throws(()=>billReminderCopy({language:'en',name:invisible,dueDate:'2026-11-04'}),TypeError);
 }
});


test('user-supplied template tokens remain literal and cannot replace the actual due date',()=>{
 for(const language of ['it','en','es','fr','de','pt']){
  const name='Energia {date} {name}';
  const dueDate='2026-12-31';
  const {text}=billReminderCopy({language,name,dueDate});
  const locale={it:'it-IT',en:'en-GB',es:'es-ES',fr:'fr-FR',de:'de-DE',pt:'pt-PT'}[language];
  const date=new Intl.DateTimeFormat(locale,{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date('2026-12-31T12:00:00Z'));
  assert.ok(text.includes('Energia {date} {name}'),language);
  assert.ok(text.includes(date),language);
  assert.equal(text.split(date).length-1,1,language);
 }
});

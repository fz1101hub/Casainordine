import test from 'node:test';
import assert from 'node:assert/strict';
import {billSummaryCopy} from '../lib/notification-summary.mjs';
const bills=[{title:'Luce',supplier:'Fornitore',due_date:'2026-11-20',amount:1234.5}];
test('monthly summaries use recipient locale without changing amounts',()=>{
 const langs=['it','en','es','fr','de','pt'];
 const results=langs.map(language=>billSummaryCopy({language,today:'2026-11-04',bills}));
 assert.equal(new Set(results.map(x=>x.subject)).size,6);
 for(const result of results){assert.equal(result.rows.length,1);assert.match(result.rows[0].title,/Luce/);assert.ok(result.description);assert.ok(result.openLabel);}
 assert.notEqual(results[0].rows[0].amount,results[1].rows[0].amount);
});
test('invalid dates and amounts fail closed',()=>{
 for(const invalid of [{...bills[0],due_date:'2026-02-30'},{...bills[0],amount:'NaN'},{...bills[0],amount:-1}]){
  assert.throws(()=>billSummaryCopy({today:'2026-11-04',bills:[invalid]}),TypeError);
 }
 assert.throws(()=>billSummaryCopy({today:'2026-11-04',bills:[]}),TypeError);
});
test('amount validation rejects missing, empty, non-numeric and overflowing totals',()=>{
 for(const amount of [null,undefined,'','   ',false,{},'Infinity',-0.01]){
  assert.throws(()=>billSummaryCopy({today:'2026-11-04',bills:[{...bills[0],amount}]}),TypeError);
 }
 assert.throws(()=>billSummaryCopy({today:'2026-11-04',bills:[{...bills[0],amount:1e308},{...bills[0],amount:1e308}]}),TypeError);
 assert.equal(billSummaryCopy({today:'2026-11-04',bills:[{...bills[0],amount:'1234.50'}]}).rows[0].amount,billSummaryCopy({today:'2026-11-04',bills}).rows[0].amount);
});
test('unsupported language falls back to Italian',()=>{
 assert.deepEqual(billSummaryCopy({language:'xx',today:'2026-11-04',bills}),billSummaryCopy({language:'it',today:'2026-11-04',bills}));
});

test('summary rejects monetary values that cannot be displayed faithfully',()=>{
 const today='2026-11-04';
 for(const amount of ['9007199254740992',9007199254740992,'9007199254740991.25']){
  assert.throws(()=>billSummaryCopy({today,bills:[{...bills[0],amount}]}),TypeError);
 }
 assert.throws(()=>billSummaryCopy({today,bills:[
  {...bills[0],amount:9007199254740991},
  {...bills[0],amount:1}
 ]}),TypeError);
 const valid=billSummaryCopy({today,bills:[{...bills[0],amount:'1234.50'}]});
 assert.notEqual(valid.description.includes('—'),true);
 assert.notEqual(valid.rows[0].amount,'—');
});

test('monthly email summaries agree in number across all six recipient languages',()=>{
 const expected={
  it:['bolletta ancora','bollette ancora'],
  en:['unpaid bill totalling','unpaid bills totalling'],
  es:['factura pendiente','facturas pendientes'],
  fr:['facture impayée','factures impayées'],
  de:['offene Rechnung','offene Rechnungen'],
  pt:['fatura por pagar','faturas por pagar']
 };
 for(const [language,[singular,plural]] of Object.entries(expected)){
  const one=billSummaryCopy({language,today:'2026-11-04',bills});
  const two=billSummaryCopy({language,today:'2026-11-04',bills:[...bills,{...bills[0],amount:10}]});
  assert.ok(one.description.includes('1 '+singular),language+' singular: '+one.description);
  assert.ok(two.description.includes('2 '+plural),language+' plural: '+two.description);
  assert.equal(one.rows.length,1);
  assert.equal(two.rows.length,2);
 }
});

test('monthly email subject uses the recipient locale for month and year',()=>{
 const expected={it:'novembre 2026',en:'November 2026',es:'noviembre de 2026',fr:'novembre 2026',de:'November 2026',pt:'novembro de 2026'};
 for(const [language,month] of Object.entries(expected)){
  const copy=billSummaryCopy({language,today:'2026-11-04',bills});
  assert.ok(copy.subject.includes(month),language+': '+copy.subject);
  assert.ok(!copy.subject.includes('(2026-11)'),language);
 }
 const january=billSummaryCopy({language:'en',today:'2027-01-01',bills});
 assert.ok(january.subject.includes('January 2027'));
});

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

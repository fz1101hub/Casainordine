import test from 'node:test';import assert from 'node:assert/strict';
import {parseRatePlanText} from '../lib/rate-plan.mjs';
import {shouldSendSummary,monthEndISO,upcomingSummaryBills} from '../lib/summary-schedule.mjs';
import {supplierMatch,gmailSupplierQuery} from '../lib/mail-suppliers.mjs';
import {likelyBillDocument} from '../lib/mail-core.mjs';

test('plan: only dates and amounts on a single rate row, never totals',()=>{
 const input='Ripartizione condominio\nRata 1 10/12/2026 € 125,00\nRata 2 10/03/2027 125,00 EUR\nTotale 250,00';
 const out=parseRatePlanText(input);
 // The parser intentionally does not guess formats not confidently supported.
 assert.equal(out.rows.length,2);assert.deepEqual(out.rows.map(x=>x.due_date),['2026-12-10','2027-03-10']);
});
test('plan: unit filter prevents mixing households',()=>{
 const input='Piano rate condominio\nInterno 4 Rata 1 10/12/2026 € 100,00\nInterno 5 Rata 1 10/12/2026 € 250,00\nInterno 5 Rata 2 10/02/2027 € 250,00';
 const out=parseRatePlanText(input,{unitFilter:'interno 5'});
 assert.equal(out.rows.length,2);assert.ok(out.rows.every(x=>x.amount===250));
});
test('plan: ambiguous or date-only rows are omitted',()=>{
 const out=parseRatePlanText('Piano rate condominio\nRata 1 10/12/2026 100,00 200,00\nRata 2 10/03/2027\nRata 3 10/06/2027 € 100,00');
 assert.equal(out.rows.length,1);assert.ok(out.warnings.some(w=>/ambigui/.test(w)));
});
test('summary: schedule respects weekdays, every two weeks and month dates',()=>{
 assert.ok(shouldSendSummary({summary_frequency:'daily'},'2026-11-02'));
 assert.ok(shouldSendSummary({summary_frequency:'weekly',summary_weekday:1},'2026-11-02'));
 assert.equal(shouldSendSummary({summary_frequency:'weekly',summary_weekday:1},'2026-11-03'),false);
 assert.ok(shouldSendSummary({summary_frequency:'monthly',summary_month_day:2},'2026-11-02'));
 assert.ok(!shouldSendSummary({summary_frequency:'monthly',summary_month_day:2},'2026-11-03'));
 assert.notEqual(shouldSendSummary({summary_frequency:'biweekly',summary_weekday:1},'2026-11-02'),shouldSendSummary({summary_frequency:'biweekly',summary_weekday:1},'2026-11-09'));
 assert.ok(!shouldSendSummary({summary_frequency:'off'},'2026-11-02'));
});
test('summary: only unpaid remaining bills within current month',()=>{
 assert.equal(monthEndISO('2026-02-10'),'2026-02-28');
 const items=upcomingSummaryBills([
  {due_date:'2026-11-03',paid_at:null,amount:20},
  {due_date:'2026-11-01',paid_at:null,amount:10},
  {due_date:'2026-11-10',paid_at:'2026-11-02',amount:50},
  {due_date:'2026-12-01',paid_at:null,amount:40}
 ],'2026-11-02');assert.equal(items.length,1);assert.equal(items[0].amount,20);
});
test('known supplier searches remain hints; no payment approvals',()=>{
 const pref=[{name:'Energia Verde',sender_email:'bollette@energiaverde.example'}];
 assert.equal(supplierMatch(pref,'Un documento per Energia Verde','mail@server.example').name,'Energia Verde');
 assert.match(gmailSupplierQuery(pref),/Energia Verde/);
 assert.ok(likelyBillDocument({subject:'Energia Verde · il tuo documento',sender:'unknown@example.com',filenames:['documento.pdf'],knownSuppliers:pref}));
 assert.ok(!likelyBillDocument({subject:'Offerta promozionale',sender:'unknown@example.com',filenames:['banner.png'],knownSuppliers:pref}));
 assert.ok(likelyBillDocument({subject:'Il tuo documento',sender:'provider@example.com',bodyText:'Bolletta Energia Verde',filenames:['allegato.pdf'],knownSuppliers:pref}));
});

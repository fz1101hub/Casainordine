import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoFixtures,restoreDemoFixtures} from '../lib/test-fixtures.mjs';

test('Demo data uses synthetic records with every Home 3.0 widget populated',()=>{
 const data=createDemoFixtures('2026-11-04');
 assert.ok(data.bills.length>=5);
 assert.ok(data.tasks.length>=4);
 assert.ok(data.shopping.length>=5);
 assert.ok(data.assets.length);
 assert.ok(data.contracts.length);
 assert.ok(data.decisions.length);
});
test('Demo data uses realistic but fictional supplier names',()=>{
 const data=createDemoFixtures('2026-11-04');
 assert.ok(data.bills.every(x=>x.supplier&&x.due_date));
 assert.ok(data.bills.some(x=>x.due_date<'2026-11-04'&&!x.paid_at));
 assert.ok(data.bills.some(x=>x.paid_at));
});
test('Refreshing Demo state restores checked tasks and shopping selections',()=>{
 const initial=createDemoFixtures('2026-11-04');
 const copy={...initial,shopping:initial.shopping.map(x=>x.id==='shop-milk'?{...x,checked:true}:x),tasks:initial.tasks.map(x=>x.id==='task-boiler'?{...x,done_at:'2026-11-04T10:00:00Z'}:x)};
 const restored=restoreDemoFixtures(copy,'2026-11-04');
 assert.equal(restored.shopping.find(x=>x.id==='shop-milk').checked,true);
 assert.equal(restored.tasks.find(x=>x.id==='task-boiler').done_at,'2026-11-04T10:00:00Z');
});
test('Demo restore drops injected fields to keep an isolated preview',()=>{
 const initial=createDemoFixtures('2026-11-04');
 const result=restoreDemoFixtures({...initial,bills:[{...initial.bills[0],supplier:'Forged',secret:'do not trust'}]},'2026-11-04');
 assert.equal(result.bills[0].supplier,'Energia Esempio');
 assert.equal('secret' in result.bills[0],false);
});
test('Demo restores safe baseline from incomplete or malformed saved data',()=>{
 assert.equal(restoreDemoFixtures(null,'2026-11-04').bills.length,6);
 assert.equal(restoreDemoFixtures({bills:'unsafe'},'2026-11-04').bills.length,6);
});

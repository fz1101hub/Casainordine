import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {v32DemoCopy} from '../lib/v32-demo-copy.mjs';
import {v21BriefingCopy} from '../lib/v21-briefing-copy.mjs';
import {buildFiveMinuteBriefing} from '../lib/v21-core.mjs';
import {createDemoFixtures,restoreDemoFixtures} from '../lib/test-fixtures.mjs';
import {localizeDemoFixtures} from '../lib/v32-demo-fixture-labels.mjs';

const component=readFileSync(new URL('../app/TestDrive.jsx',import.meta.url),'utf8');
test('test drive labels are complete for six languages',()=>{
 const languages=['it','en','es','fr','de','pt'];
 const keys=Object.keys(v32DemoCopy('it'));
 assert.equal(keys.length,11);
 for(const language of languages){
  const copy=v32DemoCopy(language);
  assert.deepEqual(Object.keys(copy),keys);
  for(const value of Object.values(copy))assert.ok(value.trim());
  assert.ok(copy.taskDue.includes('{date}'));
 }
 assert.deepEqual(v32DemoCopy('unsupported'),v32DemoCopy('it'));
 for(const key of keys)assert.ok(component.includes('copy.'+key),key);
});
test('test drive briefing is rebuilt with active language',()=>{
 assert.match(component,/copy:v21BriefingCopy\(language\)/);
 assert.match(component,/\[data,language\]/);
 const fixture={bills:[{id:'bill1',title:'Internet',supplier:'ISP',amount:20,due_date:'2026-01-01'}],today:'2026-01-05'};
 const italian=buildFiveMinuteBriefing({...fixture,copy:v21BriefingCopy('it')});
 const english=buildFiveMinuteBriefing({...fixture,copy:v21BriefingCopy('en')});
 assert.ok(italian.length>0);
 assert.deepEqual(italian.map(x=>x.id),english.map(x=>x.id));
 assert.notDeepEqual(italian.map(x=>x.label),english.map(x=>x.label));
});

test('synthetic fixture labels change in six languages without changing stored values or IDs',()=>{
 const original=createDemoFixtures('2026-11-05');
 const snapshot=JSON.stringify(original);
 const all=['it','en','es','fr','de','pt'];
 const ids=items=>items.map(x=>x.id);
 for(const language of all){
  const display=localizeDemoFixtures(original,language);
  for(const section of ['bills','tasks','shopping','assets','decisions']){
   assert.deepEqual(ids(display[section]),ids(original[section]),language+' '+section);
   assert.deepEqual(display[section].map(x=>x.paid_at??x.done_at??x.checked??null),original[section].map(x=>x.paid_at??x.done_at??x.checked??null));
  }
  if(language!=='it'){
   for(const section of ['bills','tasks','shopping'])assert.ok(display[section].every((x,i)=>x.title!==original[section][i].title),language+' '+section);
   assert.ok(display.shopping.every((x,i)=>x.quantity!==original.shopping[i].quantity||x.quantity==='1 kg'));
  }
 }
 assert.equal(JSON.stringify(original),snapshot);
 assert.deepEqual(localizeDemoFixtures(original,'unknown'),original);
 const saved=restoreDemoFixtures(original,'2026-11-05');
 assert.deepEqual(saved.bills.map(x=>x.title),original.bills.map(x=>x.title));
 assert.match(component,/localizeDemoFixtures\(data,language\)/);
 assert.match(component,/bills=\{displayData.bills\} tasks=\{displayData.tasks\}/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {v32DemoCopy} from '../lib/v32-demo-copy.mjs';
import {v21BriefingCopy} from '../lib/v21-briefing-copy.mjs';
import {buildFiveMinuteBriefing} from '../lib/v21-core.mjs';

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
 assert.notDeepEqual(italian.map(x=>x.detail),english.map(x=>x.detail));
});

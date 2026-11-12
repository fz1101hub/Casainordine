import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../app/V21Hub.jsx',import.meta.url),'utf8');
const start=source.indexOf('const exportNames=');
const end=source.indexOf('const uuid=',start);
assert.ok(start>=0&&end>start,'V21 filename helper must exist');
// Execute only the self-contained filename helper, not the React component.
const filename=(language,type,date)=>runInNewContext(
 source.slice(start,end)+'\n v21ExportName(language,type,date)',
 {language,type,date}
);

test('V21 filenames work in all six languages without changing JSON extension',()=>{
 for(const language of ['it','en','es','fr','de','pt']){
  const stems=new Set();
  for(const type of ['property','inventory','briefing']){
   const name=filename(language,type);
   assert.match(name,/^[a-z0-9-]+\.json$/);
   stems.add(name);
  }
  assert.equal(stems.size,3,'export types should have distinct filenames within each locale');
 }
});

test('V21 briefing date suffix is restricted to ISO-shaped dates',()=>{
 assert.equal(filename('en','briefing','2026-11-12'),'home-in-5-minutes-2026-11-12.json');
 assert.equal(filename('en','briefing','../../private'),'home-in-5-minutes.json');
 assert.equal(filename('en','briefing','2026/11/12'),'home-in-5-minutes.json');
 assert.equal(filename('en','briefing',null),'home-in-5-minutes.json');
});

test('V21 filename dates reject invalid calendar days and non-string values',()=>{
 for(const invalid of ['2026-02-29','2026-02-30','2026-04-31','2026-13-01','2026-00-01','2026-01-00','2026-01-32',20261112]){
  assert.equal(filename('en','briefing',invalid),'home-in-5-minutes.json');
 }
 assert.equal(filename('en','briefing','2028-02-29'),'home-in-5-minutes-2028-02-29.json');
 assert.equal(filename('en','briefing','2000-02-29'),'home-in-5-minutes-2000-02-29.json');
 assert.equal(filename('en','briefing','2100-02-29'),'home-in-5-minutes.json');
});

test('V21 filename helper falls back to Italian and rejects unknown types',()=>{
 assert.equal(filename('unknown','property'),filename('it','property'));
 assert.equal(filename('fr','unknown'),null);
});

test('V21 export controls use localized helper',()=>{
 assert.match(source,/name=\{v21ExportName\(language,'property'\)\}/);
 assert.match(source,/name=\{v21ExportName\(language,'inventory'\)\}/);
 assert.match(source,/name=\{v21ExportName\(language,'briefing',todayRome\(\)\)\}/);
});

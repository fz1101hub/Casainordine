import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {v21LoadErrorKind} from '../lib/v21-load-errors.mjs';
import {v20UiCopy} from '../lib/v20-ui-copy.mjs';

const source=readFileSync(new URL('../app/V20Hub.jsx',import.meta.url),'utf8');

test('V20 classifies failed reads rather than always announcing a missing migration',()=>{
 assert.match(source,/const errorKind=v21LoadErrorKind\(res\)/);
 assert.match(source,/errorKind==='migrationRequired'\?ui\.migrationRequired:ui\.operationFailed/);
 assert.equal(v21LoadErrorKind([{error:{code:'42501'}}]),'operationFailed');
 assert.equal(v21LoadErrorKind([{error:{code:'42P01'}}]),'migrationRequired');
 assert.equal(v21LoadErrorKind([{error:{code:'PGRST205'}}]),'migrationRequired');
 assert.equal(v21LoadErrorKind([{error:{code:'42P01'}},{error:{code:'42501'}}]),'operationFailed');
 assert.equal(v21LoadErrorKind([{data:[]}]),null);
});
test('V20 provides localized generic and migration labels in all six languages',()=>{
 for(const lang of ['it','en','es','fr','de','pt']){
  const copy=v20UiCopy(lang);
  assert.ok(copy.operationFailed?.trim(),lang);
  assert.ok(copy.migrationRequired?.trim(),lang);
 }
});

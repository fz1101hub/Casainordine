import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {v21LoadErrorKind} from '../lib/v21-load-errors.mjs';

const source=readFileSync(new URL('../app/V21Hub.jsx',import.meta.url),'utf8');

test('V21 uses localized copy selected by error classifier',()=>{
  assert.match(source,/const errorKind=v21LoadErrorKind\(errors\)/);
  assert.match(source,/if\(errorKind\)onNotify\(briefingCopy\[errorKind\]\)/);
  assert.doesNotMatch(source,/onNotify\(errors\[0\]\.error\.message\)/);
});

test('missing-table errors require migration only when every failure is 42P01',()=>{
  assert.equal(v21LoadErrorKind([{error:{code:'42P01'}},{error:{code:'42P01'}}]),'migrationRequired');
  assert.equal(v21LoadErrorKind([{error:{code:'42P01'}},{error:{code:'42501'}}]),'operationFailed');
  assert.equal(v21LoadErrorKind([{error:{code:'42P01'}},{error:{message:'Network failed'}}]),'operationFailed');
  assert.equal(v21LoadErrorKind([{error:{code:'PGRST301'}}]),'operationFailed');
});

test('successful reads, empty results and malformed responses do not trigger misleading errors',()=>{
  assert.equal(v21LoadErrorKind([]),null);
  assert.equal(v21LoadErrorKind(null),null);
  assert.equal(v21LoadErrorKind([{data:[]},{error:null}]),null);
  assert.equal(v21LoadErrorKind([{error:null},{error:{code:'42P01'}}]),'migrationRequired');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {v21LoadErrorKind} from '../lib/v21-load-errors.mjs';

test('V21 successful and empty loads do not show an error',()=>{
  assert.equal(v21LoadErrorKind([]),null);
  assert.equal(v21LoadErrorKind([{data:[]},{data:[{id:'x'}],error:null}]),null);
  assert.equal(v21LoadErrorKind(null),null);
});

test('V21 missing migration is distinguished from generic failures',()=>{
  assert.equal(v21LoadErrorKind([{error:{code:'42P01'}}]),'migrationRequired');
  assert.equal(v21LoadErrorKind([{error:{code:'42P01'}},{error:{code:'42P01'}}]),'migrationRequired');
  assert.equal(v21LoadErrorKind([{error:{code:'42P01'}},{error:{code:'42501'}}]),'operationFailed');
  assert.equal(v21LoadErrorKind([{error:{message:'provider private details'}}]),'operationFailed');
  assert.equal(v21LoadErrorKind([{error:true}]),'operationFailed');
});

test('V21 error classifier never returns provider details',()=>{
  const secret='private provider message';
  const kind=v21LoadErrorKind([{error:{code:'42501',message:secret}}]);
  assert.equal(kind,'operationFailed');
  assert.ok(!kind.includes(secret));
});


test('V21 recognizes PostgREST missing table responses without exposing their text',()=>{
  assert.equal(v21LoadErrorKind([{error:{code:'PGRST205',message:'schema cache private details'}}]),'migrationRequired');
  assert.equal(v21LoadErrorKind([{error:{code:'42P01'}},{error:{code:'PGRST205'}}]),'migrationRequired');
  assert.equal(v21LoadErrorKind([{error:{code:'PGRST205'}},{error:{code:'42501'}}]),'operationFailed');
  assert.equal(v21LoadErrorKind([{error:{code:'PGRST205'}},{error:{message:'unknown'}}]),'operationFailed');
  assert.equal(v21LoadErrorKind([{error:{code:null}}]),'operationFailed');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {v20ErrorCategory,v20SafeError} from '../lib/v20-safe-error.mjs';

test('HTTP 424 failed dependency is a recoverable service failure, not a user validation error',()=>{
 assert.equal(v20ErrorCategory({status:424}),'unavailable');
 assert.equal(v20ErrorCategory({status:422}),'validation');
 assert.equal(v20ErrorCategory({status:403}),'access');
});

test('HTTP 424 gives safe localized feedback in all six supported languages',()=>{
 const messages=new Set();
 for(const language of ['it','en','es','fr','de','pt']){
  const message=v20SafeError(language,{status:424,message:'PRIVATE_INTERNAL_ENDPOINT token=SECRET'});
  assert.equal(message,v20SafeError(language,{status:503}));
  assert.ok(message.length>10);
  assert.doesNotMatch(message,/PRIVATE_INTERNAL_ENDPOINT|SECRET|token=/);
  messages.add(message);
 }
 assert.equal(messages.size,6);
});

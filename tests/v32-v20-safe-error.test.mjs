import test from 'node:test';
import assert from 'node:assert/strict';
import {v20SafeError,v20ErrorCategory} from '../lib/v20-safe-error.mjs';

test('V20 errors are localized in all six languages without leaking provider details',()=>{
 const messages=['it','en','es','fr','de','pt'].map(v20SafeError);
 assert.equal(new Set(messages).size,6);
 for(const message of messages){assert.ok(message.length>30);assert.doesNotMatch(message,/supabase|postgres|SQLSTATE|permission denied/i);}
});
test('V20 errors default to Italian for unknown or invalid locale',()=>{
 assert.equal(v20SafeError('zz'),v20SafeError('it'));
 assert.equal(v20SafeError(null),v20SafeError('it'));
 assert.equal(v20SafeError('en-GB'),v20SafeError('en'));
});

test('V20 structured provider codes produce safe localized categories',()=>{
 for(const locale of ['it','en','es','fr','de','pt']){
  const generic=v20SafeError(locale);
  for(const error of [{code:'42501'},{status:403},{code:'42P01'},{code:'PGRST202'},{code:'NETWORK_ERROR'},{status:0}]){
   const message=v20SafeError(locale,error);
   assert.notEqual(message,generic);
   assert.doesNotMatch(message,/42501|42P01|PGRST|NETWORK_ERROR|supabase/i);
  }
  assert.equal(v20SafeError(locale,{message:'password=secret',code:'unknown'}),generic);
 }
 assert.equal(v20ErrorCategory({code:'42501'}),'access');
 assert.equal(v20ErrorCategory({code:'42P01'}),'schema');
 assert.equal(v20ErrorCategory({code:'FETCH_ERROR'}),'network');
 assert.equal(v20ErrorCategory({message:'permission denied'}),'generic');
});

test('V20 errors ignore untrusted free-text and malformed status fields',()=>{
 for(const locale of ['it','en','es','fr','de','pt']){
  const generic=v20SafeError(locale);
  for(const error of [
   {message:'permission denied',status:'403'},
   {message:'relation does not exist',code:'42P01 '},
   {message:'Failed to fetch',status:'0'},
   {message:'password=secret',code:42501},
   {message:'SQLSTATE 42501',status:500},
   {details:'PGRST202',hint:'schema missing'}
  ]) assert.equal(v20SafeError(locale,error),generic);
  assert.equal(v20SafeError(locale,{code:'42501',message:'password=secret'}),v20SafeError(locale,{code:'42501'}));
 }
 assert.equal(v20ErrorCategory(null),'generic');
 assert.equal(v20ErrorCategory(undefined),'generic');
});


test('V20 HTTP 429 rate limits have localized safe retry feedback',()=>{
 const messages=new Set();
 for(const locale of ['it','en','es','fr','de','pt']){
  const rate=v20SafeError(locale,{status:429,message:'secret token from provider'});
  messages.add(rate);
  assert.equal(v20ErrorCategory({status:429}),'rate');
  assert.notEqual(rate,v20SafeError(locale));
  assert.doesNotMatch(rate,/secret|token|429|supabase/i);
  assert.equal(v20SafeError(locale,{status:'429'}),v20SafeError(locale));
 }
 assert.equal(messages.size,6);
});

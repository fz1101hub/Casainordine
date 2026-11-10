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

test('V20 HTTP timeouts 408/504 show localized retry advice without leaking details',()=>{
 const translated=new Set();
 for(const locale of ['it','en','es','fr','de','pt']){
  const expected=v20SafeError(locale,{status:408});
  translated.add(expected);
  assert.equal(v20ErrorCategory({status:408}),'timeout');
  assert.equal(v20ErrorCategory({status:504}),'timeout');
  assert.equal(v20SafeError(locale,{status:504,message:'token=secret'}),expected);
  assert.notEqual(expected,v20SafeError(locale));
  assert.doesNotMatch(expected,/token|secret|408|504|supabase/i);
  assert.equal(v20SafeError(locale,{status:'504'}),v20SafeError(locale));
 }
 assert.equal(translated.size,6);
});


test('V20 HTTP 413 file size errors are localized without provider leakage',()=>{
 const translations=new Set();
 for(const locale of ['it','en','es','fr','de','pt']){
  const message=v20SafeError(locale,{status:413,message:'secret upload URL'});
  translations.add(message);
  assert.equal(v20ErrorCategory({status:413}),'size');
  assert.notEqual(message,v20SafeError(locale));
  assert.doesNotMatch(message,/secret|upload URL|413|supabase/i);
  assert.equal(v20SafeError(locale,{status:'413'}),v20SafeError(locale));
 }
 assert.equal(translations.size,6);
});


test('V20 HTTP 415 unsupported format feedback is safe and translated',()=>{
 const translations=new Set();
 for(const locale of ['it','en','es','fr','de','pt']){
  const message=v20SafeError(locale,{status:415,message:'private filename and token=secret'});
  translations.add(message);
  assert.equal(v20ErrorCategory({status:415}),'format');
  assert.notEqual(message,v20SafeError(locale));
  assert.doesNotMatch(message,/private|token|secret|415|supabase/i);
  assert.equal(v20SafeError(locale,{status:'415'}),v20SafeError(locale));
 }
 assert.equal(translations.size,6);
});


test('V20 HTTP 409 conflict protects concurrent edits in six languages',()=>{
 const translations=new Set();
 for(const locale of ['it','en','es','fr','de','pt']){
  const message=v20SafeError(locale,{status:409,message:'private record token=secret'});
  translations.add(message);
  assert.equal(v20ErrorCategory({status:409}),'conflict');
  assert.notEqual(message,v20SafeError(locale));
  assert.doesNotMatch(message,/private|token|secret|409|supabase/i);
  assert.equal(v20SafeError(locale,{status:'409'}),v20SafeError(locale));
 }
 assert.equal(translations.size,6);
});

test('V20 HTTP 422 validation errors give safe guidance in six languages',()=>{
 const translations=new Set();
 for(const locale of ['it','en','es','fr','de','pt']){
  const message=v20SafeError(locale,{status:422,message:'private address token=secret'});
  translations.add(message);
  assert.equal(v20ErrorCategory({status:422}),'validation');
  assert.notEqual(message,v20SafeError(locale));
  assert.doesNotMatch(message,/private|address|token|secret|422|supabase/i);
  assert.equal(v20SafeError(locale,{status:'422'}),v20SafeError(locale));
 }
 assert.equal(translations.size,6);
});

test('V20 missing records (404/410) show safe localized recovery guidance',()=>{
 const translations=new Set();
 for(const locale of ['it','en','es','fr','de','pt']){
  const message=v20SafeError(locale,{status:404,message:'private filename token=secret'});
  translations.add(message);
  assert.equal(v20ErrorCategory({status:404}),'notFound');
  assert.equal(v20ErrorCategory({status:410}),'notFound');
  assert.equal(v20SafeError(locale,{status:410}),message);
  assert.notEqual(message,v20SafeError(locale));
  assert.doesNotMatch(message,/private|filename|token|secret|404|410|supabase/i);
  assert.equal(v20SafeError(locale,{status:'404'}),v20SafeError(locale));
 }
 assert.equal(translations.size,6);
});

test('V20 HTTP 503 service outages have safe, distinct localized retry guidance',()=>{
 const translations=new Set();
 for(const locale of ['it','en','es','fr','de','pt']){
  const message=v20SafeError(locale,{status:503,message:'provider secret token=abc'});
  translations.add(message);
  assert.equal(v20ErrorCategory({status:503}),'unavailable');
  assert.notEqual(message,v20SafeError(locale));
  assert.notEqual(message,v20SafeError(locale,{status:504}));
  assert.doesNotMatch(message,/provider|secret|token|503|supabase/i);
  assert.equal(v20SafeError(locale,{status:'503'}),v20SafeError(locale));
 }
 assert.equal(translations.size,6);
});


test('V20 HTTP 502 upstream gateway failures use safe six-language service feedback',()=>{
 const translations=new Set();
 for(const locale of ['it','en','es','fr','de','pt']){
  const message=v20SafeError(locale,{status:502,message:'upstream secret token=abc'});
  translations.add(message);
  assert.equal(v20ErrorCategory({status:502}),'unavailable');
  assert.equal(message,v20SafeError(locale,{status:503}));
  assert.notEqual(message,v20SafeError(locale,{status:504}));
  assert.doesNotMatch(message,/upstream|secret|token|502|supabase/i);
  assert.equal(v20SafeError(locale,{status:'502'}),v20SafeError(locale));
 }
 assert.equal(translations.size,6);
});

test('V20 HTTP 401 requests sign-in, distinct from 403 permissions, in six languages',()=>{
 const translated=new Set();
 for(const locale of ['it','en','es','fr','de','pt']){
  const auth=v20SafeError(locale,{status:401,message:'private session token=secret'});
  translated.add(auth);
  assert.equal(v20ErrorCategory({status:401}),'auth');
  assert.notEqual(auth,v20SafeError(locale,{status:403}));
  assert.notEqual(auth,v20SafeError(locale));
  assert.doesNotMatch(auth,/private|token|secret|401|supabase/i);
  assert.equal(v20SafeError(locale,{status:'401'}),v20SafeError(locale));
 }
 assert.equal(translated.size,6);
 assert.equal(v20ErrorCategory({status:401,code:'42501'}),'auth');
 assert.equal(v20ErrorCategory({status:403,code:'42501'}),'access');
});


test('V20 HTTP 400 invalid requests reuse localized validation guidance safely',()=>{
 const translations=new Set();
 for(const locale of ['it','en','es','fr','de','pt']){
  const message=v20SafeError(locale,{status:400,message:'private data token=secret'});
  translations.add(message);
  assert.equal(v20ErrorCategory({status:400}),'validation');
  assert.equal(message,v20SafeError(locale,{status:422}));
  assert.doesNotMatch(message,/private|token|secret|400|supabase/i);
  assert.equal(v20SafeError(locale,{status:'400'}),v20SafeError(locale));
 }
 assert.equal(translations.size,6);
});

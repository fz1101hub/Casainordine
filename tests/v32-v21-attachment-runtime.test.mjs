import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the real openAttachment body with mocked browser and Storage boundaries.
const source = readFileSync(new URL('../app/V21Hub.jsx', import.meta.url), 'utf8');
const body = source.match(/async function openAttachment\(id\)\{([\s\S]*?)\n \}/)?.[1];
assert.ok(body, 'openAttachment implementation found');

function harness({popupBlocked=false,missingDocument=false,missingClient=false}={}) {
 let resolveSigned;
 const pending = new Promise(resolve => { resolveSigned = resolve; });
 const events = [];
 const context = {userId:'account-a',homeId:'home-a'};
 const popup = {opener:'initial',close(){events.push('close')},location:{replace(url){events.push(['open',url])}}};
 const sandbox = {
  URL,
  rows:{docs:missingDocument?[]:[{id:'doc-a',storage_path:'account-a/doc.pdf'}]},
  client:{storage:{from(bucket){assert.equal(bucket,'house-documents');return {createSignedUrl(path,seconds){
   assert.equal(path,'account-a/doc.pdf');assert.equal(seconds,60);return pending;
  }}}}},
  shareContextRef:{current:context},
  window:{open(){return popupBlocked?null:popup},location:{assign(url){events.push(['navigate',url])}}},
  onNotify(message){events.push(['notify',message])},
  briefingCopy:{operationFailed:'localized failure'}
 };
 if(missingClient)sandbox.client=null;
 const openAttachment=vm.runInNewContext('(async function openAttachment(id){'+body+'\n})',sandbox);
 return {openAttachment,resolveSigned,events,context};
}

test('signed attachment opens for the unchanged account and home',async()=>{
 const h=harness();const operation=h.openAttachment('doc-a');
 h.resolveSigned({data:{signedUrl:'https://example.invalid/signed'},error:null});
 await operation;
 assert.deepEqual(h.events,[['open','https://example.invalid/signed']]);
});

test('signed attachment is discarded after account switch',async()=>{
 const h=harness();const operation=h.openAttachment('doc-a');
 h.context.userId='account-b';
 h.resolveSigned({data:{signedUrl:'https://example.invalid/private'},error:null});
 await operation;
 assert.deepEqual(h.events,['close']);
});

test('signed attachment is discarded after home switch',async()=>{
 const h=harness();const operation=h.openAttachment('doc-a');
 h.context.homeId='home-b';
 h.resolveSigned({data:{signedUrl:'https://example.invalid/private'},error:null});
 await operation;
 assert.deepEqual(h.events,['close']);
});

test('stale Storage rejection does not notify the new context',async()=>{
 const h=harness();const operation=h.openAttachment('doc-a');
 h.context.userId='account-b';
 h.resolveSigned(Promise.reject(new Error('storage unavailable')));
 await operation;
 assert.deepEqual(h.events,['close']);
});

test('current Storage rejection gives localized feedback',async()=>{
 const h=harness();const operation=h.openAttachment('doc-a');
 h.resolveSigned(Promise.reject(new Error('storage unavailable')));
 await operation;
 assert.deepEqual(h.events,['close',['notify','localized failure']]);
});

test('Storage error response closes popup and notifies in current context',async()=>{
 const h=harness();const operation=h.openAttachment('doc-a');
 h.resolveSigned({data:null,error:{message:'denied'}});
 await operation;
 assert.deepEqual(h.events,['close',['notify','localized failure']]);
});

test('missing signed URL closes popup and notifies in current context',async()=>{
 const h=harness();const operation=h.openAttachment('doc-a');
 h.resolveSigned({data:{},error:null});
 await operation;
 assert.deepEqual(h.events,['close',['notify','localized failure']]);
});

test('stale Storage error response never notifies a different home',async()=>{
 const h=harness();const operation=h.openAttachment('doc-a');
 h.context.homeId='home-b';
 h.resolveSigned({data:null,error:{message:'denied'}});
 await operation;
 assert.deepEqual(h.events,['close']);
});

test('signed attachment is discarded after logout',async()=>{
 const h=harness();const operation=h.openAttachment('doc-a');
 h.context.userId=undefined;
 h.resolveSigned({data:{signedUrl:'https://example.invalid/private'},error:null});
 await operation;
 assert.deepEqual(h.events,['close']);
});

test('signed attachment is discarded when account and home both change',async()=>{
 const h=harness();const operation=h.openAttachment('doc-a');
 h.context.userId='account-b';h.context.homeId='home-b';
 h.resolveSigned({data:{signedUrl:'https://example.invalid/private'},error:null});
 await operation;
 assert.deepEqual(h.events,['close']);
});

test('missing signed URL after account switch does not notify',async()=>{
 const h=harness();const operation=h.openAttachment('doc-a');
 h.context.userId='account-b';
 h.resolveSigned({data:{},error:null});
 await operation;
 assert.deepEqual(h.events,['close']);
});


test('blocked popup navigates in the current tab only for unchanged context',async()=>{
 const h=harness({popupBlocked:true});const operation=h.openAttachment('doc-a');
 h.resolveSigned({data:{signedUrl:'https://example.invalid/signed'},error:null});
 await operation;
 assert.deepEqual(h.events,[['navigate','https://example.invalid/signed']]);
});

test('blocked popup never navigates after switching account',async()=>{
 const h=harness({popupBlocked:true});const operation=h.openAttachment('doc-a');
 h.context.userId='account-b';
 h.resolveSigned({data:{signedUrl:'https://example.invalid/private'},error:null});
 await operation;
 assert.deepEqual(h.events,[]);
});

test('blocked popup Storage error shows localized feedback in current context',async()=>{
 const h=harness({popupBlocked:true});const operation=h.openAttachment('doc-a');
 h.resolveSigned({data:null,error:{message:'denied'}});
 await operation;
 assert.deepEqual(h.events,[['notify','localized failure']]);
});

test('missing document returns without requesting signed URL or opening a tab',async()=>{
 const h=harness({missingDocument:true});await h.openAttachment('doc-a');
 assert.deepEqual(h.events,[]);
});

test('missing Supabase client returns without opening a tab',async()=>{
 const h=harness({missingClient:true});await h.openAttachment('doc-a');
 assert.deepEqual(h.events,[]);
});


test('unsafe javascript signed URL is rejected without navigation',async()=>{
 const h=harness();const operation=h.openAttachment('doc-a');
 h.resolveSigned({data:{signedUrl:'javascript:alert(1)'},error:null});
 await operation;
 assert.deepEqual(h.events,['close',['notify','localized failure']]);
});

test('insecure HTTP signed URL is rejected with blocked popup',async()=>{
 const h=harness({popupBlocked:true});const operation=h.openAttachment('doc-a');
 h.resolveSigned({data:{signedUrl:'http://example.invalid/private'},error:null});
 await operation;
 assert.deepEqual(h.events,[['notify','localized failure']]);
});

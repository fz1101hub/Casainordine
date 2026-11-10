import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { draftsFor, deviceAccountId } from '../lib/offline-queue.js';
const source=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('Bozze offline: ogni account vede solo le sue e quelle salvate senza accesso',()=>{
  const drafts=[{id:1,owner:'a'},{id:2,owner:'b'},{id:3,owner:null},{id:4}];
  assert.deepEqual(draftsFor(drafts,'a').map(d=>d.id),[1,3,4]);
  assert.deepEqual(draftsFor(drafts,'b').map(d=>d.id),[2,3,4]);
  assert.equal(draftsFor(drafts,undefined).length,4,'senza account (pagina offline) tutte');
});
test('Bozze offline: l’account si ricava dalla sessione salvata nel browser',()=>{
  const store=new Map([['altro','x'],['sb-abc-auth-token',JSON.stringify({user:{id:'u-1'}})]]);
  globalThis.localStorage={get length(){return store.size;},key:i=>[...store.keys()][i],getItem:k=>store.get(k)??null};
  try{
    assert.equal(deviceAccountId(),'u-1');
    store.set('sb-abc-auth-token','{rotto');
    assert.equal(deviceAccountId(),null);
    store.delete('sb-abc-auth-token');
    assert.equal(deviceAccountId(),null);
  }finally{delete globalThis.localStorage;}
});
test('Bozze offline: la copia per la pagina offline è identica e la cache del service worker è aggiornata',()=>{
  const lib=source('lib/offline-queue.js').split('\n').slice(1).join('\n');
  const pub=source('public/offline-standalone.js').split('\n').slice(1).join('\n');
  assert.equal(pub,lib);
  assert.match(source('lib/offline-queue.js'),/owner:deviceAccountId\(\)/);
  assert.match(source('public/sw.js'),/const CACHE='casa-shell-v40';/);
  const hub=source('app/V20Hub.jsx');
  assert.equal((hub.match(/listDrafts\(user\?\.id\)/g)||[]).length,2);
  assert.doesNotMatch(hub,/listDrafts\(\)/);
});

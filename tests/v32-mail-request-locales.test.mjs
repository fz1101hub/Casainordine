import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {translate,LANGUAGES} from '../lib/i18n.mjs';

const source=readFileSync(new URL('../app/MailImporter.jsx',import.meta.url),'utf8');
test('mail importer localizes unauthenticated and failed API fallback errors',()=>{
 assert.match(source,/tr\('mail\.sessionExpired'\)/);
 assert.match(source,/tr\('mail\.operationFailed'\)/);
 assert.match(source,/const request=\(path,method,payload\)=>mailRequest\(client,path,method,payload,tr,language\)/);
 assert.match(source,/localizeMailApiMessage\(result\.error,language\)/);
 assert.doesNotMatch(source,/throw new Error\('Sessione scaduta/);
 for(const {code} of LANGUAGES){
  for(const key of ['mail.sessionExpired','mail.operationFailed']){
   const value=translate(code,key);
   assert.ok(value.length>10,code+':'+key);
   assert.notEqual(value,key);
  }
 }
});

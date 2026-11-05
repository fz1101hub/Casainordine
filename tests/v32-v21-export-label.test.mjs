import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/V21Hub.jsx',import.meta.url),'utf8');

test('V21 JSON exports require localized button labels',()=>{
 assert.match(source,/function DownloadJson\\(\\{name,object,label\\}\\)/);
 assert.doesNotMatch(source,/label\\s*=\\s*['\"]Esporta JSON['\"]/);
 const calls=source.split('<DownloadJson ').slice(1);
 assert.equal(calls.length,3);
 for(const call of calls){
  const element=call.split('/>')[0];
  assert.match(element,/\\blabel=\\{briefingCopy\\.(?:exportDossier|exportList|exportSummary)\\}/);
 }
});

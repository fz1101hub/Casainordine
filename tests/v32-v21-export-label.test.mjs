import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/V21Hub.jsx',import.meta.url),'utf8');

test('V21 JSON export requires a localized accessible label',()=>{
 assert.match(source,/function DownloadJson\\(\\{name,object,label\\}\\)/);
 assert.doesNotMatch(source,/label\\s*=\\s*['\"]Esporta JSON['\"]/);
 const calls=source.match(/<DownloadJson\\b/g)||[];
 const labels=source.match(/<DownloadJson\\b[^>]*\\blabel=\\{briefingCopy\\.(?:exportDossier|exportList|exportSummary)\\}/gs)||[];
 assert.equal(calls.length,3);
 assert.equal(labels.length,calls.length);
});

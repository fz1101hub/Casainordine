import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/V21Hub.jsx',import.meta.url),'utf8');
test('V21 SOS and photo upload errors use localized copy, not provider exception text',()=>{
 assert.match(source,/async function offlineSos\([\s\S]*?catch\(e\)\{onNotify\(briefingCopy\.operationFailed\)\}/);
 assert.match(source,/async function uploadInventoryPhoto\([\s\S]*?catch\(e\)\{onNotify\(briefingCopy\.photoUploadFailed\)\}/);
 assert.doesNotMatch(source,/onNotify\([^)]*e\.message/);
});

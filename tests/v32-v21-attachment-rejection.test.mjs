import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/V21Hub.jsx',import.meta.url),'utf8');
test('V21 attachment signed URL handles rejected promises with localized feedback',()=>{
 const fn=source.match(/async function openAttachment\(id\)\{([\s\S]*?)\n \}/)?.[1];
 assert.ok(fn,'openAttachment function found');
 assert.match(fn,/try\s*\{/);
 assert.match(fn,/catch\s*\([^)]*\)\s*\{\s*onNotify\(briefingCopy\.operationFailed\)/);
 assert.match(fn,/if\(error\|\|!data\?\.signedUrl\)return onNotify\(briefingCopy\.operationFailed\)/);
 assert.doesNotMatch(fn,/onNotify\([^)]*\.message/);
});

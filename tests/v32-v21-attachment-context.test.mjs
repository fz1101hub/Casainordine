import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/V21Hub.jsx',import.meta.url),'utf8');
test('V21 attachment signed URLs cannot open after switching account or home',()=>{
 const start=source.indexOf('async function openAttachment(id)');
 const end=source.indexOf('async function uploadInventoryPhoto',start);
 assert.ok(start>=0&&end>start);
 const fn=source.slice(start,end);
 assert.match(fn,/attachmentContext=\{\.\.\.shareContextRef\.current\}/);
 assert.match(fn,/userId===attachmentContext\.userId/);
 assert.match(fn,/homeId===attachmentContext\.homeId/);
 const signed=fn.indexOf('createSignedUrl(');
 const stale=fn.indexOf('if(!stillCurrent())',signed);
 const navigate=fn.indexOf('popup.location.replace',signed);
 assert.ok(signed>=0&&stale>signed&&navigate>stale);
 assert.match(fn,/if\(!stillCurrent\(\)\)\{popup\?\.close\(\);return;\}/);
 assert.match(fn,/if\(stillCurrent\(\)\)onNotify/);
});

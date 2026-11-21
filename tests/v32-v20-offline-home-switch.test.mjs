import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/V20Hub.jsx',import.meta.url),'utf8');
const importBody=source.slice(source.indexOf('async function importDraft('),source.indexOf('function downloadDraft('));

test('V20 offline import keeps account and home context across confirmation and RPC',()=>{
 assert.match(source,/const activeHome=useRef\(homeId\)/);
 assert.match(source,/activeHome\.current=homeId/);
 assert.match(importBody,/const importHomeId=homeId/);
 assert.match(importBody,/const sameContext=\(\)=>activeAccount\.current===accountId&&activeHome\.current===importHomeId/);
 assert.match(importBody,/p_home_id:importHomeId/);
 assert.ok((importBody.match(/if\(!sameContext\(\)\)return/g)||[]).length>=4);
 assert.match(importBody,/catch\(e\)\{if\(sameContext\(\)\)/);
 assert.match(importBody,/finally\{if\(sameContext\(\)\)setWorking\(false\)/);
});

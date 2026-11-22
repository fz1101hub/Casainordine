import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/V20Hub.jsx',import.meta.url),'utf8');
const save=source.match(/async function save\(table,content,message,options=\{\}\)\{([\s\S]*?)\n \}\n async function change/);

test('V20 save captures account and home for the entire async write',()=>{
 assert.ok(save,'save function should be present');
 assert.match(save[1],/const accountId=user\.id,saveHomeId=homeId/);
 assert.match(save[1],/user_id:accountId,home_id:saveHomeId\|\|null/);
});

test('V20 save discards stale completion, error and refresh after a context switch',()=>{
 assert.ok(save);
 assert.match(save[1],/if\(!sameContext\(\)\)return null;\s*if\(error\)throw error/);
 assert.match(save[1],/await load\(\);\s*if\(!sameContext\(\)\)return null/);
 assert.match(save[1],/catch\(e\)\{if\(sameContext\(\)\)onNotify/);
 assert.match(save[1],/finally\{if\(sameContext\(\)\)setWorking\(false\)\}/);
});

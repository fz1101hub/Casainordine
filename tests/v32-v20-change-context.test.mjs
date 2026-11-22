import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/V20Hub.jsx',import.meta.url),'utf8');
const change=source.slice(source.indexOf(' async function change('),source.indexOf(' async function erase('));

test('V20 update captures original account and home before asynchronous mutation',()=>{
 assert.match(change,/const accountId=user\.id,changeHomeId=homeId/);
 assert.match(change,/activeAccount\.current===accountId&&activeHome\.current===changeHomeId/);
 assert.match(change,/changeHomeId\?query\.eq\('home_id',changeHomeId\):query\.eq\('user_id',accountId\)\.is\('home_id',null\)/);
 assert.doesNotMatch(change,/scopedMutation\(/);
});
test('V20 update ignores late responses and errors from a previous context',()=>{
 assert.match(change,/if\(!sameContext\(\)\)return;\s*if\(error\)throw error/);
 assert.match(change,/catch\(e\)\{if\(sameContext\(\)\)onNotify/);
 assert.match(change,/finally\{if\(sameContext\(\)\)setWorking\(false\)\}/);
});

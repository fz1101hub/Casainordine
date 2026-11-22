import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/V21Hub.jsx',import.meta.url),'utf8');
const remove=source.match(/async function remove\(table,id\)\{[\s\S]*?\n \}/)?.[0];

test('V21 delete captures account and home before asynchronous confirmation',()=>{
 assert.ok(remove,'delete handler exists');
 assert.ok(remove.indexOf('const accountId=user.id, targetHomeId=homeId||null')<remove.indexOf('await askConfirm'));
 assert.match(remove,/shareContextRef\.current\.userId!==accountId/);
 assert.match(remove,/shareContextRef\.current\.homeId\|\|null\)!==targetHomeId/);
});
test('V21 delete scopes its mutation to captured account/home, not current props',()=>{
 assert.ok(remove);
 assert.match(remove,/targetHomeId\?query\.eq\('home_id',targetHomeId\)/);
 assert.match(remove,/query\.eq\('user_id',accountId\)\.is\('home_id',null\)/);
 assert.doesNotMatch(remove,/scopedMutation\(client\.from\(table\)\.delete/);
});

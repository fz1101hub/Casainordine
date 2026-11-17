import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/V20Hub.jsx',import.meta.url),'utf8');

test('V20 personal reads are restricted to the active user and null home',()=>{
 assert.match(source,/const scope=\(q\)=>homeId\?q\.eq\('home_id',homeId\):q\.eq\('user_id',user\?\.id\)\.is\('home_id',null\)/);
});

test('V20 update and delete are scoped to active home/account',()=>{
 assert.match(source,/const scopedMutation=q=>homeId\?q\.eq\('home_id',homeId\):q\.eq\('user_id',user\?\.id\)\.is\('home_id',null\)/);
 assert.match(source,/scopedMutation\(client\.from\(table\)\.update\(patch\)\.eq\('id',id\)\)/);
 assert.match(source,/scopedMutation\(client\.from\(table\)\.delete\(\)\.eq\('id',id\)\)/);
 assert.doesNotMatch(source,/client\.from\(table\)\.delete\(\)\.eq\('id',id\);/);
});

test('V20 writes require a signed-in account',()=>{
 assert.match(source,/if\(!client\|\|!canWrite\|\|!user\?\.id\)return onNotify\(ui\.editPermissionRequired\)/);
 assert.match(source,/if\(!client\|\|!canWrite\|\|!user\?\.id\)return;setWorking\(true\)/);
});

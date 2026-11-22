import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/V20Hub.jsx',import.meta.url),'utf8');

test('V20 personal reads are restricted to the active user and null home',()=>{
 assert.match(source,/const scope=\(q\)=>homeId\?q\.eq\('home_id',homeId\):q\.eq\('user_id',user\?\.id\)\.is\('home_id',null\)/);
});

test('V20 update and delete are scoped to active home/account',()=>{
 assert.match(source,/changeHomeId\\?query\\.eq\\('home_id',changeHomeId\\):query\\.eq\\('user_id',accountId\\)\\.is\\('home_id',null\\)/);
 assert.match(source,/const accountId=user\.id, deletionHomeId=homeId/);
 assert.match(source,/if\(!\(await askConfirm\(ui\.confirmDelete,\{danger:true\}\)\)\|\|!sameContext\(\)\)return/);
 assert.match(source,/const query=client\.from\(table\)\.delete\(\)\.eq\('id',id\)/);
 assert.match(source,/deletionHomeId\?query\.eq\('home_id',deletionHomeId\):query\.eq\('user_id',accountId\)\.is\('home_id',null\)/);
});

test('V20 writes require a signed-in account',()=>{
 assert.match(source,/if\(!client\|\|!canWrite\|\|!user\?\.id\)return onNotify\(ui\.editPermissionRequired\)/);
 assert.match(source,/if\(!client\|\|!canWrite\|\|!user\?\.id\)return;/);
});

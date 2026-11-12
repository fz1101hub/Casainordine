import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/V21Hub.jsx',import.meta.url),'utf8');

test('V21 mutations are scoped to the selected personal or shared home',()=>{
 assert.match(source,/const scopedMutation=query=>homeId\?query\.eq\('home_id',homeId\):query\.eq\('user_id',user\?\.id\)\.is\('home_id',null\)/);
 assert.match(source,/scopedMutation\(client\.from\(table\)\.update\(patch\)\.eq\('id',id\)\)/);
 assert.match(source,/scopedMutation\(client\.from\(table\)\.delete\(\)\.eq\('id',id\)\)/);
 assert.match(source,/if\(!canWrite\|\|!user\?\.id\|\|!\(await askConfirm/);
});

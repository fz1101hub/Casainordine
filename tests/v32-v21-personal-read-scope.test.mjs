import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const source=readFileSync(fileURLToPath(new URL('../app/V21Hub.jsx',import.meta.url)),'utf8');

test('V21 personal reads constrain user and null home_id',()=>{
 assert.match(source,/const scope\s*=\s*q\s*=>\s*homeId\s*\?\s*q\.eq\('home_id',homeId\)\s*:\s*q\.eq\('user_id',user\?\.id\)\.is\('home_id',null\)/);
 assert.match(source,/scope\(client\.from\(tables\[k\]\)\.select\('\*'\)\)/);
});
test('V21 personal writes retain user scope',()=>{
 assert.match(source,/const scopedMutation\s*=\s*query\s*=>\s*homeId\s*\?\s*query\.eq\('home_id',homeId\)\s*:\s*query\.eq\('user_id',user\?\.id\)\.is\('home_id',null\)/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/V20Hub.jsx',import.meta.url),'utf8');

test('V20: scritture e cancellazioni vincolate al contesto casa/account',()=>{
 assert.match(source,/changeHomeId\\?query\\.eq\\('home_id',changeHomeId\\):query\\.eq\\('user_id',accountId\\)\\.is\\('home_id',null\\)/);
 assert.match(source,/deletionHomeId\?query\.eq\('home_id',deletionHomeId\):query\.eq\('user_id',accountId\)\.is\('home_id',null\)/);
});
test('V20: letture asincrone non aggiornano il contesto cambiato',()=>{
 assert.match(source,/seq!==loadSeq\.current\|\|activeAccount\.current!==accountId\|\|activeHome\.current!==homeId/);
 assert.match(source,/return \(\)=>\{loadSeq\.current\+=1;draftSeq\.current\+=1;\}/);
});

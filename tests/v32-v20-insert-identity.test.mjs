import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/V20Hub.jsx',import.meta.url),'utf8');

test('V20 insert uses captured account and home after payload spread',()=>{
  assert.match(source,/const accountId=user\.id,saveHomeId=homeId/);
  assert.match(source,/insert\(\{\.\.\.content,user_id:accountId,home_id:saveHomeId\|\|null\}\)/);
  assert.doesNotMatch(source,/insert\(\{user_id:accountId,home_id:saveHomeId\|\|null,\.\.\.content\}\)/);
});

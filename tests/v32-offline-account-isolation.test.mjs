import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/V20Hub.jsx',import.meta.url),'utf8');

test('V20 offline drafts are cleared and stale asynchronous results ignored on account change',()=>{
 assert.match(source,/let active=true;\s*setDrafts\(\[\]\);setOfflineError\(''\)/);
 assert.match(source,/tab==='offline'&&user\?\.id/);
 assert.match(source,/listDrafts\(user\.id\)\.then\(items=>\{if\(active\)setDrafts\(items\)\}\)/);
 assert.match(source,/catch\(\(\)=>\{if\(active\)setOfflineError/);
 assert.match(source,/return \(\)=>\{active=false\}/);
 assert.match(source,/\[tab,user\?\.id,language\]/);
});

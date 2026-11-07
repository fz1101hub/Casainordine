import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/V20Hub.jsx',import.meta.url),'utf8');

test('monitor alert read update is scoped to alert ID and authenticated recipient',()=>{
 const match=source.match(/client\.from\('user_alerts'\)\.update\(\{read_at:new Date\(\)\.toISOString\(\)\}\)([^;]+);/);
 assert.ok(match,'monitor alert update must exist');
 assert.match(match[1],/\.eq\('id',a\.id\)/);
 assert.match(match[1],/\.eq\('user_id',user\.id\)/);
});

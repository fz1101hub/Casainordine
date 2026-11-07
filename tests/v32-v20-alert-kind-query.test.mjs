import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/V20Hub.jsx',import.meta.url),'utf8');

test('V20 monitoring fetches all alert kinds shown in its panels',()=>{
 const match=source.match(/client\.from\('user_alerts'\)[\s\S]*?\.in\('kind',\[([^\]]+)\]\)/);
 assert.ok(match,'Expected an explicit user_alerts kind filter');
 const fetched=[...match[1].matchAll(/'([^']+)'/g)].map(m=>m[1]);
 for(const kind of ['missing_bill','mail_sync','fraud','move','savings']){
  assert.ok(fetched.includes(kind),`Missing displayed alert kind: ${kind}`);
 }
 assert.match(source,/\.eq\('user_id',user\.id\)\.in\('kind'/,'Alerts must remain scoped to the authenticated user');
});

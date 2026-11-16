import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/V20Hub.jsx',import.meta.url),'utf8');

test('V20 load captures account identity before async requests',()=>{
 assert.match(source,/const accountId=user\?\.id;/);
 assert.match(source,/if\(!client\|\|!accountId\)/);
});

test('V20 ignores async results from previous account before applying rows or notifications',()=>{
 const guard=source.indexOf('if(seq!==loadSeq.current||activeAccount.current!==accountId)return;');
 const notify=source.indexOf('const error=res.find(r=>r.error);',guard);
 const apply=source.indexOf('setRows(next);',guard);
 assert.ok(guard>0&&notify>guard&&apply>guard);
});

test('V20 does not start stale mail fetch after getSession resolves for a superseded load',()=>{
 const start=source.indexOf("client.auth.getSession().then(");
 const fetchAt=source.indexOf("fetch('/api/mail/connections'",start);
 const guard=source.indexOf("seq===loadSeq.current&&activeAccount.current===accountId&&session?.user?.id===accountId&&session?.access_token",start);
 assert.ok(start>=0&&guard>start&&fetchAt>guard,'session and load generation must be checked before HTTP fetch');
});

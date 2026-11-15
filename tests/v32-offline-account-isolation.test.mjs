import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/V20Hub.jsx',import.meta.url),'utf8');

test('V20 clears offline drafts and invalidates stale account-scoped loads',()=>{
 assert.match(source,/const draftSeq=useRef\(0\)/);
 assert.match(source,/const seq=\+\+draftSeq\.current;\s*setDrafts\(\[\]\);setOfflineError\(''\)/);
 assert.match(source,/tab==='offline'&&user\?\.id/);
 assert.match(source,/listDrafts\(user\.id\)\.then\(items=>\{if\(seq===draftSeq\.current\)setDrafts\(items\)\}/);
 assert.match(source,/return \(\)=>\{draftSeq\.current\+\+\}/);
 assert.match(source,/\[tab,user\?\.id,language\]/);
});

test('manual refresh discards late results and errors after a newer request or account change',()=>{
 assert.match(source,/async function refreshDrafts\(\)\{if\(tab!=='offline'\|\|!user\?\.id\)return;const seq=\+\+draftSeq\.current/);
 assert.match(source,/const accountId=user\.id;try\{const items=await listDrafts\(accountId\)/);
 assert.match(source,/if\(seq!==draftSeq\.current\)return;setDrafts\(items\)/);
 assert.match(source,/if\(seq===draftSeq\.current\)setOfflineError\(v20SafeError\(language\)\)/);
});

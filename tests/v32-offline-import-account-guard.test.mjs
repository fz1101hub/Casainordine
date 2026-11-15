import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/V20Hub.jsx',import.meta.url),'utf8');
const section=source.split('async function importDraft(d)')[1]?.split('function downloadDraft')[0];
test('offline import captures the account and checks it before destructive draft removal',()=>{
 assert.ok(section,'importDraft exists');
 assert.match(source,/activeAccount\.current=user\?\.id/);
 assert.match(section,/const accountId=user\.id/);
 assert.match(section,/if\(activeAccount\.current!==accountId\)return;\s*await removeDraft\(d\.id\)/);
 assert.match(section,/if\(activeAccount\.current!==accountId\)return;\s*await refreshDrafts\(\)/);
});
test('offline import suppresses stale success and error notifications',()=>{
 assert.match(section,/if\(activeAccount\.current!==accountId\)return;\s*onRefresh\(\);onNotify/);
 assert.match(section,/catch\(e\)\{if\(activeAccount\.current===accountId\)onNotify/);
});

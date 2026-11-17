import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/V20Hub.jsx',import.meta.url),'utf8');

test('offline draft initial read rejects responses from previous account',()=>{
 assert.match(source,/const accountId=user\.id;\s*listDrafts\(accountId\)/);
 assert.match(source,/seq===draftSeq\.current&&activeAccount\.current===accountId\)setDrafts\(items\)/);
 assert.match(source,/seq===draftSeq\.current&&activeAccount\.current===accountId\)setOfflineError/);
});

test('offline draft refresh rejects responses and errors from previous account',()=>{
 assert.match(source,/if\(seq!==draftSeq\.current\|\|activeAccount\.current!==accountId\)return;setDrafts\(items\)/);
 assert.match(source,/catch\(e\)\{if\(seq===draftSeq\.current&&activeAccount\.current===accountId\)setOfflineError/);
});

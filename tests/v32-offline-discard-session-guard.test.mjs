import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/V20Hub.jsx',import.meta.url),'utf8');

test('V20 offline discard checks account and home after asynchronous confirmation',()=>{
  const start=source.indexOf('title={ui.discardDraft}');
  assert.notEqual(start,-1,'offline discard control must exist');
  const action=source.slice(start,start+650);
  assert.match(action,/const accountId=user\?\.id;const currentHome=homeId/);
  assert.match(action,/await askConfirm\(ui\.confirmDiscardDraft/);
  assert.match(action,/activeAccount\.current!==accountId\|\|activeHome\.current!==currentHome\)return;await removeDraft\(d\.id\)/);
  assert.match(action,/activeAccount\.current===accountId&&activeHome\.current===currentHome\)await refreshDrafts\(\)/);
});

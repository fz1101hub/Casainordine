import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../app/V20Hub.jsx', import.meta.url), 'utf8');

test('V20 offline import completion does not reset working state of another account', () => {
  const start = source.indexOf('async function importDraft(d)');
  const end = source.indexOf('function downloadDraft(d)', start);
  assert.ok(start >= 0 && end > start, 'offline import handler must exist');
  const handler = source.slice(start, end);
  assert.match(handler, /const accountId=user\.id/);
  assert.match(handler, /if\(activeAccount\.current!==accountId\)return/);
  assert.match(handler, /finally\s*\{\s*if\(activeAccount\.current===accountId\)setWorking\(false\)/);
  assert.doesNotMatch(handler, /finally\s*\{\s*setWorking\(false\)/);
});

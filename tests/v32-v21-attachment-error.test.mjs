import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../app/V21Hub.jsx', import.meta.url), 'utf8');

test('V21 attachment link failures use localized copy without exposing provider details', () => {
  const method = source.match(/async function openAttachment\(id\)\{([\s\S]*?)\}\s*async function uploadInventoryPhoto/);
  assert.ok(method, 'attachment handler must exist');
  assert.match(method[1], /if\(error\|\|!data\?\.signedUrl\)return onNotify\(briefingCopy\.operationFailed\)/);
  assert.doesNotMatch(method[1], /onNotify\(error\.message\)/);
  assert.match(method[1], /window\.open\(data\.signedUrl/);
});

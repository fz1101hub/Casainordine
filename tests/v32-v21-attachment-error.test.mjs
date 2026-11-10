import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../app/V21Hub.jsx', import.meta.url), 'utf8');

test('V21 attachment link failures use localized copy without exposing provider details', () => {
  const method = source.match(/async function openAttachment\(id\)\{([\s\S]*?)\}\s*async function uploadInventoryPhoto/);
  assert.ok(method, 'attachment handler must exist');
  assert.match(method[1], /if\(error\|\|!data\?\.signedUrl\)\{popup\?\.close\(\);return onNotify\(briefingCopy\.operationFailed\);\}/);
  assert.doesNotMatch(method[1], /onNotify\(error\.message\)/);
  // v3.3: la scheda si apre subito nel tocco (Safari su iPhone blocca window.open dopo un await).
  assert.match(method[1], /popup\.location\.replace\(data\.signedUrl\)/);
  assert.ok(method[1].indexOf("window.open('about:blank'") < method[1].indexOf('await '), 'window.open prima di qualsiasi await');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../app/MailImporter.jsx', import.meta.url), 'utf8');

test('mail list loads invalidate stale responses on language change and unmount', () => {
  assert.match(source, /useRef\(0\)/);
  assert.match(source, /const generation = \+\+loadGeneration\.current/);
  assert.match(source, /if\(generation !== loadGeneration\.current\)return/);
  assert.match(source, /if\(generation === loadGeneration\.current\)notify\(e\.message\)/);
  assert.match(source, /if\(generation === loadGeneration\.current\)setLoading\(false\)/);
  assert.match(source, /return \(\)=>\{loadGeneration\.current\+\+;\}/);
  assert.match(source, /\[client,refresh,language\]/);
});

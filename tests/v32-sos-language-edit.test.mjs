import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../app/V21Hub.jsx', import.meta.url), 'utf8');

test('SOS suggestion retains previous language while editing and updates after edit ends', () => {
  assert.match(source, /if\(!sosEditing\)previousSosDefault\.current=briefingCopy\.defaultSosTitle/);
  assert.match(source, /previous!==briefingCopy\.defaultSosTitle&&!sosEditing/);
  assert.match(source, /current\.title===previous\?\{\.\.\.current,title:briefingCopy\.defaultSosTitle\}:current/);
  assert.match(source, /\[briefingCopy\.defaultSosTitle,sosEditing\]/);
});

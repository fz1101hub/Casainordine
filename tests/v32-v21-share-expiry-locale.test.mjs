import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source = readFileSync(new URL('../app/V21Hub.jsx', import.meta.url), 'utf8');

test('V21 renders temporary-share expiry with the active user locale and Rome timezone', () => {
  assert.match(source, /const\s*\{[^}]*\blocale\b[^}]*\}\s*=\s*useLanguage\(\)/);
  assert.match(source, /new Intl\.DateTimeFormat\(locale,\{dateStyle:'short',timeStyle:'short',timeZone:'Europe\/Rome'\}\)\.format\(new Date\(s\.expires_at\)\)/);
  assert.doesNotMatch(source, /new Date\(s\.expires_at\)\.toLocaleString\(['"]it-IT['"]/);
});

test('V21 never displays an invalid temporary-share expiry as Invalid Date', () => {
  assert.match(source, /Number\.isFinite\(Date\.parse\(s\.expires_at\)\)/);
});

test('V21 suggested SOS title comes from recipient language and preserves custom text', () => {
  assert.match(source, /title:briefingCopy\.defaultSosTitle/);
  assert.match(source, /current\.title===previous\?\{\.\.\.current,title:briefingCopy\.defaultSosTitle\}:current/);
  assert.match(source, /!sosEditing/);
});

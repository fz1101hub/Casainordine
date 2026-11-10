import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('V21 shared vacation expiry does not render Invalid Date for missing or malformed timestamps', () => {
 const source=readFileSync(new URL('../app/V21Hub.jsx',import.meta.url),'utf8');
 assert.match(source,/s\.expires_at && Number\.isFinite\(Date\.parse\(s\.expires_at\)\)/);
 assert.match(source,/new Date\(s\.expires_at\)\.toLocaleString\(locale\) : '—'/);
 assert.doesNotMatch(source,/<small>\{new Date\(s\.expires_at\)\.toLocaleString\(locale\)\}<\/small>/);
});

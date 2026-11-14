import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('V21 shared vacation expiry does not render Invalid Date for missing or malformed timestamps', () => {
 const source=readFileSync(new URL('../app/V21Hub.jsx',import.meta.url),'utf8');
 assert.match(source,/formatV20Timestamp\(s\.expires_at,locale\)/);
 assert.doesNotMatch(source,/new Intl\.DateTimeFormat\(locale,\{dateStyle:'short'/);
 assert.doesNotMatch(source,/<small>\{new Date\(s\.expires_at\)\.toLocaleString\(locale\)\}<\/small>/);
});

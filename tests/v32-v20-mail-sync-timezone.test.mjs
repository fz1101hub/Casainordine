import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/V20Hub.jsx',import.meta.url),'utf8');

test('V20 mail synchronization timestamps use profile locale and Rome timezone',()=>{
 assert.match(source,/new Date\(c\.last_sync_at\)\.toLocaleString\(locale,\{timeZone:'Europe\/Rome'\}\)/);
 assert.doesNotMatch(source,/new Date\(c\.last_sync_at\)\.toLocaleString\('it-IT'/);
});

test('Rome timestamp formatting remains locale-dependent without changing the instant',()=>{
 const instant=new Date('2026-01-15T12:34:00Z');
 const italian=instant.toLocaleString('it-IT',{timeZone:'Europe/Rome'});
 const english=instant.toLocaleString('en-GB',{timeZone:'Europe/Rome'});
 assert.ok(italian.includes('13:34'));
 assert.ok(english.includes('13:34'));
 assert.equal(instant.toISOString(),'2026-01-15T12:34:00.000Z');
});

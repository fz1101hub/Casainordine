import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/MailImporter.jsx',import.meta.url),'utf8');
test('mail payment matching options format bill due dates using active locale',()=>{
 assert.match(source,/\{date\(b\.due_date\)\}<\/option>/);
 assert.doesNotMatch(source,/\{b\.due_date\}<\/option>/);
});
test('mail document suggestions format due dates using active locale and preserve unknown fallback',()=>{
 assert.match(source,/date:d\.suggestion\.due_date\?date\(d\.suggestion\.due_date\):tr\('mail\.unknownDue'\)/);
});

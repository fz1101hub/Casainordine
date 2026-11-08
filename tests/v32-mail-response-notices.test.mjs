import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app/MailImporter.jsx',import.meta.url),'utf8');
test('mail disconnect success uses localized copy, not arbitrary API notice',()=>{
 assert.match(source,/notify\(tr\('mail\.disconnectDone'\)\)/);
 assert.doesNotMatch(source,/notify\(result\.notice/);
});
test('payment confirmation and rejection never render raw API warning',()=>{
 assert.match(source,/notify\(tr\(action==='confirm'\?'mail\.confirmedPayment':'mail\.rejectedPayment'\)\)/);
 assert.doesNotMatch(source,/notify\(result\.warning/);
});

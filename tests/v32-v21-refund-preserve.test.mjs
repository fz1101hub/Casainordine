import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source = readFileSync(new URL('../app/V21Hub.jsx', import.meta.url), 'utf8');

test('V21 refund form awaits save before resetting user input', () => {
  assert.match(source, /onSubmit=\{async e=>\{e\.preventDefault\(\);const saved=await add\('home_refund_expectations'/);
  assert.match(source, /if\(saved\)setRefund\(\{label:'',expected_amount:'',expected_on:todayRome\(\),bill_id:''\}\)/);
  assert.doesNotMatch(source, /add\('home_refund_expectations'[^\n]*;setRefund\(/);
});

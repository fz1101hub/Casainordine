import test from 'node:test';
import assert from 'node:assert/strict';
import {formatMailDate} from '../lib/mail-date.mjs';

for (const locale of ['it-IT','en-US','es-ES','fr-FR','de-DE','pt-PT']) {
  test('mail date renders calendar day in '+locale,()=>{
    const expected=new Intl.DateTimeFormat(locale,{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date('2026-01-02T12:00:00Z'));
    assert.equal(formatMailDate('2026-01-02',locale,'unknown'),expected);
  });
}
test('invalid, empty and impossible mail dates use fallback',()=>{
  for(const input of [null,undefined,'','not a date','2026-02-30','2026-13-01'])
    assert.equal(formatMailDate(input,'it-IT','unknown'),'unknown');
});
test('date-only values do not shift under western time zones',()=>{
  const result=formatMailDate('2026-01-02','en-US','unknown');
  assert.match(result,/02/);
});

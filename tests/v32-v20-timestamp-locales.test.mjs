import test from 'node:test';
import assert from 'node:assert/strict';
import {formatV20Timestamp,formatV20Date} from '../lib/v20-timestamp.mjs';

const locales=['it-IT','en-GB','es-ES','fr-FR','de-DE','pt-PT'];

test('V20 timestamp and date render in each supported locale with Rome timezone',()=>{
  const instant=new Date('2026-03-29T22:30:00Z');
  for(const locale of locales){
    assert.equal(formatV20Timestamp('2026-03-29T22:30:00Z',locale),
      instant.toLocaleString(locale,{timeZone:'Europe/Rome'}),locale);
    assert.equal(formatV20Date('2026-03-29T22:30:00Z',locale),
      instant.toLocaleDateString(locale,{timeZone:'Europe/Rome'}),locale);
  }
});

test('V20 rejects invalid and ambiguous provider dates rather than normalizing them',()=>{
  for(const value of ['2026-02-30','2025-02-29','2026-13-01','2026-00-01',
    '2026-01-00','2026-04-31','2026-01-01T24:00:00Z',
    '2026-01-01T23:60:00Z','2026-01-01T12:30:60Z',
    '2026-01-01T12:30:00+14:30','2026-01-01T12:30:00+15:00',
    '2026-01-01T12:30:00','03/04/2026','',null,42]){
    assert.equal(formatV20Timestamp(value,'it-IT','invalid'),'invalid',String(value));
  }
  assert.notEqual(formatV20Timestamp('2024-02-29','it-IT'),'—');
  assert.notEqual(formatV20Timestamp('2000-02-29','it-IT'),'—');
  assert.equal(formatV20Timestamp('1900-02-29','it-IT'),'—');
});

test('V20 respects explicit offset and does not mutate the source timestamp',()=>{
  const value='2026-10-25T02:30:00+02:00';
  const expected=new Date(value).toLocaleString('de-DE',{timeZone:'Europe/Rome'});
  assert.equal(formatV20Timestamp(value,'de-DE'),expected);
  assert.equal(value,'2026-10-25T02:30:00+02:00');
});

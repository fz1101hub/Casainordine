import test from 'node:test';
import assert from 'node:assert/strict';
import { LANGUAGES, formatDate, formatMoney, localeFor } from '../lib/i18n.mjs';

// Date-only values represent calendar days, not instants in the browser timezone.
// In particular, DST boundaries must never move a due date to the previous day.
test('date-only rendering is stable at European daylight-saving boundaries', () => {
 const dates=['2026-03-28','2026-03-29','2026-03-30','2026-10-24','2026-10-25','2026-10-26'];
 for (const {code} of LANGUAGES) {
  for (const iso of dates) {
   const expected=new Intl.DateTimeFormat(localeFor(code),{
    day:'numeric',month:'short',year:'numeric',timeZone:'UTC'
   }).format(new Date(iso+'T12:00:00Z'));
   assert.equal(formatDate(iso,code),expected,code+' '+iso);
  }
 }
});

test('calendar date and amount formatters never mutate caller values', () => {
 for (const {code} of LANGUAGES) {
  const date='2026-10-25';
  const amount='1234.50';
  assert.notEqual(formatDate(date,code),'—');
  assert.notEqual(formatMoney(amount,code),'—');
  assert.equal(date,'2026-10-25');
  assert.equal(amount,'1234.50');
 }
});

test('invalid dates and non-decimal monetary strings are rejected for every locale', () => {
 for (const {code} of LANGUAGES) {
  for (const date of ['2026-02-29','2026-04-31','2026-13-01','2026-00-01'])
   assert.equal(formatDate(date,code),'—',code+' '+date);
  for (const amount of ['0x10','1e3','Infinity','NaN','', '  '])
   assert.equal(formatMoney(amount,code),'—',code+' '+amount);
 }
});

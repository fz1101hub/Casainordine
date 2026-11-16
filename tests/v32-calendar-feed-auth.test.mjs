import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source = readFileSync(new URL('../app/CalendarFeed.jsx', import.meta.url), 'utf8');

test('calendar feed checks session generation before sending requests', () => {
  const beforeFetch = source.split("fetch('/api/calendar/feed'")[0];
  assert.match(beforeFetch, /authTicket!==authGeneration\.current/);
});

test('calendar feed never sends an empty bearer token', () => {
  assert.match(source, /if\(!session\?\.access_token\)throw new Error/);
  assert.match(source, /Authorization:`Bearer \$\{session\.access_token\}`/);
  assert.doesNotMatch(source, /session\?\.access_token\|\|''/);
});

test('calendar clipboard callbacks do not notify a different authenticated session', () => {
  assert.match(source, /const ticket=authGeneration\.current;const secret=url/);
  assert.match(source, /clipboard\.writeText\(secret\)\.then\(\(\)=>\{if\(ticket===authGeneration\.current\)onNotify/);
  assert.match(source, /\.catch\(\(\)=>\{if\(ticket===authGeneration\.current\)onNotify\(t\('calendar\.copyFailed'\)\)/);
});

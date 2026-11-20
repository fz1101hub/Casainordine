import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const callback = readFileSync(new URL('../app/api/mail/callback/route.js', import.meta.url), 'utf8');

test('OAuth callback uses stable status codes, not untranslated prose or provider errors', () => {
  for (const status of ['invalid_state','expired','other_browser','denied','failed','no_refresh','connected']) {
    assert.match(callback, new RegExp("redirect\\('"+status+"'\\s*,\\s*request\\)"));
  }
  assert.match(callback, /encodeURIComponent\(status\)/);
  assert.doesNotMatch(callback, /searchParams\.get\(['"]error['"]\)[^\n]*redirect\(url\.searchParams/);
});

test('OAuth callback clears state cookie and prevents caching on all redirects', () => {
  assert.match(callback, /'Set-Cookie':clearOauthStateCookie\(\)/);
  assert.match(callback, /'Cache-Control':'no-store'/);
  assert.match(callback, /status:303/);
});

test('OAuth callback consumes state once and retains browser/account binding', () => {
  assert.match(callback, /\.from\('mail_oauth_states'\)\.delete\(\)/);
  assert.match(callback, /hashState\(state\)/);
  assert.match(callback, /binding==='mismatch'/);
  assert.match(callback, /mailboxMatchesAccount\(account\?\.user,email\)/);
  assert.match(callback, /user_id:pending\.user_id/);
});

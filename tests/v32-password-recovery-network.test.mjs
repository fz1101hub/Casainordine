import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../app/AccountSecurity.jsx', import.meta.url), 'utf8');

test('recupero password: errori di rete e API mostrano lo stesso messaggio localizzato', () => {
  const dialog = source.split('export function PasswordRecoveryDialog')[1]?.split('export function DeleteAccountPanel')[0];
  assert.ok(dialog, 'PasswordRecoveryDialog deve esistere');
  assert.match(dialog, /try\s*\{[\s\S]*client\.auth\.updateUser\(\{ password \}\)/);
  assert.match(dialog, /if \(err\)\s*\{\s*setError\(t\('account\.passwordFailed'\)\)/);
  assert.match(dialog, /catch\s*\{\s*[\s\S]*?setError\(t\('account\.passwordFailed'\)\)/);
  assert.match(dialog, /finally\s*\{\s*setPending\(false\)/);
  assert.match(dialog, /onDone\(t\('account\.passwordSaved'\)\)/);
});

test('richiesta reset: risposta neutra indipendentemente dalla registrazione', () => {
  const reset = source.split('export function ForgotPasswordButton')[1]?.split('export function PasswordRecoveryDialog')[0];
  assert.ok(reset);
  assert.match(reset, /resetPasswordForEmail/);
  assert.match(reset, /onMessage\(t\('account\.resetSent'\)\)/);
});

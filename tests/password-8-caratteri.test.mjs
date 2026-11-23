import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MIN_PASSWORD_LENGTH, passwordTooShort, markPasswordUpgrade, clearPasswordUpgrade, needsPasswordUpgrade } from '../lib/password-policy.mjs';
import { TRANSLATIONS as messages } from '../lib/i18n.mjs';

const memory = () => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };

test('la regola è 8 caratteri', () => {
  assert.equal(MIN_PASSWORD_LENGTH, 8);
  assert.equal(passwordTooShort('1234567'), true);
  assert.equal(passwordTooShort('12345678'), false);
  assert.equal(passwordTooShort(undefined), true);
});

test('la richiesta di cambiare password vale solo per l’indirizzo che ha fatto l’accesso', () => {
  const s = memory();
  markPasswordUpgrade(s, ' Anna@Example.com ');
  assert.equal(needsPasswordUpgrade(s, 'anna@example.com'), true);
  assert.equal(needsPasswordUpgrade(s, 'marco@example.com'), false);
  clearPasswordUpgrade(s);
  assert.equal(needsPasswordUpgrade(s, 'anna@example.com'), false);
  // Storage non disponibile (navigazione privata, permessi): nessun errore.
  const broken = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } };
  markPasswordUpgrade(broken, 'a@b.it'); clearPasswordUpgrade(broken);
  assert.equal(needsPasswordUpgrade(broken, 'a@b.it'), false);
});

test('registrazione, recupero e cambio chiedono 8 caratteri; l’accesso non blocca le password vecchie', () => {
  const page = readFileSync(new URL('../app/page.jsx', import.meta.url), 'utf8');
  const account = readFileSync(new URL('../app/AccountSecurity.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /minLength=\{6\}/);
  assert.match(page, /minLength=\{signup\?MIN_PASSWORD_LENGTH:undefined\}/);
  assert.match(page, /signup && passwordTooShort\(password\)/);
  assert.match(page, /setRecovery\('upgrade'\)/);
  assert.match(account, /minLength=\{MIN_PASSWORD_LENGTH\}/);
  assert.match(account, /passwordTooShort\(password\)/);
});

test('i testi dicono 8 caratteri in tutte le lingue', () => {
  for (const key of ['auth.passwordHint', 'auth.passwordTooShort', 'account.passwordUpgrade', 'account.newPassword']) {
    for (const [lang, dict] of Object.entries(messages)) {
      assert.match(String(dict[key] || ''), /8/, `${key} in ${lang}`);
    }
  }
});

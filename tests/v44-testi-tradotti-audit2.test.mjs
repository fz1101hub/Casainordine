// Secondo audit, S9-S11: testi scritti in italiano nel codice, pagina della vacanza condivisa ed
// errori tecnici del database mostrati così come arrivano.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LANGUAGES, translate, acceptedLanguage } from '../lib/i18n.mjs';
import { friendlyError, friendlyErrorKey } from '../lib/friendly-error.mjs';
import { publicError } from '../lib/public-error.mjs';
const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const NEW_KEYS = ['mail.status.connected', 'mail.status.denied', 'mail.status.expired', 'mail.status.otherBrowser', 'mail.status.noRefresh', 'mail.status.failed',
  'import.pdfTruncated', 'import.readingRatePlan', 'import.preparing', 'import.readingEmailBill', 'import.senderHintExact', 'import.senderHintDomain', 'import.senderAuthFailed',
  'home.extraUnavailable', 'home.shoppingUpdated', 'home.shoppingFailed', 'sample.failed',
  'share.vacation.metaTitle', 'share.vacation.heading', 'share.vacation.intro', 'share.vacation.validUntil', 'share.vacation.unavailable', 'share.vacation.emergency',
  'errors.generic', 'errors.permission', 'errors.duplicate', 'errors.invalidData', 'errors.migration', 'errors.network'];

test('Nuovi testi presenti e diversi dall’italiano nelle altre 5 lingue', () => {
  for (const key of NEW_KEYS) {
    const it = translate('it', key);
    assert.notEqual(it, key, key);
    for (const { code } of LANGUAGES.filter(l => l.code !== 'it')) {
      const value = translate(code, key);
      assert.ok(value && value !== key, `${code}: ${key}`);
      if (!/^Casa in Ordine/.test(it)) assert.notEqual(value, it, `${code}: ${key} è ancora in italiano`);
      const tokens = s => (s.match(/\{[a-z][a-zA-Z0-9]*\}/g) || []).sort().join();
      assert.equal(tokens(value), tokens(it), `${code}: ${key} segnaposto`);
    }
  }
});

test('Lingua della pagina condivisa dall’intestazione Accept-Language', () => {
  assert.equal(acceptedLanguage('de-CH,de;q=0.9,en;q=0.8'), 'de');
  assert.equal(acceptedLanguage('zh-CN,fr;q=0.5,en;q=0.7'), 'en', 'conta il peso q');
  assert.equal(acceptedLanguage('pt-BR'), 'pt');
  assert.equal(acceptedLanguage('ja,ko'), 'it');
  assert.equal(acceptedLanguage(''), 'it');
  assert.equal(acceptedLanguage(null), 'it');
  assert.equal(acceptedLanguage('es;q=0,fr'), 'fr', 'q=0 vuol dire «no»');
  const page = source('app/vacanza/[token]/page.jsx');
  assert.match(page, /acceptedLanguage\(\(await headers\(\)\)\.get\('accept-language'\)\)/);
  assert.match(page, /export async function generateMetadata/);
  assert.doesNotMatch(page, /Condivisione temporanea|Questa condivisione|numeri di emergenza/);
  assert.match(page, /referrer:'no-referrer'/);
  assert.match(page, /robots:\{index:false,follow:false\}/);
});

test('Errori del database: messaggio tradotto, dettaglio solo in console', () => {
  const quiet = console.error; console.error = () => {};
  try {
    const tr = key => translate('en', key);
    assert.equal(friendlyErrorKey({ code: '42501', message: 'new row violates row-level security policy' }), 'errors.permission');
    assert.equal(friendlyErrorKey({ message: 'new row violates row-level security policy for table "bills"' }), 'errors.permission');
    assert.equal(friendlyErrorKey({ code: '23505' }), 'errors.duplicate');
    assert.equal(friendlyErrorKey({ code: '23514' }), 'errors.invalidData');
    assert.equal(friendlyErrorKey({ code: 'PGRST205' }), 'errors.migration');
    assert.equal(friendlyErrorKey(new TypeError('Failed to fetch')), 'errors.network');
    assert.equal(friendlyErrorKey({ code: 'XX000', message: 'boom' }), 'errors.generic');
    assert.equal(friendlyError({ code: '42501', message: 'permission denied for table bills' }, tr), 'You do not have permission for this action.');
    assert.equal(friendlyError(publicError('Messaggio dell’app'), tr), 'Messaggio dell’app');
    // I messaggi dei controlli del database sono in italiano: si vedono solo con l'app in italiano.
    const guard = { code: 'P0001', message: 'Impossibile cambiare la casa di un elemento' };
    assert.equal(friendlyError(guard, key => translate('it', key)), 'Impossibile cambiare la casa di un elemento');
    assert.equal(friendlyError(guard, tr), 'The operation failed: please try again.');
  } finally { console.error = quiet; }
});

test('Nei componenti non restano i testi e gli errori grezzi corretti', () => {
  const page = source('app/page.jsx'), home = source('app/PersonalizedHome.jsx'), sample = source('app/SampleAccountSetup.jsx');
  for (const text of ['Casella email collegata!', 'Lettura del piano rate…', 'Preparazione del documento…', 'Lettura della bolletta ricevuta via email…',
    'PDF lungo:', 'Mittente associato in passato', 'Attenzione: autenticazione del mittente']) assert.ok(!page.includes(text), text);
  assert.doesNotMatch(page, /notify\(error\.message\)/);
  for (const text of ['Alcuni dati non sono disponibili', 'Lista della spesa aggiornata.', 'Non è stato possibile aggiornare la lista.', 'aria-label="Modifica la tua Home"'])
    assert.ok(!home.includes(text), text);
  assert.ok(!sample.includes('Errore durante la preparazione.'));
  assert.match(page, /function mailStatusMessage\(status,tr\)\{return tr\(MAIL_STATUS\[status\]\|\|'mail\.status\.failed'\);\}/);
});

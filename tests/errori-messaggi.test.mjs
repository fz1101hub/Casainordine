// Messaggi d'errore per chi usa l'app: una sola classificazione (lib/friendly-error.mjs) per tutta
// l'app e un codice per ogni risposta d'errore delle API, tradotto dal browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { friendlyErrorKey, friendlyError, apiErrorText, apiText, authErrorKey, appError, shownError, ITALIAN_GENERIC } from '../lib/friendly-error.mjs';
import { translate } from '../lib/i18n.mjs';
import { fraudFlagText } from '../lib/v20-core.mjs';

const tFor = lang => (key, params) => translate(lang, key, params);
const en = tFor('en'), it = tFor('it');

test('Codici del database e stati HTTP → messaggio comprensibile', () => {
  const cases = [
    [{ code: '42501' }, 'permission'], [{ status: 403 }, 'permission'], [{ message: 'new row violates row-level security policy' }, 'permission'],
    [{ code: '23505' }, 'duplicate'], [{ code: '23503' }, 'dependency'], [{ code: '23514' }, 'invalidData'], [{ code: '22P02' }, 'invalidData'],
    [{ status: 422 }, 'invalidData'], [{ code: '42P01' }, 'migration'], [{ code: 'PGRST205' }, 'migration'], [{ status: 501 }, 'migration'],
    [{ code: 'PGRST116' }, 'notFound'], [{ status: 410 }, 'notFound'], [{ status: 401 }, 'auth'], [{ status: 429 }, 'rate'],
    [{ status: 424 }, 'unavailable'], [{ status: 503 }, 'unavailable'], [{ status: 507 }, 'storage'], [{ code: '55P03' }, 'locked'],
    [{ status: 409 }, 'conflict'], [{ status: 412 }, 'conflict'], [{ code: '57014' }, 'timeout'], [{ status: 504 }, 'timeout'],
    [{ status: 413 }, 'size'], [{ status: 415 }, 'format'], [{ message: 'TypeError: Failed to fetch' }, 'network'], [{ status: 0 }, 'network'],
    [{ code: 'XX000', message: 'internal detail' }, 'generic'], [null, 'generic']
  ];
  for (const [error, category] of cases) assert.equal(friendlyErrorKey(error), 'errors.' + category, JSON.stringify(error));
});

test('Il testo tecnico non arriva mai a chi usa l’app', () => {
  const original = console.error; console.error = () => {};
  try {
    assert.equal(friendlyError({ code: 'XX000', message: 'relation "secret_table" does not exist' }, en), translate('en', 'errors.generic'));
    assert.equal(friendlyError({ code: '23505', message: 'duplicate key value violates unique constraint "x"' }, it), translate('it', 'errors.duplicate'));
    // I controlli del database (P0001) sono in italiano: si mostrano solo con l'app in italiano.
    assert.equal(friendlyError({ code: 'P0001', message: 'La casa ha già un proprietario' }, it), 'La casa ha già un proprietario');
    assert.equal(friendlyError({ code: 'P0001', message: 'La casa ha già un proprietario' }, en), translate('en', 'errors.generic'));
  } finally { console.error = original; }
  assert.equal(translate('it', 'errors.generic'), ITALIAN_GENERIC);
});

test('Errori dell’app: chiave del dizionario o testo già tradotto', () => {
  assert.equal(friendlyError(appError('ocr.tooLarge'), en), translate('en', 'ocr.tooLarge'));
  assert.equal(friendlyError(appError('csv.rowInvalid', { row: 4 }), tFor('de')), 'Zeile 4: Betrag oder Datum ungültig');
  assert.equal(friendlyError(shownError('Testo pronto'), en), 'Testo pronto');
});

test('Risposte d’errore delle API: codice → testo nella lingua dell’app', () => {
  assert.equal(apiErrorText({ error: 'syncMissing' }, en), 'Mailbox not found');
  assert.equal(apiErrorText({ error: 'syncMissing' }, tFor('fr')), 'Boîte mail introuvable');
  // Codice sconosciuto, testo libero o niente: messaggio di riserva, mai il testo ricevuto.
  assert.equal(apiErrorText({ error: 'nonEsiste' }, en, 'mail.operationFailed'), translate('en', 'mail.operationFailed'));
  assert.equal(apiErrorText({ error: 'Error: connect ECONNREFUSED 10.0.0.1:5432' }, en), translate('en', 'errors.generic'));
  assert.equal(apiErrorText({}, en), translate('en', 'errors.generic'));
  assert.equal(apiText('connectionsGoogle', tFor('de')), translate('de', 'api.connectionsGoogle'));
  assert.equal(apiText('', en), '');
  assert.equal(apiText(undefined, en), '');
});

test('Accesso: gli errori di Supabase Auth hanno un messaggio per ogni lingua', () => {
  assert.equal(authErrorKey({ code: 'invalid_credentials' }), 'auth.error.invalidCredentials');
  assert.equal(authErrorKey({ code: 'user_already_exists' }), 'auth.error.userExists');
  assert.equal(authErrorKey({ code: 'weak_password' }), 'auth.error.weakPassword');
  assert.equal(authErrorKey({ code: 'email_not_confirmed' }), 'auth.error.emailNotConfirmed');
  assert.equal(authErrorKey({ status: 429 }), 'auth.error.rateLimit');
  assert.equal(authErrorKey({ message: 'Failed to fetch' }), 'errors.network');
  assert.equal(authErrorKey({ message: 'Something odd' }), 'auth.error.generic');
});

test('Segnali di possibile frode: testo per id, importo nella lingua dell’app', () => {
  const money = value => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);
  assert.equal(fraudFlagText({ id: 'new_sender' }, tFor('de')), translate('de', 'fraud.new_sender'));
  assert.match(fraudFlagText({ id: 'high_amount' }, tFor('de'), 80, money), /80,00\s€/);
  assert.equal(fraudFlagText({ id: 'high_amount' }, en, null), translate('en', 'fraud.high_amountPlain'));
  assert.equal(fraudFlagText({ id: 'vecchio', label: 'Etichetta salvata' }, en), 'Etichetta salvata');
});

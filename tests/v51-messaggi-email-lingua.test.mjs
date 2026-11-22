import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mailStartMessage, mailApiMessageKey, mailApiMessage } from '../lib/mail-api-i18n.mjs';
import { safeMailApiMessage } from '../lib/mail-api-errors.mjs';

const LANGS = ['it', 'en', 'es', 'fr', 'de', 'pt'];
const source = readFileSync(new URL('../lib/mail-api-i18n.mjs', import.meta.url), 'utf8');
const KEYS = [...source.matchAll(/^\s+(\w+): \[/gm)].map(m => m[1]);

test('Le chiavi dei messaggi email sono state trovate', () => {
  assert.ok(KEYS.length > 40, `trovate ${KEYS.length} chiavi`);
});

test('Un messaggio già tradotto dal server resta visibile nel browser, in ogni lingua', () => {
  // Prima di questa correzione il browser riconosceva solo i testi italiani:
  // chi usava l'app in inglese vedeva «Operazione non riuscita» al posto del motivo.
  for (const key of KEYS) for (const lang of LANGS) {
    const fromServer = mailStartMessage(key, lang);
    // Il punto finale può differire dalla vecchia tabella italiana: conta il testo.
    const bare = text => String(text).replace(/\.$/, '');
    assert.equal(bare(safeMailApiMessage(fromServer, lang)), bare(fromServer), `${key} ${lang}`);
  }
});

test('Se il server risponde in un’altra lingua, il browser mostra quella scelta nell’app', () => {
  assert.equal(safeMailApiMessage(mailStartMessage('syncMissing', 'it'), 'en'), 'Mailbox not found');
  assert.equal(safeMailApiMessage(mailStartMessage('syncFailure', 'en'), 'de'), mailApiMessage('syncFailure', 'de'));
  assert.equal(mailApiMessageKey('Mailbox not found.'), 'syncMissing');
});

test('I testi sconosciuti (per esempio errori grezzi del provider) restano nascosti', () => {
  for (const raw of ['ECONNRESET imap.gmail.com:993', 'invalid_grant', '', '   ']) {
    assert.equal(safeMailApiMessage(raw, 'en'), null, raw);
    assert.equal(mailApiMessageKey(raw), null, raw);
  }
  assert.equal(mailApiMessage('toString', 'en'), null);
  assert.equal(mailApiMessage('__proto__', 'en'), null);
});

test('In tedesco i messaggi email danno del tu, come il resto dell’app', () => {
  for (const key of KEYS) {
    const text = mailStartMessage(key, 'de');
    assert.doesNotMatch(text, /\b(Sie|Ihr|Ihre|Ihres|Ihren|Ihrem)\b/, `${key}: ${text}`);
  }
});

test('In francese e portoghese i messaggi email usano il registro formale dell’app', () => {
  assert.match(mailStartMessage('login', 'fr'), /Connectez-vous/);
  assert.match(mailStartMessage('login', 'pt'), /Inicie sessão/);
});

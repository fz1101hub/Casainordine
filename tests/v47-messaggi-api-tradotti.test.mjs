// Secondo audit, S11 (seconda parte): i messaggi d'errore delle API che l'app mostra (caselle
// email, notifiche, calendario, chiave di integrazione) arrivano tradotti nelle 6 lingue.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { safeMailApiMessage } from '../lib/mail-api-errors.mjs';
import { localizeSettingsApiError } from '../lib/settings-api-errors.mjs';

const root = new URL('..', import.meta.url).pathname;
const LANGS = ['en', 'es', 'fr', 'de', 'pt'];
function files(dir) {
  return readdirSync(join(root, dir)).flatMap(name => {
    const path = join(dir, name);
    return statSync(join(root, path)).isDirectory() ? files(path) : /\.(js|mjs)$/.test(name) ? [path] : [];
  });
}
function messages(paths, patterns) {
  const found = new Set();
  for (const file of paths) {
    const text = readFileSync(join(root, file), 'utf8');
    for (const pattern of patterns) for (const match of text.matchAll(pattern)) found.add(match[1]);
  }
  return [...found];
}
const ERROR_PATTERNS = [/json\(\{ ?error: ?'([^']+)'/g, /failure\([a-zA-Z]+, ?'([^']+)'/g, /publicError\('([^']+)'/g];

test('Ogni messaggio delle API delle caselle email ha la traduzione nelle 5 lingue', () => {
  const mail = messages([...files('app/api/mail'), 'lib/mail-providers.mjs', 'lib/mail-imap.mjs'], ERROR_PATTERNS);
  assert.ok(mail.length > 30, `trovati ${mail.length} messaggi`);
  const missing = [];
  for (const message of mail) for (const lang of LANGS) {
    const translated = safeMailApiMessage(message, lang);
    if (!translated || translated === message) missing.push(`${lang}: ${message}`);
  }
  assert.deepEqual(missing, []);
});

test('Ogni messaggio delle API di notifiche, calendario e integrazione ha la traduzione', () => {
  const settings = messages(['app/api/push/subscribe/route.js', 'app/api/calendar/feed/route.js', 'app/api/integration-key/route.js'], ERROR_PATTERNS);
  assert.ok(settings.length >= 8, `trovati ${settings.length} messaggi`);
  const missing = [];
  for (const message of settings) for (const lang of LANGS)
    if (localizeSettingsApiError(message, lang) === message) missing.push(`${lang}: ${message}`);
  assert.deepEqual(missing, []);
});

test('I messaggi sconosciuti non si mostrano grezzi', () => {
  assert.equal(safeMailApiMessage('relation "mail_connections" does not exist', 'en'), null);
  const page = readFileSync(join(root, 'app/page.jsx'), 'utf8');
  assert.match(page, /throw new Error\(payload\.error\?localizeSettingsApiError\(payload\.error,language\):tr\('errors\.generic'\)\)/);
});

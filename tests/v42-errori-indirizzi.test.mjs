// Secondo audit, S1 e S6: al browser arrivano solo messaggi generici (i dettagli tecnici restano nei
// log) e i link delle email e del collegamento delle caselle non portano mai a http://localhost.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { failure, publicError, publicAppUrl, PRODUCTION_URL } from '../lib/server.mjs';
import { validateMailboxInput } from '../lib/mail-providers.mjs';

const root = new URL('..', import.meta.url).pathname;
function files(dir) {
  return readdirSync(join(root, dir)).flatMap(name => {
    const path = join(dir, name);
    return statSync(join(root, path)).isDirectory() ? files(path) : /\.(js|jsx|mjs)$/.test(name) ? [path] : [];
  });
}

test('failure: messaggio generico al browser, dettaglio nei log', async () => {
  const logged = [], original = console.error;
  console.error = (...args) => logged.push(args.join(' '));
  try {
    const response = failure(new Error('MAIL_TOKEN_ENCRYPTION_KEY deve essere una chiave casuale'), 'Impossibile avviare il collegamento.', 500, 'mail/start');
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'Impossibile avviare il collegamento.' });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(logged.join('\n'), /\[mail\/start\] MAIL_TOKEN_ENCRYPTION_KEY/);
  } finally { console.error = original; }
});

test('failure: gli errori pensati per chi usa l’app passano, come richiesta non valida', async () => {
  const response = failure(publicError('Indirizzo email non valido.'), 'generico', 500);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Indirizzo email non valido.' });
  assert.throws(() => validateMailboxInput({ provider: 'nessuno' }), e => e.public === true);
});

test('Nessuna API restituisce al browser il messaggio interno di un errore', () => {
  const leaks = [];
  for (const file of files('app/api')) {
    const text = readFileSync(join(root, file), 'utf8');
    // Il cron è eccezione voluta: risponde solo a Vercel o Supabase Cron, già autorizzati.
    if (file.includes('api/cron/route.js') || file.includes('api/mail/cron/route.js')) continue;
    for (const pattern of [/json\(\{\s*error:\s*(e|err|error)\.message/, /json\(\{\s*error:\s*String\((e|err|error)\.message\)/])
      if (pattern.test(text)) leaks.push(file);
  }
  assert.deepEqual(leaks, []);
});

test('publicAppUrl: APP_URL https, poi l’indirizzo della richiesta, mai localhost per sbaglio', () => {
  assert.equal(publicAppUrl({ url: 'https://altro.example/api/cron' }, 'https://casa.example/'), 'https://casa.example');
  assert.equal(publicAppUrl({ url: 'https://casainordine-git-x.vercel.app/api/cron' }, ''), 'https://casainordine-git-x.vercel.app');
  assert.equal(publicAppUrl({ url: 'https://casa.example/x' }, 'http://casa.example'), 'https://casa.example', 'APP_URL senza https non vale');
  assert.equal(publicAppUrl({ url: 'http://localhost:3000/api/cron' }, undefined), 'http://localhost:3000', 'prova in locale');
  assert.equal(publicAppUrl({ url: 'http://evil.example/x' }, undefined), PRODUCTION_URL);
  assert.equal(publicAppUrl(undefined, undefined), PRODUCTION_URL);
});

test('Nessun link di ripiego verso http://localhost:3000 nel codice dell’app', () => {
  const found = files('app').filter(file => readFileSync(join(root, file), 'utf8').includes("'http://localhost:3000'"));
  assert.deepEqual(found, []);
  const cron = readFileSync(join(root, 'app/api/cron/route.js'), 'utf8');
  assert.match(cron, /const appUrl = publicAppUrl\(request\);/);
  assert.match(cron, /emailReminder\(profile\.email,bill,languagePreference\?\.language\|\|'it',appUrl\)/);
  assert.match(cron, /emailSummary\(profile\.email,items,today,languagePreference\?\.language\|\|'it',appUrl\)/);
  const callback = readFileSync(join(root, 'app/api/mail/callback/route.js'), 'utf8');
  assert.doesNotMatch(callback, /redirect\('[a-z_]+'\)/, 'ogni ritorno usa l’indirizzo della richiesta');
});

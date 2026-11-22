import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatTimestampForDevice, formatV20Timestamp } from '../lib/v20-timestamp.mjs';
import { translate } from '../lib/i18n.mjs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const labels = { italyLabel: 'ora italiana', deviceLabel: 'ora del dispositivo' };
const at = (value, timeZone, locale = 'it-IT') => formatTimestampForDevice(value, locale, { ...labels, timeZone });

test('In Italia (o con la stessa ora) resta una sola ora, senza etichette', () => {
  const value = '2026-11-22T17:35:00Z';
  assert.equal(at(value, 'Europe/Rome'), formatV20Timestamp(value, 'it-IT'));
  assert.equal(at(value, 'Europe/Berlin'), formatV20Timestamp(value, 'it-IT'));
  assert.doesNotMatch(at(value, 'Europe/Rome'), /ora italiana/);
});

test('All’estero mostra l’ora italiana e quella del dispositivo, ciascuna con la sua etichetta', () => {
  const value = '2026-11-22T17:35:00Z';
  const text = at(value, 'Europe/London');
  const italian = formatV20Timestamp(value, 'it-IT');
  const local = new Date(value).toLocaleTimeString('it-IT', { timeZone: 'Europe/London' });
  assert.equal(text, `${italian} (ora italiana) · ${local} (ora del dispositivo)`);
  assert.match(text, /18:35/);
  assert.match(text, /17:35/);
});

test('Se al dispositivo è un altro giorno, l’ora del dispositivo ha anche la data', () => {
  // 03:30 del 22 novembre in Italia = 21:30 del 21 novembre a New York.
  const text = at('2026-11-22T02:30:00Z', 'America/New_York');
  assert.match(text, /^22\/11\/2026, 03:30:00 \(ora italiana\) · /);
  assert.match(text, /21\/11\/2026, 21:30:00 \(ora del dispositivo\)$/);
});

test('Funziona anche con l’ora legale e nelle altre lingue', () => {
  const summer = at('2026-07-15T10:00:00Z', 'Asia/Tokyo', 'en-GB');
  assert.match(summer, /12:00:00 \(ora italiana\)/);
  assert.match(summer, /19:00:00 \(ora del dispositivo\)$/);
});

test('Casi limite: senza etichette, fuso sconosciuto, data senza ora, valore non valido', () => {
  const value = '2026-11-22T17:35:00Z';
  assert.equal(formatTimestampForDevice(value, 'it-IT', { timeZone: 'Europe/London' }), formatV20Timestamp(value, 'it-IT'));
  assert.equal(at(value, 'Marte/Base'), formatV20Timestamp(value, 'it-IT'));
  assert.equal(at(value, null), formatV20Timestamp(value, 'it-IT'));
  assert.equal(at('2026-11-22', 'America/New_York'), formatV20Timestamp('2026-11-22', 'it-IT'));
  assert.equal(formatTimestampForDevice('non è una data', 'it-IT', { ...labels, fallback: 'Mai', timeZone: 'Europe/London' }), 'Mai');
  assert.equal(formatTimestampForDevice(undefined, 'it-IT', { ...labels, timeZone: 'Europe/London' }), '—');
});

test('Le etichette esistono nelle 6 lingue', () => {
  for (const lang of ['it', 'en', 'es', 'fr', 'de', 'pt']) {
    for (const key of ['time.italy', 'time.device']) {
      const text = translate(lang, key);
      assert.ok(text && text !== key, `${lang} ${key}`);
    }
  }
  assert.equal(translate('en', 'time.italy'), 'Italian time');
  assert.equal(translate('de', 'time.device'), 'Gerätezeit');
});

test('Cronologia, caselle email, bozze e link temporanei usano l’ora con il dispositivo', () => {
  const v20 = read('app/V20Hub.jsx'), v21 = read('app/V21Hub.jsx');
  assert.match(v20, /const stamp=\(value,fallback\)=>formatTimestampForDevice\(value,locale,\{fallback,italyLabel:t\('time\.italy'\),deviceLabel:t\('time\.device'\)\}\)/);
  assert.match(v21, /const stamp=\(value,fallback\)=>formatTimestampForDevice\(value,locale,\{fallback,italyLabel:tr\('time\.italy'\),deviceLabel:tr\('time\.device'\)\}\)/);
  assert.doesNotMatch(v20 + v21, /formatV20Timestamp\(/);
});

test('La pagina condivisa calcola l’ora del dispositivo solo nel browser', () => {
  const page = read('app/vacanza/[token]/page.jsx');
  const device = read('app/vacanza/[token]/DeviceTimestamp.jsx');
  assert.match(page, /<DeviceTimestamp value=\{String\(shared\.expires_at\)\}/);
  assert.match(page, /italyLabel=\{t\('time\.italy'\)\} deviceLabel=\{t\('time\.device'\)\}/);
  assert.match(device, /^'use client';/);
  // Prima resta il testo del server (ora italiana); l'ora del dispositivo arriva dopo il caricamento.
  assert.match(device, /useState\(italian\)/);
  assert.match(device, /useEffect\(\(\) => \{\n\s+setText\(formatTimestampForDevice\(/);
});

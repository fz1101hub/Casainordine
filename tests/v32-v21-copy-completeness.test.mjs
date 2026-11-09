import test from 'node:test';
import assert from 'node:assert/strict';
import { v21BriefingCopy } from '../lib/v21-briefing-copy.mjs';

const languages = ['it', 'en', 'es', 'fr', 'de', 'pt'];
const reference = v21BriefingCopy('it');
const keys = Object.keys(reference);

test('V21 copy has a nonempty translation for every key in all six languages', () => {
  assert.ok(keys.length > 100, 'unexpectedly small V21 translation catalogue');
  for (const language of languages) {
    const copy = v21BriefingCopy(language);
    assert.deepEqual(Object.keys(copy), keys, language);
    for (const key of keys) {
      assert.equal(typeof copy[key], 'string', language + ':' + key);
      assert.ok(copy[key].trim(), language + ':' + key);
    }
  }
});

test('V21 interpolated placeholders match Italian source in each locale', () => {
  const placeholders = value => [...value.matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g)]
    .map(match => match[1]).sort();
  assert.deepEqual(placeholders('Promemoria {name} del {date}'), ['date', 'name']);
  for (const language of languages.slice(1)) {
    const copy = v21BriefingCopy(language);
    for (const key of keys) {
      assert.deepEqual(placeholders(copy[key]), placeholders(reference[key]),
        language + ':' + key);
    }
  }
});

test('unknown language falls back to Italian without missing keys', () => {
  assert.deepEqual(v21BriefingCopy('xx'), reference);
});

test('V21 translations do not contain broken interpolation markers', () => {
  // A misspelled or half-written marker would otherwise appear verbatim in UI.
  const marker = /\{[^{}]*\}/g;
  assert.equal('Promemoria {name'.replace(/\{[a-zA-Z][a-zA-Z0-9_]*\}/g, '').includes('{'), true);
  assert.equal('Promemoria {name}'.replace(/\{[a-zA-Z][a-zA-Z0-9_]*\}/g, '').includes('{'), false);
  for (const language of languages) {
    const copy = v21BriefingCopy(language);
    for (const key of keys) {
      const value = copy[key];
      const withoutValidMarkers = value.replace(/\{[a-zA-Z][a-zA-Z0-9_]*\}/g, '');
      assert.equal(withoutValidMarkers.includes('{') || withoutValidMarkers.includes('}'), false,
        language + ':' + key + ' has an incomplete or invalid marker');
      assert.equal((value.match(marker) || []).length,
        (value.match(/\{[a-zA-Z][a-zA-Z0-9_]*\}/g) || []).length,
        language + ':' + key);
    }
  }
});

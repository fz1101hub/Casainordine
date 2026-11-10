import test from 'node:test';
import assert from 'node:assert/strict';
import {formatMailDate} from '../lib/mail-date.mjs';

for (const locale of ['it-IT','en-GB','es-ES','fr-FR','de-DE','pt-PT']) {
  test(`lowercase-t ISO timestamps validate calendar days in ${locale}`, () => {
    assert.equal(formatMailDate('2026-02-30t12:00:00Z', locale, '—'), '—');
    assert.equal(formatMailDate('2025-02-29t12:00:00+01:00', locale, '—'), '—');
    assert.notEqual(formatMailDate('2024-02-29t12:00:00Z', locale, '—'), '—');
  });
}

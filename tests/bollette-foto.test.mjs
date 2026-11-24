// Bollette fotografate (scelta dell'utente, 24 novembre 2026): errori tipici della lettura delle foto
// che la lettura dei campi ora tollera. La prova con le foto vere nel browser è scripts/prove-foto.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractBillFields, ocrLineFixes } from '../lib/document-import.mjs';

test('spazio dentro la data dopo la barra', () => {
  assert.equal(ocrLineFixes('Scadenza 18/ 12/2026'), 'Scadenza 18/12/2026');
  assert.equal(ocrLineFixes('Scadenza 18 /12 / 2026'), 'Scadenza 18/12/2026');
  assert.equal(extractBillFields('Lumen Casa\nTotale da pagare 156,20 €\nScadenza 18/ 12/2026').due_date, '2026-12-18');
});

test('virgola letta come spazio, solo accanto all\'euro e con due cifre', () => {
  assert.equal(extractBillFields('GasNord\nTOTALE DA PAGARE € 112 50\nScadenza 15/12/2026').amount, 112.5, 'prima 112');
  assert.equal(extractBillFields('GasNord\nTotale da pagare 112 50 €\nScadenza 15/12/2026').amount, 112.5);
  assert.equal(ocrLineFixes('€ 1.234 56'), '€ 1.234,56');
  // Migliaia con lo spazio, date e numeri di telefono restano come sono.
  for (const line of ['€ 1 234', 'tel 06 12 34 56', '€ 30 15/12/2026', 'Periodo 01/09/2026 - 31/10/2026', 'IBAN IT60 X054 2811 1010 0000 0123 456'])
    assert.equal(ocrLineFixes(line), line);
});

test('POD con la I letta come 1, l o |', () => {
  for (const pod of ['1T001E12345678', 'lT001E12345678', '|T001E12345678']) assert.equal(extractBillFields(`POD ${pod}`).pod, 'IT001E12345678');
  assert.equal(extractBillFields('Codice 21T001E12345678').pod, null, 'non dentro un altro numero');
});

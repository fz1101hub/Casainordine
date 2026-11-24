// Bollette lette dai PDF (scelta dell'utente, 24 novembre 2026): importo, scadenza, periodo, consumo,
// POD e PDR su bollette di esempio con le impaginazioni tipiche dei fornitori italiani
// (tests/fixtures/bollette-esempio.mjs). Ogni bolletta diventa un PDF vero, letto con pdfjs come
// nell'app (pageText di lib/document-reader.js), poi con extractBillFields.
// Prima di questa prova: 36 campi giusti su 62 (date in lettere, periodo, consumo, POD e PDR mancanti).
import test from 'node:test';
import assert from 'node:assert/strict';
import { BOLLETTE } from './fixtures/bollette-esempio.mjs';
import { extractBillFields, wordDatesToNumbers } from '../lib/document-import.mjs';
import { pageText } from '../lib/document-reader.js';
import { textPdf, columnsPdf } from '../scripts/text-pdf.mjs';

async function pdfText(bytes) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: false, disableFontFace: true, verbosity: 0 });
  try { return pageText((await (await (await task.promise).getPage(1)).getTextContent()).items); }
  finally { await task.destroy(); }
}

for (const bill of BOLLETTE) {
  test(`PDF: ${bill.name}`, async () => {
    const text = await pdfText(bill.columns ? columnsPdf(bill.columns) : textPdf(bill.lines));
    const got = extractBillFields(text);
    for (const [field, expected] of Object.entries(bill.expected)) {
      if (field === 'warning') assert.ok(got.warnings.includes(expected), `${field}: ${got.warnings.join(', ')}`);
      else assert.deepEqual(got[field] ?? null, expected, `${field} (testo letto: ${JSON.stringify(text).slice(0, 300)})`);
    }
  });
}

test('date in lettere: maiuscole, abbreviazioni con il punto, «1°»; non le parole qualsiasi', () => {
  assert.equal(wordDatesToNumbers('Scadenza 1 Gennaio 2027'), 'Scadenza 01/01/2027');
  assert.equal(wordDatesToNumbers('entro il 1° set. 2026'), 'entro il 01/09/2026');
  assert.equal(wordDatesToNumbers('dal 9 GEN 2027 al 28 feb 2027'), 'dal 09/01/2027 al 28/02/2027');
  assert.equal(wordDatesToNumbers('marzo 2026, mar 15'), 'marzo 2026, mar 15');
  assert.equal(wordDatesToNumbers('Tariffa 12 mesi 2026'), 'Tariffa 12 mesi 2026');
});

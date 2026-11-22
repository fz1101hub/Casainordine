// Lettura dei PDF: la libreria pdfjs-dist 6 non ha più destroy() sul documento, solo sul caricamento.
// Chiamarlo sul documento faceva fallire ogni PDF caricato (e svuotava in silenzio quelli delle email).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { captureProposal } from '../lib/capture.mjs';
import { extractBillFields } from '../lib/document-import.mjs';
import { textPdf } from '../scripts/text-pdf.mjs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('Si chiude il caricamento, non il documento', async () => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: textPdf(['Prova']), isEvalSupported: false, useSystemFonts: false, disableFontFace: true, verbosity: 0 });
  const doc = await task.promise;
  assert.equal(typeof task.destroy, 'function');
  assert.equal(typeof doc.destroy, 'undefined', 'se torna a esistere, si può usare di nuovo');
  await task.destroy();
  assert.match(read('lib/document-reader.js'), /finally\{await loading\.destroy\(\);\}/);
  assert.match(read('lib/mail-attachment.mjs'), /finally\{await task\.destroy\(\);\}/);
  assert.doesNotMatch(read('lib/document-reader.js') + read('lib/mail-attachment.mjs'), /(pdf|doc)\.destroy\(/);
});

test('Uno scontrino in PDF arriva alla proposta senza passare dall’OCR', async () => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: textPdf(['MediaWorld', 'Documento commerciale di vendita', '12/03/2026', 'Lavatrice Bosch', 'Modello: WGG244A0IT', 'Totale complessivo 499,00']), isEvalSupported: false, useSystemFonts: false, disableFontFace: true, verbosity: 0 });
  try {
    const page = await (await task.promise).getPage(1);
    const text = (await page.getTextContent()).items.map(item => item.str + (item.hasEOL ? '\n' : '')).join('');
    const proposal = captureProposal(text, extractBillFields(text), []);
    assert.equal(proposal.suggested, 'purchase');
    assert.equal(proposal.purchase.warranty_until, '2028-03-12');
  } finally { await task.destroy(); }
  // Testo leggibile su ogni pagina: niente OCR anche se manca una scadenza; se l'OCR non parte, resta il testo.
  const reader = read('lib/document-reader.js');
  assert.match(reader, /\(needsOcrRetry\(text,100\)&&\(thin\|\|unreadable\)\)\|\|\(planMode&&thin\)/);
  assert.match(reader, /catch\(error\)\{if\(!text\.replace\(\/\\s\/g,''\)\)throw error;\}/);
});

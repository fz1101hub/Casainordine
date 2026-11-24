import test from 'node:test';
import assert from 'node:assert/strict';
import {needsOcrRetry,preferOcrText,ocrFieldsScore,ocrReadingsDisagree} from '../lib/ocr-quality.mjs';

const good='Fornitore: Elettrica Verde S.r.l.\nEnergia elettrica\nTotale da pagare € 98,40\nScadenza pagamento: 20/11/2026';
const bad='Fornitore: Elettrica Verde S.r.l.\nBolletta energia\nCodice cliente 012345';
test('Runs a second OCR pass only when fields are missing or OCR is unclear',()=>{
  assert.equal(needsOcrRetry(good,90),false);
  assert.equal(needsOcrRetry(bad,90),true);
  assert.equal(needsOcrRetry(good,25),true);
  // Lettura solo discreta (foto piccola o compressa): un secondo passaggio, una cifra può essere sbagliata.
  assert.equal(needsOcrRetry(good,80),true);
});
test('Two readings with different amount or due date need checking',()=>{
  const misread=good.replace('98,40','93,40');
  assert.equal(ocrReadingsDisagree({text:good},{text:misread}),true);
  assert.equal(ocrReadingsDisagree({text:good},{text:good.replace('20/11/2026','26/11/2026')}),true);
  assert.equal(ocrReadingsDisagree({text:good},{text:good}),false);
  assert.equal(ocrReadingsDisagree({text:good},{text:bad}),false,'una lettura senza campi non è un disaccordo');
});
test('Prefers complete amount and date over a higher raw OCR confidence',()=>{
  assert.ok(ocrFieldsScore(good)>ocrFieldsScore(bad));
  assert.equal(preferOcrText({text:bad,confidence:90},{text:good,confidence:55}).text,good);
  assert.equal(preferOcrText({text:good,confidence:45},{text:bad,confidence:97}).text,good);
});

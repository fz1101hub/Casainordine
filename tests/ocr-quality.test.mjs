import test from 'node:test';
import assert from 'node:assert/strict';
import {needsOcrRetry,preferOcrText,ocrFieldsScore} from '../lib/ocr-quality.mjs';

const good='Fornitore: Elettrica Verde S.r.l.\nEnergia elettrica\nTotale da pagare € 98,40\nScadenza pagamento: 20/11/2026';
const bad='Fornitore: Elettrica Verde S.r.l.\nBolletta energia\nCodice cliente 012345';
test('Runs a second OCR pass only when fields are missing or OCR is unclear',()=>{
  assert.equal(needsOcrRetry(good,90),false);
  assert.equal(needsOcrRetry(bad,90),true);
  assert.equal(needsOcrRetry(good,25),true);
});
test('Prefers complete amount and date over a higher raw OCR confidence',()=>{
  assert.ok(ocrFieldsScore(good)>ocrFieldsScore(bad));
  assert.equal(preferOcrText({text:bad,confidence:90},{text:good,confidence:55}).text,good);
  assert.equal(preferOcrText({text:good,confidence:45},{text:bad,confidence:97}).text,good);
});

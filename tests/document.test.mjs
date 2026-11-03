import test from 'node:test';
import assert from 'node:assert/strict';
import {extractBillFields} from '../lib/document-import.mjs';

test('extracts Italian utility bill amount and payment due date',()=>{
  const result=extractBillFields(`Energia Verde S.p.A.\nEnergia elettrica POD IT00000\nData emissione 01/11/2026\nTotale da pagare € 1.234,56\nScadenza pagamento: 25/11/2026\nIVA e costi`);
  assert.equal(result.supplier,'Energia Verde S.p.A.');
  assert.equal(result.amount,1234.56);
  assert.equal(result.due_date,'2026-11-25');
  assert.equal(result.category,'Luce');
});
test('finds invoice fields on the next line',()=>{
  const result=extractBillFields('Fornitore: Acqua Locale srl\nServizio idrico\nTotale bolletta\n€ 46,90\nDa pagare entro\n13/12/2026');
  assert.equal(result.supplier,'Acqua Locale srl');
  assert.equal(result.amount,46.9);
  assert.equal(result.due_date,'2026-12-13');
  assert.equal(result.category,'Acqua');
});
test('does not invent missing amounts or payment due dates',()=>{
  const result=extractBillFields('Operatore Telecom\nFattura emessa in data 01/10/2026\nCodice cliente 3052382\nImponibile netto');
  assert.equal(result.amount,null);
  assert.equal(result.due_date,null);
  assert.ok(result.warnings.some(x=>x.includes('Scadenza')));
});
test('rejects impossible dates',()=>{
  const result=extractBillFields('Bolletta Gas\nTotale da pagare 58,90 €\nScadenza: 31/02/2027');
  assert.equal(result.due_date,null);
  assert.equal(result.amount,58.9);
});
test('chooses the amount, not the date, if both appear on one line',()=>{
  const result=extractBillFields('Fornitore: Casa Energia\nData emissione 02/11/2026 · Scadenza pagamento 25/11/2026\nTotale da pagare entro il 25/11/2026: € 90,05');
  assert.equal(result.amount,90.05);
  assert.equal(result.due_date,'2026-11-25');
});

test('ignores invoice issue dates and VAT when extracting due amount and date',()=>{
  const x=extractBillFields('Fornitore: Fornitore Casa\nData emissione 02/11/2026\nIVA € 7,60\nTotale da pagare: EUR 58,90\nScadenza pagamento: 26/11/2026');
  assert.equal(x.due_date,'2026-11-26');
  assert.equal(x.amount,58.9);
});
test('does not invent a selection when two different due dates share the best label',()=>{
  const x=extractBillFields('Energia Verde\nScadenza: 21/11/2026\nScadenza: 28/11/2026\nTotale da pagare € 99,80');
  assert.equal(x.due_date,null);
  assert.match(x.warnings.join(' '),/Più scadenze/i);
});
test('does not guess among different amount totals',()=>{
  const x=extractBillFields('Fornitore: Rete Casa\nScadenza pagamento: 28/11/2026\nTotale da pagare: € 55,00\nTotale da pagare: € 75,00');
  assert.equal(x.amount,null);
  assert.match(x.warnings.join(' '),/Più importi/i);
});
test('supports OCR spaced thousands and international decimal with currency',()=>{
  const a=extractBillFields('Fornitore: Gas Casa\nTotale da pagare € 1 234,56\nScadenza pagamento: 25/12/2026');
  const b=extractBillFields('Fornitore: Gas Casa\nTotale da pagare: 1234.56 EUR\nScadenza pagamento: 25/12/2026');
  assert.equal(a.amount,1234.56);assert.equal(b.amount,1234.56);
});
test('flags payment receipt and duplicate-risk payment reminder',()=>{
  const r=extractBillFields('Ricevuta di pagamento\nEnel Energia\nPagamento effettuato € 72,10');
  const s=extractBillFields('Sollecito di pagamento\nFornitore Casa\nTotale da pagare € 90,00\nScadenza 23/11/2026');
  assert.equal(r.documentType,'ricevuta');
  assert.equal(s.documentType,'sollecito');
  assert.ok(r.warnings.length>0&&s.warnings.length>0);
});

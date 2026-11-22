// Fase 2 · 3.3 — acquisizione unica: una foto o un PDF, la destinazione la sceglie la persona.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyCapture, receiptFields, purchaseFields, matchBill, captureProposal, addYears, LEGAL_WARRANTY_YEARS } from '../lib/capture.mjs';
import { extractBillFields } from '../lib/document-import.mjs';
import { MESSAGE_KEYS } from '../lib/i18n.mjs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const propose = (text, bills = []) => captureProposal(text, extractBillFields(text), bills);

const BILL = 'Enel Energia\nBolletta luce\nPeriodo di fatturazione 01/09/2026 - 31/10/2026\nTotale da pagare 84,50 €\nScadenza 25/11/2026\nPOD IT001E12345678';
const RECEIPT = 'Ricevuta di pagamento\nPagamento eseguito il 05/11/2026\nBeneficiario Enel Energia\nImporto 84,50 EUR\nCRO: 1234567890AB';
const PURCHASE = 'MediaWorld\nDocumento commerciale di vendita\n12/03/2026\nLavatrice Bosch\nModello: WGG244A0IT\nMatricola: FD9876543210\nTotale complessivo 499,00';

test('Proposta: bolletta, ricevuta o prova d’acquisto', () => {
  assert.equal(propose(BILL).suggested, 'bill');
  assert.equal(propose(RECEIPT).suggested, 'receipt');
  assert.equal(propose(PURCHASE).suggested, 'purchase');
  // Una bolletta che cita la garanzia resta una bolletta.
  assert.equal(classifyCapture(BILL + '\nGaranzia di continuità del servizio', {}), 'bill');
  assert.equal(classifyCapture('Kassenbon\nGarantie 2 Jahre\n12.03.2026', {}), 'purchase');
  assert.equal(classifyCapture('', {}), 'bill');
});

test('Prova d’acquisto: oggetto, modello, matricola, data e garanzia legale di 2 anni', () => {
  assert.deepEqual(purchaseFields(PURCHASE), { name: 'Lavatrice Bosch', model: 'WGG244A0IT', serial_number: 'FD9876543210', purchased_on: '2026-03-12', warranty_until: '2028-03-12' });
  assert.equal(LEGAL_WARRANTY_YEARS, 2);
  assert.equal(addYears('2024-02-29', 2), '2026-02-28');
  assert.equal(addYears('non è una data', 2), '');
  assert.deepEqual(purchaseFields('Scontrino senza data').purchased_on, '');
  // Senza riga di modello il nome resta da scrivere: il negozio non è l'oggetto.
  assert.equal(purchaseFields('MediaWorld\nScontrino\n12/03/2026\nTotale 20,00').name, '');
});

test('Ricevuta: data, importo, riferimento e bolletta da collegare', () => {
  const bills = [{ id: 'b1', amount: 84.5, supplier: 'Enel Energia', paid_at: null }, { id: 'b2', amount: 30, supplier: 'Acqua', paid_at: null }];
  const proposal = propose(RECEIPT, bills);
  assert.equal(proposal.receipt.reference, '1234567890AB');
  assert.equal(proposal.receipt.bill_id, 'b1');
  assert.equal(proposal.receipt.paid_on, '2026-11-05');
  assert.equal(proposal.receipt.amount, 84.5);
  // La data del pagamento, non la prima data del foglio (né la scadenza della bolletta).
  assert.equal(receiptFields('Bonifico del 01/10/2026\nEseguito il 03/10/2026\nImporto 12,00').paid_on, '2026-10-03');
  assert.equal(receiptFields('Paid on 2026-10-04\nAmount 9.90').amount, 9.9);
});

test('Collegamento alla bolletta solo se non ci sono dubbi', () => {
  const twins = [{ id: 'a', amount: 50, supplier: 'Luce Uno', paid_at: null }, { id: 'b', amount: 50, supplier: 'Gas Due', paid_at: null }];
  assert.equal(matchBill(twins, { amount: 50 }), '', 'due bollette con lo stesso importo: nessuna scelta');
  assert.equal(matchBill(twins, { amount: 50, supplier: 'Gas Due' }), 'b', 'il fornitore scioglie il dubbio');
  assert.equal(matchBill([{ id: 'p', amount: 50, paid_at: '2026-01-01' }], { amount: 50 }), '', 'una bolletta già pagata non si propone');
  assert.equal(matchBill(twins, { amount: 'x' }), '');
});

test('Niente viene scritto prima della conferma; ricevute e garanzie arrivano alla sezione giusta', () => {
  const page = read('app/page.jsx');
  // La lettura prepara solo la finestra di scelta.
  const reading = page.slice(page.indexOf('const proposal=captureProposal('), page.indexOf('function continueCapture'));
  assert.doesNotMatch(reading, /client\.from\(|\.insert\(/);
  assert.match(page, /setCapture\(\{file,fingerprint,extracted,choice:demo\?'bill':proposal\.suggested,\.\.\.proposal\}\)/);
  assert.match(page, /changePage\(c\.choice==='receipt'\?'payments':'maintenance'\)/);
  assert.match(page, /intent=\{captureIntent\} onIntentUsed=\{\(\)=>setCaptureIntent\(null\)\}/);
  assert.match(page, /disabled=\{demo&&kind!=='bill'\}/, 'senza account si salvano solo bollette');
  assert.match(page, /\(kind==='bill'\|\|capture\.suggested===kind\)&&facts/, 'i dati letti si mostrano solo dove hanno senso');
  // La logica si scarica solo quando si legge un documento.
  assert.match(page, /const \{captureProposal\}=await import\('\.\.\/lib\/capture\.mjs'\)/);
  const extra = read('app/HomeExtra.jsx');
  assert.match(extra, /docType:'ricevuta',billId:receipt\.bill_id/);
  assert.match(extra, /docType:'garanzia'/);
  assert.match(extra, /if\(!intent\)return;/);
});

test('Testi dell’acquisizione nelle 6 lingue', () => {
  for (const key of ['title', 'intro', 'suggested', 'bill', 'billHelp', 'receipt', 'receiptHelp', 'purchase', 'purchaseHelp', 'warrantyUntil', 'demoOnly', 'continue', 'review', 'keepFile'])
    assert.ok(MESSAGE_KEYS.includes('capture.' + key), key);
});

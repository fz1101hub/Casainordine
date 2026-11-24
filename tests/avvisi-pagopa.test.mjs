// Avvisi pagoPA (scelta dell'utente, 24 novembre 2026): codice avviso, ente, importo e scadenza da
// avvisi realistici e dai codici QR e Data Matrix. Con più pagamenti nello stesso avviso (TARI: rata
// unica o rate) nessuna scelta automatica: si propongono le opzioni.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePagoPA } from '../lib/v20-core.mjs';
import { AVVISI } from './fixtures/avvisi-pagopa.mjs';

for (const avviso of AVVISI) {
  test(`avviso: ${avviso.name}`, () => {
    const r = parsePagoPA(avviso.text), e = avviso.expected;
    assert.deepEqual({ noticeCode: r.noticeCode, creditorCode: r.creditorCode, creditorName: r.creditorName, amount: r.amount, dueDate: r.dueDate, ambiguous: r.ambiguous },
      { noticeCode: e.noticeCode, creditorCode: e.creditorCode, creditorName: e.creditorName, amount: e.amount, dueDate: e.dueDate, ambiguous: e.ambiguous });
    assert.deepEqual(r.options.map(o => [o.noticeCode, o.amount, o.dueDate, o.label]), e.options || []);
  });
}

test('il codice fiscale del destinatario non diventa quello dell\'ente', () => {
  const r = parsePagoPA('DESTINATARIO AVVISO Cod. Fiscale 01234567890\nCodice avviso 301000000000123456\nImporto € 10,00');
  assert.equal(r.creditorCode, null);
});

test('date senza «entro» o «scadenza» (emissione, notifica) non sono la scadenza', () => {
  const r = parsePagoPA('Data emissione 01/11/2026\nCodice avviso 301000000000123456\nEuro 10,00');
  assert.equal(r.dueDate, null);
});

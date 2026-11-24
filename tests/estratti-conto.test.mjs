// Estratti conto in CSV (scelta dell'utente, 24 novembre 2026): formati di Intesa Sanpaolo,
// UniCredit, Fineco, BancoPosta, N26, PayPal e Revolut con le stesse uscite. Le bollette aperte
// risultano pagate, gli altri pagamenti di bollette diventano bollette già pagate, il resto no.
import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeCsvBytes, parseBankStatement, billPaymentsFromBank, signedAmount } from '../lib/bank-csv.mjs';
import { parseBillsCsv } from '../lib/csv.mjs';
import { FILE, ATTESE, BOLLETTE_APERTE } from './fixtures/estratti-conto.mjs';

for (const [bank, text] of Object.entries(FILE)) {
  test(`estratto conto ${bank}`, () => {
    assert.throws(() => parseBillsCsv(text), /csv\.columnsRequired/, 'non è un elenco di bollette');
    const statement = parseBankStatement(text);
    assert.ok(statement, 'riconosciuto come estratto conto');
    assert.equal(statement.rows.length, 8, 'otto uscite');
    const plan = billPaymentsFromBank(statement, BOLLETTE_APERTE);
    const got = new Map([...plan.paid.map(p => [`${p.row.date}|${p.row.amount}`, p.bill.id]), ...plan.added.map(b => [`${b.due_date}|${b.amount}`, b.category])]);
    for (const [day, amount, expected] of ATTESE) assert.equal(got.get(`${day}|${amount}`) ?? null, expected, `${day} ${amount}`);
    assert.equal(plan.skipped, 3, 'spesa, carburante e prelievo restano fuori');
    for (const b of plan.added) {
      assert.equal(b.paid_at, `${b.due_date}T12:00:00.000Z`);
      assert.match(b.external_id, /^bank:\d{4}-\d{2}-\d{2}:[0-9a-f]{8}$/);
      assert.doesNotMatch(b.supplier, /^(?:bonifico|addebito|sepa|in uscita)/i, b.supplier);
    }
  });
}

test('di nuovo lo stesso estratto conto, dopo l\'importazione: niente da aggiungere né da segnare', () => {
  const statement = parseBankStatement(FILE.intesa);
  const first = billPaymentsFromBank(statement, BOLLETTE_APERTE);
  // Dopo la prima importazione: Enel e TIM pagate, Eni, condominio e SMAT aggiunte.
  const after = [...BOLLETTE_APERTE.map(b => ({ ...b, paid_at: '2026-11-17T12:00:00.000Z' })), ...first.added.map((b, i) => ({ ...b, id: `n${i}` }))];
  const second = billPaymentsFromBank(statement, after);
  assert.deepEqual([second.paid.length, second.added.length, second.already], [0, 0, 5]);
});

test('due bollette aperte uguali: il pagamento non si abbina e non si aggiunge (da guardare a mano)', () => {
  const two = [{ id: 'a', supplier: 'Enel Energia', amount: 87.5, due_date: '2026-10-20', paid_at: null }, { id: 'b', supplier: 'Enel Energia', amount: 87.5, due_date: '2026-11-20', paid_at: null }];
  const plan = billPaymentsFromBank(parseBankStatement('Data;Descrizione;Importo\n17/11/2026;ADDEBITO SDD ENEL ENERGIA;-87,50'), two);
  assert.deepEqual([plan.paid.length, plan.added.length, plan.already], [0, 0, 1]);
});

test('stesso file due volte: stesse impronte (nessun doppione con la chiave unica)', () => {
  const a = billPaymentsFromBank(parseBankStatement(FILE.intesa), []).added.map(b => b.external_id);
  const b = billPaymentsFromBank(parseBankStatement(FILE.intesa), []).added.map(x => x.external_id);
  assert.deepEqual(a, b);
  assert.equal(new Set(a).size, a.length);
});

test('codifica Windows-1252 (Excel in italiano, molte banche): accenti giusti', () => {
  const bytes = Buffer.from(FILE.bancoposta, 'latin1');
  assert.throws(() => new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  const text = decodeCsvBytes(bytes);
  assert.match(text, /SOCIETÀ PER AZIONI/);
  assert.match(decodeCsvBytes(Buffer.from('﻿Titolo;Importo\n', 'utf8')), /^Titolo/);
});

test('importi con segno in tutti i modi delle banche', () => {
  for (const [raw, value] of [['-87,50', -87.5], ['87,50-', -87.5], ['(87,50)', -87.5], ['-87.50', -87.5], ['€ -1.234,56', -1234.56], ['+1.850,00', 1850], ['1850', 1850], ['−29,90', -29.9]])
    assert.equal(signedAmount(raw), value, raw);
});

test('un elenco di bollette resta un elenco di bollette', () => {
  const { bills } = parseBillsCsv('Titolo;Fornitore;Importo;Scadenza\nLuce;Enel;87,50;20/11/2026');
  assert.equal(bills.length, 1);
});

test('una carta usata da Eni (carburante) non diventa una bolletta, ma una bolletta aperta uguale sì', () => {
  const statement = parseBankStatement('Data;Descrizione;Importo\n11/11/2026;POS ENI STATION ROMA;-48,75');
  assert.equal(billPaymentsFromBank(statement, []).added.length, 0);
  const open = [{ id: 'gas', supplier: 'Eni Plenitude', amount: 48.75, due_date: '2026-11-15', paid_at: null }];
  assert.equal(billPaymentsFromBank(statement, open).paid[0]?.bill.id, 'gas');
});

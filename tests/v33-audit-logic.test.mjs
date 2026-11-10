import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMoney } from '../lib/dates.mjs';
import { extractPaymentEvidence, matchOutstandingBill } from '../lib/payment-recognition.mjs';
import { extractBillFields } from '../lib/document-import.mjs';
import { parseRatePlanText } from '../lib/rate-plan.mjs';
import { parseBillsCsv } from '../lib/csv.mjs';
import { extractConsumption } from '../lib/home-insights.mjs';

// 1. parseMoney
test('parseMoney: thousands separators in Italian and international formats', () => {
  assert.equal(parseMoney('1.200'), 1200);
  assert.equal(parseMoney('1,200'), 1200);
  assert.equal(parseMoney('1.234'), 1234);
  assert.equal(parseMoney('1,234.56'), 1234.56);
  assert.equal(parseMoney('€ 1.234,56'), 1234.56);
  assert.equal(parseMoney('1.234,56 €'), 1234.56);
  assert.equal(parseMoney('1.234.567'), 1234567);
  assert.equal(parseMoney('1,234,567'), 1234567);
  assert.equal(parseMoney('1.234.567,89'), 1234567.89);
  assert.equal(parseMoney('1 234,56'), 1234.56);
});
test('parseMoney: a single separator not followed by exactly three digits is decimal', () => {
  assert.equal(parseMoney('12,50'), 12.5);
  assert.equal(parseMoney('12.50'), 12.5);
  assert.equal(parseMoney('12,5'), 12.5);
  assert.equal(parseMoney('1234.56'), 1234.56);
  assert.equal(parseMoney('0,500'), 0.5);
  assert.equal(parseMoney('120'), 120);
  assert.equal(parseMoney('0'), 0);
  assert.equal(parseMoney(87.5), 87.5);
});
test('parseMoney: rejects scientific, hexadecimal, infinite, negative and malformed values', () => {
  for (const value of ['1e3', '0x10', 'Infinity', '-Infinity', 'NaN', '-5', '-5,00', '1,23.45', '1.23.45', '1.234,56,78', '12..50', 'abc', '', null, undefined, Infinity, -5, NaN])
    assert.ok(Number.isNaN(parseMoney(value)), `${String(value)} deve essere non valido`);
});

// 2a. Amounts with the euro sign after the figure
const receipt = {
  subject: 'Ricevuta di pagamento bolletta Enel Energia',
  sender: '"Amministrazione Enel" <ricevute@enel.it>',
  receivedAt: '2026-11-02T10:00:00.000Z'
};
test('payment: reads "87,50 €", "€ 87,50", "EUR 87,50" and "87,50 EUR"', () => {
  for (const amount of ['87,50 €', '87,50€', '€ 87,50', 'EUR 87,50', '87,50 EUR']) {
    const x = extractPaymentEvidence({ ...receipt, text: `Gentile cliente, abbiamo ricevuto il pagamento della tua bolletta Enel Energia. Importo pagato: ${amount}` });
    assert.ok(x, amount);
    assert.equal(x.amount, 87.5, amount);
    assert.equal(x.autoEligible, true, amount);
  }
});
test('payment: several amounts are never reduced to one, whatever the euro sign position', () => {
  for (const text of [
    'Abbiamo ricevuto il pagamento Enel Energia. Importo 87,50 € e commissione € 1,50',
    'Abbiamo ricevuto il pagamento Enel Energia. Importo 87,50 € e commissione 1,50 €',
    'Abbiamo ricevuto il pagamento Enel Energia. Importo € 87,50 e commissione 1,50 EUR',
    'Abbiamo ricevuto il pagamento Enel Energia del 17/11/2026 € 87,50 e commissione 1,50 €'
  ]) assert.equal(extractPaymentEvidence({ ...receipt, text }), null, text);
});
test('payment: an amount after the euro sign is read in full, not cut at the first digits', () => {
  for (const [amount, value] of [['€ 1234,56', 1234.56], ['€ 87.50', 87.5], ['EUR 1234.56', 1234.56], ['€ 1.234,56', 1234.56], ['€ 1.200', 1200]]) {
    const x = extractPaymentEvidence({ ...receipt, text: `Abbiamo ricevuto il pagamento della bolletta Enel Energia. Importo ${amount}.` });
    assert.equal(x?.amount, value, amount);
  }
});
test('document: an amount after the euro sign is read in full, not cut at the first digits', () => {
  for (const [amount, value] of [['€ 1234,56', 1234.56], ['EUR 1234.56', 1234.56], ['€ 87.50', 87.5], ['€ 1.234,56', 1234.56], ['€ 1.200', 1200]])
    assert.equal(extractBillFields(`Fornitore: Energia Casa\nTotale da pagare ${amount}\nScadenza: 25/11/2026`).amount, value, amount);
});
test('payment: a date next to the euro sign is not read as an amount', () => {
  const x = extractPaymentEvidence({ ...receipt, text: 'Abbiamo ricevuto il pagamento della bolletta Enel Energia del 17/11/2026 € 87,50' });
  assert.equal(x?.amount, 87.5);
});

// 2b. False positives
const notAutoConfirmable = x => x === null || x.autoEligible === false;
test('payment: a new bill that thanks for the previous payment is not evidence of payment', () => {
  for (const subject of [receipt.subject, 'La tua nuova bolletta Enel Energia', 'Enel Energia']) for (const text of [
    'È disponibile la nuova bolletta Enel Energia. Importo € 87,50. Grazie, abbiamo ricevuto il pagamento della bolletta di ottobre.',
    'La tua bolletta di novembre Enel Energia è disponibile. Importo 87,50 €. Grazie, abbiamo ricevuto il pagamento della bolletta di ottobre.',
    'E disponibile la nuova bolletta Enel Energia. Importo € 87,50. Il pagamento della bolletta precedente è stato registrato.',
    'La tua bolletta Enel Energia è disponibile. Importo € 87,50.'
  ]) assert.equal(extractPaymentEvidence({ ...receipt, subject, text }), null, `${subject} | ${text}`);
});
test('payment: a notice of a future direct debit is not evidence of payment', () => {
  for (const text of [
    'Abbiamo registrato la tua bolletta Enel Energia: il pagamento di € 87,50 verrà effettuato tramite addebito diretto il 17/11.',
    'Abbiamo registrato la tua bolletta Enel Energia: il pagamento di € 87,50 verra effettuato tramite addebito diretto il 17/11.',
    'Pagamento registrato. L’importo di 87,50 € sarà addebitato sul tuo conto il 17/11.'
  ]) assert.equal(extractPaymentEvidence({ ...receipt, text }), null, text);
});
test('payment: a rejected or failed payment is never eligible for automatic confirmation', () => {
  for (const text of [
    'Il pagamento della bolletta Enel Energia è stato effettuato ma la banca lo ha respinto. Importo € 87,50',
    'Il pagamento è stato effettuato ma la banca lo ha respinto. Importo € 87,50',
    'Abbiamo ricevuto il pagamento della bolletta Enel Energia di € 87,50 ma non è andato a buon fine.',
    'Il pagamento di € 87,50 non è andato a buon fine.',
    'Abbiamo registrato il pagamento ma non è stato possibile addebitare € 87,50 sul tuo conto.',
    'Abbiamo ricevuto il pagamento di € 87,50: risulta insoluto.',
    'Il pagamento è stato effettuato, poi è stato stornato. € 87,50'
  ]) {
    assert.ok(notAutoConfirmable(extractPaymentEvidence({ ...receipt, text })), text);
    assert.ok(notAutoConfirmable(extractPaymentEvidence({ ...receipt, subject: 'Bolletta Enel Energia', text })), text);
  }
});
test('payment: a genuine receipt is still recognised and eligible', () => {
  const x = extractPaymentEvidence({ ...receipt, text: 'Gentile cliente, abbiamo ricevuto il pagamento della bolletta Enel Energia n. 123 emessa il 01/10/2026. Importo pagato: 87,50 €.' });
  assert.equal(x?.amount, 87.5);
  assert.equal(x.autoEligible, true);
});

// 2c. Matching the receipt to the closest bill, including bills already paid
const fiber = { sender: 'ricevute@iliad.it', subject: 'Ricevuta di pagamento Iliad', text: 'Abbiamo ricevuto il pagamento della bolletta Iliad Fibra. Importo pagato: € 29,90.' };
const october = { id: 'oct', user_id: 'u1', supplier: 'Iliad Fibra', amount: 29.9, due_date: '2026-10-15', paid_at: '2026-10-15T07:00:00.000Z' };
const november = { id: 'nov', user_id: 'u1', supplier: 'Iliad Fibra', amount: 29.9, due_date: '2026-11-15', paid_at: null };
test('match: a receipt for an already paid monthly bill does not close the next one', () => {
  const x = extractPaymentEvidence({ ...fiber, receivedAt: '2026-10-15T10:00:00.000Z' });
  assert.equal(x?.amount, 29.9);
  assert.equal(matchOutstandingBill(x, [october, november]), null);
  assert.equal(matchOutstandingBill(x, [november, october]), null);
});
test('match: the receipt closes the open bill when it is the closest one', () => {
  const x = { ...fiber, amount: 29.9, receivedAt: '2026-11-14T10:00:00.000Z' };
  assert.equal(matchOutstandingBill(x, [october, november]), november);
});
test('match: two compatible bills at the same distance are ambiguous', () => {
  const x = { ...fiber, amount: 29.9, receivedAt: '2026-10-15T10:00:00.000Z' };
  const a = { ...november, id: 'a', due_date: '2026-10-01' }, b = { ...november, id: 'b', due_date: '2026-10-29' };
  assert.equal(matchOutstandingBill(x, [a, b]), null);
  assert.equal(matchOutstandingBill(x, [{ ...a, paid_at: '2026-10-01T10:00:00.000Z' }, b]), null);
});
test('match: only due dates from 90 days before to 45 days after the email are considered', () => {
  const x = { ...fiber, amount: 29.9, receivedAt: '2026-10-15T10:00:00.000Z' };
  assert.equal(matchOutstandingBill(x, [{ ...november, due_date: '2026-11-29' }]).due_date, '2026-11-29'); // +45
  assert.equal(matchOutstandingBill(x, [{ ...november, due_date: '2026-11-30' }]), null); // +46
  assert.equal(matchOutstandingBill(x, [{ ...november, due_date: '2026-07-17' }]).due_date, '2026-07-17'); // -90
  assert.equal(matchOutstandingBill(x, [{ ...november, due_date: '2026-07-16' }]), null); // -91
  // A bill outside the window never hides an eligible one.
  assert.equal(matchOutstandingBill(x, [{ ...october, due_date: '2026-12-31' }, { ...november, due_date: '2026-11-20' }]).due_date, '2026-11-20');
});
test('match: amount and supplier must still be compatible', () => {
  const x = { ...fiber, amount: 29.9, receivedAt: '2026-11-14T10:00:00.000Z' };
  assert.equal(matchOutstandingBill(x, [{ ...november, amount: 29.91 }]), null);
  assert.equal(matchOutstandingBill(x, [{ ...november, supplier: 'Enel Energia' }]), null);
  // A paid bill from another supplier does not block the right one.
  assert.equal(matchOutstandingBill(x, [{ ...november, id: 'other', supplier: 'Enel Energia', due_date: '2026-11-14', paid_at: '2026-11-14T08:00:00.000Z' }, november]), november);
});

// 3a. Due date priority and exclusions
test('document: "Data scadenza" wins over a complaint deadline "entro il"', () => {
  const x = extractBillFields('Fornitore: Energia Casa\nTotale da pagare € 80,00\nData scadenza: 25/11/2026\nPer eventuali reclami scrivere entro il 31/12/2026');
  assert.equal(x.due_date, '2026-11-25');
  assert.doesNotMatch(x.warnings.join(' '), /Più scadenze/);
});
test('document: "Scadenza:" and "Scadenza -" have the highest priority', () => {
  assert.equal(extractBillFields('Fornitore: Energia Casa\nTotale da pagare € 80,00\nScadenza: 25/11/2026\nAttivazione entro il 31/12/2026').due_date, '2026-11-25');
  assert.equal(extractBillFields('Fornitore: Energia Casa\nTotale da pagare € 80,00\nScadenza - 25/11/2026\nAttivazione entro il 31/12/2026').due_date, '2026-11-25');
});
test('document: dates near complaint, self-reading, withdrawal or cancellation are not due dates', () => {
  for (const line of [
    'Reclami entro il 31/12/2026',
    'Autolettura entro il 31/12/2026',
    'Diritto di recesso entro il 31/12/2026',
    'Disdetta entro il 31/12/2026',
    'Diritto di ripensamento entro il 31/12/2026',
    'Puoi inviare un reclamo: entro il 31/12/2026',
    'Entro il 31/12/2026 puoi inviare un reclamo'
  ]) {
    const x = extractBillFields(`Fornitore: Energia Casa\nTotale da pagare € 80,00\n${line}`);
    assert.equal(x.due_date, null, line);
  }
  const y = extractBillFields('Fornitore: Energia Casa\nTotale da pagare € 80,00\nScadenza: 25/11/2026 · reclami entro il 31/12/2026');
  assert.equal(y.due_date, '2026-11-25');
});
test('document: different dates under the two highest priorities are flagged as ambiguous', () => {
  const x = extractBillFields('Fornitore: Energia Casa\nTotale da pagare € 80,00\nScadenza: 25/11/2026\nDa pagare entro il 30/11/2026');
  assert.match(x.warnings.join(' '), /Più scadenze/);
  const y = extractBillFields('Fornitore: Energia Casa\nTotale da pagare € 80,00\nScadenza: 25/11/2026\nDa pagare entro il 25/11/2026');
  assert.equal(y.due_date, '2026-11-25');
  assert.doesNotMatch(y.warnings.join(' '), /Più scadenze/);
});

// 3b. "IVA inclusa"
test('document: "Totale da pagare (IVA inclusa)" is a valid total, VAT lines are not', () => {
  assert.equal(extractBillFields('Fornitore: Energia Casa\nTotale da pagare (IVA inclusa) € 120,50\nScadenza: 25/11/2026').amount, 120.5);
  assert.equal(extractBillFields('Fornitore: Energia Casa\nTotale da pagare IVA compresa € 120,50\nScadenza: 25/11/2026').amount, 120.5);
  for (const line of ['IVA 10% totale da pagare € 10,95', 'Totale IVA da pagare € 10,95', 'IVA su totale da pagare € 10,95', 'Importo IVA da pagare € 10,95'])
    assert.equal(extractBillFields(`Fornitore: Energia Casa\n${line}\nScadenza: 25/11/2026`).amount, null, line);
  assert.equal(extractBillFields('Fornitore: Energia Casa\nIVA 10% € 10,95\nTotale da pagare € 120,50\nScadenza: 25/11/2026').amount, 120.5);
});

// 3c. Credit notes and negative amounts
test('document: credit notes and negative totals never become an amount to pay', () => {
  for (const text of [
    'NOTA DI CREDITO\nFornitore: Energia Casa\nTotale documento € 25,00\nScadenza: 25/11/2026',
    'Fornitore: Energia Casa\nTotale documento € -25,00\nScadenza: 25/11/2026',
    'Fornitore: Energia Casa\nTotale documento -25,00 €\nScadenza: 25/11/2026',
    'Fornitore: Energia Casa\nTotale documento\n-25,00 €\nScadenza: 25/11/2026',
    'Fornitore: Energia Casa\nTotale bolletta a vostro credito € 25,00\nScadenza: 25/11/2026',
    'Fornitore: Energia Casa\nSaldo a vostro credito € 25,00'
  ]) {
    const x = extractBillFields(text);
    assert.equal(x.amount, null, text);
    assert.equal(x.documentType, 'nota_credito', text);
    assert.match(x.warnings[0], /nota di credito/i, text);
  }
});
test('document: a dash used as a separator is not a minus sign', () => {
  const x = extractBillFields('Fornitore: Energia Casa\nTotale da pagare - € 80,00\nScadenza: 25-11-2026');
  assert.equal(x.amount, 80);
  assert.equal(x.documentType, 'bolletta');
});

// 3d. Reminders
test('document: reminders, formal notices and suspension notices are not new bills', () => {
  for (const title of ['Secondo sollecito', 'Sollecito', 'Primo sollecito di pagamento', 'Messa in mora', 'Avviso di sospensione della fornitura', 'Avviso di morosità']) {
    const x = extractBillFields(`${title}\nFornitore: Energia Casa\nTotale da pagare € 80,00\nScadenza: 25/11/2026`);
    assert.equal(x.documentType, 'sollecito', title);
    assert.match(x.warnings[0], /sollecito/, title);
  }
});

// 4a. Unit / name filter
test('rate plan: the unit filter matches whole words only, ignoring case and accents', () => {
  const plan = 'Piano rate condominio\nInterno 1 Rata 1 10/12/2026 € 100,00\nInterno 10 Rata 1 10/12/2026 € 200,00\nInterno 12 Rata 1 10/12/2026 € 300,00\nINTERNO 1 Rata 2 10/02/2027 € 100,00';
  assert.deepEqual(parseRatePlanText(plan, { unitFilter: 'interno 1' }).rows.map(r => r.amount), [100, 100]);
  const names = 'Piano rate condominio\nRossi Rata 1 10/12/2026 € 100,00\nRossini Rata 1 10/12/2026 € 200,00\nRossi Rata 2 10/02/2027 € 100,00';
  assert.deepEqual(parseRatePlanText(names, { unitFilter: 'Rossi' }).rows.map(r => r.amount), [100, 100]);
  const accents = 'Piano rate condominio\nNicolò Rata 1 10/12/2026 € 100,00\nNicolò Rata 2 10/02/2027 € 100,00\nNicolosi Rata 1 10/12/2026 € 300,00';
  assert.deepEqual(parseRatePlanText(accents, { unitFilter: 'NICOLO' }).rows.map(r => r.amount), [100, 100]);
});

// 4b. Instalments must not be lost silently
test('rate plan: distinct rows with the same date and amount are both kept', () => {
  const out = parseRatePlanText('Piano rate condominio\nRata 1 ordinaria 10/12/2026 € 100,00\nRata 1 straordinaria 10/12/2026 € 100,00\nRata 2 saldo residuo 10/02/2027 € 50,00');
  assert.equal(out.rows.length, 3);
  assert.deepEqual(out.rows.map(r => r.amount), [100, 100, 50]);
  assert.equal(out.discarded, 0);
  assert.ok(out.warnings.some(w => /stessa data e lo stesso importo/.test(w)));
});
test('rate plan: only textually identical rows are de-duplicated, and it is reported', () => {
  const out = parseRatePlanText('Piano rate condominio\nRata 1 10/12/2026 € 100,00\nRata 1 10/12/2026 € 100,00\nRata 2 10/02/2027 € 100,00');
  assert.equal(out.rows.length, 2);
  assert.equal(out.discarded, 1);
  assert.ok(out.warnings.some(w => /1 righe/.test(w)));
});

// 4c. Credits
test('rate plan: credit adjustments and negative amounts are not instalments to pay', () => {
  const out = parseRatePlanText('Piano rate condominio\nRata 1 10/12/2026 € 100,00\nRata 2 10/02/2027 € 100,00\nConguaglio a credito 10/03/2027 -50,00 €\nRata 3 10/04/2027 € -30,00\nConguaglio a vostro credito 10/05/2027 € 20,00');
  assert.deepEqual(out.rows.map(r => r.amount), [100, 100]);
  assert.equal(out.discarded, 3);
  assert.ok(out.warnings.some(w => /credito/.test(w)));
  // A dash as a separator is not a minus sign.
  assert.deepEqual(parseRatePlanText('Piano rate condominio\nRata 1 - 10/12/2026 - € 100,00\nRata 2 - 10/02/2027 - 100,00 €').rows.map(r => r.amount), [100, 100]);
});

// 5. CSV
test('CSV: English and underscore header aliases are recognised', () => {
  for (const header of ['due_date;amount;supplier', 'data_scadenza;importo;fornitore', 'Due-Date;Amount;Supplier', 'Data Scadenza;Importo;Fornitore']) {
    const r = parseBillsCsv(`${header}\n12/12/2026;89,70;Enel`);
    assert.equal(r.bills.length, 1, header);
    assert.equal(r.bills[0].due_date, '2026-12-12', header);
    assert.equal(r.bills[0].amount, 89.7, header);
    assert.equal(r.bills[0].supplier, 'Enel', header);
  }
});
test('CSV: zero or invalid amounts are rejected with a row error', () => {
  const r = parseBillsCsv('scadenza;importo\n12/12/2026;0\n12/12/2026;abc\n12/12/2026;0,00\n12/12/2026;1e3\n12/12/2026;1.200');
  assert.deepEqual(r.bills.map(b => b.amount), [1200]);
  assert.deepEqual(r.errors, ['Riga 2: importo o data non validi', 'Riga 3: importo o data non validi', 'Riga 4: importo o data non validi', 'Riga 5: importo o data non validi']);
});

// 6. Consumption
test('consumption: a year before the figure is not merged into the number', () => {
  const r = extractConsumption('Consumo fatturato anno 2025 1.234 kWh');
  assert.equal(r.value, 1234);
  assert.equal(r.unit, 'kWh');
  assert.equal(extractConsumption('Consumo gas anno 2025 118 Smc').value, 118);
  assert.equal(extractConsumption('Consumo acqua anno 2025 49 m³').value, 49);
});

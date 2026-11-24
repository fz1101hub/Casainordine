// Bollette di esempio per la prova della lettura automatica (tests/bollette-pdf.test.mjs).
// Dati inventati, impaginazioni ispirate a quelle tipiche dei fornitori italiani: etichette,
// date scritte in lettere, importi con il punto delle migliaia, due colonne, trappole (data di
// emissione, scadenza dell'autolettura, IVA, importo già pagato, rate).
// lines: righe come le estrae il PDF. columns: righe a due colonne [sinistra, destra] (impaginazione
// a colonne: il testo arriva sulla stessa riga). expected: quello che la lettura deve trovare
// (null = non deve trovare niente; un campo assente non si controlla).
export const BOLLETTE = [
  {
    name: 'Luce, mercato libero, etichette classiche',
    lines: ['Energia Chiara S.p.A.', 'Bolletta n. 0041-2026-118734 del 18/11/2026', 'Intestatario: Mario Rossi',
      'Fornitura di energia elettrica', 'Codice POD: IT001E12345678', 'Periodo di fatturazione: dal 01/09/2026 al 31/10/2026',
      'Consumo fatturato nel periodo: 412 kWh', 'Totale IVA 22% € 15,20', 'Totale da pagare € 84,32', 'Scadenza 16/12/2026',
      'Per reclami scrivere entro il 31/12/2026 al servizio clienti'],
    expected: { amount: 84.32, due_date: '2026-12-16', category: 'Luce', supplier: 'Energia Chiara S.p.A.', pod: 'IT001E12345678',
      period_start: '2026-09-01', period_end: '2026-10-31', consumption_value: 412, consumption_unit: 'kWh', documentType: 'bolletta' },
  },
  {
    name: 'Gas, data scritta in lettere',
    lines: ['GasNord Energia S.r.l.', 'Fattura n. G-77812 emessa il 3 novembre 2026', 'Fornitura gas naturale - PDR 00881234567890',
      'Periodo di riferimento dal 1 settembre 2026 al 31 ottobre 2026', 'Consumi fatturati: 120 Smc', 'TOTALE DA PAGARE 112,50 €',
      'Da pagare entro il 15 dicembre 2026'],
    expected: { amount: 112.5, due_date: '2026-12-15', category: 'Gas', pdr: '00881234567890',
      period_start: '2026-09-01', period_end: '2026-10-31', consumption_value: 120, consumption_unit: 'Smc' },
  },
  {
    name: 'Luce e gas, due colonne (scadenza e totale sulla riga sotto le etichette)',
    columns: [['Lumen Casa S.p.A.', 'Bolletta luce e gas'], ['Data emissione', 'Numero documento'], ['20/11/2026', '2026/889912'],
      ['Scadenza', 'Totale da pagare'], ['18/12/2026', '€ 156,20'], ['Periodo', 'Consumi luce'], ['01/09/2026 - 31/10/2026', '305 kWh']],
    expected: { amount: 156.2, due_date: '2026-12-18', period_start: '2026-09-01', period_end: '2026-10-31' },
  },
  {
    name: 'Importo scritto «euro» e mese abbreviato',
    lines: ['Edera Energia', 'Documento di sintesi', 'Energia elettrica - POD IT004E87654321', 'Importo da pagare: 74,10 euro',
      'Scadenza: 9 gen 2027', 'Periodo: 01.11.2026 - 30.11.2026'],
    expected: { amount: 74.1, due_date: '2027-01-09', pod: 'IT004E87654321', period_start: '2026-11-01', period_end: '2026-11-30' },
  },
  {
    name: 'Acqua, metri cubi',
    lines: ['Acque del Fiume S.p.A.', 'Servizio idrico integrato', 'Bolletta n. 55-2026-00123', 'Periodo di riferimento dal 01/07/2026 al 31/10/2026',
      'Consumo 38 mc', 'Importo totale € 45,60', 'Scadenza: 10/01/2027'],
    expected: { amount: 45.6, due_date: '2027-01-10', category: 'Acqua', consumption_value: 38, consumption_unit: 'm³',
      period_start: '2026-07-01', period_end: '2026-10-31' },
  },
  {
    name: 'Gas, trappole: emissione, autolettura, IVA, già pagato',
    lines: ['Fiamma Blu Gas', 'Data emissione 15/11/2026', 'Data fattura 15/11/2026', 'PDR: 12345678901234', 'Comunica l\'autolettura entro il 28/11/2026',
      'Imponibile 80,33 €', 'IVA 22% 17,67 €', 'Importo già pagato 0,00 €', 'Totale bolletta 98,00 €', 'Data scadenza 05/12/2026', 'Consumo totale 85,5 Smc'],
    expected: { amount: 98, due_date: '2026-12-05', pdr: '12345678901234', consumption_value: 85.5, consumption_unit: 'Smc' },
  },
  {
    name: 'Telefono e internet, data con i punti',
    lines: ['Rete Veloce S.p.A.', 'Conto telefonico n. 8812345', 'Linea fibra FTTH', 'Periodo di fatturazione: 01/12/2026 - 31/12/2026',
      'Totale da pagare 31,95 €', 'Data scadenza 05.12.2026'],
    expected: { amount: 31.95, due_date: '2026-12-05', category: 'Internet', period_start: '2026-12-01', period_end: '2026-12-31',
      consumption_value: null },
  },
  {
    name: 'Telefonia mobile, data ISO e EURO maiuscolo',
    lines: ['Onda Mobile', 'Fattura telefonia mobile', 'TOTALE FATTURA EURO 27,99', 'Scadenza pagamento 2026-12-08'],
    expected: { amount: 27.99, due_date: '2026-12-08', category: 'Telefono' },
  },
  {
    name: 'Importo con migliaia',
    lines: ['Calore Condominio S.r.l.', 'Riscaldamento centralizzato condominio', 'Totale da pagare € 1.234,56', 'Scadenza 31/12/2026'],
    expected: { amount: 1234.56, due_date: '2026-12-31', category: 'Condominio' },
  },
  {
    name: 'TARI in due rate: scadenza da scegliere',
    lines: ['Comune di Borgo Fiorito', 'Avviso di pagamento TARI 2026', 'Importo totale dovuto € 312,00',
      'Rata 1 scadenza 16/12/2026 € 156,00', 'Rata 2 scadenza 16/02/2027 € 156,00'],
    expected: { amount: 312, category: 'Rifiuti', due_date: null, warning: 'import.warn.dueAmbiguous' },
  },
  {
    name: 'Nota di credito',
    lines: ['Energia Chiara S.p.A.', 'Nota di credito n. NC-2026-001', 'Importo a vostro credito € 23,40', 'Data 20/11/2026'],
    expected: { amount: null, documentType: 'nota_credito' },
  },
  {
    name: 'Sollecito',
    lines: ['GasNord Energia S.r.l.', 'Sollecito di pagamento', 'Risulta non pagata la bolletta n. G-70001', 'Importo da pagare € 64,00', 'Da pagare entro il 30/11/2026'],
    expected: { amount: 64, due_date: '2026-11-30', documentType: 'sollecito' },
  },
  {
    name: 'Domiciliata: niente da pagare',
    lines: ['Energia Chiara S.p.A.', 'Bolletta n. 0041-2026-200000', 'Pagamento con addebito diretto SEPA', 'Totale bolletta € 61,00',
      'Addebito sul conto corrente il 12/12/2026', 'Scadenza 12/12/2026'],
    expected: { amount: 61, due_date: '2026-12-12' },
  },
  // Trappole: niente periodo, consumo o codici quando non ci sono davvero.
  {
    name: 'Trappole: validità dell\'offerta, consumo annuo, IBAN, codice cliente',
    lines: ['Energia Chiara S.p.A.', 'Offerta Casa Luce - periodo di validità dell\'offerta dal 01/01/2026 al 31/12/2026', 'Codice cliente 12345678901234',
      'Consumo annuo stimato 2.400 kWh', 'IBAN IT60X0542811101000000123456', 'Totale da pagare € 70,00', 'Scadenza 1 Gennaio 2027'],
    expected: { amount: 70, due_date: '2027-01-01', period_start: null, period_end: null, consumption_value: null, consumption_unit: null, pod: null, pdr: null },
  },
];

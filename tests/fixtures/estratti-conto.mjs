// Estratti conto realistici (formati delle principali banche italiane, di PayPal e di Revolut), con
// le stesse uscite: bollette, spesa, carburante, prelievo. Dati inventati.
export const BOLLETTE_APERTE = [
  { id: 'enel', supplier: 'Enel Energia', amount: 87.5, due_date: '2026-11-20', paid_at: null },
  { id: 'tim', supplier: 'TIM', amount: 29.9, due_date: '2026-11-16', paid_at: null },
];
// Uscite attese: [data, importo, bolletta segnata pagata | categoria della nuova bolletta | null (non è una bolletta)]
export const ATTESE = [
  ['2026-11-17', 87.5, 'enel'], ['2026-11-15', 29.9, 'tim'], ['2026-11-10', 250, 'Condominio'], ['2026-11-05', 58.4, 'Acqua'],
  ['2026-11-12', 64.2, 'Gas'], ['2026-11-08', 54.3, null], ['2026-11-09', 60, null], ['2026-11-11', 48.75, null],
];
const row = (sep, values) => values.map(v => (String(v).includes(sep) || /"/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v)).join(sep);
export const FILE = {
  // Intesa Sanpaolo: righe di intestazione, separatore ;, importi con virgola e segno.
  intesa: ['Elenco movimenti conto corrente', 'Conto: IT60 X054 2811 1010 0000 0123 456', 'Periodo: dal 01/11/2026 al 20/11/2026', '',
    'Data;Operazione;Dettagli;Conto o carta;Contabilizzazione;Categoria;Valuta;Importo',
    '17/11/2026;Addebito diretto;ENEL ENERGIA S.P.A. - SDD bolletta luce;Conto;Contabilizzato;Utenze;EUR;-87,50',
    '15/11/2026;Addebito diretto;TIM S.P.A. - fattura 8Z12345678;Conto;Contabilizzato;Utenze;EUR;-29,90',
    '12/11/2026;Addebito diretto;ENI PLENITUDE SPA SDD gas naturale;Conto;Contabilizzato;Utenze;EUR;-64,20',
    '11/11/2026;Pagamento POS;POS ENI STATION 4412 ROMA;Carta;Contabilizzato;Carburante;EUR;-48,75',
    '10/11/2026;Bonifico in uscita;CONDOMINIO VIA ROMA 10 - rata condominiale novembre;Conto;Contabilizzato;Casa;EUR;-250,00',
    '09/11/2026;Prelievo;PRELIEVO ATM 1234;Carta;Contabilizzato;Contanti;EUR;-60,00',
    '08/11/2026;Pagamento POS;POS SUPERMERCATO CONAD;Carta;Contabilizzato;Spesa;EUR;-54,30',
    '05/11/2026;Pagamento bollettino;BOLLETTINO SMAT SPA acqua;Conto;Contabilizzato;Utenze;EUR;-58,40',
    '01/11/2026;Bonifico in entrata;STIPENDIO OTTOBRE;Conto;Contabilizzato;Entrate;EUR;1.850,00',
  ].join('\r\n'),
  // UniCredit: «Data Registrazione», importo con colonna in euro.
  unicredit: ['Data Registrazione;Data valuta;Descrizione;Importo (EUR)',
    '17.11.2026;17.11.2026;ADDEBITO SDD ENEL ENERGIA SPA BOLLETTA;-87,50', '15.11.2026;15.11.2026;ADDEBITO SDD TIM SPA;-29,90',
    '12.11.2026;12.11.2026;ADDEBITO SDD ENI PLENITUDE GAS;-64,20', '11.11.2026;11.11.2026;PAGAMENTO CARTA ENI STATION ROMA;-48,75',
    '10.11.2026;10.11.2026;BONIFICO A CONDOMINIO VIA ROMA 10;-250,00', '09.11.2026;09.11.2026;PRELIEVO BANCOMAT;-60,00',
    '08.11.2026;08.11.2026;PAGAMENTO CARTA CONAD;-54,30', '05.11.2026;05.11.2026;PAGAMENTO BOLLETTINO SMAT ACQUA;-58,40',
    '01.11.2026;01.11.2026;BONIFICO STIPENDIO;1.850,00'].join('\n'),
  // Fineco: «Entrate» e «Uscite» separate (uscite negative), descrizione completa.
  fineco: ['Data_Operazione;Data_Valuta;Entrate;Uscite;Descrizione;Descrizione_Completa;Stato',
    '17/11/2026;17/11/2026;;-87,5;SEPA Direct Debit;ENEL ENERGIA SPA bolletta;Contabilizzato', '15/11/2026;15/11/2026;;-29,9;SEPA Direct Debit;TIM SPA;Contabilizzato',
    '12/11/2026;12/11/2026;;-64,2;SEPA Direct Debit;ENI PLENITUDE gas;Contabilizzato', '11/11/2026;11/11/2026;;-48,75;Pagamento Visa Debit;ENI STATION ROMA;Contabilizzato',
    '10/11/2026;10/11/2026;;-250;Bonifico SEPA;CONDOMINIO VIA ROMA 10;Contabilizzato', '09/11/2026;09/11/2026;;-60;Prelievo Bancomat;ATM ROMA;Contabilizzato',
    '08/11/2026;08/11/2026;;-54,3;Pagamento Visa Debit;CONAD ROMA;Contabilizzato', '05/11/2026;05/11/2026;;-58,4;Pagamento bollettino;SMAT SPA acqua;Contabilizzato',
    '01/11/2026;01/11/2026;1850;;Bonifico SEPA;STIPENDIO;Contabilizzato'].join('\n'),
  // BancoPosta: «Addebiti» positivi, codifica Windows-1252 (si prova a parte).
  bancoposta: ['Data Contabile;Data Valuta;Addebiti;Accrediti;Descrizione operazioni',
    '17/11/2026;17/11/2026;87,50;;ADDEBITO DIRETTO SDD ENEL ENERGIA SOCIETÀ PER AZIONI', '15/11/2026;15/11/2026;29,90;;ADDEBITO DIRETTO SDD TIM',
    '12/11/2026;12/11/2026;64,20;;ADDEBITO DIRETTO SDD ENI PLENITUDE GAS', '11/11/2026;11/11/2026;48,75;;PAGAMENTO POS ENI STATION',
    '10/11/2026;10/11/2026;250,00;;BONIFICO A CONDOMINIO VIA ROMA 10', '09/11/2026;09/11/2026;60,00;;PRELIEVO ATM POSTAMAT',
    '08/11/2026;08/11/2026;54,30;;PAGAMENTO POS CONAD', '05/11/2026;05/11/2026;58,40;;PAGAMENTO BOLLETTINO SMAT ACQUA',
    '01/11/2026;01/11/2026;;1.850,00;ACCREDITO STIPENDIO'].join('\r\n'),
  // N26: separatore , con virgolette, date ISO, punto decimale.
  n26: ['"Date","Payee","Account number","Transaction type","Payment reference","Amount (EUR)","Amount (Foreign Currency)","Type Foreign Currency","Exchange Rate"',
    '"2026-11-17","ENEL ENERGIA SPA","IT00X0000000000000000000000","Direct Debit","Bolletta luce","-87.50","","",""',
    '"2026-11-15","TIM SPA","","Direct Debit","Fattura","-29.90","","",""', '"2026-11-12","ENI PLENITUDE","","Direct Debit","Gas","-64.20","","",""',
    '"2026-11-11","ENI STATION ROMA","","MasterCard Payment","","-48.75","","",""', '"2026-11-10","CONDOMINIO VIA ROMA 10","","Outgoing Transfer","Rata condominiale","-250.00","","",""',
    '"2026-11-09","ATM ROMA","","MasterCard Payment","Prelievo","-60.00","","",""', '"2026-11-08","CONAD","","MasterCard Payment","","-54.30","","",""',
    '"2026-11-05","SMAT SPA","","Outgoing Transfer","Bollettino acqua","-58.40","","",""', '"2026-11-01","DATORE DI LAVORO","","Income","Stipendio","1850.00","","",""'].join('\n'),
  // PayPal: «Lordo» con la virgola decimale dentro le virgolette, «Stato».
  paypal: ['"Data","Ora","Fuso orario","Nome","Tipo","Stato","Valuta","Lordo","Tariffa","Netto"',
    '"17/11/2026","09:30:00","CET","Enel Energia S.p.A.","Pagamento preautorizzato","Completata","EUR","-87,50","0,00","-87,50"',
    '"15/11/2026","10:00:00","CET","TIM S.p.A.","Pagamento preautorizzato","Completata","EUR","-29,90","0,00","-29,90"',
    '"12/11/2026","10:00:00","CET","Eni Plenitude","Pagamento preautorizzato","Completata","EUR","-64,20","0,00","-64,20"',
    '"11/11/2026","10:00:00","CET","Eni Station Roma","Pagamento con carta","Completata","EUR","-48,75","0,00","-48,75"',
    '"10/11/2026","10:00:00","CET","Condominio Via Roma 10","Pagamento inviato","Completata","EUR","-250,00","0,00","-250,00"',
    '"09/11/2026","10:00:00","CET","Prelievo ATM","Prelievo","Completata","EUR","-60,00","0,00","-60,00"',
    '"08/11/2026","10:00:00","CET","Conad","Pagamento con carta","Completata","EUR","-54,30","0,00","-54,30"',
    '"05/11/2026","10:00:00","CET","SMAT S.p.A. bollettino acqua","Pagamento inviato","Completata","EUR","-58,40","0,00","-58,40"',
    '"04/11/2026","10:00:00","CET","Hera Comm","Pagamento preautorizzato","Annullata","EUR","-99,00","0,00","-99,00"'].join('\n'),
  // Revolut: data e ora, stato COMPLETED.
  revolut: ['Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance',
    'TRANSFER,Current,2026-11-17 09:30:00,2026-11-17 09:31:00,Enel Energia SpA SDD,-87.50,0.00,EUR,COMPLETED,1000.00',
    'TRANSFER,Current,2026-11-15 09:30:00,2026-11-15 09:31:00,TIM SpA SDD,-29.90,0.00,EUR,COMPLETED,1000.00',
    'TRANSFER,Current,2026-11-12 09:30:00,2026-11-12 09:31:00,Eni Plenitude SDD gas,-64.20,0.00,EUR,COMPLETED,1000.00',
    'CARD_PAYMENT,Current,2026-11-11 09:30:00,2026-11-11 09:31:00,Eni Station Roma,-48.75,0.00,EUR,COMPLETED,1000.00',
    'TRANSFER,Current,2026-11-10 09:30:00,2026-11-10 09:31:00,Condominio Via Roma 10,-250.00,0.00,EUR,COMPLETED,1000.00',
    'ATM,Current,2026-11-09 09:30:00,2026-11-09 09:31:00,Prelievo ATM,-60.00,0.00,EUR,COMPLETED,1000.00',
    'CARD_PAYMENT,Current,2026-11-08 09:30:00,2026-11-08 09:31:00,Conad,-54.30,0.00,EUR,COMPLETED,1000.00',
    'TRANSFER,Current,2026-11-05 09:30:00,2026-11-05 09:31:00,SMAT bollettino acqua,-58.40,0.00,EUR,COMPLETED,1000.00',
    'TOPUP,Current,2026-11-01 09:30:00,2026-11-01 09:31:00,Stipendio,1850.00,0.00,EUR,COMPLETED,2850.00'].join('\n'),
};
export { row };

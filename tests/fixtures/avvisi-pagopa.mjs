// Avvisi pagoPA realistici (testo come esce da un PDF o da una foto) e contenuti dei codici QR e
// Data Matrix. expected: i campi che la lettura deve proporre (null = da non indovinare).
export const AVVISI = [
  { name: 'TARI con rata unica o due rate', text: `AVVISO DI PAGAMENTO
TARI 2026 - Tassa sui rifiuti
ENTE CREDITORE Cod. Fiscale 00514490010
Comune di Torino
DESTINATARIO AVVISO Cod. Fiscale RSSMRA80A01L219X
MARIO ROSSI
QUANTO E QUANDO PAGARE?
112,00 Euro entro il 16/07/2026 in un'unica soluzione
oppure in 2 rate
RATA UNICA entro il 16/07/2026
Codice Avviso 3012 3456 7890 1234 56
Euro 112,00
1a RATA entro il 16/07/2026
Codice Avviso 3012 3456 7890 1234 64
Euro 56,00
2a RATA entro il 02/12/2026
Codice Avviso 3012 3456 7890 1234 72
Euro 56,00`,
    expected: { noticeCode: null, creditorCode: '00514490010', creditorName: 'Comune di Torino', amount: null, dueDate: null, ambiguous: true,
      options: [['301234567890123456', 112, '2026-07-16', 'RATA UNICA'], ['301234567890123464', 56, '2026-07-16', '1a RATA'], ['301234567890123472', 56, '2026-12-02', '2a RATA']] } },
  { name: 'mensa scolastica', text: `Avviso di pagamento pagoPA
Ente creditore: Comune di Milano - C.F. 01199250158
Causale: Refezione scolastica novembre 2026
Importo: € 85,40
Scadenza: 30/11/2026
Codice avviso: 301000000000123456`,
    expected: { noticeCode: '301000000000123456', creditorCode: '01199250158', creditorName: 'Comune di Milano', amount: 85.4, dueDate: '2026-11-30', ambiguous: false } },
  { name: 'multa con importo ridotto', text: `AVVISO DI PAGAMENTO
Verbale n. 2026/123456 - Polizia Locale
ENTE CREDITORE Cod. Fiscale 80016350821 Comune di Palermo
Importo ridotto se paghi entro 5 giorni dalla notifica: 29,40 Euro
Importo entro 60 giorni dalla notifica: 42,00 Euro
Codice Avviso 0011 2233 4455 6677 88
Data di notifica 12/11/2026`,
    // Due importi per lo stesso codice: l'importo non si indovina.
    expected: { noticeCode: '001122334455667788', creditorCode: '80016350821', creditorName: 'Comune di Palermo', amount: null, dueDate: null, ambiguous: false } },
  { name: 'ticket sanitario con IUV', text: `AZIENDA SANITARIA LOCALE ROMA 1
Codice fiscale ente: 13664791004
Prestazione specialistica ambulatoriale
Numero avviso: 3 1234 5678 9012 3456 7
Importo da pagare 36,15 €
Da pagare entro il 15/12/2026`,
    expected: { noticeCode: '312345678901234567', creditorCode: '13664791004', creditorName: null, amount: 36.15, dueDate: '2026-12-15', ambiguous: false } },
  { name: 'codice QR dell\'avviso', text: 'PAGOPA|002|301000000000123456|01199250158|0000008540',
    expected: { noticeCode: '301000000000123456', creditorCode: '01199250158', creditorName: null, amount: 85.4, dueDate: null, ambiguous: false } },
  { name: 'Data Matrix di Poste', text: 'codfase=NBPA;1830100000000012345612000001234567100000008540389601199250158      ',
    expected: { noticeCode: '301000000000123456', creditorCode: null, creditorName: null, amount: 85.4, dueDate: null, ambiguous: false } },
  { name: 'bollo auto', text: `REGIONE LAZIO - Tassa automobilistica
Targa AB123CD
Cod. Fisc. Ente 80143490581
Codice avviso 3 0 1 0 0 0 0 0 0 0 0 0 9 8 7 6 5 4
Totale da pagare € 214,73
Scadenza 31/01/2027`,
    expected: { noticeCode: '301000000000987654', creditorCode: '80143490581', creditorName: null, amount: 214.73, dueDate: '2027-01-31', ambiguous: false } },
];

# Piano di sviluppo Casa in Ordine — sequenza concordata

**Vincolo di rilascio: la revisione complessiva finale si svolge solo dopo il completamento di tutte le funzionalità.** Durante lo sviluppo restano obbligatori test ordinari di sicurezza, regressione, build e verifica RLS per ogni nuova funzione: non sostituiscono l'audit finale.

## Fase 1 — Concludere 3.2 multilingua

- [x] Catalogo italiano, inglese, spagnolo, francese, tedesco e portoghese e provider per lingua individuale
- [x] Selettore lingua, schermata accesso, navigazione, Home, panoramica, bollette e attività
- [x] Demo, calendario, notifiche push, caricamento dati di prova e importazione email lato client
- [x] Migrazione RLS per la lingua del singolo utente; formati numerici e valute senza conversione degli importi
- [x] Traduzione dei flussi principali dei moduli famiglia, budget, spesa e veicoli (verifica linguistica E2E ancora da fare)
- [ ] Traduzione completa dei moduli avanzati: **HomeExtra 1.9 tradotto lato client nei sette pannelli principali** (verifiche visuali e messaggi dinamici ancora da fare); **V20Hub e V21Hub ancora da completare**
- [ ] Tutti i form, modali, errori e stati vuoti della pagina principale (modali di bollette, utenze, attività, rate e Impostazioni già localizzati)
- [ ] Messaggi API e notifiche/email dove opportuno, in lingua del destinatario
- [ ] Coerenza, accessibilità, mobile, test e verifica con due utenti reali
- [ ] CI e Vercel approvati; chiusura PR 3.2 e pubblicazione verificata

## Fase 2 — Nuove funzioni, una alla volta

Ogni funzione richiede flusso realmente utilizzabile, permessi per utente/casa condivisa, eventuale migrazione RLS, test automatici, mobile e anteprima Vercel. Evitare servizi AI a pagamento.

### 3.3 — Gestione rapida

- [ ] **Ricerca universale**: ricerca trasversale di bollette, attività, contratti, documenti e oggetti; risultati per tipo e permessi rispettati; nessuna ricerca indiscriminata fra account.
- [ ] **Acquisizione intelligente unica**: unica azione foto/PDF con classificazione locale e suggerimento di destinazione bolletta, ricevuta o garanzia, con conferma prima di scrivere.
- [ ] **Automazioni personalizzate**: regole soglia importi, rinnovi, frequenze; simulazione, sospensione, cron e deduplica avvisi; autorizzazione di proprietario/editor.

### 3.4 — Cura quotidiana

- [ ] **Professionisti di fiducia**: contatti, professione, note private/condivise, costi e interventi associati a manutenzioni.
- [ ] **Programma stagionale**: checklist adattabili per stagione, località e tipi d'immobile; azioni ricorrenti e completamento.
- [ ] **Scorte domestiche**: scorte, soglie, decrementi, proposta prodotto in lista spesa senza aggiunte silenziose.

### 4.0 — Evoluzione completa

- [ ] **Progetti e lavori**: schede progetto, fasi, preventivi, spese, foto prima/dopo e fornitori.
- [ ] **Fondo sostituzioni**: vita utile indicativa, costi stimati, risparmio mensile e disclaimer delle stime.
- [ ] **Profilo locatore/inquilino**: immobili e contratti, verbali ingresso/uscita, foto e letture, accesso separato per ruolo senza esposizione dati privati.
- [ ] **Casa Control**: pannello facoltativo, indicatori calcolati da eventi veri, formula trasparente, gestione mancanza dati e nessun punteggio arbitrario.

## Fase 3 — Solo dopo le due fasi precedenti: audit indipendente e correzioni

- [ ] Revisione separata e critica dell'intero repository; inventario API, flussi, autorizzazioni, dipendenze e dati.
- [ ] Verifica di Auth, SQL RLS e privilegi, secrets, email/OAuth/cron, documenti e upload.
- [ ] Privacy/GDPR, esportazione/cancellazione, PWA/offline, resilienza e backup/ripristino.
- [ ] Prestazioni, accessibilità WCAG, UX mobile, traduzioni e comportamenti cross-device.
- [ ] Test E2E e di regressione; report con gravità, riproducibilità, correzioni, miglioramenti e rischi residui.
- [ ] Ripetere le verifiche dopo le correzioni e pubblicare il rapporto. Audit interno automatizzato ≠ certificazione di terze parti.

## Regole operative

Le operazioni ad alto rischio o a pagamento richiedono autorizzazione esplicita. Non utilizzare credenziali di produzione per demo, non cancellare dati senza consenso, non introdurre permessi che ampliano la visibilità delle informazioni. Tenere la versione di produzione separata fino ai test. Riportare risultati verificati senza attribuire successo a controlli non effettuati.

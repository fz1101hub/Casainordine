# Piano di sviluppo Casa in Ordine — sequenza concordata

**Vincolo di rilascio: la revisione complessiva finale si svolge solo dopo il completamento di tutte le funzionalità.** Durante lo sviluppo restano obbligatori test ordinari di sicurezza, regressione, build e verifica RLS per ogni nuova funzione: non sostituiscono l'audit finale.

## Fase 1 — Concludere 3.2 multilingua

- [x] Catalogo italiano, inglese, spagnolo, francese, tedesco e portoghese e provider per lingua individuale
- [x] Selettore lingua, schermata accesso, navigazione, Home, panoramica, bollette e attività
- [x] Demo, calendario, notifiche push, caricamento dati di prova e importazione email lato client
- [x] Migrazione RLS per la lingua del singolo utente; formati numerici e valute senza conversione degli importi
- [x] Traduzione dei flussi principali dei moduli famiglia, budget, spesa e veicoli (verifica linguistica E2E ancora da fare)
- [x] Traduzione completa, compresi HomeExtra, V20Hub e V21Hub, moduli, errori, stati vuoti, messaggi delle API, email, notifiche e calendario (22 novembre: dizionario unico, vedi docs/I18N_V32.md)
- [x] Controlli automatici: dizionario completo nelle sei lingue e prova nel browser che cerca i testi non tradotti
- [ ] Verifica con l'app online: due account in lingue diverse, email e notifiche ricevute, mobile e lettore di schermo (serve `SUPABASE_SECRET_KEY` su Vercel)

## Fase 2 — Nuove funzioni, una alla volta

Le voci spuntate hanno codice, test e prova nel browser in demo; la prova con un account vero si fa insieme a quella della Fase 1, quando la produzione torna attiva.

Ogni funzione richiede flusso realmente utilizzabile, permessi per utente/casa condivisa, eventuale migrazione RLS, test automatici, mobile e anteprima Vercel. Evitare servizi AI a pagamento.

### 3.3 — Gestione rapida

- [x] **Ricerca universale**: ricerca trasversale di bollette, attività, contratti, documenti e oggetti; risultati per tipo e permessi rispettati; nessuna ricerca indiscriminata fra account. — #59 (Ctrl/Cmd+K o «/»).
- [x] **Acquisizione intelligente unica**: unica azione foto/PDF con classificazione locale e suggerimento di destinazione bolletta, ricevuta o garanzia, con conferma prima di scrivere. — #60.
- [x] **Automazioni personalizzate**: regole soglia importi, rinnovi, frequenze; simulazione, sospensione, cron e deduplica avvisi; autorizzazione di proprietario/editor. — #61; serve `migrate_v43_automazioni.sql` sul database.

### 3.4 — Cura quotidiana

- [x] **Professionisti di fiducia**: contatti, professione, note private/condivise, costi e interventi associati a manutenzioni. — #62; serve `migrate_v44_professionisti.sql` sul database.
- [x] **Programma stagionale**: checklist adattabili per stagione, località e tipi d'immobile; azioni ricorrenti e completamento. — #63; serve `migrate_v45_stagionale.sql` sul database.
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

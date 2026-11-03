# Piano di collaudo — Casa in Ordine 2.0

## Test eseguiti in questa consegna

- `npm test`: 104 test Node passati al momento del confezionamento. Verificano regole, calcoli, parsing, checksum IBAN, classificazione e alcuni invarianti statici SQL.
- Parsing TypeScript del codice JS/JSX: nessun errore sintattico nei moduli controllati.
- Esistenza degli import relativi verificata senza build.
- Registro npm non raggiungibile: **dipendenze non installate e `next build` non eseguita**.

## Test indispensabili ancora da eseguire

- [ ] Applicazione migrazione v20 reale in un database staging derivato dalla v19; rollback da backup.
- [ ] RLS: utente A privato, utente B privato, entrambi nella casa H, e un utente C senza accesso. B senza permessi di modifica non deve poter usare API/RPC né leggere bozze o case di A.
- [ ] Creazione, modifica, cancellazione e ripristino di `house_tasks` e `home_shopping` con utenti diversi. Verificare conservazione massima 30 giorni e nessun recupero da case estranee.
- [ ] Storico della casa: il proprietario e i membri leggono soltanto gli eventi del loro spazio, il personale non è visibile agli altri.
- [ ] PagoPA: 15/18 cifre, codici duplicati, QR non riconosciuto, testi ambigui, generazione atomica di scadenza e promemoria, nessun pagamento automatico.
- [ ] Controlli IBAN: PDF digitale, foto, più IBAN, codice non valido, stesso IBAN e cambio IBAN. Nessun IBAN integrale nel database, log del server o backup.
- [ ] Confronto degli importi contro lo storico, assenza di falsi allarmi su utenze appena create e bollette solamente stimate.
- [ ] Controllo Gmail, Microsoft, IMAP reali: autorizzazioni, revoche, scadenze token, limiti cron, notifiche per collegamenti interrotti.
- [ ] Test push PWA su Android e iPhone (installazione su Home per iOS), inclusi revoca permessi e ore silenziose.
- [ ] Offline: prima installazione online, passaggio in modalità aereo, salvataggio di bozze e file, ritorno online, replay idempotente e differenza tra casa privata e condivisa.
- [ ] Confermare che gli account email personali non siano visibili alle case condivise.
- [ ] Backup Supabase e bucket Storage con procedura di ripristino realmente provata, senza chiavi OAuth nella copia.
- [ ] Carico oltre 8 caselle email: definire coda e capacità prima della diffusione ampia.

## Limiti non coperti dal codice v2.0

Non sono implementati pagamenti pagoPA diretti, accesso alle aree clienti di tutti i fornitori, verifica di titolarità bancaria, sincronizzazione bidirezionale calendario, app native negli store o sincronizzazione offline di file senza revisione. Non dichiarare questi punti disponibili.

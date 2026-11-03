# Collaudo Casa in Ordine 2.1

## Verificato in questa consegna

- Test di logica dei nove nuovi moduli, comportamento sui duplicati e sui dati non autorizzati.
- Controllo sintattico JS/JSX via parser TypeScript senza compilazione Next completa.
- Verifica degli import relativi e dell'assenza di credenziali nel pacchetto.
- I test della 2.0 sono stati mantenuti.

## Da eseguire prima della pubblicazione

- [ ] `npm install` e `npm run build` su macchina con accesso al registro npm. Durante questa sessione `npm install` si è fermato per timeout; Next e `qrcode` non erano presenti.
- [ ] Applicare `migrate_v21.sql` a staging Supabase derivato da v2.0; testare rollback da backup e integrità riferimenti.
- [ ] RLS: utente A e B privati, casa H con owner, editor e viewer, casa K estranea, utenti rimossi. Le schede SOS e l'inventario di A non devono essere consultabili da B se non appartengono alla stessa casa.
- [ ] Provare QR fisici dopo login/logout su iPhone e Android; scansionando il QR di una casa condivisa l'app deve selezionare la casa corretta senza esporre dati a estranei.
- [ ] Provare i collegamenti dei documenti e i permessi Storage; caricare e aprire fotografie con i permessi appropriati, con e senza accesso alla casa.
- [ ] Produrre una copia SOS cifrata online, mettere il telefono offline, aprirla con la frase corretta e respingere una frase errata. Verificare cancellazione locale, rotazione e aggiornamento manuale della copia.
- [ ] Link vacanza: validità 24h/72h/7gg, scadenza, revoca, assenza di leak di dati in risposta, assenza di caching, test in finestra privata.
- [ ] Votazioni: viewer può votare ma non creare/modificare la proposta; i membri non possono votare proposte esterne; voto aggiornabile solo prima della chiusura.
- [ ] Radar: verificare documenti reali, note di credito, conguagli e false positività. Non usarlo per eseguire bonifici.
- [ ] Stampare passaporto in PDF da iPhone, Android e desktop verificando esclusione predefinita dell'indirizzo e dei seriali.
- [ ] Testare passaggio tra casa privata e condivisa con due utenti, budget, avvisi e dati incrociati.
- [ ] Eseguire nuovamente i collaudi aperti nelle versioni 1.9 e 2.0: sincronizzazione Gmail/Outlook/IMAP, cron, notifiche push, email e sicurezza storage.

## Limiti consapevoli

I test automatici in Node non sostituiscono un database e dispositivi reali. La 2.1 non è stata pubblicata in questa sessione. La condivisione temporanea si basa su un link segreto: chi lo possiede può leggerne il testo fino a revoca/scadenza, pertanto si devono condividere solo dettagli non sensibili. Anche con cifratura, una frase offline debole è vulnerabile ad attacchi di forza bruta.

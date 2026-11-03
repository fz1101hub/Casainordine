# Stato della versione 2.0

**Codice delle 8 nuove aree integrato; collaudo reale ancora necessario.** Funzioni principali: rilevamento bollette attese, controllo antifrode, pagoPA con avviso T-3 opzionale, salute mail, audit/recupero limitato, bozze offline, checklist trasloco e risparmio.

### Blocchi prima di una distribuzione pubblica

- Compilazione completa e test E2E con le librerie realmente installate.
- Applicazione migrazione v20 su staging e security audit RLS/RPC su più account.
- Test OCR e scanner QR su PDF/foto autentiche e device reali.
- Test cron, email e push; coda di sincronizzazione oltre 8 caselle/turno.
- Backup/restore automatico dei dati binari e cancellazione dei documenti orfani.
- Configurazione OAuth Google/Microsoft e verifica disponibilità per account di terzi.
- Pubblicazione HTTPS, monitoraggio errori e test offline iPhone/Android.

Vedi `docs/COLLAUDO_V20.md`.

---

# Casa in Ordine 1.9 — Stato di sviluppo e collaudo

## Funzioni con codice e schermate implementate

1. Grafici e indicatori di consumo da bollette (kWh/Smc/m³), valori OCR confermati e segnalazione anomalie basate su storico.
2. Archivio documenti privato con categorie, riferimenti a bollette/immobili, storage e RLS per case condivise, ricerca e accesso tramite link firmato.
3. Previsioni di spesa per i prossimi 3/6/12 mesi con indicazione di importi già noti e di stime.
4. Autoletture contatori da foto o input, storico, differenze e scadenze di comunicazione ricorrenti.
5. Impianti e manutenzioni, garanzie, storico interventi con costo e documenti, avvisi nel cron.
6. Ricevute e registro pagamenti con conferma esplicita atomica e corrispondenza dell'importo; nessuna verifica automatica di movimenti bancari.
7. Più immobili per spazio con assegnazione di bollette, utenze, documenti e interventi; permessi ereditati dalla casa.
8. Contratti e rinnovi con importi, date, allegati e avviso programmato; nessun confronto automatico di offerte live.
9. Preferenze push per categoria, ore silenziose italiane e elenco degli avvisi interni.
10. Esportazione JSON dei metadati/dati, CSV bollette e report PDF tramite stampa browser. Nessun export dei token o degli allegati binari.

Rimangono tutte le funzioni delle versioni 1.1-1.8: account privati, collegamenti email individuali Gmail/Outlook/IMAP, OCR e regole, calendario, promemoria bollette T-3, case condivise, budget, spesa, auto, faccende, liste.

## Prima di usare davvero o distribuire

- [ ] Installare le dipendenze Next.js ed eseguire una build completa (`npm ci` o `npm install`, `npm run build`). La registrazione npm non era raggiungibile durante lo sviluppo qui.
- [ ] Applicare `supabase/migrate_v19.sql` su un database staging **con backup** e verificare che schema, policy, trigger, storage, RPC funzionino effettivamente. Controllo solo statico SQL finora.
- [ ] Creare due account e due case; provare esplicitamente che il ruolo lettore e gli utenti di altre case non possano leggere/download/modificare dati e documenti, anche conoscendo gli UUID.
- [ ] Provare importazione e OCR con bollette, letture e ricevute reali, incluse scansioni illeggibili e documenti contraffatti. La conferma di pagamento deve rimanere esplicita.
- [ ] Verificare con dispositivi Android/iPhone reali che le push arrivino dopo l'autorizzazione; provare le ore silenziose, modifiche ruolo, disiscrizione dei device.
- [ ] Configurare job giornalieri, logging, limite agli utenti, retry/paginazione e monitoraggio errori; i job ora processano un massimo di 1000 record per alcuni flussi.
- [ ] Impostare backup automatici del server/storage e prova di ripristino; la v1.9 offre esportazioni manuali ma NON un ripristino completo automatico.
- [ ] Aggiungere procedura sicura di cancellazione dei file dallo Storage quando una casa o un account è cancellato; adesso la cancellazione di righe via cascata può lasciare file fisici orfani.
- [ ] Pubblicare privacy policy e termini, definire tempi di conservazione e verificare autorizzazioni Google/Microsoft per gli account reali di terzi.
- [ ] Se interessano gli store, packaging native e approvazione Apple/Google. La PWA installabile non equivale a pubblicazione negli store.

**Non dichiarare la versione 1.9 già online o pronta per il pubblico.** I test automatici coprono funzioni deterministiche e la presenza di policy nel codice, **non** verificano RLS Supabase, integrità dei bucket o funzionamento OAuth nel cloud.

## Casa in Ordine 2.1 — implementato nel sorgente (ancora da collaudare)

- QR protetti sugli impianti; SOS online/offline cifrato; radar di incoerenze; simulazioni; dossier immobile; checklist vacanza e link a tempo revocabili; inventario con foto; proposte e voti familiari; riepilogo essenziale delle azioni.
- Sicurezza da verificare con Supabase di staging e test end-to-end: RLS, Storage, link temporanei, email e push.
- Compilazione Next/PWA e verifica QR su smartphone: bloccate in questa sessione dall'installazione delle dipendenze (timeout npm).
- Pubblicazione e distribuzione negli store non eseguite.

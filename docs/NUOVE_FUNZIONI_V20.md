# Casa in Ordine 2.0 — funzioni, installazione e limiti

Questa è una **versione sorgente**, non una distribuzione già online e collaudata. Il funzionamento automatico richiede Supabase, hosting Next.js e cron attivi. Nessuna API AI a consumo viene utilizzata; OCR e parsing del documento lavorano localmente nel browser.

## Otto novità principali

1. **Bollette attese ma non ricevute**: `missingBillCandidates` confronta le bollette *reali* precedenti per una stessa utenza (ne servono almeno due e cadenza coerente) con il periodo programmato. Una soglia di 7 giorni riduce i falsi allarmi. Stime automatiche NON contano come ricevute. Il cron invia un solo avviso per scadenza prevista.
2. **Antifrode**: importi molto diversi rispetto allo storico (almeno tre bollette di confronto), mittente non noto, fallimenti dichiarati dell'autenticazione email e cambi di IBAN. Per l'IBAN italiano c'è un controllo modulo 97; l'app salva solo SHA-256 e ultime 4 cifre. La verifica dei mittenti e la correttezza del codice IBAN **non attestano l'identità del beneficiario**. Nessuna bolletta viene bloccata o segnata pagata dall'antifrode.
3. **Avvisi pagoPA**: upload PDF/foto per OCR locale e lettura QR via BarcodeDetector quando il browser lo supporta; codice avviso manuale come fallback. Inserimento di importo, ente e scadenza. Se l'utente conferma, un'unica transazione crea anche la bolletta con l'avviso T-3; non gestisce denaro né accede a pagoPA.
4. **Monitoraggio automazioni**: stato e ultima scansione delle caselle, richieste di nuovo accesso e avvisi se il collegamento non viene controllato da oltre 48 ore. Preferenza indipendente per le push di monitoraggio.
5. **Cronologia e cestino**: trigger SQL registrano aggiunte, modifiche ed eliminazioni delle principali entità. Attività personali e articoli della spesa eliminati possono essere recuperati per 30 giorni; gli altri tipi di dato sono soltanto in cronologia. Audit conservato al massimo 365 giorni dal cron giornaliero.
6. **Offline**: dopo una prima visita online della PWA in HTTPS, il Service Worker mostra `/offline.html` quando manca rete. La pagina può conservare attività, articoli della spesa e foto/PDF nel browser mediante IndexedDB. Dopo il rientro online, l'utente importa consapevolmente le bozze; gli inserimenti di attività e spesa usano RPC idempotenti. I documenti non sono importati automaticamente e vanno scaricati e ricaricati per revisione. I dati locali **non sono cifrati**: evitare computer condivisi e non cancellare i dati del browser fino all'importazione.
7. **Traslochi**: piano e checklist di 7 passaggi con date relative al trasloco; tracking dei completamenti e avviso nei 7 giorni prima della data. L'app non esegue disdette, cambi di residenza o volture reali.
8. **Obiettivi risparmio**: target, saldo accantonato, scadenza, quota mensile suggerita e avviso di scadenza entro 30 giorni. Sono semplici calcoli, non trasferimenti bancari. Il confronto delle tariffe è un link al Portale Offerte, senza scraping o integrazione automatica.

## Installazione di un progetto nuovo

1. Scarica il pacchetto e apri la cartella `casa-in-ordine`.
2. Installa Node.js compatibile con Next 15 e le dipendenze (`npm install`); esegui `npm test` e **`npm run build`**. La build non è stata verificabile qui per indisponibilità del registro npm.
3. Crea un progetto Supabase vuoto. Esegui `supabase/schema.sql` come indicato dalla guida di base; in un ambiente esistente **non** rieseguire schema e migrazioni precedenti. Esegui soltanto le migrazioni mancanti, in ordine.
4. Se aggiorni da 1.9, effettua un backup del database e poi applica **`supabase/migrate_v20.sql` una sola volta**, su staging prima che su produzione.
5. Copia `.env.example` in `.env.local` e imposta URL Supabase, chiave pubblica e **segreti solo lato server**. Configura OAuth per Gmail e Microsoft, credenziali dei provider IMAP, dominio HTTPS, CRON_SECRET e, se vuoi le email/push, Resend e VAPID.
6. Pubblica la Next.js web app con HTTPS, attiva le cron di `vercel.json` e verifica i log delle due route `/api/mail/cron` e `/api/cron`.
7. Collauda con due account reali, almeno una casa condivisa, due caselle email e iPhone/Android come descritto in `docs/COLLAUDO_V20.md`.

**Nota di capacità:** il job email attuale elabora un massimo di 8 collegamenti per esecuzione, con al massimo 12 email e 3 allegati per collegamento. Questo è un limite intenzionale dei costi/tempi, **non una garanzia di scansione quotidiana per un numero illimitato di utenti**. Occorre un worker con coda e batch configurati prima di distribuirla su larga scala. Anche il job principale usa limiti di lettura per esecuzione.

## Funzionamento delle notifiche

Il controllo delle email resta separato dall'avviso sulle bollette e dal riepilogo mensile. Le bollette normali ricevono il promemoria T-3 solo se ancora aperte. Bollette mancanti, anomalie e problemi con una casella producono avvisi interni deduplicati, con push opzionale. Le push richiedono un service worker attivo, HTTPS, un dispositivo compatibile e VAPID configurato. Le date di invio e le ore silenziose dipendono dalla configurazione del server.

## Privacy e rischi da non trascurare

- La scelta di una casa condivisa modifica l'accessibilità di documenti, spese e notifiche. Ogni membro vede solo i dati del proprio spazio o delle case a cui appartiene.
- L'app usa `security definer` per alcune RPC delicate, ma verifica esplicitamente `auth.uid()` e permessi di modifica; deve essere **testata su Supabase reale** prima di essere usata da terzi.
- I controlli antifrode sono segnali euristici: non garantiscono assenza di frodi; non è possibile verificare con certezza una bolletta o l'IBAN senza una fonte esterna affidabile.
- Non archiviare password della posta in backup JSON; per il backup completo dei documenti sono necessarie copie di sicurezza del bucket Supabase.
- La funzione di scansione dei QR dipende dal browser; alcuni QR pagoPA usano formati diversi e potrebbero dover essere trascritti. Confermare sempre codici e importi contro l'avviso originale.
- Il controllo del testo e delle immagini tramite OCR può sbagliare, specialmente con scansioni sfuocate. Nessun pagamento viene avviato dall'app.
- Per un lancio pubblico servono collaudo, condizioni d'uso/privacy, verifiche Google eventualmente necessarie per Gmail e una strategia di backup/ripristino.

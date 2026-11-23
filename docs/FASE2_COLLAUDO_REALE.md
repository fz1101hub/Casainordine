# Fase 2 — Protocollo di collaudo reale (non eseguito)

**Stato al 23 novembre 2026:** le dieci funzionalità sono integrate secondo la roadmap; il collaudo con account reali rimane aperto. Questo documento è una procedura, **non** un verbale di test superati. La Fase 3 resta bloccata fino alla chiusura documentata di questi controlli.

## Prerequisiti e protezione dei dati

- Verificare deployment realmente raggiungibile, variabili d'ambiente configurate tramite pannelli sicuri (mai riportare valori nei log), stato migrazioni v43–v49 e delle eventuali v50–v52 mediante elenco versioni applicate; non applicare SQL alla cieca.
- Predisporre due account di test distinti, A e B, e due case separate; successivamente invitare B in una casa condivisa con ruolo minimo. Usare dati sintetici, nessuna credenziale di utenti reali.
- Registrare per ogni prova data/ora, ambiente, commit SHA, account/ruolo (identificativi anonimizzati), dispositivo/browser, esito, screenshot oscurati e issue di riferimento.
- Non disabilitare RLS, non usare service-role nel browser, non effettuare modifiche distruttive o spese.

## Matrice minima di accettazione

| Area | Prova positiva | Prova negativa / isolamento |
| --- | --- | --- |
| Lingue | A in italiano, B in francese; ripetere en/es/de/pt su schermate, errori, email, date e importi; persistenza preferenze | La lingua di A non modifica quella di B; nessuna chiave grezza o importo convertito impropriamente |
| Ricerca | Ricerca su bollette, contratti, attività, documenti propri e condivisi autorizzati | A non vede record della casa esclusiva di B |
| Acquisizione | Foto/PDF di bolletta, ricevuta, garanzia; anteprima, correzione, conferma e persistenza | Annullamento non scrive; nessun allegato accessibile da altro account |
| Automazioni | Simulazione regola, attivazione, sospensione, deduplica e cron su dati di prova | Viewer non crea/modifica regole; nessun invio doppio |
| Professionisti | Crea contatto, intervento, costo, collega manutenzione | Note private invisibili agli altri membri |
| Stagionale | Checklist, ricorrenza, completamento, cambio stagione | Nessuna modifica da ruolo senza permesso |
| Scorte | Soglia e suggerimento lista spesa, conferma esplicita | Nessun inserimento automatico non confermato |
| Progetti | Preventivi, fasi, costi, foto, budget | File privati e modifiche non autorizzate negati |
| Fondo | Obiettivo, contributo, stima e spiegazione | Nessuna previsione presentata come dato certo |
| Affitti | Locatore/inquilino, verbale, foto, firme e accessi distinti | Inquilino non accede a documenti privati del locatore |
| Casa Control | Attiva/disattiva, indicatori tracciabili a dati effettivi, dati mancanti | Nessun valore inventato e nessuna lettura fuori permesso |
| Backup/ripristino | Backup sintetico, restore additivo, ripetizione idempotente, spese divise e scadenze auto | Nessuna duplicazione, perdita o sovrascrittura dei record esistenti |
| Notifiche/email | Messaggio ricevuto in lingua attesa, preferenze e disiscrizione, cron e deduplica | Nessun invio a destinatario estraneo |
| UX/mobile | Tastiera, focus, lettore di schermo, 320px, PWA e offline essenziale | Nessun blocco navigazione o esposizione dati in cache condivisa |

## Evidenze richieste prima di chiudere Fase 2

1. CI del commit candidato: test, build e test:languages verdi; allegare URL run e SHA.
2. Anteprima verificata sul commit candidato; verificare URL pubblico e login reale, non soltanto stato READY.
3. Risultati della matrice con esiti **PASS / FAIL / BLOCKED**, riferimenti a issue e correzioni; test RLS sia via API autenticata sia su file privati.
4. Evidenza dell'effettiva applicazione delle migrazioni necessarie e della loro compatibilità con dati preesistenti.
5. Firma di accettazione del responsabile di rilascio; se resta anche un blocco critico, non dichiarare completata la Fase 2 e non iniziare l'audit Fase 3.

**Nota:** questo protocollo non autorizza deploy, invii reali, migrazioni o accessi a dati personali; tali operazioni richiedono ambiente e permessi appropriati.

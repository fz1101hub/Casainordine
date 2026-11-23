# Collaudo del database vero — 23 novembre 2026

**Ambito:** solo il database del progetto Supabase di produzione (regole di accesso, trigger, vincoli e funzioni). Non riguarda l'app pubblicata, che il 23 novembre risponde ancora `503 databaseConfig` perché su Vercel manca `SUPABASE_SECRET_KEY`, né email, notifiche o file reali. Non è un collaudo completo della Fase 2: è un'evidenza per i controlli G03 (migrazioni) e G04 (isolamento) del protocollo.

## Metodo

- Le prove sono quelle che la CI esegue a ogni PR su PostgreSQL 17 con un sostituto di Supabase (`supabase/tests/*_test.sql`, lavoro `database`). Qui sono state eseguite sul database vero, quindi con lo schema `auth` e lo schema `storage` veri di Supabase.
- **Senza lasciare traccia:** ogni file gira in una sola transazione che finisce sempre con un errore voluto, `COLLAUDO|prove|fallite|nomi`. Così il risultato arriva nel messaggio e tutto viene annullato: utenti, case e file di prova non restano.
  - Prima e dopo ogni gruppo il database aveva 0 utenti, 0 case, 0 profili e 0 file.
  - Le funzioni con effetti fuori dalla transazione (richieste HTTP con `pg_net`) non vengono chiamate da nessuna prova.
- **Impersonazione degli utenti:** gli utenti si impersonano con `set role authenticated` e `request.jwt.claims`, come fa PostgREST.
- **Migrazioni applicate:** v51 e v52 sono state applicate il 23 novembre, con il via dell'utente. Dopo l'applicazione, l'impronta di regole di accesso e funzioni del database vero (194 regole, `md5` del testo) è identica a quella della copia su cui girano le prove.

## Esiti

| Gruppo | Prove | Fallite | Esito |
| --- | --- | --- | --- |
| Funzioni privilegiate (`sicurezza_funzioni_test.sql`) | 99 | 0 | PASS |
| Automazioni (v43) | 20 | 0 | PASS |
| Professionisti (v44) | 19 | 0 | PASS |
| Stagionale (v45) | 18 | 0 | PASS |
| Scorte (v46) | 15 | 0 | PASS |
| Progetti (v47) | 19 | 0 | PASS |
| Fondo di sostituzione (v48) | 12 | 0 | PASS |
| Affitti (v49) | 28 | — | BLOCKED |
| Email dei promemoria (v50) | 12 | — | BLOCKED |

**Totale eseguito: 202 prove, 0 fallite.**

Per v49 e v50 Supabase chiede una conferma, perché ci sono aggiornamenti senza filtro dentro la transazione. Il client l'ha annullata in automatico (dopo 0,4 s) e non è partito niente. Restano BLOCKED finché qualcuno non conferma l'esecuzione. Gli stessi file passano nella CI (28 e 12 prove).

## Che cosa coprono le prove eseguite

- **Funzioni privilegiate:**
  - ognuna delle 21 azioni chiamabili dall'app rifiuta estraneo, lettore ed editor dove serve il proprietario;
  - l'elenco delle funzioni privilegiate chiamabili è chiuso;
  - nessuna di queste funzioni è chiamabile da `anon`;
  - `search_path` fisso su tutte;
  - le funzioni di controllo stanno fuori da `public`;
  - gli affitti vogliono l'email verificata.
- **Sezioni della Fase 2:** in ognuna, il lettore vede ma non scrive; l'editor scrive ma non cambia autore o casa; l'estraneo non vede niente; valgono i limiti per spazio e i vincoli sui dati; le voci restano coerenti quando una persona lascia la casa o cancella l'account.

## Non coperto qui

Login reale, sessioni e recupero password; Storage via API (le regole dei bucket sono provate solo con inserimenti diretti); email, notifiche e cron reali; l'app pubblicata.

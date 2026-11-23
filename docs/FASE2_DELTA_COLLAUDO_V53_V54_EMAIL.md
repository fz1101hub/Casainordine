# Fase 2 — Delta di collaudo per modifiche concorrenti (23 novembre 2026)

**Stato: da verificare, non PASS.** Questa scheda integra `FASE2_COLLAUDO_REALE.md` e `FASE2_SBLOCCO_DEPLOY_CHECKLIST.md`. Non avvia l'audit di Fase 3. Le verifiche sono riferite ai commit/PR indicati e non dimostrano applicazione delle migrazioni in produzione.

## Evidenza di repository letta

- PR #99 unita in `main` con commit `80681eee5a4cf679abfb00e6550da3ea17e5e635`: differimento delle notifiche push durante l'orario silenzioso, migrazione v53 e prova `tests/promemoria-completi.test.mjs`.
- PR #101 unita in `main` con commit `84d8273b95eb0081431026659cb5fe5dfc75feaf`: eliminazione account e pulizia locale, migrazione v54, prova SQL `supabase/tests/eliminazione_account_test.sql` e browser `scripts/prove-eliminazione-account.mjs`.
- PR #102 **unita in `main` il 23 novembre 2026 alle 17:45 UTC**, merge commit `e2fc4ecd82ab20359e7e8feecc7eaa1f92a001e0` (head `23fd185f77aa857c201b16c2eb25f72a54061c42`): email HTML e solo testo, disiscrizione GET/POST con token HMAC, intestazioni `List-Unsubscribe`, controlli browser e dimensioni dei comandi desktop. Questi dettagli sono dichiarati nella descrizione della PR e **non equivalgono a CI o collaudo reale indipendentemente verificati**. La chiave di firma dipende dalla configurazione `SUPABASE_SECRET_KEY`: il blocco `503 databaseConfig` precedentemente documentato rende particolarmente importante il gate DEP.

## Gate addizionali obbligatori prima di chiudere Fase 2

| ID | Ambito | Prova reale richiesta | Esito |
| --- | --- | --- | --- |
| M53 | Migrazione v53 | Leggere lo storico delle migrazioni nell'ambiente esatto; controllare tabella, privilegi, policy e job orario; evitare di applicare SQL se la versione è già presente | BLOCKED |
| P53 | Push differite | Con due utenti di prova e fusi/orari diversi, verificare coda nell'orario silenzioso, invio dopo la fine, deduplica, scadenza e revoca preferenza; registrare solo identificativi sintetici | BLOCKED |
| M54 | Migrazione v54 | Confermare versione applicata, dipendenze e comportamento di cancellazione senza usare dati reali; verificare rollback/ripristino autorizzato in ambiente isolato | BLOCKED |
| A54 | Eliminazione account | Su utenti sintetici, controllare inviti aperti/usati, file personali/condivisi, proprietà e membership, token invalidati, cache offline e iscrizioni push; assicurare che i dati degli altri utenti restino invariati | BLOCKED |
| E102 | Email e disiscrizione | La PR #102 è ora unita in `main`; verificare che sia inclusa nello SHA candidato, poi verificare GET senza effetti, POST autorizzato con token valido, rifiuto token alterato, isolamento destinatario, lingua, versione testo, intestazioni unsubscribe e prova di invio in ambiente controllato | BLOCKED |
| RLS | Accesso reale | Eseguire richieste con JWT separati per A/B e ruoli differenti, incluse API, storage e ricerca; non sostituire con il Supabase finto o il database CI | BLOCKED |
| DEP | Deploy | Verificare nuovamente l'eventuale `503 databaseConfig` e la presenza delle variabili **solo per nome**; documentare SHA/ambiente/URL senza segreti | BLOCKED |

## Regole per la prova

1. Associare ogni risultato a SHA completo, URL della run/deploy, ambiente, data, operatore e issue; registrare PASS/FAIL/BLOCKED e non promuovere una prova locale a prova reale.
2. Non eseguire migrazioni, invii, cancellazioni o modifica di variabili di produzione senza autorizzazione; preferire account e dati sintetici e ambiente isolato.
3. Prima del rilascio, rieseguire `npm ci`, `npm test`, `npm run build`, `npm run test:languages -- http://localhost:3000` con server disponibile, test browser e SQL previsti dal workflow sullo **stesso SHA candidato**.
4. Le prove dichiarate nelle descrizioni delle PR non equivalgono a log indipendentemente verificati; le migrazioni versionate nel repository non equivalgono a migrazioni applicate.
5. Se una PR concorrente cambia codice o schema dopo il collaudo, rivalutare le righe impattate. Fase 3 resta NON AUTORIZZATA finché tutti i gate obbligatori non hanno evidenza reale.

## Aggiornamento repository — 23 novembre 2026, ore 19:41 CET

La lettura diretta dei metadati GitHub conferma PR #102 `closed / merged`, merge SHA `e2fc4ecd82ab20359e7e8feecc7eaa1f92a001e0`. La PR #88 resta `open / draft`, head `42491db92fe0d4eb1ae657df93ddb648d255d254`; GitHub riporta `mergeable=false`. **Non dedurre la causa della non-mergeability senza analizzare i conflitti e i controlli richiesti.** Prima di integrare la documentazione occorre confrontare la base `main` aggiornata con il branch, preservando eventuali modifiche concorrenti. Il gate E102 è applicabile al prossimo candidato integrato, ma resta `BLOCKED` finché non siano verificati CI sullo SHA candidato e prove reali di invio/disiscrizione. Nessun deploy, migrazione, segreto o dato modificato in questa verifica. Fase 3 non avviata.

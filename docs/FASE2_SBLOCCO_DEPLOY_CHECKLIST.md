# Fase 2 — Sblocco controllato del deployment e collaudo reale

**Stato: BLOCKED.** Questo documento è una procedura di accettazione, non una prova eseguita. Non avvia la Fase 3 e non autorizza operazioni sui dati di produzione.

## Blocco noto e diagnosi minima

Il documento `docs/COLLAUDO_DATABASE_20261123.md` riferisce che l'app pubblica risponde `503 databaseConfig` per una configurazione Vercel mancante (`SUPABASE_SECRET_KEY`). **Verificare nuovamente il comportamento prima di intervenire:** una diagnosi storica non dimostra lo stato attuale. Non scrivere mai il valore di chiavi o token in issue, log, screenshot, PR o documenti.

1. Verificare in Vercel il progetto e l'ambiente esatti (Preview/Production) e la presenza **solo come nome** delle variabili richieste dal codice. Non copiare valori nei log. Evitare di impostare segreti su preview pubbliche o branch non fidati.
2. Se manca una variabile, chiedere conferma all'amministratore responsabile prima di modificarla. Usare esclusivamente il pannello protetto del provider e le credenziali appropriate; non usare chiavi di servizio nel browser o in variabili `NEXT_PUBLIC_*`.
3. Dopo un'eventuale modifica autorizzata, eseguire il deployment secondo le procedure del progetto e registrare URL, ambiente, SHA, ora, esito HTTP e ID del deploy. Non dichiarare risolto il 503 in assenza di nuova verifica.
4. Se il 503 persiste, raccogliere solo il codice di errore e log **redatti** (nessun cookie, Authorization header, indirizzo email, token, chiave o dato personale).

## Matrice di collaudo reale (ambiente autorizzato)

Per ogni riga registrare **PASS / FAIL / BLOCKED**, SHA, ambiente, data, operatore, evidenza senza dati personali. Non eseguire su utenti o case reali senza autorizzazione e piano di ripristino.

| ID | Verifica | Criterio di accettazione |
| --- | --- | --- |
| D01 | Disponibilità | App raggiungibile senza `503 databaseConfig`; login e logout funzionanti |
| D02 | Isolamento | Account A non legge né modifica dati privati di B tramite UI e API; nessuna fuga nei risultati della ricerca |
| D03 | Condivisione | Accesso ai dati condivisi solo con appartenenza e ruolo corretti; revoca effettiva |
| D04 | Moduli 1–10 | Creazione, modifica, lettura, cancellazione consentita e rifiuto delle operazioni vietate; conferma prima dell'acquisizione o suggerimenti |
| D05 | Lingue | Due account con preferenze diverse; UI, errori, importi, date, email e notifiche coerenti per it/en/es/fr/de/pt |
| D06 | Comunicazioni | Invio email, cron e notifiche con evidenza di consegna, deduplica, consenso e gestione degli errori |
| D07 | Backup | Esportazione e ripristino in ambiente isolato; niente duplicati, niente accesso incrociato, nessuna perdita di quote o scadenze |
| D08 | Mobile/PWA/accessibilità | Navigazione tastiera, lettore schermo, mobile, offline e installazione PWA con prove manuali documentate |
| D09 | Migrazioni | Versioni realmente applicate, compatibilità schema, RLS attiva e nessuna migrazione distruttiva |

**Gate:** tutti i controlli obbligatori devono essere PASS con evidenze riproducibili prima di dichiarare completata la Fase 2. In particolare, le 202 prove DB documentate non sostituiscono i test v49/v50 bloccati né i test via API con due account veri. In caso di FAIL o BLOCKED, mantenere la PR draft e non iniziare l'audit della Fase 3.

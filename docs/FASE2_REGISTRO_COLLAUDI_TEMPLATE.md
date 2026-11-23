# Fase 2 — Registro esecuzione collaudi (modello, nessun test eseguito)

Questo registro integra [FASE2_COLLAUDO_REALE.md](FASE2_COLLAUDO_REALE.md). **Non compilare PASS senza prova riproducibile.** Non contiene credenziali, dati personali, URL firmati o token. Ogni sessione di collaudo usa una copia di questa tabella, datata, in una PR separata; conservare screenshot anonimizzati in un archivio autorizzato e riportare solo il riferimento.

## Identificazione della sessione

| Campo | Valore |
| --- | --- |
| Data e ora (UTC) | NON ESEGUITO |
| Commit applicazione e branch | DA RILEVARE |
| CI: URL run, SHA, test/build/test:languages | BLOCKED — non verificati per questa sessione |
| Deployment: URL e risposta HTTP/login | BLOCKED — non verificati per questa sessione |
| Supabase: progetto/ambiente (senza ID sensibili) | DA RILEVARE |
| Migrazioni v43–v52 (versioni effettivamente applicate) | BLOCKED — da confrontare con storico DB |
| Browser/dispositivi | DA RILEVARE |
| Account sintetici A/B, case H1/H2 e ruoli | DA PREPARARE |
| Responsabile accettazione | DA INDICARE |

## Ordine obbligatorio delle prove

1. Verificare commit e CI sullo stesso SHA; se manca una delle tre verifiche richieste, registrare BLOCKED.
2. Verificare raggiungibilità dell'URL pubblico, login e persistenza della sessione; lo stato READY da solo non basta.
3. Con due account sintetici separati, creare H1 (solo A) e H2 (solo B). Tentare letture e scritture incrociate su ogni tabella/file coinvolto: devono essere negate. Solo dopo, invitare B in H1 come viewer e verificare i limiti del ruolo. Non usare service-role per simulare un utente.
4. Eseguire prove positive/negative per le dieci funzioni nell'ordine 1–10, quindi i18n, email/cron, backup e accessibilità. Per ogni prova annotare un identificativo sintetico di record creato e verificare che un annullamento non abbia scritto nulla.
5. Eseguire nuovamente i casi regressione dopo ogni correzione e annotare SHA e risultato; non riutilizzare PASS ottenuti su un commit diverso.

## Scheda esiti

| ID | Ambito | Positivo | Negativo/permessi | Esito | Evidenza / issue |
| --- | --- | --- | --- | --- | --- |
| G01 | CI e commit candidato | test, build, test:languages | SHA differente o job fallito blocca | BLOCKED | — |
| G02 | Online/Auth | HTTP, login e sessione reali | non basarsi su READY | BLOCKED | — |
| G03 | Migrazioni e dati | versioni e compatibilità dati esistenti | nessun SQL alla cieca | BLOCKED | — |
| G04 | Isolamento RLS/storage | A/H1, B/H2, viewer condiviso | lettura/scrittura cross-house negate | BLOCKED | — |
| F01 | Ricerca universale | record propri e condivisi consentiti | record di H2 invisibili ad A | BLOCKED | — |
| F02 | Acquisizione | bolletta/ricevuta/garanzia confermate | annulla senza scrittura; file privati | BLOCKED | — |
| F03 | Automazioni | simula, attiva, sospendi, cron | viewer negato; deduplica | BLOCKED | — |
| F04 | Professionisti | intervento e costo collegati | note private non condivise | BLOCKED | — |
| F05 | Stagionale | checklist e ricorrenza | viewer non modifica | BLOCKED | — |
| F06 | Scorte | soglia e conferma spesa | nessuna aggiunta silenziosa | BLOCKED | — |
| F07 | Progetti | preventivo, foto, budget | accesso file e scritture negati | BLOCKED | — |
| F08 | Fondo | obiettivo e calcolo tracciabile | stime non spacciate per certe | BLOCKED | — |
| F09 | Affitti | verbale e firme separate | documenti privati del locatore invisibili | BLOCKED | — |
| F10 | Casa Control | indicatori reali, toggle | dati mancanti e permessi | BLOCKED | — |
| X01 | Lingue | it/en/es/fr/de/pt, preferenze, date/importi | isolamento preferenze; nessuna chiave grezza | BLOCKED | — |
| X02 | Email/notifiche | recapito, lingua, preferenze, cron | nessun destinatario errato/doppione | BLOCKED | — |
| X03 | Backup/ripristino | additivo e ripetibile | nessuna perdita, duplicazione o sovrascrittura | BLOCKED | — |
| X04 | Mobile/accessibilità/PWA | 320px, tastiera, screen reader, offline | nessuna fuga in cache condivisa | BLOCKED | — |

**Legenda:** PASS = eseguito sul commit indicato con evidenza; FAIL = difetto riprodotto e issue; BLOCKED = prova non eseguita o prerequisito mancante. Non convertire BLOCKED in PASS sulla base di test demo o CI.

## Decisione di rilascio

- **Fase 2 collaudata:** NO (modello non compilato; tutti gli esiti BLOCKED).
- **Fase 3 autorizzata:** NO.
- **Problemi aperti / rischio residuo:** da registrare con severità, riproduzione e issue.
- **Accettazione responsabile:** NON PRESENTE.

Non usare questo file come attestazione di collaudo: è soltanto un modello operativo.

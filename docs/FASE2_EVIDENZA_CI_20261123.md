# Fase 2 — Evidenza automatica CI (23 novembre 2026)

**Ambito limitato:** questa scheda documenta esclusivamente la CI della PR draft #88, non un collaudo reale né un'autorizzazione al rilascio. Il registro di accettazione rimane BLOCKED per i controlli online.

| Campo | Evidenza verificata |
| --- | --- |
| PR | https://github.com/fz1101hub/Casainordine/pull/88 (draft, non unita al momento della verifica) |
| Branch | `docs/fase2-collaudo-reale-20261123` |
| Commit esatto | `9dd05b3f78b1d1cfb33739e213fe6f932c73379a` |
| GitHub Actions | https://github.com/fz1101hub/Casainordine/actions/runs/45132476752 |
| Risultato run | `completed / success`, verificato tramite API GitHub il 23 novembre 2026 |
| Job test | `success`: `npm ci`, `npm audit --omit=dev --audit-level=high`, `npm test`, `npm run build`, smoke Chromium senza database, `scripts/check-languages.mjs`, `scripts/check-accessibility.mjs`, `scripts/prove-sezioni.mjs` |
| Job database | `success`: `scripts/db-tests.sh` su PostgreSQL 17 locale con sostituto minimo Supabase |

**Verifica aggiuntiva del 23 novembre 2026 (lettura diretta di `package.json` su `main`):** lo script `test:languages` esiste ed è definito come `node scripts/check-languages.mjs`. Il workflow ha eseguito lo stesso file con l'argomento esplicito `http://localhost:3000`; quindi è verificata la corrispondenza del programma, **non** l'esecuzione letterale di `npm run test:languages` senza argomenti, né l'equivalenza del comportamento con e senza URL. Per il gate G01 resta da eseguire e registrare il comando richiesto sullo SHA candidato.

**Limiti verificati:** il browser della CI usa un'app compilata **senza database reale**; PostgreSQL è un servizio temporaneo con un sostituto minimo Supabase. Nessuna evidenza in questa run dimostra login reale, isolamento multiaccount nel progetto Supabase effettivo, invio email/cron, applicazione migrazioni in produzione, disponibilità del deployment pubblico o prove manuali con lettore di schermo.

**Gate Fase 2:** G01 = CI automatica verificata per questo SHA, con riserva sul comando `test:languages`; G02–G04, F01–F10, X01–X04 = **BLOCKED** in assenza di prove reali. Fase 3 = **NON AUTORIZZATA**. Non riciclare questa evidenza per altri SHA.

## Correzione CI proposta (23 novembre 2026)

Sul branch della PR #88, commit `96b2e1d78d32540a46adce149735231f74310944`, il workflow `.github/workflows/tests.yml` invoca ora **`npm run test:languages -- http://localhost:3000`** invece di chiamare direttamente il file JavaScript. L'argomento esplicito mantiene il medesimo indirizzo dell'app avviata dalla CI. È una modifica alla modalità di invocazione, **non** un ampliamento della copertura alle sei lingue né una prova online.

**Stato della modifica: IN ATTESA DI CI sul nuovo SHA.** La run `45132476752` resta evidenza storica del commit `9dd05b3` e non attesta la riuscita del commit nuovo. Prima di aggiornare G01, verificare job, log e SHA della nuova run. G02–G04, F01–F10 e X01–X04 restano BLOCKED. Nessun collaudo reale o audit di Fase 3 avviato.

## Riscontro CI successivo — 23 novembre 2026, ore 12:35 CET

Verifica tramite GitHub Actions API per la PR #88:

- Commit `96b2e1d78d32540a46adce149735231f74310944`: [run 45157331194](https://github.com/fz1101hub/Casainordine/actions/runs/45157331194), `completed / success`.
- Commit `b7ee6e1e16c766bab33cc66ffdd70b84ad9f5174`: [run 45157347953](https://github.com/fz1101hub/Casainordine/actions/runs/45157347953), `completed / success`. Verificati anche i job `test` e `database`, entrambi `completed / success`. Nel job `test` risultano riusciti i passi `npm test`, build Next.js, browser demo, controllo lingue, accessibilità e prove sezioni; nel job `database` è riuscito lo script di prove DB.
- Sullo SHA `b7ee6e1` il workflow letto dal branch invoca `npm run test:languages -- http://localhost:3000`: il passo relativo alle lingue risulta `success`. Non è stata verificata l'invocazione **senza** argomento URL.

**Aggiornamento gate:** G01 = PASS **solo per la CI automatica sullo SHA `b7ee6e1` e per i comandi effettivamente presenti nel workflow**, senza estensione ai test reali. G02–G04, F01–F10 e X01–X04 restano BLOCKED fino a evidenze di account reali, Supabase effettivo, deploy pubblico, notifiche/email e prove manuali. La PR rimane draft; nessun via libera alla Fase 3. Questa annotazione non equivale a certificazione esterna.

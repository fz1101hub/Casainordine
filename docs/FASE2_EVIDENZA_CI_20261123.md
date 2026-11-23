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

## Riscontro sul commit successivo — 23 novembre 2026, ore 13:33 CET

- Commit `93dd74cb25b022fe377db43d2d1d8f2f6c326b89`: [run 45166705442](https://github.com/fz1101hub/Casainordine/actions/runs/45166705442), stato `completed`, conclusione `success`, verificati tramite connettore GitHub.
- Job `test` e `database`: entrambi `completed / success`. Nel job `test` risultano `success` i passi di installazione, controllo dipendenze, test logici, build Next.js, browser demo senza database, lingue, accessibilità e prove delle sezioni. Nel job `database` risulta `success` il passo delle prove su migrazioni/regole/funzioni in ambiente CI.
- **G01:** evidenza CI positiva per il commit `93dd74c` e i passi previsti dal workflow; non equivale all'esecuzione locale indipendente, né a prove con account o DB di produzione. Il comando linguistico nel workflow mantiene l'URL esplicito: non è attestata l'esecuzione senza argomenti.
- **G02–G04, F01–F10, X01–X04:** ancora `BLOCKED` nel registro di collaudo reale. La Fase 3 resta non autorizzata. Nessun deploy o intervento sui dati effettuato con questa verifica.

## Riscontro CI sul commit `48ce0a3` — 23 novembre 2026, ore 14:39 CET

- Commit esatto `48ce0a3f817b94c8b5d9939b3cdb6a366de68ea6` (head della PR #88 verificato via GitHub).
- [GitHub Actions run 45175584682](https://github.com/fz1101hub/Casainordine/actions/runs/45175584682), workflow `Test automatici`, run numero 1907: API GitHub riporta `completed / success` per lo SHA indicato.
- Questa verifica attesta **l'esito complessivo della run**, non la lettura indipendente dei log di ogni singolo passo. Il gate G01 dispone dunque di evidenza CI sul commit `48ce0a3`, limitata al workflow; non si attribuiscono nuove prove reali o verifiche manuali.
- **G02–G04, F01–F10, X01–X04: BLOCKED.** Nessuna evidenza aggiuntiva di login con due account, RLS sul Supabase effettivo, migrazioni applicate in produzione, email, notifiche o URL pubblico. Fase 3 non autorizzata.

## Riscontro CI sul commit `a56c0a7` — 23 novembre 2026, ore 15:32 CET

- Head PR #88 verificato: `a56c0a734f2120cd9d5a85f615f3c487f1d39023`, PR ancora **draft**, non unita.
- [GitHub Actions run #45186210950](https://github.com/fz1101hub/Casainordine/actions/runs/45186210950): `completed / success`, run numero 1914, associata esattamente allo SHA sopra. Consultati tramite connettore GitHub anche i job: **test**, **accesso**, **database**, tutti `completed / success`.
- Nel job **accesso** è riuscita la prova browser di accesso, lettura dati, backup, ripristino e uscita, ma con **Supabase finto**, non con credenziali o sessioni reali. Nel job **test** sono riusciti build, test di logica, browser demo, lingue, accessibilità e sezioni Fase 2; nel job **database** sono riuscite le prove su database temporaneo. Non è stata eseguita una prova indipendente locale.
- Nuova evidenza **separata dalla CI della PR #88** già presente su `main`: [docs/COLLAUDO_DATABASE_20261123.md](https://github.com/fz1101hub/Casainordine/blob/main/docs/COLLAUDO_DATABASE_20261123.md), integrata con PR #91. Il documento dichiara **202 prove / 0 fallite** su Supabase effettivo, in transazioni annullate, per funzioni privilegiate e moduli v43–v48; dichiara inoltre v51/v52 applicate. Questa è **evidenza documentale del progetto**, non una riesecuzione indipendente in questa sessione. I gruppi v49 (affitti) e v50 (email promemoria) sono **BLOCKED** perché l'esecuzione è stata annullata prima della conferma richiesta.
- **Gate:** G01 ha evidenza automatica positiva sullo SHA `a56c0a7`; G03/G04 dispongono ora di evidenza parziale documentata per le prove realmente eseguite, **non PASS complessivo**. G02 e le prove online/account/email/notifiche/accessibilità manuale restano aperte. Il documento sul database riferisce inoltre che l'app pubblica rispondeva `503 databaseConfig` per configurazione Vercel mancante: non trattare la disponibilità pubblica come verificata. **Fase 3 non autorizzata.**

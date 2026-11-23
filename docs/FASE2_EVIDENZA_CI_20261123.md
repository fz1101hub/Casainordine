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

**Precisazione:** il workflow non esegue letteralmente `npm run test:languages`: esegue `node scripts/check-languages.mjs http://localhost:3000`. La corrispondenza con un eventuale script npm omonimo non è stata verificata. Non attribuire a questa run quel comando specifico.

**Limiti verificati:** il browser della CI usa un'app compilata **senza database reale**; PostgreSQL è un servizio temporaneo con un sostituto minimo Supabase. Nessuna evidenza in questa run dimostra login reale, isolamento multiaccount nel progetto Supabase effettivo, invio email/cron, applicazione migrazioni in produzione, disponibilità del deployment pubblico o prove manuali con lettore di schermo.

**Gate Fase 2:** G01 = CI automatica verificata per questo SHA, con riserva sul comando `test:languages`; G02–G04, F01–F10, X01–X04 = **BLOCKED** in assenza di prove reali. Fase 3 = **NON AUTORIZZATA**. Non riciclare questa evidenza per altri SHA.

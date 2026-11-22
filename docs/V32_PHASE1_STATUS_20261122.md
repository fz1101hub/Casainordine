# Stato operativo v3.2 — 22 novembre 2026 (Fase 1)

## Riferimenti verificati

- PR draft attiva: [#54](https://github.com/fz1101hub/Casainordine/pull/54), **open / draft**, head `feat/v32-mail-documents-i18n-20261120`; HEAD verificato prima dell'intervento `23a8098c04371ab5747d8d36cb47ab794ae3428f`.
- Documento guida: [docs/I18N_V32.md](I18N_V32.md). Non confondere una PR aperta con una versione pubblicata.
- Pipeline [#45003770896](https://github.com/fz1101hub/Casainordine/actions/runs/45003770896) per `23a8098`: GitHub riporta **completed / success**. Il risultato non si estende ai commit successivi.

## Intervento di questa esecuzione — test V20

- Creato `tests/v32-v20-timestamp-locales.test.mjs`: controlla la resa dei timestamp in `Europe/Rome` per it-IT, en-GB, es-ES, fr-FR, de-DE e pt-PT, il cambio di giorno, offset espliciti, date bisestili, date impossibili e orari/offset invalidi.
- Commit test: `3d7486f000bd6ffdb02b64c11efecd4cc9024a4c`. **Non è stata ancora verificata la CI o la build su questo SHA.** Non sono stati eseguiti test browser, Supabase o deploy.
- Nessuna modifica ai dati, migrazione, API o produzione. Il test non dimostra la completezza delle traduzioni.

## Gate non superati — vietato dichiarare completa la 3.2

1. Copertura reale di ogni modulo, dialogo, stato, validazione, errore, messaggio API ed email in it/en/es/fr/de/pt.
2. Controlli browser/E2E per sei lingue, persistenza preferenze, date/importi e fallback.
3. Prove di isolamento con due account Supabase reali e RLS server, inclusi cambi account durante operazioni asincrone.
4. Privacy, accessibilità e mobile, build e anteprima Vercel dell'HEAD finale, CI verde sullo stesso SHA.
5. Revisione delle modifiche della PR, nessuna migrazione distruttiva, nessun rilascio prima delle verifiche.

## Sequenza vincolante

**Fase attiva: 1**. La Fase 2 (dieci funzioni in ordine) è bloccata fino al completamento verificato della 3.2. La Fase 3 (audit indipendente integrale) è bloccata fino al completamento e collaudo di tutte e dieci le funzioni. Nessun audit integrale anticipato.

## Prossimo intervento tecnico

Verificare CI e build del nuovo HEAD; poi continuare la localizzazione di V20/V21 e API/email con test dinamici pertinenti, prima dei collaudi E2E e RLS reali.

## Aggiornamento 22 novembre 2026 — preferenze e formati

- Verificata la CI del commit precedente `d4c7bfc448f102c349dd01b9c727e584c4942f61`: [workflow #45008205576](https://github.com/fz1101hub/Casainordine/actions/runs/45008205576), **completed / success**. Questo esito non copre i nuovi commit.
- Aggiunto `tests/v32-i18n-preferences-formats.test.mjs` (commit `009a4e30ee653cfcc6528d9aead8f4d0081c7b0e`): copertura per sei codici/locale, chiavi preferenze separate per account, fallback, date bisestili e impossibili, importi e conteggi. Sono test di libreria: non dimostrano persistenza reale delle preferenze né UX browser.
- Gate ancora aperti: CI/build sul nuovo HEAD, copertura test dinamici/browser, testi V20/V21/API/email, privacy e isolamento RLS reale, accessibilità/mobile, anteprima Vercel. **Fase 1 ancora aperta; nessuna Fase 2 o Fase 3.**

## Aggiornamento 22 novembre 2026 — negoziazione lingua pubblica

- Verificato con GitHub Actions il workflow [#45013253061](https://github.com/fz1101hub/Casainordine/actions/runs/45013253061), relativo a `c6598894460e9a7bf6a1acda6872458ad2eb974c`: **completed/success**. Non estendere l'esito ai commit successivi.
- Aggiunto `tests/v32-i18n-language-negotiation.test.mjs` (commit `6aff7783d6deccb79b231698a5a945c8ba8fe2d5`) per negoziazione `Accept-Language` delle pagine pubbliche: sei lingue, pesi e ordine, esclusioni `q=0`, pesi malformati, wildcard, fallback, preferenza browser e segnaposto mancanti. Si tratta di test unitari della libreria, non di test browser o delle email.
- Nuovo HEAD documentale da sottoporre a CI e build. Rimangono aperti tutti i gate di copertura linguistica integrale, Supabase RLS reale, browser/mobile/accessibilità, privacy e anteprima Vercel. Fase 1 ancora attiva; fasi 2 e 3 bloccate. Nessun merge/deploy/migrazione o modifica dati.

## Verifica CI 22 novembre 2026 — negoziazione lingua

- Verificata tramite GitHub Actions la pipeline [#45018362025](https://github.com/fz1101hub/Casainordine/actions/runs/45018362025) per il commit `1b3e5ddd8cd08a952e497c031d57472969f60f4a`: stato `completed`, conclusione `success`. Questa evidenza riguarda esclusivamente quel commit, non quello documentale successivo.
- Riletto `lib/i18n-core.mjs`: `acceptedLanguage` ordina i valori `Accept-Language` per peso e posizione, rifiuta parametri non validi e restituisce l'italiano come fallback; `localeFor` mappa it/en/es/fr/de/pt ai rispettivi locale; `formatDate`, `formatMoney` e `formatCount` validano gli input. È una verifica statica del codice, non una prova browser né della copertura traduttiva.
- Priorità successiva: individuare e correggere testi residui in V20/V21 e server/email, aggiungere prove di flusso browser e preferenze per le sei lingue; successivamente verificare RLS reale e anteprima. **Fase 1 incompleta; Fasi 2 e 3 non avviate.** Nessun merge, deploy, migrazione o modifica ai dati persistiti.

## Aggiornamento 22 novembre 2026 — copertura testi V21

- Aggiunto `tests/v32-v21-briefing-copy-locales.test.mjs` (commit `8f4ebbd4e7be3ff178b945f62928d25f6992759f`): controlli delle sei lingue per testi critici di privacy, errori, dialoghi e messaggi, parità delle chiavi, segnaposto di interpolazione e fallback regionali. Il test non prova l'interfaccia nel browser e non sostituisce la revisione linguistica.
- Verificare esecuzione effettiva del nuovo test, CI e build sul nuovo HEAD; se fallisce, correggere il catalogo prima del merge. Restano i gate E2E, Supabase RLS con due account, email/API, accessibilità/mobile e anteprima Vercel. Nessun rilascio o avvio delle Fasi 2 e 3.

## Aggiornamento 22 novembre 2026 — regressione segnaposto V21

- Verificata la CI del commit `0b6d43b3b56172d09f7d11e6d2911d12f9f33531`: workflow [#45028744061](https://github.com/fz1101hub/Casainordine/actions/runs/45028744061), `completed/success`. Non è prova per commit successivi.
- Corretto il rilevatore di segnaposto nel test `tests/v32-v21-briefing-copy-locales.test.mjs` (commit `f9726da52e8cf11d074101b8897d602cbff2d4f0`): la precedente regex cercava backslash non presenti nei template, rischiando un falso positivo sulla parità dei parametri. Aggiunta asserzione di autocontrollo su `{amount}` e `{date}`. La CI sul nuovo commit deve ancora essere verificata.
- Questo intervento migliora il controllo regressione, non completa la traduzione. Restano aperti i gate di Fase 1: revisione di tutti i flussi e messaggi, E2E sei lingue, RLS reale multiaccount, privacy, mobile/accessibilità, anteprima Vercel e CI sullo SHA finale. Nessun merge/deploy/migrazione; Fasi 2 e 3 bloccate.

## Verifica CI 22 novembre 2026 — correzione segnaposto V21

- Verificato GitHub Actions sul commit `0f229a4f18d944dcc8044ba6176ad286b494d30d`: workflow [#45033952169](https://github.com/fz1101hub/Casainordine/actions/runs/45033952169), stato `completed`, conclusione `success`.
- La pipeline conferma il risultato automatizzato di questo SHA, non la correttezza linguistica di tutte le schermate né la sicurezza RLS su Supabase reale. Non è una certificazione esterna.
- Priorità operativa invariata: correggere le traduzioni residue di V20/V21 e i messaggi API/email, poi collaudare E2E nelle sei lingue, preferenze, RLS multiaccount, privacy, mobile/accessibilità e anteprima Vercel sullo SHA candidato.
- Nessun merge, deploy, migrazione o modifica ai dati; Fase 1 aperta, Fasi 2 e 3 bloccate.

## Aggiornamento 22 novembre 2026 — precisione importi nelle email mensili

- Verificata la pipeline [#45039432554](https://github.com/fz1101hub/Casainordine/actions/runs/45039432554) per il precedente HEAD `d5ce27d`: **completed/success**. Non estendere il risultato ai commit successivi.
- Corretto `lib/notification-summary.mjs`: importi di singole bollette e totali che `formatMoney` non può rappresentare con precisione affidabile vengono rifiutati, anziché produrre `—` in un'email di riepilogo o un totale apparentemente preciso. Nessun importo persistito viene modificato.
- Aggiunti casi in `tests/v32-notification-summary.test.mjs` per importi fuori intervallo sicuro, stringhe decimali oltre la precisione rappresentabile, overflow del totale e importi normali. Commit funzionale `0900f4f`, test `79b9606`.
- **CI/build sul nuovo HEAD ancora da verificare.** Nessuna email reale inviata; restano collaudi staging, RLS multiaccount, browser nelle sei lingue, accessibilità/mobile, traduzioni residue e anteprima Vercel. Fase 1 aperta; Fasi 2 e 3 non avviate. Nessun merge o deploy.

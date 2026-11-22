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

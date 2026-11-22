# Stato operativo v3.2 — 22 novembre 2026 (Fase 1)

## Riferimenti verificati

- PR draft attiva: [#54](https://github.com/fz1101hub/Casainordine/pull/54), **open / draft**, head `feat/v32-mail-documents-i18n-20261120`, commit `f0e4bc6df851fb3bb53e6bfaba3084dbd3225482` al momento della lettura.
- Documento guida: [docs/I18N_V32.md](I18N_V32.md). Non confondere una PR aperta con una versione pubblicata.
- Precedente errore di scrittura dovuto a riferimento di branch inesistente: risolto identificando il nome effettivo del branch tramite metadati della PR; nessuna riscrittura o force push.
- La pipeline [#44994853811](https://github.com/fz1101hub/Casainordine/actions/runs/44994853811) è stata riportata come conclusa con successo per `f0e4bc6` nella verifica precedente. **In questa esecuzione non è stato rieseguito né verificato il dettaglio dei job**; il risultato non si estende ai commit successivi.

## Gate non superati — vietato dichiarare completa la 3.2

1. Copertura reale di ogni modulo, dialogo, stato, validazione, errore, messaggio API ed email in it/en/es/fr/de/pt.
2. Controlli browser/E2E per sei lingue, persistenza preferenze, date/importi e fallback.
3. Prove di isolamento con due account Supabase reali e RLS server, inclusi cambi account durante operazioni asincrone.
4. Privacy, accessibilità e mobile, build e anteprima Vercel dell'HEAD finale, CI verde sullo stesso SHA.
5. Revisione delle modifiche della PR, nessuna migrazione distruttiva, nessun rilascio prima delle verifiche.

## Sequenza vincolante

**Fase attiva: 1**. La Fase 2 (dieci funzioni in ordine) è bloccata fino al completamento verificato della 3.2. La Fase 3 (audit indipendente integrale) è bloccata fino al completamento e collaudo di tutte e dieci le funzioni. Nessun audit integrale anticipato.

## Prossimo intervento tecnico

Concentrarsi su una singola area V20/V21 o su API/email ancora non tradotta, aggiungendo test dinamici pertinenti. Eseguire test e build sullo SHA prodotto e registrare gli esiti esatti; non sostituire test statici con affermazioni di verifica RLS.

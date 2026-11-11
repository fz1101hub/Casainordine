# Stato i18n 3.2 — 2026-11-11 (verifica V21 segnaposto)

Fase attiva: **FASE 1**, non completata. FASI 2 e 3 non avviate.

- La PR #31 è stata integrata in main con commit `2c92ff15ad4c0bb76d6c7c56b1ead36edcbe99fd`.
- Nuova PR draft #32, branch `test/i18n-v32-v21-interpolation-20261111`: verifica che i segnaposto dinamici di V21 coincidano tra italiano, inglese, spagnolo, francese, tedesco e portoghese; segnala anche token inattesi.
- La presenza di token coerenti non garantisce una traduzione corretta né una interpolazione sicura al rendering.
- **Verifiche non ancora confermate per la PR #32**: CI, suite Node, build Next.js e anteprima Vercel. Non eseguire merge o rilascio senza controlli.
- Restano revisione linguistica, flussi browser/mobile e accessibilità, IMAP in staging e RLS multiaccount con due utenti reali; evitare dati personali nei log e screenshot.
- Nessun deploy, invio email, migrazione o intervento distruttivo richiesto da questa PR.

Fare riferimento anche a `docs/I18N_V32.md` per la roadmap completa.

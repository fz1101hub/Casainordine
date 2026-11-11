# Stato i18n 3.2 — 2026-11-11 (verifica V21 segnaposto)

Fase attiva: **FASE 1**, non completata. FASI 2 e 3 non avviate.

- La PR #31 è stata integrata in main con commit `2c92ff15ad4c0bb76d6c7c56b1ead36edcbe99fd`.
- Nuova PR draft #32, branch `test/i18n-v32-v21-interpolation-20261111`: verifica che i segnaposto dinamici di V21 coincidano tra italiano, inglese, spagnolo, francese, tedesco e portoghese; segnala anche token inattesi.
- La presenza di token coerenti non garantisce una traduzione corretta né una interpolazione sicura al rendering.
- **Verifica reale:** GitHub Actions run `43013196085` conclusa con `success` sul commit `ec4aeb7`; il job `test` include audit dipendenze, test di logica e build Next.js, tutti riusciti. Non equivale a E2E, revisione linguistica o prova di anteprima Vercel.
- Commit successivo `1dfee55`: aggiunto controllo di regressione dei segnaposto e dei testi V21 con varianti regionali e codici lingua maiuscoli.
- **Verifica reale aggiornata (2026-11-11):** GitHub Actions run `43021906361` sul commit `d4bff8f07b569212bde028b5312994b0bdc8d984` conclusa con `success`; job `test` completato con successo. Passaggi riusciti: installazione dipendenze, controllo vulnerabilità note, test di logica e build Next.js. URL: https://github.com/fz1101hub/Casainordine/actions/runs/43021906361 . Il commit di questo aggiornamento documentale richiederà una propria verifica CI; non confondere i due HEAD. Non eseguire merge o rilascio senza collaudi adeguati.
- Restano revisione linguistica, flussi browser/mobile e accessibilità, IMAP in staging e RLS multiaccount con due utenti reali; evitare dati personali nei log e screenshot.
- Nessun deploy, invio email, migrazione o intervento distruttivo richiesto da questa PR.

Fare riferimento anche a `docs/I18N_V32.md` per la roadmap completa.

## Verifica aggiuntiva 2026-11-11 (HEAD `6406008`)

- GitHub Actions [run 43030670110](https://github.com/fz1101hub/Casainordine/actions/runs/43030670110), associata al commit `640600863e9fab94e3fa7d3dd78e9d0bc4e90fdf`: stato `completed`, conclusione `success`. Job `test` riuscito; passaggi verificati: dipendenze, controllo vulnerabilità note, test di logica e build Next.js.
- Il bot Vercel segnala un'anteprima **Ready** per la PR #32, aggiornata alle 13:37 UTC dell'11 novembre 2026: [deployment](https://vercel.com/fz1101hub-6215s-projects/casainordine/5MDFmuzWMQhsPFGMjt7uScgcxQzr). Stato del deployment non equivale a test E2E o prova funzionale dell'anteprima.
- Questa registrazione modifica solo la documentazione; la CI sul commit documentale successivo resta da verificare.
- Gate di rilascio invariato: revisione testi nelle sei lingue, E2E/browser/mobile/accessibilità, IMAP staging e RLS con due account; nessun passaggio alla Fase 2 e nessun audit di Fase 3.

## Verifica CI del commit `b8eb94b` — 11 novembre 2026

- GitHub Actions run [43040100891](https://github.com/fz1101hub/Casainordine/actions/runs/43040100891) associata al commit `b8eb94b730ee86efa54355e3f5c3b8588ed98804`: `status=completed`, `conclusion=success`, workflow «Test automatici». Il risultato conferma il workflow configurato, non la revisione manuale né gli E2E.
- **Gate ancora aperti:** (1) revisione manuale dei sei cataloghi e dei messaggi di errore; (2) test dei flussi con browser e mobile in tutte le lingue, inclusa accessibilità; (3) IMAP con account di staging senza dati personali; (4) isolamento RLS con due account reali e preferenze diverse; (5) verifica CI/build sul commit finale candidato al rilascio.
- Nessun merge o rilascio autorizzato da questa verifica. Fase 1 aperta; Fasi 2 e 3 non avviate.

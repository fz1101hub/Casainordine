# Stato Fase 1 — email bollette e codici regionali (11 novembre 2026)

**Fase 1 aperta; Fasi 2 e 3 non avviate.** La PR #32 risulta integrata in `main` (`ba04f9fd1ebc88efb59c8b198670ac8cc73f1f60`). Sul suo ultimo commit `b0ccc5d357ba7c820f45f57f725863a4a9568779`, GitHub Actions workflow «Test automatici» run [43050920009](https://github.com/fz1101hub/Casainordine/actions/runs/43050920009) risulta `completed/success`.

Questo ramo aggiunge un test di regressione alla generazione delle email promemoria bollette: per ogni lingua it/en/es/fr/de/pt verifica che varianti regionali, maiuscole e underscore producano lo stesso oggetto e corpo della lingua base, senza fallback involontario all'italiano. **Il nuovo test e la build non sono ancora verificati sul nuovo HEAD.** Nessuna email reale inviata, nessuna modifica ai dati, nessun deploy o migrazione.

**Gate di rilascio 3.2:** revisione linguistica di tutti i moduli e stati/errori, prove browser/mobile/accessibilità nelle sei lingue, IMAP in staging, RLS con due account e preferenze distinte, CI e build sul candidato finale. Non avviare la Fase 2 prima di completare questi controlli; l'audit indipendente di Fase 3 resta differito.

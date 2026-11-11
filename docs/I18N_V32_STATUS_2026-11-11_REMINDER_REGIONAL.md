# Stato Fase 1 — email bollette e codici regionali (11 novembre 2026)

**Fase 1 aperta; Fasi 2 e 3 non avviate.** La PR #32 risulta integrata in `main` (`ba04f9fd1ebc88efb59c8b198670ac8cc73f1f60`). Sul suo ultimo commit `b0ccc5d357ba7c820f45f57f725863a4a9568779`, GitHub Actions workflow «Test automatici» run [43050920009](https://github.com/fz1101hub/Casainordine/actions/runs/43050920009) risulta `completed/success`.

Questo ramo aggiunge un test di regressione alla generazione delle email promemoria bollette: per ogni lingua it/en/es/fr/de/pt verifica che varianti regionali, maiuscole e underscore producano lo stesso oggetto e corpo della lingua base, senza fallback involontario all'italiano. **Verifica eseguita sul commit `cf801eba37ba365d82267a9b94011bca8701646f`:** [workflow 43060126511](https://github.com/fz1101hub/Casainordine/actions/runs/43060126511), `completed/success`. Nel job `test` risultano `success` installazione, audit dipendenze, test di logica, build Next.js e prova Chromium dell'app compilata **senza database**. Stato Vercel `success` sul medesimo commit ([dettaglio](https://vercel.com/fz1101hub-6215s-projects/casainordine/7mPsuDs3y2N8Yp7mbvaQopGwNfay)). La prova Chromium non sostituisce il collaudo con database e account reali. Anche il commit documentale `c1fee4b2b6bb7aefdab703577932f6d67b303bcb` è stato verificato: [workflow 43070655099](https://github.com/fz1101hub/Casainordine/actions/runs/43070655099), `completed/success`, job `test` `success` con installazione, controllo dipendenze, test di logica, build Next.js e prova Chromium senza database tutti riusciti. Questa conferma riguarda il commit indicato, non eventuali commit successivi. Nessuna email reale inviata, nessuna modifica ai dati, nessun deploy o migrazione.

**Gate di rilascio 3.2:** revisione linguistica di tutti i moduli e stati/errori, prove browser/mobile/accessibilità nelle sei lingue, IMAP in staging, RLS con due account e preferenze distinte, CI e build sul candidato finale. Non avviare la Fase 2 prima di completare questi controlli; l'audit indipendente di Fase 3 resta differito.


## Verifica successiva — commit `1878785729db282e8a1a20bec11d439bd9afef17`

GitHub Actions «Test automatici», [run 43089429094](https://github.com/fz1101hub/Casainordine/actions/runs/43089429094): `completed/success`, associata al commit indicato. Il job `test` è `completed/success`: dipendenze da lockfile, controllo vulnerabilità note, test di logica (inclusi i nuovi casi regionali), build Next.js e prova Chromium dell'app compilata senza database hanno tutti esito `success`. Questa prova **non** verifica email reali, account distinti, RLS con database, IMAP in staging, traduzioni in browser/mobile o accessibilità. La PR #40 resta draft e la Fase 1 aperta. Nessuna autorizzazione al rilascio o all'avvio delle fasi successive deriva dalla sola CI.

## Verifica CI e nuova regressione — 11 novembre 2026

Sul commit `4e712fcecaccabd22f1f1dd003b1b3d30e875bf7`, GitHub Actions [run 43103042672](https://github.com/fz1101hub/Casainordine/actions/runs/43103042672) risulta `completed/success`. Questo esito non riguarda il commit successivo.

Il commit `c66ae92a1a8c2dc6da0518b665220804a06bf6b5` aggiunge una regressione sulle sei varianti regionali dei promemoria: scadenze impossibili e date non valide devono essere rifiutate, mantenendo invariato il nome fornito dall'utente. **CI e build su questo nuovo commit non ancora verificate.** Restano aperti i gate di rilascio sopra indicati; Fase 1 non conclusa, Fasi 2 e 3 non avviate.

## Verifica CI — 12 novembre 2026

Sul commit `d79ff22714851f99269252fce5a7df8c3e6cfbd8`, GitHub Actions «Test automatici» [run 43112714493](https://github.com/fz1101hub/Casainordine/actions/runs/43112714493) risulta `completed/success`. Nel job `test` risultano `success` installazione dipendenze, controllo vulnerabilità note, test di logica (inclusa la regressione sulle date impossibili), build Next.js e prova Chromium dell'app compilata senza database. Questa verifica supera la precedente indicazione «CI e build non ancora verificate» limitatamente al commit `d79ff22`; non certifica alcun commit successivo.

La PR draft #42 resta il percorso di revisione per i commit post-merge della #40. Restano non eseguiti o non documentati i collaudi linguistici completi, browser/mobile/accessibilità nelle sei lingue, IMAP in staging e RLS multiaccount con preferenze distinte. Nessun merge, rilascio, migrazione o invio email reale autorizzato da questa CI. **Fase 1 aperta; Fasi 2 e 3 non avviate.**

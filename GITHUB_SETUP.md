# Pubblicare Casa in Ordine 2.1 su GitHub

Destinazione autorizzata: **repository pubblico** https://github.com/fz1101hub/Casainordine

Questo archivio include il codice e la cronologia Git: non caricare lo ZIP come singolo file su GitHub; estrailo e pubblica la cartella Git.

## Metodo più semplice: GitHub Desktop

1. Estrai l'archivio e installa [GitHub Desktop](https://desktop.github.com/) se necessario.
2. Apri GitHub Desktop ed entra con l'account `fz1101hub`.
3. Seleziona **File → Add local repository** e scegli la cartella estratta `casa-in-ordine` (contiene `.git`).
4. Il repository remoto è già configurato su `https://github.com/fz1101hub/Casainordine.git`.
5. Seleziona **Push origin**. Se viene richiesto, autorizza GitHub Desktop nel browser.

**Non usare “Publish repository”**: esiste già un repository online vuoto.

## Metodo da terminale

Apri un terminale nella cartella estratta `casa-in-ordine` e lancia:

```bash
git remote -v
git push -u origin main
```

I file `PUBBLICA_SU_GITHUB.sh` (macOS/Linux) e `PUBBLICA_SU_GITHUB.cmd` (Windows) contengono gli stessi comandi, con una conferma sulla visibilità pubblica.

## Controllo dopo il push

In https://github.com/fz1101hub/Casainordine dovresti vedere almeno `app/`, `lib/`, `supabase/`, `tests/`, `README.md` e `.github/workflows/tests.yml`.

**Attenzione:** il codice sarà leggibile pubblicamente. Non caricare mai `.env.local`, credenziali Supabase, password, token OAuth, chiavi VAPID, email reali degli utenti o documenti privati. `.gitignore` esclude i normali segreti locali; non sostituisce una verifica prima di ogni commit.

**Stato del software:** il repository contiene una versione di sviluppo; restano da verificare build completa Next.js, migrazioni/permessi su un database reale, acquisizione bollette e notifiche su smartphone.

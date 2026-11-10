## Versione 3.3 — correzioni dell'audit di novembre 2026

**Prima di pubblicare questa versione** esegui una volta, nel SQL Editor di Supabase, `supabase/migrate_v33_audit.sql`, dopo tutte le migrazioni precedenti (v3.2 compresa) e dopo `harden_trigger_permissions.sql`. Lo script è in una sola transazione e si può rieseguire. Senza questa migrazione non si può salvare nessuna bolletta, utenza o documento (difetto dei trigger della v1.9) e i file del bucket `house-documents` sono leggibili da qualsiasi utente registrato.

Cosa cambia per chi usa l'app:

- **Esci** chiude la sessione solo su questo dispositivo, funziona anche senza rete e stacca il dispositivo dalle notifiche dell'account che esce.
- Il collegamento di Gmail o Outlook va completato nello stesso browser in cui è stato avviato. Se il browser non conserva il cookie (per esempio la web app sulla schermata Home di iPhone che apre l'accesso in Safari), si può collegare solo la casella con lo stesso indirizzo, già verificato, dell'account.
- La **conferma automatica dei pagamenti** richiede anche che Gmail o Outlook riportino DMARC superato per il dominio del mittente; con le caselle IMAP la conferma resta sempre manuale. In una casa condivisa serve il ruolo di proprietario o editor.
- Un membro rimosso da una casa non può più aprire né cancellare i file che vi aveva caricato.

Ordine completo di installazione su un database nuovo: `schema.sql`, `migrate_v19.sql`, `migrate_v20.sql`, `migrate_v21.sql`, `migrate_v30.sql`, `migrate_v32_languages.sql`, `harden_trigger_permissions.sql`, `migrate_v33_audit.sql`, `migrate_v34_saldi.sql` (saldi tra coinquilini calcolati nel database; finché non è eseguita l'app usa il calcolo precedente sulle ultime 250 spese), `migrate_v36_quota.sql` (200 MB di documenti per utente; il numero si cambia in `v36_storage_quota_bytes()`).


### Controlli programmati con Supabase Cron

I promemoria (`/api/cron`) e la lettura delle caselle email (`/api/mail/cron`) possono partire dal database invece che solo da Vercel: con il piano Hobby Vercel li esegue una volta al giorno, con un margine di un'ora. Supabase Cron è compreso nel piano gratuito di Supabase.

1. Pubblica su Vercel la versione dell'app che accetta l'intestazione `x-casa-cron-token`.
2. Esegui `supabase/migrate_v35_cron.sql` nel SQL Editor. Lo script attiva `pg_cron` e `pg_net`, genera una chiave nel Vault (non va copiata su Vercel) e programma tre job:
   - promemoria ogni giorno alle 07:07 UTC;
   - caselle email ogni 3 ore (ogni casella si legge comunque al massimo una volta ogni 20 ore);
   - pulizia della cronologia.
3. Controlla le esecuzioni con `select * from cron.job_run_details order by start_time desc limit 20;`.

I cron di `vercel.json` restano come riserva: una seconda chiamata nello stesso giorno non manda nulla due volte. Se l'indirizzo dell'app non è `https://casainordine.vercel.app`, aggiorna il segreto `casa_app_url` (istruzioni in testa al file SQL).
---
## Provare Casa in Ordine con dati di esempio

**Prova immediata senza account**: apri `/prova` per una modalità completamente isolata dal database Supabase, con bollette, attività, lista della spesa, manutenzioni e dashboard personalizzabile. Le azioni sono simulazioni salvate solo nel browser e puoi ripristinare i dati quando vuoi. Nessuna autenticazione, pagamento, invio email o chiamata API al database viene eseguita in questo percorso.

**Account di test reale**: registrati con un indirizzo email che controlli e, una volta entrato in un account nuovo e senza dati, vai in **Impostazioni → Carica dati di prova**. Il sistema crea una casa `Casa Demo (dati fittizi)` e inserisce 6 bollette, 5 attività e 6 articoli della spesa usando le regole RLS Supabase; non occorre alcuna chiave server. L'operazione è volontaria e rifiuta account con dati o case preesistenti. Questi dati sono scritti sul database di quell'account di prova, quindi è possibile eliminarli usando l'interfaccia delle case.

**Sicurezza**: non creare account di prova inserendo record direttamente in `auth.users`; la registrazione avviene tramite Supabase Auth. La modalità `/prova` non crea utenti reali e non testa autenticazione, isolamento RLS fra utenti, OAuth o invio email.

---
# Casa in Ordine 3.0 — Home personale

**Versione 3.0:** puoi decidere cosa vedere nella tua pagina iniziale. I moduli predefiniti, nell'ordine, sono **Bollette e scadenze**, **Lista della spesa**, **Attività da fare** e **La casa in 5 minuti**. Layout iniziale **Compatto**.

Apri **La mia Home → Personalizza** per mostrare/nascondere i quattro moduli, spostarli con le frecce, passare da Compatto a Dettagliato e salvare. L'ordine personale viene salvato su `user_home_preferences`, con RLS per utente; **gli altri membri della famiglia non vedono né modificano queste preferenze**.

È sempre disponibile la vecchia dashboard completa, ora sotto **Panoramica completa**.

**Database:** su un'installazione 2.1 esegui la migrazione `supabase/migrate_v30.sql` (additiva) prima di abilitare la personalizzazione agli utenti. Su una nuova installazione completa segui l'ordine indicato nella sezione v3.3 in cima a questo file. Verifica RLS con due utenti distinti e il build Next.js.

**Nota:** la lista della spesa è condivisa in una casa e quindi si visualizza quando selezioni una casa; i widget personalizzati e le loro preferenze sono invece personali. In demo il layout viene memorizzato solo nel browser. La pagina “La casa in 5 minuti” mostra riepiloghi indicativi calcolati dai dati, non pagamenti automatici.

---
# Casa in Ordine 2.1 — progetto aggiornato

**Stato:** codice preparato, non ancora pubblicato online né collaudato con account reali.

Novità: bollette mancanti, antifrode (senza certificazione bancaria), avvisi pagoPA con scadenze confermate dall'utente, stato sincronizzazione email, cronologia/cestino, bozze offline, assistente trasloco e obiettivi risparmio. OCR e regole locali; nessuna API AI generativa.

Per installazione, rischi, migrazione e nuovi limiti vedi **[Guida v2.0](docs/NUOVE_FUNZIONI_V20.md)** e **[Collaudo v2.0](docs/COLLAUDO_V20.md)**. Su una base 1.9 applica `supabase/migrate_v20.sql` dopo backup e verifica della v1.9.

---

# Casa in Ordine 🏡 — v1.9

Casa in Ordine è una **web app autonoma/PWA per iPhone e Android**, con account personali e, dalla v1.8, case familiari condivise. Non utilizza API AI generative: lettura tramite regole e OCR nel browser. **Non è ancora pubblicata o collaudata end-to-end**: il pacchetto è codice sorgente pronto per configurazione, test e deployment.

## Novità v1.9 — tutte le 10 nuove aree domestiche

**Stato:** codice e interfacce preparati, test unitari e analisi sintattica superati. La migrazione SQL **non è stata eseguita su Supabase reale**; la compilazione Next.js e i flussi OAuth, storage e push **non sono stati collaudati end-to-end**. Non distribuire come servizio pubblico prima dei test descritti sotto.

Per passare dalla v1.8 alla v1.9:

1. Effettua un backup del database e dei documenti di Supabase.
2. Esegui **una sola volta** `supabase/migrate_v19.sql` nell'editor SQL di Supabase. **Non** sostituire lo schema v1.8 né cancellare i dati. Il file crea nuove tabelle, un bucket privato `house-documents`, criteri RLS, trigger di validazione e l'RPC per confermare i pagamenti.
3. Aggiorna il progetto Next.js con i file della v1.9. Mantieni le variabili `.env` già configurate, inclusi `SUPABASE_SECRET_KEY`, `CRON_SECRET`, i provider OAuth e, se desideri le push, VAPID.
4. Prima di abilitare gli accessi pubblici, prova con **due utenti distinti** (proprietario/editor/lettore, due case diverse) ogni operazione di lettura, creazione, modifica, download e cancellazione documento. Controlla che nessun utente possa leggere le email o i documenti di un altro spazio.
5. Verifica dal server che il job `/api/cron` giri ogni giorno; i nuovi avvisi su contratti, manutenzione, garanzie e autoletture vengono generati **solo se il job è configurato e viene eseguito**. La ricerca giornaliera delle email usa il job separato `/api/mail/cron`.

### 1. Analisi consumi

In **Consumi e previsioni** seleziona una bolletta e inserisci i kWh, Smc o m³ e il periodo di fatturazione. Puoi caricare un PDF, JPG, PNG o WEBP: il browser estrae il testo via OCR e propone un valore, ma **devi controllare e confermare il dato**. Il grafico aggrega per mese e unità; con almeno due periodi storici può segnalare un aumento superiore alla soglia configurata nel codice (attualmente 35%). Non corregge automaticamente stagionalità o periodi di fatturazione diversi: le anomalie sono solo indizi da verificare.

### 2. Archivio documenti

In **Archivio documenti** carichi PDF, immagini o TXT fino a **10 MB**. Selezioni la categoria, eventualmente l'immobile e la bolletta da collegare. L'app memorizza i file in un bucket **privato** di Supabase Storage; non usa un URL pubblico permanente. I membri autorizzati di una casa possono aprirli con link di durata limitata. Ricerca locale per nome, tipo, note, immobile, fornitore, importo e scadenza collegata. Le credenziali Gmail/Outlook/IMAP non vengono archiviate qui. I file vengono caricati esplicitamente dall'utente: le email importate non vengono copiate automaticamente nell'archivio definitivo.

**Avvertenza:** dopo l'eliminazione di una casa o di un account, una parte dei file fisici potrebbe richiedere pulizia operativa di Storage. Serve verificare la procedura di cancellazione e retention prima del rilascio pubblico; non è sufficiente eliminare la riga del database.

### 3. Previsioni di spesa

Stime su **3, 6 o 12 mesi**: importi di bollette future note più una media dei precedenti pagamenti con una cadenza ricavata dallo storico del fornitore (mensile, bimestrale ecc.). Non vengono aggiunte automaticamente stime per un fornitore con un solo documento storico. **Non sono importi certi** e non comprendono bollette future che non possono essere inferite dallo storico.

### 4. Autolettura contatori

Fotografa il contatore o inserisci la lettura manuale. L'OCR locale suggerisce numeri che richiedono conferma; vengono conservati data, contatore, tipo e unità. Il confronto tra letture è indicativo, e un valore negativo può indicare sostituzione o azzeramento. È disponibile un **promemoria di comunicazione** ricorrente (mensile, bimestrale, trimestrale o annuale). L'app **non** invia la lettura direttamente al fornitore.

### 5. Manutenzioni e garanzie

Registra elettrodomestici e impianti, acquisto, fine garanzia, prossima manutenzione e ripetizione in mesi. Conserva lo storico di interventi con costi e allegati. Il cron genera un avviso interno 3 giorni prima della manutenzione e 30 giorni prima della fine garanzia; può inviare push se autorizzate e configurate.

### 6. Ricevute e pagamenti

Abbina una ricevuta a una bolletta, scegli metodo, data, importo e documento. **Una ricevuta non segna automaticamente pagata una bolletta**: solo il pulsante di conferma, eseguito da un editor o proprietario, richiama `confirm_payment_receipt`. La funzione verifica in transazione importo corrispondente, permessi e bolletta ancora aperta. Lo stato «confermato» indica una **verifica dell'utente**, non un riscontro contabile indipendente della banca. La lettura di conferme via email rimane separata e segue le preferenze già esistenti.

### 7. Più immobili

In **Immobili** puoi censire più proprietà nello stesso spazio, associando bollette, utenze, documenti, contratti, contatori e manutenzioni. La proprietà non sostituisce il concetto di casa condivisa: la **casa** definisce i permessi di accesso, l'**immobile** è un'etichetta di organizzazione all'interno di quello spazio. Non è consentito collegare un immobile o documento a dati di un'altra casa.

### 8. Rinnovi e tariffe

Conserva fornitore, servizio, costo, PDF del contratto e data di rinnovo/scadenza. Scegli quanti giorni prima ricevere l'avviso. **Non** è attivo lo scraping automatico delle tariffe né una verifica delle condizioni commerciali: per il confronto puoi visitare il Portale Offerte pubblico.

### 9. Centro notifiche

In **Notifiche e backup** puoi abilitare/disabilitare le categorie push (bollette, contratti, manutenzioni/autoletture, riepiloghi), impostare un orario silenzioso in **Europa/Roma** e consultare/segnare come letti gli avvisi interni. Il cron registra gli avvisi interni a prescindere dal permesso push. Durante l'orario silenzioso, le push sono omesse, non accodate per una consegna successiva: gli avvisi interni restano accessibili. Il comportamento delle email esistenti è configurato separatamente.

### 10. Backup, CSV e PDF

Esporta un **JSON** dei dati visibili nello spazio selezionato, comprensivo dei principali moduli domestici e di metadati dell'archivio, oppure il **CSV** delle bollette. Il pulsante di stampa permette di usare «Salva come PDF» dal browser per l'elenco delle scadenze. **Non sono incluse** password, credenziali OAuth, token, file PDF/JPG originali o il contenuto di altre case. Scarica i file originali separatamente. Non sono attivi il ripristino automatico del JSON né il backup pianificato del server; configura le procedure di backup di Supabase/hosting prima di affidare all'app dati importanti.

### Costi e disponibilità

Non vengono utilizzate API AI a pagamento. Supabase, l'hosting, email transazionali, storage, dominio e notifiche potrebbero avere costi/limiti; per un'app destinata ad amici o utenti esterni servono privacy policy, test di accesso e in alcuni casi le verifiche OAuth dei provider. La v1.9 resta una **base applicativa non pubblicata**, non un servizio online già funzionante.

---

## Novità v1.8 — famiglia, budget, spesa, auto, push, calendario

### Come usare le case condivise

- **Famiglia e inviti → Crea casa**: un utente può creare una o più case, separate dal proprio spazio personale. Gli amici che vogliono solo usare l'app possono crearne una indipendente; non condividono mai dati automaticamente.
- Il proprietario può generare un **invito per un indirizzo email specifico**, con scadenza dopo 7 giorni. Il destinatario deve registrarsi/accedere con **quell'email verificata**. Il token di invito è casuale e memorizzato solo come hash nel database; non compare in un elenco pubblico.
- I ruoli sono **proprietario, editor, lettore**. Proprietario ed editor possono modificare bollette, attività e moduli domestici della casa. Il lettore può consultare, senza modificare. Il proprietario può cambiare permessi, revocare inviti, rimuovere membri ed eliminare la casa. Un membro può abbandonare la casa.
- Nel menu in alto seleziona **Privato** oppure una casa condivisa. **Le bollette già personali della v1.7 restano private**; una voce è condivisa solo se viene *creata mentre è selezionata una casa*. Le credenziali delle caselle email e i documenti in attesa di revisione non diventano condivisi.
- Non c'è ancora un trasferimento sicuro di bollette storiche private verso una casa; evita di reinserirle senza prima verificare i duplicati. Le eventuali email per riconoscimento bollette rimangono legate all'account che le ha autorizzate.

### Budget, spese e liste

- **Budget e spese**: imposta limiti mensili per categorie predefinite o personalizzate; confronta le spese condivise registrate con ciascun limite.
- **Dividi spesa**: indica chi ha pagato e tra quali membri ripartire equamente l'importo. Le quote vengono calcolate *in centesimi*, con distribuzione dell'eventuale resto, e salvate in una transazione SQL, in modo che sommino esattamente all'importo. I saldi indicano chi deve contribuire o ricevere; **non sono trasferimenti di denaro**.
- **Lista della spesa**: gli editor possono aggiungere, spuntare ed eliminare articoli; la visualizzazione avviene per casa e si aggiorna quando la pagina ricarica i dati.
- **Attività casa**: nella casa condivisa puoi assegnare una faccenda a un membro, con scadenza e stato completato.
- **Auto e scadenze**: aggiungi veicoli e registra bollo, assicurazione, revisione o tagliando. Ogni scadenza genera una bolletta nella casa condivisa e partecipa ai normali avvisi. Puoi scegliere ripetizione **nessuna, annuale o ogni 2 anni**, che genera stime tramite le utenze ricorrenti. Non sostituisce le verifiche normative sulle scadenze reali.

### Notifiche e calendario

- Le bollette **non pagate 3 giorni prima della scadenza** continuano a generare l'avviso interno ed eventualmente una email. La v1.8 aggiunge **Web Push opt-in** per ciascun dispositivo, inviate dal cron giornaliero anche agli altri membri della casa che hanno attivato i promemoria. Richiedono un sito HTTPS, service worker, browser compatibile e chiavi VAPID configurate sul server. Su iPhone aggiungi la PWA alla schermata Home prima di abilitare le push. Non sono state provate su telefoni reali.
- In **Impostazioni** è disponibile una **esportazione .ics** immediata delle bollette ancora aperte, con avviso calendario a 3 giorni. È un file statico, quindi non viene aggiornato una volta importato.
- In alternativa, **Calendario sincronizzabile** genera un indirizzo segreto, revocabile, da aggiungere come abbonamento a un calendario esterno. Mostra le bollette personali e delle case di cui sei membro ancora da pagare. Al successivo aggiornamento da parte del calendario esterno, le voci pagate o non più accessibili scompaiono. **È una sincronizzazione in sola lettura**: modificare un evento nel calendario esterno non modifica la bolletta nell'app. Non condividere l'URL: chi lo possiede può leggere le descrizioni degli eventi.
- Il **controllo email quotidiano** (`/api/mail/cron`) resta silenzioso e separato dal cron delle scadenze (`/api/cron`). Il riepilogo periodico del mese rimane configurabile per singolo utente e può generare una notifica push (oltre a quella interna/email) quando attivata.

### Aggiornare dalla v1.7 e installare

1. **Fai un backup** del progetto Supabase. Se aggiorni un database **v1.7 esistente**, esegui UNA VOLTA `supabase/migrate_v18.sql` con SQL Editor; non rieseguire `schema.sql` sopra un'installazione già creata. Per un progetto completamente nuovo usa soltanto `supabase/schema.sql`.
2. Aggiorna tutti i file del pacchetto, installa le dipendenze (`npm install`) e verifica (`npm test`, `npm run build`). Le variabili server e OAuth/Gmail/IMAP esistenti restano necessarie: vedi la sezione successiva sul primo avvio.
3. Pubblica su hosting HTTPS che supporti Next.js, job giornalieri e accesso sicuro a Supabase. Configura `APP_URL`, `CRON_SECRET`, Supabase, eventuale `RESEND_API_KEY` e OAuth email. **Non inserire segreti nei campi NEXT_PUBLIC**.
4. Per le push, genera le chiavi VAPID (es. `npx web-push generate-vapid-keys` dopo l'installazione delle dipendenze). Configura `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT=mailto:indirizzo-di-contatto`. Abilita le notifiche dall'app su ciascun telefono.
5. In Supabase configura e verifica **Authentication → URL Configuration**, con l'URL pubblico e i redirect per il login OAuth. Prova da due account diversi: invito, revoca, modifica, sola lettura, pagamento, push, cron e rimozione dati prima di distribuire l'app.

La migrazione aggiunge tabelle condivise con **RLS** e funzioni SQL di autorizzazione; **non rimuove né condivide automaticamente le vecchie bollette**, e mantiene private le integrazioni email. Gli indici e i ruoli vanno collaudati su un vero database Supabase. Gli inviti non sono spediti automaticamente: copia e invia privatamente il collegamento all'email invitata.

**Limiti residui e requisiti per la pubblicazione:** la compilazione Next.js non è stata completata in questo ambiente (il registro npm è irraggiungibile); mancano test end-to-end su Supabase, caselle reali e telefoni. Le integrazioni dirette ai portali dei fornitori richiedono API/autorizzazioni effettivamente disponibili, e non esiste un connettore universale. Non è stato realizzato il collegamento **bidirezionale** ai calendari né la pubblicazione come app nativa negli store: richiedono ulteriori sviluppi, account sviluppatore e verifiche. Per distribuire pubblicamente l'app sono indispensabili valutazione GDPR, gestione della cancellazione completa degli account e dei dati, audit di sicurezza, monitoraggio e controllo delle quote. Il cron email attuale elabora un numero limitato di caselle per volta, perciò un utilizzo su larga scala richiede una coda con ripartenza/paginazione.

**Nota su Vercel:** i Cron Jobs sono disponibili anche su Hobby, ma con esecuzione al massimo giornaliera e senza precisione al minuto. Le due pianificazioni incluse sono entrambe giornaliere, ma il piano e le quote reali vanno verificati prima della pubblicazione.

---


## Storico v1.7 — idee utili dalla conversazione Claude, senza AI

**Casa in Ordine è un progetto di app web autonoma, non un'app interna a Claude.** La nuova versione mantiene tutte le funzioni precedenti e aggiunge:

- **Fornitori da impostare personalmente**: vai in **Le mie utenze → Chi ti manda le bollette?**, scegli servizio e nome; puoi aggiungere l'indirizzo esatto quando lo conosci. La ricerca email amplia i candidati usando anche i fornitori indicati, ma la corrispondenza non prova l'identità del mittente e non segna mai pagamenti in automatico. Ogni utente conserva il proprio elenco.
- **Piano rate condominiale**: in **Importa e collega → Importa il piano rate del condominio** puoi leggere PDF/JPG/PNG/WEBP o incollare il testo. Il lettore propone solo righe con data e importo univoci sulla stessa riga; correggi e seleziona ogni rata prima di importare. L'OCR e la lettura avvengono localmente, senza caricare il documento. Il filtro per interno/nome funziona se compare *su ogni riga*, non solo nell'intestazione. Non salva automaticamente rate non riconosciute. Le rate diventano bollette categoria Condominio; gli importi non sono stime.
- **Testo di bolletta incollato**: in **Importa e collega → Incolla il testo di una bolletta**, per copia-incolla da portali e app di fornitori non collegabili.
- **Promemoria e riepilogo distinti**: il controllo della posta resta quotidiano e silenzioso, se il cron è attivo. L'avviso individuale resta fissato a **3 giorni** prima della scadenza per le bollette aperte; in Impostazioni puoi configurare **separatamente il riepilogo delle bollette future del mese**: disattivato (predefinito), giornaliero, settimanale, ogni due settimane, mensile. In app viene conservato il riepilogo; via email viene spedito solo quando Resend è configurato. Per settimane/quindicine si sceglie il giorno, per il mensile il giorno da 1 a 28.
- **PWA installabile**: icone, manifest e service worker senza cache dei dati personali. Quando il sito sarà disponibile in HTTPS su un browser compatibile, potrai aggiungerlo alla schermata Home di iPhone e Android. Il pacchetto v1.8 include notifiche Web Push opt-in per PWA compatibili, ma non è ancora distribuito negli store.

**Aggiornamento v1.6 → v1.7:** fai un backup, esegui **solo** `supabase/migrate_v17.sql` nel SQL Editor di Supabase, aggiorna i file dell'app e ripubblica. Per **installazioni nuove**, esegui `supabase/schema.sql` soltanto (include già la v1.7). Non ripetere la migrazione; il database dei mittenti/email precedenti rimane invariato.

**Limiti:** il cron quotidiano già presente elabora poche caselle per esecuzione (8): per molti amici sarà necessario introdurre coda/paginazione e monitoraggio. L'importazione piani rate richiede collaudo su documenti veri, specialmente quelli con tabelle e unità multiple. La compilazione completa e i flussi OAuth reali restano da verificare. Queste funzioni sono state aggiunte nella v1.8; vanno tuttavia ancora collaudate su servizi reali. Consulta `ROADMAP.md` per il confronto con la conversazione Claude.

**Regola da mantenere:** la presenza di un addebito automatico/SDD non dimostra che la bolletta sia stata pagata; non la segniamo pagata solo perché è domiciliata. Il riconoscimento email di ricevute resta separato e prudente.

## Novità v1.6 — mittenti personali che si apprendono dopo una conferma

**Nessuna API AI:** Casa in Ordine continua a usare filtri deterministici, lettura PDF e OCR locale. L'apprendimento dei mittenti è una semplice rubrica privata associata al fornitore confermato dall'utente.

1. Una scansione Gmail / Outlook / IMAP trova un possibile documento e lo mette tra i **Documenti trovati**. Nessuna email viene aggiunta automaticamente come mittente attendibile.
2. L'utente apre il documento, controlla **fornitore, importo e scadenza** e salva la bolletta. Soltanto dopo questa conferma, il server ricava l'**indirizzo From effettivo** (non il nome visualizzato) dai metadati originali del documento.
3. Se l'indirizzo è valido, non appartiene a un provider di posta personale comune e non presenta un esito negativo DMARC riportato, viene memorizzata un'associazione privata **indirizzo esatto → fornitore**. Se si sceglie un nuovo fornitore nel modulo di revisione, viene appreso anche quello.
4. Ai controlli successivi, Gmail aggiunge una ricerca dedicata agli **indirizzi esatti appresi**; Microsoft e IMAP utilizzano gli indirizzi appresi per valutare anche documenti PDF con oggetto generico nella finestra delle email recenti. Il fornitore può essere proposto nella revisione; **non viene mai confermato al posto dell'utente**.
5. I domini sono memorizzati solo per generare **suggerimenti prudenziali** quando la segnalazione DMARC riportata dal provider è positiva e tutti gli indirizzi memorizzati sotto quel dominio corrispondono allo stesso fornitore. Il solo dominio **non** autorizza la ricerca estesa né un pagamento.
6. In **Importa e collega → Mittenti delle bollette appresi** ogni persona vede le proprie associazioni e può premere **Dimentica**. Un account non può consultare i mittenti degli amici.

### Autenticazione e limitazioni di sicurezza

- Gmail e Microsoft possono mostrare i risultati **SPF / DKIM / DMARC** nei propri header `Authentication-Results`. L'app esamina un risultato DMARC riportato dall'infrastruttura del provider, coerente con il dominio del campo `From` (DMARC incorpora l'allineamento di SPF/DKIM). Questo **non è una verifica crittografica indipendente**: gli header possono essere assenti, ambigui o in alcuni casi falsificati; il risultato è un *indizio* per classificare un documento, non una prova d'identità.
- Sugli account IMAP generici non si assume di potersi fidare della provenienza dei risultati di autenticazione. I mittenti vengono appresi come **autenticazione sconosciuta** solo dopo una conferma manuale.
- Gli indirizzi da domini comuni di posta personale (es. Gmail, Libero, Outlook, iCloud, Yahoo) vengono esclusi dall'apprendimento automatico, così un inoltro non diventa un fornitore. I domini simili a quelli legittimi non vengono considerati equivalenti.
- Non esiste un elenco preautorizzato di fornitori: eventuali domini citati in rete non vengono promossi automaticamente a mittenti sicuri. Le email con firma o autenticazione sospetta, o con fornitori discordanti, richiedono sempre verifica umana. Le regole possono non rilevare tutte le frodi.
- **La lista dei mittenti delle bollette è diversa dai mittenti autorizzati alle conferme di pagamento.** Imparare un mittente NON abilita la conferma automatica di pagamenti, che resta soggetta alle regole e alle impostazioni separate della v1.4.
- È stato aggiunto un nuovo endpoint autenticato `GET /api/mail/senders` / `DELETE /api/mail/senders` (solo i record del proprietario). La lista persiste finché l'utente non elimina l'associazione o l'account.

**Aggiornamento da v1.5:** dopo un backup, esegui `supabase/migrate_learned_senders.sql` una sola volta in Supabase, aggiorna il codice e ripubblica. Senza la migrazione l'elenco mittenti e la scansione delle email mostreranno un errore. **Nuove installazioni:** esegui solo `supabase/schema.sql` (già comprensivo della migrazione v1.6). Le caselle già collegate non vanno ricollegate.

## Novità v1.5 — OCR e regole locali (senza AI)

Casa in Ordine **non chiama API di AI generativa**. La scansione periodica della posta usa Gmail API / Microsoft Graph / IMAP, filtri deterministici su oggetti e allegati e successivamente, quando approvi un documento, **PDF.js e Tesseract OCR nel browser**.

- **Ricerca email più selettiva:** distingue candidati di bollette da ricevute di pagamento e pubblicità; evita allegati decorativi come `logo.png` e `banner.jpg`. Questo filtro può occasionalmente scartare una vera bolletta: il controllo umano resta necessario.
- **PDF e foto:** oltre a leggere il testo nativo, un PDF incompleto può essere letto con OCR sulle pagine più probabilmente scansionate (fino a 5); una foto può essere analizzata una seconda volta con contrasto migliorato, se mancano dati o la qualità è scarsa. Il risultato migliore viene scelto attraverso i campi realmente ricavati, non solo il punteggio dell’OCR.
- **Importi e date:** esclude meglio IVA, subtotali e date di emissione; se ci sono importi totali o scadenze in conflitto, propone di scegliere manualmente invece di indovinare. Gestisce euro con separatori italiani e internazionali.
- **Ricevute e solleciti:** avverte esplicitamente quando il documento potrebbe non essere una nuova bolletta e chiede un’ulteriore conferma prima di salvarlo come debito.
- **Pagamenti via email:** filtra richieste di pagamento, solleciti, revoche e messaggi equivoci. Anche con autoconferma facoltativa attivata e mittente autorizzato, richiede una conferma esplicita nel corpo del messaggio e un riferimento al fornitore nell'oggetto o mittente; l’email non diventa una prova bancaria.

**Non serve una nuova migrazione SQL passando dalla v1.4 alla v1.5.** Non è stata aggiunta alcuna chiave API AI, nessun modello generativo e nessun collegamento bancario. Il costo delle API AI è zero; rimangono eventualmente i costi ordinari di hosting, servizi email e database.

**Limiti:** Tesseract e le regole non sono infallibili. Il secondo OCR può impiegare più tempo e necessita di risorse nel browser; le dipendenze possono scaricare i modelli linguistici al primo utilizzo. L’OCR reale su foto/PDF deve essere ancora collaudato su dispositivi e documenti reali. Non segnare mai un pagamento solo perché un testo somiglia a una ricevuta.

## Funzionalità

- Registrazione e accesso personale via Supabase Auth (email/password e, quando configurato, Google OAuth).
- Isolamento dei dati tramite Row Level Security: gli amici possono creare account indipendenti senza vedere dati altrui.
- Dashboard con importi ancora da pagare, spese, scadenze e grafico di sei mesi.
- Bollette: creazione, stato pagato/non pagato, cancellazione, ricerca e filtri.
- Utenze ricorrenti (mensili, bimestrali, trimestrali, annuali): genera automaticamente fatture con **importo stimato**.
- Attività di casa: aggiunta e completamento.
- **Importazione da PDF, JPG, PNG e WEBP**: estrazione sul dispositivo (testo PDF + OCR per scansioni/screenshot), proposta automatica di fornitore, categoria, importo e scadenza; sempre modificabili in una schermata di revisione prima del salvataggio. Il file originale non viene caricato o conservato sul server. Limite 15 MB, fino a 8 pagine PDF lette e fino a 5 pagine scansionate con OCR. Le librerie OCR possono scaricare i modelli linguistici sul dispositivo al primo utilizzo.
- Controllo duplicati per PDF e immagini già importati, usando un hash SHA-256 del file (non ne memorizziamo il contenuto).
- **Ricerca automatica da email (v1.6)**: Gmail e Outlook/Hotmail/Microsoft 365 tramite OAuth; iCloud, Yahoo, Libero, Virgilio, Aruba, PEC e altri provider tramite IMAP/TLS. Ogni utente collega una o più caselle personali, l’app cerca bollette e raccoglie gli allegati candidati in una coda privata da verificare.
- Importazione CSV (opzionale): `fornitore;importo;scadenza;categoria;descrizione;stato`, formato italiano.
- **Riconoscimento delle email di pagamento (v1.4)**: legge il testo delle possibili conferme ricevute da Gmail, Outlook e account IMAP; abbina per importo, fornitore e periodo. La prima conferma resta da verificare, puoi autorizzare un mittente e attivare la conferma automatica nelle Impostazioni (disattivata in partenza).
- Promemoria **in app** per tutte le scadenze ancora da pagare a tre giorni; email tramite Resend se configurato.
- Una chiave di integrazione diversa per ciascun utente permette a servizi esterni (ad es. n8n/Make) di inviare automaticamente bollette all'endpoint HTTPS.
- Modalità dimostrativa locale senza configurazione (i dati sono salvati nel browser, **non** condivisi né protetti come account online).

## Importare una bolletta da PDF o screenshot

1. Apri **Importa e collega → Seleziona PDF o immagine**; in alternativa usa **Bollette → Carica PDF o foto**.
2. Scegli un PDF, JPG, PNG o WEBP. Il browser legge il testo; se il file è una scansione o foto, esegue OCR italiano/inglese.
3. Controlla la scheda di revisione **prima di salvare**: fornitore, descrizione, categoria, importo e scadenza possono richiedere correzioni. Il sistema non segna pagamenti come effettuati sulla base del documento.
4. Salva la bolletta. Il documento originale non viene memorizzato, solo i dati confermati e l’impronta usata per evitare duplicati.

**Privacy e limiti**: il documento viene elaborato nel browser e non viene inviato alla nostra API. Librerie e modelli OCR vengono caricati dal browser. Il riconoscimento è euristico e non garantisce accuratezza; in particolare foto sfocate, layout complessi e PDF protetti possono non essere letti. Non usare gli importi rilevati per effettuare pagamenti senza verificarli. Per i documenti caricati direttamente dal dispositivo non c’è archiviazione sul server; gli allegati trovati tramite Gmail vengono invece temporaneamente archiviati in uno spazio privato per consentire la revisione successiva.

### Aggiornamento da una versione già installata (v1.6)

- **Da v1.5**: esegui `migrate_learned_senders.sql`.
- **Da v1.4**: esegui `migrate_learned_senders.sql` (la v1.5 non richiedeva modifiche al database).
- **Da v1.3**: esegui nell'ordine `migrate_payment_emails.sql`, `migrate_learned_senders.sql` nel SQL Editor di Supabase.
- **Da v1.2**: esegui nell'ordine `migrate_mail_providers.sql`, `migrate_payment_emails.sql`, `migrate_learned_senders.sql`.
- **Da v1.1**: esegui `migrate_mail.sql`, `migrate_mail_providers.sql`, `migrate_payment_emails.sql`, `migrate_learned_senders.sql`.
- **Da v1.0**: esegui `migrate_document_import.sql`, `migrate_mail.sql`, `migrate_mail_providers.sql`, `migrate_payment_emails.sql`, `migrate_learned_senders.sql`.
- **Nuova installazione**: esegui **solo** `supabase/schema.sql` (v1.6 completa).

Esegui ciascuna migrazione una volta sola, dopo aver fatto un backup. Non è necessario ricollegare le caselle email già attive. Aggiorna il codice, installa le dipendenze con `npm install`, poi ripubblica la versione di produzione. Se dimentichi la nuova migrazione, il controllo automatico della posta può dare errore.

## Collegamento di più provider email (v1.5)

Ogni persona mantiene il proprio account e può collegare più caselle, con un controllo programmato sul server.

### Provider integrati

| Provider | Modalità | Note |
| --- | --- | --- |
| **Gmail / Google Workspace** | OAuth Google, `gmail.readonly` | Richiede credenziali Google Cloud, verifica OAuth applicabile |
| **Outlook.com, Hotmail, Live, Microsoft 365** | OAuth Microsoft Graph, permessi delegati `Mail.Read`, `User.Read`, `offline_access` | Richiede registrazione app Microsoft Entra; l'amministratore aziendale può limitare il consenso |
| **Apple iCloud Mail** | IMAP/TLS `imap.mail.me.com:993` | Password specifica per app; il login può essere la sola parte prima di @ |
| **Yahoo Mail** | IMAP/TLS `imap.mail.yahoo.com:993` | Password per app, se resa disponibile da Yahoo |
| **AOL Mail** | IMAP/TLS `imap.aol.com:993` | Accesso a terze parti soggetto alle impostazioni AOL |
| **Libero Mail** | IMAP/TLS `imapmail.libero.it:993` | Credenziale consentita dal provider |
| **Virgilio Mail** | IMAP/TLS `in.virgilio.it:993` | Credenziale consentita dal provider |
| **Tiscali Mail** | IMAP/TLS `imap.tiscali.it:993` | IMAP deve essere disponibile |
| **Aruba Mail (dominio) / gratuita** | IMAP/TLS `imaps.aruba.it` / `imap.aruba.it`, porta 993 | IMAP può richiedere attivazione per alcuni piani |
| **Aruba PEC** | IMAP/TLS `imaps.pec.aruba.it:993` | Configura una password per programmi se usi 2FA |
| **Fastmail** | IMAP/TLS `imap.fastmail.com:993` | Password per app, piano che comprenda IMAP |
| **Zoho Mail** | IMAP/TLS `imap.zoho.com` / `imappro.zoho.com` | Account personale / aziendale, data center USA |
| **Zoho Mail EU** | IMAP/TLS `imap.zoho.eu` / `imappro.zoho.eu` | Account europeo personale / aziendale, verificare il server in Zoho |
| **GMX.com / GMX.de** | IMAP/TLS `imap.gmx.com` / `imap.gmx.net` | Attiva accesso a client IMAP nel profilo |
| **mail.com** | IMAP/TLS `imap.mail.com:993` | Accesso IMAP subordinato al piano |

I server IMAP sono **preimpostati lato backend** per evitare accessi a destinazioni arbitrarie e sono tutti su TLS 993, con verifica del certificato. Non è disponibile la configurazione di un server IMAP personalizzato: potrà essere prevista in futuro con opportune verifiche anti-SSRF. Non sono inclusi Proton Mail (Bridge è locale, non un'API cloud IMAP), servizi senza API/IMAP e l'inoltro automatico a una casella comune. Non tutti i provider garantiscono l'accesso da applicazioni terze o da server cloud.

### Configurazione OAuth Google

1. Configura database Supabase, URL HTTPS di produzione e `APP_URL` (solo origine, senza slash finale).
2. In Google Cloud Console abilita la **Gmail API**, configura lo schermo OAuth e crea un client **Web application**.
3. Configura il redirect **esatto** `https://TUO-DOMINIO.it/api/mail/callback` (in locale `http://localhost:3000/api/mail/callback`) e le variabili server `GOOGLE_MAIL_CLIENT_ID`, `GOOGLE_MAIL_CLIENT_SECRET`.
4. L'utente sceglie **Collega Gmail** e autorizza la lettura della posta. Il solo login Google tramite Supabase **non** equivale al consenso Gmail.

Lo scope `gmail.readonly` è **restricted**: per la distribuzione pubblica Google può richiedere verifica OAuth e valutazione di sicurezza indipendente, soprattutto se gli allegati vengono conservati sul server. In fase di test gli utenti sono limitati e alcuni refresh token potrebbero scadere rapidamente.

### Configurazione OAuth Microsoft

1. In **Microsoft Entra admin center → App registrations**, registra un'app che ammetta account personali Microsoft e account aziendali/scolastici (*Accounts in any organizational directory and personal Microsoft accounts*).
2. Seleziona piattaforma **Web** e configura il redirect `https://TUO-DOMINIO.it/api/mail/callback` (o `http://localhost:3000/api/mail/callback` in sviluppo).
3. Aggiungi autorizzazioni **Microsoft Graph / Delegated**: `Mail.Read` e `User.Read` (il flusso richiede anche `offline_access`); crea un **client secret** e salva `MICROSOFT_MAIL_CLIENT_ID` e `MICROSOFT_MAIL_CLIENT_SECRET` esclusivamente sul server.
4. L'utente clicca **Outlook / Hotmail / Microsoft 365**, approva il consenso ed effettua il primo controllo. Alcune organizzazioni richiedono l'approvazione dell'amministratore.

Si usa l'API Microsoft Graph in sola lettura e, nella prima versione, si cercano gli allegati nella **Posta in arrivo recente**: le fatture archiviate altrove potrebbero non essere individuate. Lo scollegamento elimina il token dall'app; l'utente può revocare separatamente l'autorizzazione nel proprio account Microsoft.

### Configurazione IMAP

1. Nella sezione **Altri servizi email (IMAP)** seleziona il gestore, inserisci email e credenziale IMAP. Se il servizio offre password specifiche per applicazioni **usa quella**, non la password principale. È previsto anche un campo facoltativo per il nome utente IMAP (utile per iCloud).
2. L'app verifica realmente la connessione al server del provider tramite TLS e salva la credenziale cifrata in PostgreSQL, senza mostrarla nuovamente nel browser. Ogni utente può collegare fino a 12 caselle; dopo cinque tentativi di connessione in 15 minuti gli ulteriori tentativi vengono temporaneamente bloccati.
3. Avvia **Cerca bollette** dalla casella collegata. La ricerca IMAP prende messaggi recenti nella cartella INBOX, non sposta né cancella email.
4. Per rimuovere il collegamento clicca **Scollega** e revoca la password per app sul sito del gestore. Per alcuni gestori l'uso di una password normale permette accesso pieno e la revoca richiede cambiarla.

**Avviso di sicurezza**: IMAP con password comporta più rischi rispetto a OAuth: la nostra app può tecnicamente leggere la casella intera. Le credenziali IMAP sono inviate al server dell'app solo su HTTPS e cifrate in database tramite `MAIL_TOKEN_ENCRYPTION_KEY` (AES-256-GCM). Non usare questa soluzione con caselle particolarmente sensibili senza aver effettuato audit di sicurezza, gestione incidenti e valutazione privacy.

### Riconoscimento delle email di pagamento (novità v1.4)

1. Collega la tua email tramite **Importa e collega** come prima: Gmail/Outlook tramite OAuth, gli altri provider tramite IMAP/TLS. I permessi email restano gli stessi (lettura, non invio).
2. Il cron giornaliero `/api/mail/cron` controlla anche alcuni messaggi recenti con indicazioni di pagamento avvenuto, **anche senza allegati**. Per Gmail usa una ricerca dedicata, per Microsoft/IMAP analizza i messaggi recenti nella Posta in arrivo. Per ogni provider ci sono limiti sul numero di messaggi per esecuzione; possono sfuggire email meno recenti o con terminologia diversa.
3. Se trova una dichiarazione esplicita di pagamento e **un importo EUR univoco**, cerca tra le bollette non ancora pagate: importo identico, nome del fornitore compatibile e scadenza in una finestra temporale ragionevole. Con più corrispondenze non sceglie arbitrariamente: propone la segnalazione per verifica.
4. Vai su **Importa e collega → Conferme di pagamento**. Controlla l'oggetto, il mittente, l'importo e la bolletta associata. Premi **Conferma** per segnare la bolletta come pagata, oppure **Scarta**. Puoi anche selezionare una bolletta diversa, purché l'importo sia identico.
5. Solo se selezioni la casella **Autorizza questo mittente** al momento della conferma, e attivi **Impostazioni → Conferma automatica dei pagamenti**, i futuri messaggi da *quell'indirizzo* e per *quel fornitore* possono registrare un pagamento senza ulteriori clic, **se viene trovata una sola bolletta corrispondente**. Di default questa opzione è **disattivata**.
6. Puoi revocare ogni autorizzazione in **Importa e collega → Mittenti autorizzati** e spegnere l'automazione in qualsiasi momento dalle Impostazioni. Un pagamento riconosciuto impedisce la creazione del futuro promemoria a 3 giorni per quella bolletta, se il cron lo vede già registrato.

**Limiti e sicurezza importanti**: una email non equivale a una prova bancaria e il nome mittente può essere falsificato. Dalla v3.3 l'autoconferma avviene solo se Gmail o Outlook riportano DMARC superato per il dominio del mittente (mai con IMAP); il sistema **non verifica il saldo bancario**, quindi anche l'autoconferma con mittente autorizzato comporta un rischio di errore. Per la maggiore affidabilità, tieni l'opzione spenta e verifica ogni proposta. Non vengono eseguiti pagamenti né richieste al conto corrente. Le conferme PDF *allegate* non vengono lette come prova di pagamento in questa versione: il riconoscimento riguarda il testo/HTML dell'email. Oggetto, indirizzo mittente, importo, data e stato sono conservati nell'app per deduplicazione e revisione, **non** il corpo completo dell'email. I candidati non verificati vengono cancellati dopo 120 giorni e la cronologia delle decisioni dopo 365 giorni, se il job giornaliero è attivo. Le regole sono euristiche: non possono garantire di individuare tutte le conferme.

### Documenti, scansioni e notifiche

- `GET /api/mail/cron` è protetto da `CRON_SECRET` e programmato per **05:30 UTC** ogni giorno. Analizza un numero limitato di caselle per esecuzione: per molti utenti servono coda e paginazione.
- Per le bollette con allegato ricerca i messaggi recenti (tipicamente ultimi 35 giorni) con parole chiave e allegati PDF/JPG/PNG/WEBP entro 15 MB. I file candidati sono temporaneamente nel bucket Supabase **privato** `mail-bills`, con accesso limitato al proprietario; dati testo come mittente e oggetto possono essere conservati per un massimo di 45 giorni nella coda.
- Seleziona **Verifica** e controlla importo, fornitore e scadenza. L'OCR di immagini e PDF scansionati avviene **nel browser**. Il riconoscimento documentale non è garantito e non registra pagamenti; le conferme email sono elaborate con il distinto flusso protetto illustrato sopra.
- Dopo importazione, scarto o 45 giorni, il file temporaneo viene rimosso. I riferimenti a messaggio/allegato sono usati per evitare duplicati; il controllo è per connessione e può perdere memoria del duplicato dopo averla scollegata.
- I promemoria 3 giorni prima della scadenza restano gestiti dal cron bollette `GET /api/cron`. **La casella connessa serve per leggere le fatture; non viene usata per inviare promemoria.** Per l'invio è necessario Resend, altrimenti restano gli avvisi in app.

Per ogni provider, l'utente deve fornire consenso o una credenziale valida. Prima di distribuire ad amici servono privacy policy GDPR, limiti di conservazione, procedura completa di cancellazione dati, rate limiting esteso, test dell'autenticazione, monitoraggio e controllo delle dipendenze. L'integrazione non è ancora stata testata end-to-end con vere caselle email.

## Primo avvio

1. Installa Node.js 20+.
2. Da terminale, in questa cartella: `npm install` (il comando copia automaticamente il worker PDF.js nella cartella `public/`).
3. Avvia la demo: `npm run dev` e apri `http://localhost:3000`.
4. Per abilitarne l'uso reale, crea un progetto su **Supabase**, esegui `supabase/schema.sql` nel SQL Editor e copia `.env.example` in `.env.local`.
5. Inserisci `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY` (secret/service-role **solo backend**), `CRON_SECRET` e `APP_URL`.
6. Nella dashboard Supabase, sezione **Authentication → URL Configuration**, configura il dominio del sito e i redirect consentiti. Attiva la verifica email e imposta un SMTP affidabile per le email di registrazione.
7. Per login Google configura **Supabase → Authentication → Providers → Google** con un OAuth Client ID/Secret e il redirect fornito da Supabase. L'accesso Google permette solo il login: **non** legge Gmail automaticamente.
8. In Supabase e Vercel imposta le policy di accesso del progetto e conserva i segreti soltanto nelle variabili server.
9. Per i promemoria email, crea un account **Resend**, verifica il dominio mittente e configura `RESEND_API_KEY` e `RESEND_FROM`. Senza queste variabili, vengono comunque creati promemoria **in app** (visibili all'apertura).
10. Pubblica il progetto su **Vercel**, collegando il repository oppure distribuendolo via Vercel CLI. Imposta le stesse variabili d'ambiente. Le scadenze automatiche e le notifiche richiedono una **distribuzione production** con Cron Jobs abilitati.

> Importante: non è possibile attivare account, email reali o API dei fornitori senza che il proprietario configuri i relativi servizi, gli accessi e i consensi. Il progetto non contiene credenziali e non accede ai portali dei fornitori.

## Promemoria e ricorrenze

- `vercel.json` invoca `GET /api/cron` ogni giorno alle **07:00 UTC**, cioè alle 08:00 in inverno e 09:00 in estate in Italia (su Vercel Hobby l'esecuzione può avvenire nell'ora pianificata).
- Il job calcola la data secondo il fuso **Europe/Rome**, crea le bollette ricorrenti fino a 45 giorni avanti e seleziona tutte le bollette con scadenza fra **esattamente tre giorni** e `paid_at = null`.
- Se i promemoria sono attivi per l'utente, crea un avviso interno una sola volta. Se è disponibile Resend, invia anche una email che chiede **«Hai già effettuato il pagamento?»** e rinvia all'app per segnare la bolletta come pagata.
- L'endpoint è protetto dalla variabile `CRON_SECRET`, che Vercel invia nell'header `Authorization: Bearer …`.
- In caso di indisponibilità di Resend, il promemoria in app resta creato. Gli invii falliti non sono ritentati automaticamente in questa prima versione; monitorare il log del cron.
- Il job ha un limite MVP di 1000 utenze / 1000 bollette per esecuzione: aumentare con paginazione e code per crescita significativa.

## Collegamento automatico indipendente per ogni utente

In **Importa e collega → Genera chiave personale** ogni utente autenticato riceve una chiave segreta distinta, mostrata una sola volta e memorizzata soltanto come hash SHA-256. La chiave può essere rigenerata o revocata.

Da un'automazione personale autorizzata (es. n8n o Make) esegui:

```bash
curl -X POST 'https://TUO-DOMINIO.it/api/ingest' \
  -H 'Authorization: Bearer LA_TUA_CHIAVE' \
  -H 'Content-Type: application/json' \
  -d '{
    "external_id": "fornitore-2026-001",
    "title": "Bolletta luce novembre",
    "supplier": "Fornitore luce",
    "category": "Luce",
    "amount": 89.50,
    "due_date": "2026-11-25",
    "paid": false
  }'
```

`external_id` evita doppioni quando la stessa automazione ripete l'invio. Se re-invia lo stesso ID, aggiorna la bolletta anziché crearne un'altra. Le credenziali dei fornitori non sono salvate in Casa in Ordine.

**Non implementato**: collegamento diretto ai portali dei fornitori, lettura delle caselle senza consenso/credenziali, identificazione dei pagamenti via banca. I provider email necessitano ancora configurazione e prove end-to-end con account reali. L’endpoint generico permette anche integrazioni tramite servizi terzi configurati da ciascun utente.

## Sicurezza e dati personali

- Non inserire mai `SUPABASE_SECRET_KEY`, `CRON_SECRET` o `RESEND_API_KEY` in variabili `NEXT_PUBLIC_` o nel repository.
- Tutte le tabelle personali hanno RLS. `integration_keys` e le scritture in `reminders` sono accessibili solo dal backend con chiave segreta.
- Le email dei profili sono lette da Supabase Auth e non modificabili liberamente dagli utenti tramite la tabella profili.
- Prima di un lancio pubblico: privacy policy GDPR, ruoli e responsabilità privacy, cancellazione account e dati (inclusi documenti Storage), log non sensibili, rate limit API e OAuth, audit RLS, verifica SMTP, monitoraggio job e backup. In particolare verifica le condizioni Google per lo scope Gmail restricted, i requisiti Microsoft e il rischio di conservare credenziali IMAP.
- Una bolletta viene segnata pagata **manualmente** o da un'automazione che invia `paid: true`, non accedendo al conto corrente senza consenso.
- Non mettere password dei fornitori nel campo «Codice cliente».

## Verifiche

`npm test` esegue oltre 400 test automatici (novembre 2026) su date italiane, rinnovi, CSV, estrazione dei campi, OAuth Google/Microsoft (state/PKCE), validazione provider IMAP, cifratura credenziali, sicurezza degli allegati, riconoscimento prudente delle conferme di pagamento e apprendimento isolato dei mittenti. L’OCR reale va provato in un browser con file di esempio; il riconoscimento è probabilistico.

## Verifica e stato attuale

I test automatici con `npm test` passano e `npm run build` compila (verificato a novembre 2026; la stessa verifica gira su GitHub a ogni push, `.github/workflows/tests.yml`). Il collaudo end-to-end con caselle reali, telefoni veri e Supabase resta da effettuare. Il sistema non è già in produzione: per attivare scansioni e notifiche è necessario pubblicarlo, configurare le credenziali e controllare i log dei cron.

## Stack

Next.js / React, PDF.js, Tesseract.js (OCR nel browser), Supabase (Auth, PostgreSQL, Storage privato e RLS), Gmail API OAuth, Microsoft Graph OAuth, IMAPFlow e MailParser per provider preconfigurati, Vercel Cron Jobs, Resend opzionale. Nessun dato reale è incluso nel progetto.

## Novità 2.1 — Le funzioni non convenzionali

Sono state integrate nove sezioni aggiuntive: **QR degli oggetti**, **SOS Casa (anche offline con copia cifrata)**, **Radar incongruenze**, **Simulatore spese**, **Passaporto immobile**, **Modalità vacanza (condivisione temporanea revocabile)**, **Inventario assicurativo con foto**, **Decisioni di famiglia** e **La casa in 5 minuti**.

Prima di usare la versione 2.1 applicare `supabase/migrate_v21.sql` **dopo** le migrazioni fino alla 2.0. La guida ai nuovi flussi è in `docs/NUOVE_FUNZIONI_V21.md`; la lista dei test reali mancanti è in `docs/COLLAUDO_V21.md`. Non collegare utenti reali finché non sono completate le prove di sicurezza in staging.

La generazione dei QR usa `qrcode` installato come normale dipendenza con `npm install`. Non ci sono nuove API AI o costi a bolletta. La copia SOS locale è cifrata; le fotografie utilizzano il bucket Storage già previsto. Un collegamento vacanza rivela **solo** le istruzioni scelte volontariamente dal proprietario/editor, non documenti, credenziali o indirizzi della casa.

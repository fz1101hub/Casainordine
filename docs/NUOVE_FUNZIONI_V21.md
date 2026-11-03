# Casa in Ordine 2.1 — Funzioni non convenzionali

La versione 2.1 estende la 2.0. Funziona senza API AI a pagamento. Non sono stati collegati account reali né pubblicata una versione in produzione durante questa consegna.

## Le nove funzioni

1. **QR sugli oggetti**: in **Manutenzioni** registri il modello, numero di serie e stanza. In **QR degli oggetti** generi un codice che incorpora soltanto l'URL HTTPS e l'identificativo UUID dell'oggetto. La scheda dell'oggetto e gli eventuali allegati sono visibili solo dopo login e nel corretto spazio personale/familiare. La generazione QR usa il pacchetto `qrcode`, che va installato con le dipendenze.
2. **SOS Casa**: schede online visibili ai membri autorizzati con indicazioni sui punti di arresto e i contatti. Per l'uso offline si sceglie esplicitamente una scheda e una frase segreta di almeno 10 caratteri. AES-256-GCM e PBKDF2 proteggono la copia nel browser. Solo l'utente che conosce la frase la può aprire in `/offline.html`. Una modifica online **non** aggiorna da sola la copia offline: bisogna rigenerarla. Non salvare PIN, password o istruzioni pericolose.
3. **Radar delle incongruenze**: controlla documenti dello stesso spazio e fornitore, segnala periodi fatturati due volte, ripetizioni di bollette saldate, prezzi superiori a quelli registrati per alcuni servizi a quota fissa, e rimborsi che l'utente dichiara attesi ma non arrivati. Non certifica errori, frodi o rimborsi: richiede una verifica dei documenti originali.
4. **Simulatore «Cosa succederebbe se…»**: calcola l'impatto di consumi, variazioni delle altre spese e costi straordinari, con un periodo fra 1 e 60 mesi. È una simulazione numerica, non un modello predittivo o un preventivo.
5. **Passaporto dell'immobile**: prende le informazioni già registrate in Immobili, Manutenzioni, Archivio e Contratti. Permette di esportare un JSON limitato ai campi scelti o stampare/salvare PDF tramite il browser. Indirizzo e seriali sono **esclusi per impostazione predefinita**. Non incorpora PDF, originali o credenziali.
6. **Modalità vacanza**: checklist editabile per l'assenza. Il proprietario/editor può creare un collegamento temporaneo di 24 ore, 3 giorni o 7 giorni che contiene soltanto le istruzioni appositamente scritte per il destinatario. Il link è segreto, revocabile, non recuperabile dopo la creazione e non concede l'accesso all'app, ai documenti o alle informazioni private. Non condividere informazioni che non vorresti fossero lette da chiunque ricevesse quel link.
7. **Inventario fotografico assicurativo**: registra oggetti, stanza, seriale e valore stimato; consente di fotografare o selezionare una foto JPG/PNG/WEBP da 10 MB massimo, archiviata nel bucket privato `house-documents`, e di collegare il documento al bene. Il dossier JSON non contiene link temporanei ai file né token. Il valore non è una perizia assicurativa.
8. **Decisioni familiari**: in una casa condivisa editor/proprietario pubblicano proposte con budget e scadenza, mentre ciascun membro (anche lettore) può esprimere una scelta «favorevole», «contrario» o «mi astengo». Un voto per persona/proposta; modifica consentita finché la proposta è aperta. La chiusura non attiva alcun pagamento o acquisto.
9. **La casa in 5 minuti**: mostra fino a cinque azioni prioritarie: bollette aperte e scadute, manutenzioni, rinnovi, faccende e decisioni; permette un export JSON con sole etichette, sezioni e date. La lista è aggiornata all'apertura e non produce ulteriori notifiche. Può essere consultata ogni settimana o quando serve.

## Flusso dei permessi

I record hanno `user_id` e `home_id`. `home_id=NULL` significa personale. Un record condiviso è visibile esclusivamente ai membri della casa; solo proprietario/editor può modificarlo. I voti sono per membro e limitati alla proposta associata. I documenti continuano a usare il bucket privato e il sistema RLS della 1.9. Gli identificativi QR da soli non autorizzano la lettura di dati. Il link vacanza è l'unica eccezione intenzionale: è un segreto temporaneo che espone il solo testo selezionato.

## Aggiornamento da 2.0

1. Effettuare un backup Supabase e del bucket `house-documents`.
2. Verificare la presenza di tutte le migrazioni fino a `migrate_v20.sql`.
3. Su un **database di staging**, applicare `supabase/migrate_v21.sql`, poi ripetere le prove RLS con almeno tre utenti, due case e un lettore.
4. Installare dipendenze con `npm install` (incluso `qrcode`) ed eseguire `npm test` e `npm run build`.
5. Configurare le variabili di ambiente già descritte in `.env.example` e l'hosting HTTPS. Il codice non contiene nuove chiavi obbligatorie per la 2.1.
6. Pubblicare la versione *solo dopo* aver verificato i test con persone e dispositivi reali.

## Cosa non fa

Non esegue acquisti, pagamenti o interventi di emergenza; non certifica documenti o l'autenticità di una bolletta; non apre portali fornitori non autorizzati; non produce una perizia. La copia SOS offline non si sincronizza tra dispositivi. Il dossier stampato usa la funzione nativa del browser, non un generatore PDF lato server. Gli allegati assicurativi vanno controllati dai singoli utenti.

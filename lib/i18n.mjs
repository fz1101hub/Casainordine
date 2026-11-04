// Casa in Ordine 3.2 — shared, dependency-free six-language catalogue.
// Each entry is ordered: Italian, English, Spanish, French, German, Portuguese.
export const LANGUAGES = Object.freeze([
 {code:'it',name:'Italiano',locale:'it-IT'},
 {code:'en',name:'English',locale:'en-GB'},
 {code:'es',name:'Español',locale:'es-ES'},
 {code:'fr',name:'Français',locale:'fr-FR'},
 {code:'de',name:'Deutsch',locale:'de-DE'},
 {code:'pt',name:'Português',locale:'pt-PT'}
]);
export const DEFAULT_LANGUAGE='it';
const CODES=LANGUAGES.map(x=>x.code);
export function normalizeLanguage(value) {
 const raw=String(value||'').trim().toLowerCase().replace('_','-');
 const primary=raw.split('-')[0];
 return CODES.includes(primary)?primary:DEFAULT_LANGUAGE;
}
export function browserLanguage(value) {
 const raw=String(value||'').trim().toLowerCase();
 return CODES.includes(raw.split(/[-_]/)[0])?normalizeLanguage(raw):DEFAULT_LANGUAGE;
}
export function localeFor(lang) {return LANGUAGES.find(x=>x.code===normalizeLanguage(lang))?.locale||'it-IT';}
const PHRASES={
 'bill.paid':['Pagata','Paid','Pagada','Payée','Bezahlt','Paga'],
 'bill.overdue':['Scaduta','Overdue','Vencida','En retard','Überfällig','Vencida'],
 'bill.dueSoon':['In scadenza','Due soon','Próxima a vencer','Bientôt à payer','Bald fällig','A vencer'],
 'bill.toPay':['Da pagare','To pay','Por pagar','À payer','Zu bezahlen','Por pagar'],
 'home.loadError':['Impossibile leggere le preferenze personali','Unable to load personal preferences','No se pueden cargar las preferencias personales','Impossible de charger les préférences personnelles','Persönliche Einstellungen konnten nicht geladen werden','Não foi possível carregar as preferências pessoais'],
 'home.saveError':['Salvataggio non riuscito','Could not save','No se pudo guardar','Enregistrement impossible','Speichern fehlgeschlagen','Não foi possível guardar'],
 'home.retry':['Riprova','Try again','Vuelve a intentarlo','Réessayez','Bitte erneut versuchen','Tente novamente'],
 'home.signInToSave':['Accedi per salvare le preferenze.','Sign in to save preferences.','Inicia sesión para guardar las preferencias.','Connectez-vous pour enregistrer vos préférences.','Melde dich an, um Einstellungen zu speichern.','Inicie sessão para guardar as preferências.'],
 'home.moveUp':['Sposta in alto','Move up','Subir','Monter','Nach oben','Mover para cima'],
 'home.moveDown':['Sposta in basso','Move down','Bajar','Descendre','Nach unten','Mover para baixo'],
 'nav.dashboard':['La mia Home','My Home','Mi inicio','Mon accueil','Mein Zuhause','A minha página inicial'],
 'nav.overview':['Panoramica completa','Full overview','Vista general','Vue d’ensemble','Gesamtübersicht','Visão geral completa'],
 'nav.bills':['Bollette','Bills','Facturas','Factures','Rechnungen','Faturas'],
 'nav.utilities':['Le mie utenze','My utilities','Mis suministros','Mes abonnements','Meine Versorger','Os meus serviços'],
 'nav.tasks':['Attività casa','Home tasks','Tareas del hogar','Tâches de la maison','Haushaltsaufgaben','Tarefas de casa'],
 'nav.household':['Famiglia e inviti','Family & invites','Familia e invitaciones','Famille et invitations','Familie & Einladungen','Família e convites'],
 'nav.budget':['Budget e spese','Budget & expenses','Presupuesto y gastos','Budget et dépenses','Budget & Ausgaben','Orçamento e despesas'],
 'nav.shopping':['Lista della spesa','Shopping list','Lista de la compra','Liste de courses','Einkaufsliste','Lista de compras'],
 'nav.vehicles':['Auto e scadenze','Vehicles & deadlines','Vehículos y vencimientos','Véhicules et échéances','Fahrzeuge & Termine','Veículos e prazos'],
 'nav.insights':['Consumi e previsioni','Usage & forecasts','Consumos y previsiones','Consommation et prévisions','Verbrauch & Prognosen','Consumos e previsões'],
 'nav.archive':['Archivio documenti','Documents','Archivo de documentos','Archives des documents','Dokumentenarchiv','Arquivo de documentos'],
 'nav.properties':['Immobili','Properties','Inmuebles','Biens immobiliers','Immobilien','Imóveis'],
 'nav.maintenance':['Manutenzioni','Maintenance','Mantenimiento','Entretien','Wartung','Manutenção'],
 'nav.contracts':['Contratti','Contracts','Contratos','Contrats','Verträge','Contratos'],
 'nav.payments':['Ricevute','Receipts','Recibos','Reçus','Quittungen','Recibos'],
 'nav.alerts':['Notifiche e backup','Alerts & backup','Avisos y copias','Notifications et sauvegarde','Mitteilungen & Backup','Notificações e cópias'],
 'nav.monitor':['Monitoraggio email','Email monitoring','Seguimiento del correo','Suivi des e-mails','E-Mail-Überwachung','Monitorização de email'],
 'nav.fraud':['Controllo antifrode','Fraud checks','Control antifraude','Contrôle antifraude','Betrugsprüfung','Verificação antifraude'],
 'nav.pagopa':['Avvisi pagoPA','pagoPA notices','Avisos pagoPA','Avis pagoPA','pagoPA-Mitteilungen','Avisos pagoPA'],
 'nav.history':['Cronologia e recupero','History & recovery','Historial y recuperación','Historique et récupération','Verlauf & Wiederherstellung','Histórico e recuperação'],
 'nav.moving':['Assistente trasloco','Moving assistant','Asistente de mudanza','Assistant déménagement','Umzugshilfe','Assistente de mudanças'],
 'nav.savings':['Obiettivi risparmio','Savings goals','Objetivos de ahorro','Objectifs d’épargne','Sparziele','Objetivos de poupança'],
 'nav.offline':['Bozze offline','Offline drafts','Borradores sin conexión','Brouillons hors ligne','Offline-Entwürfe','Rascunhos offline'],
 'nav.briefing':['La casa in 5 minuti','Home in 5 minutes','La casa en 5 minutos','La maison en 5 minutes','Zuhause in 5 Minuten','A casa em 5 minutos'],
 'nav.tags':['QR degli oggetti','Item QR codes','QR de objetos','QR des objets','QR-Codes für Gegenstände','QR dos objetos'],
 'nav.sos':['SOS Casa','Home SOS','SOS Hogar','SOS Maison','Haus-Notfall','SOS Casa'],
 'nav.radar':['Radar incongruenze','Discrepancy radar','Radar de anomalías','Radar des anomalies','Unstimmigkeiten','Radar de anomalias'],
 'nav.simulator':['Simulatore spese','Expense simulator','Simulador de gastos','Simulateur de dépenses','Ausgabensimulator','Simulador de despesas'],
 'nav.passport':['Passaporto immobile','Property passport','Ficha del inmueble','Passeport du bien','Immobilienpass','Passaporte do imóvel'],
 'nav.vacation':['Modalità vacanza','Holiday mode','Modo vacaciones','Mode vacances','Urlaubsmodus','Modo férias'],
 'nav.inventory':['Inventario assicurativo','Insurance inventory','Inventario del seguro','Inventaire d’assurance','Versicherungsinventar','Inventário do seguro'],
 'nav.decisions':['Decisioni di famiglia','Family decisions','Decisiones familiares','Décisions familiales','Familienentscheidungen','Decisões familiares'],
 'nav.connect':['Importa e collega','Import & connect','Importar y conectar','Importer et connecter','Importieren & verbinden','Importar e ligar'],
 'nav.settings':['Impostazioni','Settings','Ajustes','Paramètres','Einstellungen','Definições'],
 'general.private':['Privato','Private','Privado','Privé','Privat','Privado'],
 'general.house':['Casa','Home','Casa','Maison','Zuhause','Casa'],
 'general.loading':['Caricamento…','Loading…','Cargando…','Chargement…','Wird geladen…','A carregar…'],
 'general.save':['Salva','Save','Guardar','Enregistrer','Speichern','Guardar'],
 'general.cancel':['Annulla','Cancel','Cancelar','Annuler','Abbrechen','Cancelar'],
 'general.add':['Aggiungi','Add','Añadir','Ajouter','Hinzufügen','Adicionar'],
 'general.open':['Apri','Open','Abrir','Ouvrir','Öffnen','Abrir'],
 'general.update':['Aggiorna','Refresh','Actualizar','Actualiser','Aktualisieren','Atualizar'],
 'general.all':['Tutte','All','Todas','Toutes','Alle','Todas'],
 'general.none':['Nessuna','None','Ninguna','Aucune','Keine','Nenhuma'],
 'general.restore':['Ripristina','Restore','Restablecer','Réinitialiser','Zurücksetzen','Repor'],
 'general.saved':['Salvato','Saved','Guardado','Enregistré','Gespeichert','Guardado'],
 'general.details':['Dettagli','Details','Detalles','Détails','Details','Detalhes'],
 'general.currencyNote':['Gli importi non vengono convertiti cambiando lingua.','Changing language does not convert amounts.','Cambiar el idioma no convierte los importes.','Changer de langue ne convertit pas les montants.','Ein Sprachwechsel rechnet keine Beträge um.','Mudar de idioma não converte os montantes.'],
 'settings.language':['Lingua dell’app','App language','Idioma de la aplicación','Langue de l’application','Sprache der App','Idioma da aplicação'],
 'settings.language.help':['Scegli la lingua che preferisci. La scelta è personale, anche nelle case condivise.','Choose your preferred language. This setting is personal, even in shared homes.','Elige tu idioma. Esta preferencia es personal, incluso en hogares compartidos.','Choisissez votre langue. Ce réglage est personnel, même dans une maison partagée.','Wähle deine Sprache. Diese Einstellung gilt nur für dich, auch in geteilten Haushalten.','Escolha o seu idioma. Esta preferência é pessoal, mesmo em casas partilhadas.'],
 'settings.language.saved':['Lingua aggiornata.','Language updated.','Idioma actualizado.','Langue mise à jour.','Sprache aktualisiert.','Idioma atualizado.'],
 'settings.language.error':['Impossibile salvare la lingua nel tuo account.','Unable to save your language to your account.','No se pudo guardar el idioma en tu cuenta.','Impossible d’enregistrer la langue sur votre compte.','Die Sprache konnte nicht in deinem Konto gespeichert werden.','Não foi possível guardar o idioma na sua conta.'],
 'home.greeting':['Buongiorno{who}!','Hello{who}!','¡Hola{who}!','Bonjour{who} !','Hallo{who}!','Olá{who}!'],
 'home.eyebrow':['LA MIA HOME · VERSIONE 3.0','MY HOME · VERSION 3.2','MI INICIO · VERSIÓN 3.2','MON ACCUEIL · VERSION 3.2','MEIN ZUHAUSE · VERSION 3.2','A MINHA PÁGINA · VERSÃO 3.2'],
 'home.subtitle':['Le cose che contano per te, nell’ordine che preferisci.','What matters to you, in your preferred order.','Lo que te importa, en el orden que prefieras.','L’essentiel pour vous, dans l’ordre qui vous convient.','Das Wichtigste für dich – in deiner Reihenfolge.','O que é importante para si, pela ordem que preferir.'],
 'home.personalize':['Personalizza','Customize','Personalizar','Personnaliser','Anpassen','Personalizar'],
 'home.editor.title':['Scegli cosa vedere per primo','Choose what to see first','Elige qué ver primero','Choisissez ce que vous voyez en premier','Wähle, was du zuerst sehen möchtest','Escolha o que ver primeiro'],
 'home.editor.help':['Seleziona i moduli e usa le frecce per cambiare l’ordine. Solo tu vedrai le tue preferenze.','Select modules and use the arrows to reorder them. Your preferences are yours alone.','Selecciona módulos y usa las flechas para cambiar su orden. Solo tú verás tus preferencias.','Sélectionnez les modules et utilisez les flèches pour les réorganiser. Ces choix restent personnels.','Wähle Module und sortiere sie mit den Pfeilen. Nur du siehst deine Einstellungen.','Selecione os módulos e use as setas para alterar a ordem. Só a sua conta vê estas escolhas.'],
 'home.editor.layout':['Come vuoi visualizzarli?','How would you like to see them?','¿Cómo quieres verlos?','Comment souhaitez-vous les afficher ?','Wie möchtest du sie anzeigen?','Como quer vê-los?'],
 'home.editor.compact':['Compatto — solo l’essenziale','Compact — essentials only','Compacto — solo lo esencial','Compact — l’essentiel','Kompakt — nur das Wesentliche','Compacto — apenas o essencial'],
 'home.editor.expanded':['Dettagliato — più informazioni','Expanded — more detail','Detallado — más información','Détaillé — plus d’informations','Detailliert — mehr Informationen','Detalhado — mais informação'],
 'home.editor.default':['Ripristina la Home iniziale','Restore default Home','Restaurar inicio predeterminado','Rétablir l’accueil par défaut','Standard-Startseite wiederherstellen','Repor página inicial'],
 'home.editor.save':['Salva la mia Home','Save my Home','Guardar mi inicio','Enregistrer mon accueil','Meine Startseite speichern','Guardar a minha página'],
 'home.editor.saving':['Salvataggio…','Saving…','Guardando…','Enregistrement…','Wird gespeichert…','A guardar…'],
 'home.editor.saved':['Preferenze della Home salvate.','Home preferences saved.','Preferencias de inicio guardadas.','Préférences de l’accueil enregistrées.','Startseiten-Einstellungen gespeichert.','Preferências da página inicial guardadas.'],
 'home.editor.privacy':['Non cambierai i dati né le preferenze degli altri utenti.','This will not change other users’ data or preferences.','No cambiarás los datos ni las preferencias de otros usuarios.','Vous ne modifierez ni les données ni les préférences d’autres utilisateurs.','Daten und Einstellungen anderer Nutzer bleiben unverändert.','Não altera os dados ou preferências de outros utilizadores.'],
 'home.widget.bills':['Bollette e scadenze','Bills & deadlines','Facturas y vencimientos','Factures et échéances','Rechnungen & Fälligkeiten','Faturas e prazos'],
 'home.widget.shopping':['Lista della spesa','Shopping list','Lista de la compra','Liste de courses','Einkaufsliste','Lista de compras'],
 'home.widget.tasks':['Attività da fare','Tasks to do','Tareas pendientes','Tâches à faire','Offene Aufgaben','Tarefas a fazer'],
 'home.widget.briefing':['La casa in 5 minuti','Home in 5 minutes','La casa en 5 minutos','La maison en 5 minutes','Zuhause in 5 Minuten','A casa em 5 minutos'],
 'home.widget.bills.count':['{count} aperte · {amount} da pagare','{count} open · {amount} due','{count} pendientes · {amount} por pagar','{count} en attente · {amount} à payer','{count} offen · {amount} fällig','{count} pendentes · {amount} a pagar'],
 'home.widget.bills.alert':['{count} bollette scadute o in scadenza oggi','{count} bills overdue or due today','{count} facturas vencidas o con vencimiento hoy','{count} factures en retard ou à régler aujourd’hui','{count} Rechnungen überfällig oder heute fällig','{count} faturas vencidas ou a vencer hoje'],
 'home.widget.bills.empty':['Nessuna bolletta aperta. Le prossime scadenze appariranno qui.','No open bills. Upcoming deadlines will appear here.','No hay facturas pendientes. Los próximos vencimientos aparecerán aquí.','Aucune facture en attente. Les prochaines échéances apparaîtront ici.','Keine offenen Rechnungen. Die nächsten Termine erscheinen hier.','Sem faturas pendentes. Os próximos prazos aparecerão aqui.'],
 'home.widget.bills.new':['Nuova bolletta','New bill','Nueva factura','Nouvelle facture','Neue Rechnung','Nova fatura'],
 'home.widget.shopping.count':['{count} prodotti da comprare','{count} items to buy','{count} productos por comprar','{count} articles à acheter','{count} Artikel auf der Liste','{count} produtos por comprar'],
 'home.widget.shopping.shared':['Disponibile nelle case condivise','Available in shared homes','Disponible en hogares compartidos','Disponible dans les maisons partagées','In geteilten Haushalten verfügbar','Disponível em casas partilhadas'],
 'home.widget.shopping.nohome':['Seleziona o crea una casa condivisa per gestire la spesa con la famiglia.','Choose or create a shared home to manage shopping together.','Elige o crea un hogar compartido para organizar la compra.','Choisissez ou créez une maison partagée pour gérer les courses ensemble.','Wähle oder erstelle einen gemeinsamen Haushalt für die Einkaufsliste.','Escolha ou crie uma casa partilhada para gerir as compras em família.'],
 'home.widget.shopping.empty':['Non ci sono prodotti da acquistare.','No items to buy.','No hay productos por comprar.','Aucun article à acheter.','Nichts einzukaufen.','Não há produtos para comprar.'],
 'home.widget.shopping.newhome':['Crea una casa','Create a home','Crear hogar','Créer une maison','Haushalt erstellen','Criar casa'],
 'home.widget.shopping.open':['Apri lista','Open list','Abrir lista','Ouvrir la liste','Liste öffnen','Abrir lista'],
 'home.widget.tasks.count':['{count} attività aperte','{count} open tasks','{count} tareas pendientes','{count} tâches en attente','{count} offene Aufgaben','{count} tarefas pendentes'],
 'home.widget.tasks.empty':['Non ci sono attività in sospeso.','No pending tasks.','No hay tareas pendientes.','Aucune tâche en attente.','Keine offenen Aufgaben.','Não há tarefas pendentes.'],
 'home.widget.tasks.new':['Nuova attività','New task','Nueva tarea','Nouvelle tâche','Neue Aufgabe','Nova tarefa'],
 'home.widget.briefing.count':['Le azioni più importanti','Your top priorities','Tus prioridades','Vos priorités','Deine Prioritäten','As suas prioridades'],
 'home.widget.briefing.empty':['Nessuna azione urgente rilevata nei dati registrati.','No urgent actions found in the saved data.','No hay acciones urgentes en los datos guardados.','Aucune action urgente repérée dans les données.','Keine dringenden Aufgaben in den gespeicherten Daten.','Nenhuma ação urgente detetada nos dados guardados.'],
 'home.widget.briefing.loading':['Preparazione del riepilogo…','Preparing summary…','Preparando resumen…','Préparation du résumé…','Zusammenfassung wird erstellt…','A preparar resumo…'],
 'home.widget.briefing.open':['Apri riepilogo','Open summary','Abrir resumen','Ouvrir le résumé','Zusammenfassung öffnen','Abrir resumo'],
 'home.openAll':['Vedi tutte','View all','Ver todas','Tout voir','Alle anzeigen','Ver todas'],
 'home.seeAll':['Apri panoramica completa','Open full overview','Abrir vista general','Ouvrir la vue d’ensemble','Gesamtübersicht öffnen','Abrir visão geral'],
 'home.overview.hint':['La panoramica completa rimane sempre disponibile nel menu.','The full overview is always available in the menu.','La vista general siempre está disponible en el menú.','La vue d’ensemble reste disponible dans le menu.','Die Gesamtübersicht bleibt im Menü verfügbar.','A visão geral continua disponível no menu.'],
 'home.loading':['Caricamento della tua Home…','Loading your Home…','Cargando tu inicio…','Chargement de votre accueil…','Deine Startseite wird geladen…','A carregar a sua página…'],
 'home.shop.quantity':['Quantità: {quantity}','Quantity: {quantity}','Cantidad: {quantity}','Quantité : {quantity}','Menge: {quantity}','Quantidade: {quantity}'],
 'home.task.deadline':['Entro il {date}','Due {date}','Hasta el {date}','Avant le {date}','Bis {date}','Até {date}'],
 'home.task.noDate':['Senza scadenza','No deadline','Sin fecha límite','Sans échéance','Ohne Termin','Sem prazo'],
 'home.bill.markPaid':['Segna pagata: {title}','Mark paid: {title}','Marcar como pagada: {title}','Marquer comme payée : {title}','Als bezahlt markieren: {title}','Marcar como paga: {title}'],
 'auth.title':['Bentornato a casa','Welcome home','Bienvenido a casa','Bienvenue chez vous','Willkommen zu Hause','Bem-vindo a casa'],
 'auth.signupTitle':['Crea il tuo account','Create your account','Crea tu cuenta','Créez votre compte','Erstelle dein Konto','Crie a sua conta'],
 'auth.loginHelp':['Accedi per vedere tutte le tue scadenze.','Sign in to see your deadlines.','Inicia sesión para ver tus vencimientos.','Connectez-vous pour voir vos échéances.','Melde dich an, um deine Termine zu sehen.','Inicie sessão para ver os seus prazos.'],
 'auth.signupHelp':['I tuoi dati restano privati; scegli tu cosa condividere con la famiglia.','Your data stays private; you choose what to share with family.','Tus datos son privados; tú eliges qué compartir con tu familia.','Vos données restent privées ; vous décidez quoi partager avec la famille.','Deine Daten bleiben privat; du entscheidest, was du teilst.','Os seus dados são privados; decide o que partilhar com a família.'],
 'auth.email':['Email','Email','Correo electrónico','E-mail','E-Mail','Email'],
 'auth.password':['Password','Password','Contraseña','Mot de passe','Passwort','Palavra-passe'],
 'auth.signIn':['Accedi','Sign in','Iniciar sesión','Se connecter','Anmelden','Iniciar sessão'],
 'auth.signUp':['Registrati','Create account','Registrarse','S’inscrire','Registrieren','Registar'],
 'auth.signingIn':['Accesso in corso…','Signing in…','Iniciando sesión…','Connexion…','Anmeldung läuft…','A iniciar sessão…'],
 'auth.or':['oppure','or','o','ou','oder','ou'],
 'auth.google':['Continua con Google','Continue with Google','Continuar con Google','Continuer avec Google','Mit Google fortfahren','Continuar com Google'],
 'auth.demo':['Prova subito con dati di esempio','Try with sample data','Probar con datos de ejemplo','Essayer avec des données fictives','Mit Beispieldaten testen','Experimentar com dados de exemplo'],
 'auth.noAccount':['Non hai un account?','No account?','¿No tienes cuenta?','Pas encore de compte ?','Noch kein Konto?','Ainda não tem conta?'],
 'auth.hasAccount':['Hai già un account?','Already have an account?','¿Ya tienes cuenta?','Déjà un compte ?','Schon ein Konto?','Já tem conta?'],
 'auth.passwordHint':['Almeno 6 caratteri','At least 6 characters','Al menos 6 caracteres','Au moins 6 caractères','Mindestens 6 Zeichen','Pelo menos 6 caracteres'],
 'auth.confirm':['Registrazione effettuata. Controlla la tua email per confermare l’account.','Account created. Check your email to confirm it.','Cuenta creada. Revisa tu correo para confirmarla.','Compte créé. Vérifiez votre e-mail pour le confirmer.','Konto erstellt. Bitte bestätige es per E-Mail.','Conta criada. Confirme-a através do seu email.'],
 'auth.privacy':['I tuoi spazi privati restano personali. Condividi solo le case che scegli.','Your private space stays private. Share only the homes you choose.','Tus espacios privados siguen siendo tuyos. Comparte solo los hogares que elijas.','Votre espace privé reste personnel. Ne partagez que les maisons choisies.','Dein privater Bereich bleibt privat. Teile nur ausgewählte Haushalte.','Os seus espaços privados continuam pessoais. Partilhe apenas as casas escolhidas.'],
 'auth.brandLine':['LE SCADENZE DI CASA, SOTTO CONTROLLO','HOUSEHOLD DEADLINES, UNDER CONTROL','TUS PLAZOS DEL HOGAR, BAJO CONTROL','LES ÉCHÉANCES DU FOYER, SOUS CONTRÔLE','HAUSHALTSTERMINE IM BLICK','PRAZOS DA CASA, SOB CONTROLO'],
 'auth.tagline':['Più casa. Meno pensieri.','More home. Less worry.','Más hogar. Menos preocupaciones.','Plus de maison. Moins de soucis.','Mehr Zuhause. Weniger Sorgen.','Mais casa. Menos preocupações.'],
 'auth.intro':['Bollette, utenze e impegni domestici in un unico posto. Privato, semplice e sempre aggiornato.','Bills, services and home tasks in one place. Private, simple and up to date.','Facturas, suministros y tareas del hogar en un solo lugar. Privado, fácil y actualizado.','Factures, services et tâches ménagères au même endroit. Privé, simple et à jour.','Rechnungen, Verträge und Aufgaben an einem Ort. Privat, einfach und aktuell.','Faturas, serviços e tarefas domésticas num só lugar. Privado, simples e atualizado.'],
 'auth.reminder':['Un promemoria 3 giorni prima delle scadenze non pagate.','A reminder 3 days before unpaid bills are due.','Un recordatorio 3 días antes de un vencimiento pendiente.','Un rappel 3 jours avant une échéance impayée.','Eine Erinnerung 3 Tage vor offenen Fälligkeiten.','Um lembrete 3 dias antes dos prazos por pagar.']
};
export const MESSAGE_KEYS=Object.freeze(Object.keys(PHRASES));
export const TRANSLATIONS=Object.freeze(Object.fromEntries(CODES.map((lang,index)=>[
 lang,Object.freeze(Object.fromEntries(Object.entries(PHRASES).map(([key,values])=>[key,values[index]])))
])));
export function translate(lang,key,params={}) {
 const locale=normalizeLanguage(lang);
 const str=TRANSLATIONS[locale][key]??TRANSLATIONS.it[key]??key;
 return str.replace(/\{([a-z][a-zA-Z0-9]*)\}/g,(_,name)=>params[name]===undefined?'{'+name+'}':String(params[name]));
}
export function formatMoney(amount,lang='it',currency='EUR'){
 const n=Number(amount);
 if(!Number.isFinite(n))return '—';
 return new Intl.NumberFormat(localeFor(lang),{style:'currency',currency}).format(n);
}
export function formatDate(iso,lang='it',options={day:'numeric',month:'short',year:'numeric'}){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(iso||'')))return '—';
 const date=new Date(iso+'T12:00:00Z');
 if(Number.isNaN(date.getTime()))return '—';
 return new Intl.DateTimeFormat(localeFor(lang),{...options,timeZone:'UTC'}).format(date);
}

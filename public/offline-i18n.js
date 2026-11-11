// Testi della pagina offline (public/offline.html) nelle 6 lingue dell'app.
// La lingua è quella scelta nell'app (preferenza dell'account usato sul dispositivo, poi quella
// generale), altrimenti quella del browser. Tono come nel resto dell'app: tu in italiano,
// spagnolo e tedesco; forma di cortesia in inglese neutro, francese e portoghese.
const KEY = 'casainordine-language-v32';
const LOCALES = { it: 'it-IT', en: 'en-GB', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', pt: 'pt-PT' };

export const OFFLINE_COPY = {
  it: {
    title: 'Casa in Ordine · Offline',
    intro: "Puoi preparare un'attività o salvare una bolletta in PDF/foto come bozza sul dispositivo. Nessun dato sarà inviato prima che tu riapra l'app con Internet e confermi.",
    taskLabel: 'Nuova attività personale', taskPlaceholder: 'Es. Segnalare autolettura gas', taskButton: 'Salva attività offline',
    shoppingLabel: 'Articolo da comprare (lista condivisa)', shoppingPlaceholder: 'Es. Latte', shoppingButton: 'Salva articolo offline',
    fileLabel: 'Foto / PDF da importare in seguito', fileButton: 'Conserva file offline',
    sosTitle: 'SOS Casa · copie private cifrate',
    sosIntro: "Se hai salvato le schede SOS di una casa dall'app, puoi aprirle anche senza rete. Le case protette si aprono con la frase della casa, le altre con la frase scelta per il dispositivo. La frase non viene inviata a un server.",
    copyLabel: 'Copia', phraseLabel: 'Frase', phrasePlaceholder: 'Almeno 10 caratteri', openButton: 'Apri le schede SOS', clearButton: 'Cancella questa copia da questo telefono',
    note: 'Le bozze rimangono nel browser (non cifrate). Evita dispositivi condivisi; non cancellare i dati del browser prima di importarle. Un file salvato non è una bolletta registrata.',
    reopen: "Riapri l'app quando torni online",
    taskSaved: 'Bozza attività salvata sul dispositivo.', shoppingSaved: 'Articolo salvato: sceglierai la casa prima di importarlo.', fileSaved: 'Documento conservato sul dispositivo. Importalo dopo la riconnessione.',
    errStorage: 'Memoria offline non disponibile su questo browser.', errTitle: 'Il testo è troppo corto.', errFile: 'File non valido: scegli un PDF o una foto di massimo 10 MB.', errGeneric: 'Salvataggio non riuscito. Riprova.',
    cards: '{n} schede', home: 'Casa', legacyCopy: 'Copia precedente (una sola per tutte le case)', noCopy: 'Nessuna copia su questo telefono',
    where: 'Dove intervenire', instructions: 'Istruzioni', contact: 'Contatto',
    noSaved: 'Nessuna copia SOS salvata su questo dispositivo.', wrongPhrase: 'Frase non corretta.', emptyCopy: 'La copia non contiene schede.',
    openFailed: 'Impossibile aprire la copia: frase non corretta o copia danneggiata.', confirmClear: 'Cancellare questa copia SOS da questo telefono?', cleared: 'Copia cancellata.'
  },
  en: {
    title: 'Casa in Ordine · Offline',
    intro: 'You can prepare a task or save a bill as a PDF or photo draft on this device. Nothing is sent until you reopen the app online and confirm.',
    taskLabel: 'New personal task', taskPlaceholder: 'E.g. Submit gas meter reading', taskButton: 'Save task offline',
    shoppingLabel: 'Item to buy (shared list)', shoppingPlaceholder: 'E.g. Milk', shoppingButton: 'Save item offline',
    fileLabel: 'Photo / PDF to import later', fileButton: 'Keep file offline',
    sosTitle: 'Home SOS · private encrypted copies',
    sosIntro: "If you saved a home's SOS records from the app, you can open them without a connection. Protected homes open with the home passphrase, the others with the passphrase chosen for this device. The passphrase is never sent to a server.",
    copyLabel: 'Copy', phraseLabel: 'Passphrase', phrasePlaceholder: 'At least 10 characters', openButton: 'Open SOS records', clearButton: 'Delete this copy from this phone',
    note: "Drafts stay in the browser (not encrypted). Avoid shared devices and don't clear the browser data before importing them. A saved file is not a recorded bill.",
    reopen: 'Reopen the app when you are back online',
    taskSaved: 'Task draft saved on this device.', shoppingSaved: 'Item saved: you will choose the home before importing it.', fileSaved: 'Document kept on this device. Import it once you are back online.',
    errStorage: 'Offline storage is not available in this browser.', errTitle: 'The text is too short.', errFile: 'Invalid file: choose a PDF or a photo up to 10 MB.', errGeneric: 'Saving failed. Please try again.',
    cards: '{n} records', home: 'Home', legacyCopy: 'Previous copy (one for all homes)', noCopy: 'No copy on this phone',
    where: 'Where to act', instructions: 'Instructions', contact: 'Contact',
    noSaved: 'No SOS copy saved on this device.', wrongPhrase: 'Incorrect passphrase.', emptyCopy: 'This copy contains no records.',
    openFailed: 'The copy could not be opened: wrong passphrase or damaged copy.', confirmClear: 'Delete this SOS copy from this phone?', cleared: 'Copy deleted.'
  },
  es: {
    title: 'Casa in Ordine · Sin conexión',
    intro: 'Puedes preparar una tarea o guardar una factura en PDF o foto como borrador en el dispositivo. No se enviará nada hasta que vuelvas a abrir la aplicación con Internet y lo confirmes.',
    taskLabel: 'Nueva tarea personal', taskPlaceholder: 'P. ej. Enviar la lectura del gas', taskButton: 'Guardar tarea sin conexión',
    shoppingLabel: 'Artículo para comprar (lista compartida)', shoppingPlaceholder: 'P. ej. Leche', shoppingButton: 'Guardar artículo sin conexión',
    fileLabel: 'Foto / PDF para importar más tarde', fileButton: 'Guardar archivo sin conexión',
    sosTitle: 'SOS Casa · copias privadas cifradas',
    sosIntro: 'Si guardaste las fichas SOS de una casa desde la aplicación, puedes abrirlas también sin conexión. Las casas protegidas se abren con la frase de la casa; las demás, con la frase elegida para el dispositivo. La frase no se envía a ningún servidor.',
    copyLabel: 'Copia', phraseLabel: 'Frase', phrasePlaceholder: 'Al menos 10 caracteres', openButton: 'Abrir las fichas SOS', clearButton: 'Borrar esta copia de este teléfono',
    note: 'Los borradores se quedan en el navegador (sin cifrar). Evita los dispositivos compartidos y no borres los datos del navegador antes de importarlos. Un archivo guardado no es una factura registrada.',
    reopen: 'Vuelve a abrir la aplicación cuando tengas conexión',
    taskSaved: 'Borrador de tarea guardado en el dispositivo.', shoppingSaved: 'Artículo guardado: elegirás la casa antes de importarlo.', fileSaved: 'Documento guardado en el dispositivo. Impórtalo cuando vuelvas a tener conexión.',
    errStorage: 'El almacenamiento sin conexión no está disponible en este navegador.', errTitle: 'El texto es demasiado corto.', errFile: 'Archivo no válido: elige un PDF o una foto de 10 MB como máximo.', errGeneric: 'No se pudo guardar. Inténtalo de nuevo.',
    cards: '{n} fichas', home: 'Casa', legacyCopy: 'Copia anterior (una para todas las casas)', noCopy: 'No hay copias en este teléfono',
    where: 'Dónde actuar', instructions: 'Instrucciones', contact: 'Contacto',
    noSaved: 'No hay ninguna copia SOS guardada en este dispositivo.', wrongPhrase: 'Frase incorrecta.', emptyCopy: 'La copia no contiene fichas.',
    openFailed: 'No se pudo abrir la copia: frase incorrecta o copia dañada.', confirmClear: '¿Borrar esta copia SOS de este teléfono?', cleared: 'Copia borrada.'
  },
  fr: {
    title: 'Casa in Ordine · Hors ligne',
    intro: 'Vous pouvez préparer une tâche ou enregistrer une facture en PDF ou en photo comme brouillon sur l’appareil. Rien n’est envoyé avant que vous rouvriez l’application avec Internet et confirmiez.',
    taskLabel: 'Nouvelle tâche personnelle', taskPlaceholder: 'Ex. Transmettre le relevé du gaz', taskButton: 'Enregistrer la tâche hors ligne',
    shoppingLabel: 'Article à acheter (liste partagée)', shoppingPlaceholder: 'Ex. Lait', shoppingButton: 'Enregistrer l’article hors ligne',
    fileLabel: 'Photo / PDF à importer plus tard', fileButton: 'Conserver le fichier hors ligne',
    sosTitle: 'SOS Maison · copies privées chiffrées',
    sosIntro: 'Si vous avez enregistré les fiches SOS d’un foyer depuis l’application, vous pouvez les ouvrir même sans connexion. Les foyers protégés s’ouvrent avec la phrase du foyer, les autres avec la phrase choisie pour l’appareil. La phrase n’est jamais envoyée à un serveur.',
    copyLabel: 'Copie', phraseLabel: 'Phrase', phrasePlaceholder: 'Au moins 10 caractères', openButton: 'Ouvrir les fiches SOS', clearButton: 'Supprimer cette copie de ce téléphone',
    note: 'Les brouillons restent dans le navigateur (non chiffrés). Évitez les appareils partagés et n’effacez pas les données du navigateur avant de les importer. Un fichier enregistré n’est pas une facture enregistrée.',
    reopen: 'Rouvrez l’application lorsque vous êtes de nouveau en ligne',
    taskSaved: 'Brouillon de tâche enregistré sur l’appareil.', shoppingSaved: 'Article enregistré : vous choisirez le foyer avant de l’importer.', fileSaved: 'Document conservé sur l’appareil. Importez-le une fois la connexion rétablie.',
    errStorage: 'Le stockage hors ligne n’est pas disponible dans ce navigateur.', errTitle: 'Le texte est trop court.', errFile: 'Fichier non valide : choisissez un PDF ou une photo de 10 Mo maximum.', errGeneric: 'L’enregistrement a échoué. Réessayez.',
    cards: '{n} fiches', home: 'Foyer', legacyCopy: 'Copie précédente (une seule pour tous les foyers)', noCopy: 'Aucune copie sur ce téléphone',
    where: 'Où intervenir', instructions: 'Instructions', contact: 'Contact',
    noSaved: 'Aucune copie SOS enregistrée sur cet appareil.', wrongPhrase: 'Phrase incorrecte.', emptyCopy: 'Cette copie ne contient aucune fiche.',
    openFailed: 'Impossible d’ouvrir la copie : phrase incorrecte ou copie endommagée.', confirmClear: 'Supprimer cette copie SOS de ce téléphone ?', cleared: 'Copie supprimée.'
  },
  de: {
    title: 'Casa in Ordine · Offline',
    intro: 'Du kannst eine Aufgabe vorbereiten oder eine Rechnung als PDF oder Foto als Entwurf auf dem Gerät speichern. Es wird nichts gesendet, bevor du die App mit Internet wieder öffnest und bestätigst.',
    taskLabel: 'Neue persönliche Aufgabe', taskPlaceholder: 'z. B. Gaszählerstand melden', taskButton: 'Aufgabe offline speichern',
    shoppingLabel: 'Einzukaufender Artikel (gemeinsame Liste)', shoppingPlaceholder: 'z. B. Milch', shoppingButton: 'Artikel offline speichern',
    fileLabel: 'Foto / PDF zum späteren Import', fileButton: 'Datei offline aufbewahren',
    sosTitle: 'Haushalts-SOS · private verschlüsselte Kopien',
    sosIntro: 'Wenn du die SOS-Einträge eines Haushalts in der App gespeichert hast, kannst du sie auch ohne Verbindung öffnen. Geschützte Haushalte öffnen sich mit dem Passwortsatz des Haushalts, die anderen mit dem für das Gerät gewählten. Der Passwortsatz wird nie an einen Server gesendet.',
    copyLabel: 'Kopie', phraseLabel: 'Passwortsatz', phrasePlaceholder: 'Mindestens 10 Zeichen', openButton: 'SOS-Einträge öffnen', clearButton: 'Diese Kopie von diesem Telefon löschen',
    note: 'Entwürfe bleiben im Browser (unverschlüsselt). Vermeide gemeinsam genutzte Geräte und lösche die Browserdaten nicht, bevor du sie importierst. Eine gespeicherte Datei ist keine erfasste Rechnung.',
    reopen: 'Öffne die App wieder, sobald du online bist',
    taskSaved: 'Aufgabenentwurf auf dem Gerät gespeichert.', shoppingSaved: 'Artikel gespeichert: Du wählst den Haushalt vor dem Import.', fileSaved: 'Dokument auf dem Gerät aufbewahrt. Importiere es, sobald du wieder online bist.',
    errStorage: 'Offline-Speicher ist in diesem Browser nicht verfügbar.', errTitle: 'Der Text ist zu kurz.', errFile: 'Ungültige Datei: Wähle ein PDF oder ein Foto mit höchstens 10 MB.', errGeneric: 'Speichern fehlgeschlagen. Bitte erneut versuchen.',
    cards: '{n} Einträge', home: 'Haushalt', legacyCopy: 'Frühere Kopie (eine für alle Haushalte)', noCopy: 'Keine Kopie auf diesem Telefon',
    where: 'Wo eingreifen', instructions: 'Anleitung', contact: 'Kontakt',
    noSaved: 'Keine SOS-Kopie auf diesem Gerät gespeichert.', wrongPhrase: 'Falscher Passwortsatz.', emptyCopy: 'Die Kopie enthält keine Einträge.',
    openFailed: 'Die Kopie lässt sich nicht öffnen: falscher Passwortsatz oder beschädigte Kopie.', confirmClear: 'Diese SOS-Kopie von diesem Telefon löschen?', cleared: 'Kopie gelöscht.'
  },
  pt: {
    title: 'Casa in Ordine · Offline',
    intro: 'Pode preparar uma tarefa ou guardar uma fatura em PDF ou foto como rascunho no dispositivo. Nada é enviado antes de voltar a abrir a aplicação com Internet e confirmar.',
    taskLabel: 'Nova tarefa pessoal', taskPlaceholder: 'Ex.: Comunicar a leitura do gás', taskButton: 'Guardar tarefa offline',
    shoppingLabel: 'Artigo a comprar (lista partilhada)', shoppingPlaceholder: 'Ex.: Leite', shoppingButton: 'Guardar artigo offline',
    fileLabel: 'Foto / PDF para importar mais tarde', fileButton: 'Guardar ficheiro offline',
    sosTitle: 'SOS Casa · cópias privadas cifradas',
    sosIntro: 'Se guardou as fichas SOS de uma casa na aplicação, pode abri-las mesmo sem rede. As casas protegidas abrem-se com a frase da casa; as outras, com a frase escolhida para o dispositivo. A frase nunca é enviada para um servidor.',
    copyLabel: 'Cópia', phraseLabel: 'Frase', phrasePlaceholder: 'Pelo menos 10 caracteres', openButton: 'Abrir as fichas SOS', clearButton: 'Eliminar esta cópia deste telemóvel',
    note: 'Os rascunhos ficam no navegador (sem cifra). Evite dispositivos partilhados e não apague os dados do navegador antes de os importar. Um ficheiro guardado não é uma fatura registada.',
    reopen: 'Volte a abrir a aplicação quando estiver online',
    taskSaved: 'Rascunho da tarefa guardado no dispositivo.', shoppingSaved: 'Artigo guardado: vai escolher a casa antes de o importar.', fileSaved: 'Documento guardado no dispositivo. Importe-o quando voltar a ter ligação.',
    errStorage: 'O armazenamento offline não está disponível neste navegador.', errTitle: 'O texto é demasiado curto.', errFile: 'Ficheiro inválido: escolha um PDF ou uma foto com 10 MB no máximo.', errGeneric: 'Não foi possível guardar. Tente novamente.',
    cards: '{n} fichas', home: 'Casa', legacyCopy: 'Cópia anterior (uma para todas as casas)', noCopy: 'Nenhuma cópia neste telemóvel',
    where: 'Onde intervir', instructions: 'Instruções', contact: 'Contacto',
    noSaved: 'Nenhuma cópia SOS guardada neste dispositivo.', wrongPhrase: 'Frase incorreta.', emptyCopy: 'A cópia não contém fichas.',
    openFailed: 'Não foi possível abrir a cópia: frase incorreta ou cópia danificada.', confirmClear: 'Eliminar esta cópia SOS deste telemóvel?', cleared: 'Cópia eliminada.'
  }
};

const pick = value => { const code = String(value || '').toLowerCase().split(/[-_]/)[0]; return OFFLINE_COPY[code] ? code : null; };
// accountId: l'account usato sul dispositivo (deviceAccountId di offline-standalone.js), o null.
export function offlineLanguage(storage = globalThis.localStorage, nav = globalThis.navigator, accountId = null) {
  try {
    if (accountId) { const own = pick(storage.getItem(`${KEY}:user:${accountId}`)); if (own) return own; }
    const shared = pick(storage.getItem(KEY)); if (shared) return shared;
  } catch {}
  return pick(nav?.languages?.[0] || nav?.language) || 'it';
}
export const offlineLocale = lang => LOCALES[lang] || 'it-IT';
export function offlineText(lang, key, params = {}) {
  const text = (OFFLINE_COPY[lang] || OFFLINE_COPY.it)[key] ?? OFFLINE_COPY.it[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (match, name) => params[name] ?? match);
}
// Gli errori di offline-standalone.js e sos-private.js sono in italiano: si mostrano tradotti.
export function offlineError(lang, error) {
  const message = String(error?.message || '');
  if (/memoria offline/i.test(message)) return offlineText(lang, 'errStorage');
  if (/titolo troppo corto/i.test(message)) return offlineText(lang, 'errTitle');
  if (/file non valido/i.test(message)) return offlineText(lang, 'errFile');
  return offlineText(lang, 'errGeneric');
}
// Testi della pagina: data-t = testo, data-t-placeholder = segnaposto del campo.
export function applyOfflineCopy(doc, lang) {
  doc.documentElement.lang = lang;
  doc.title = offlineText(lang, 'title');
  for (const el of doc.querySelectorAll('[data-t]')) el.textContent = offlineText(lang, el.dataset.t);
  for (const el of doc.querySelectorAll('[data-t-placeholder]')) el.placeholder = offlineText(lang, el.dataset.tPlaceholder);
}

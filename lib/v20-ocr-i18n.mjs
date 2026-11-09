// UI-only localization of progress emitted by the local document reader.
// Never send OCR content to a translation service.
const COPY={
it:['Preparazione riconoscimento testo…','Riconoscimento in corso','Lettura del PDF…','Lettura testo PDF, pagina','Scansione PDF, pagina','Analisi della foto o dello screenshot…','Seconda lettura con contrasto migliorato…','Impossibile leggere il documento. Verifica il file e riprova.'],
en:['Preparing text recognition…','Recognizing text','Reading PDF…','Reading PDF text, page','Scanning PDF, page','Analyzing photo or screenshot…','Trying again with enhanced contrast…','Unable to read the document. Check the file and try again.'],
es:['Preparando reconocimiento de texto…','Reconociendo texto','Leyendo PDF…','Leyendo texto del PDF, página','Escaneando PDF, página','Analizando foto o captura…','Reintentando con mayor contraste…','No se pudo leer el documento. Comprueba el archivo e inténtalo de nuevo.'],
fr:['Préparation de la reconnaissance de texte…','Reconnaissance du texte','Lecture du PDF…','Lecture du texte PDF, page','Analyse du PDF, page','Analyse de la photo ou capture…','Nouvelle lecture avec contraste amélioré…','Impossible de lire le document. Vérifiez le fichier et réessayez.'],
de:['Texterkennung wird vorbereitet…','Texterkennung läuft','PDF wird gelesen…','PDF-Text wird gelesen, Seite','PDF wird gescannt, Seite','Foto oder Screenshot wird analysiert…','Erneuter Versuch mit höherem Kontrast…','Dokument konnte nicht gelesen werden. Datei prüfen und erneut versuchen.'],
pt:['A preparar o reconhecimento de texto…','A reconhecer texto','A ler PDF…','A ler texto do PDF, página','A digitalizar PDF, página','A analisar fotografia ou captura de ecrã…','Nova leitura com contraste melhorado…','Não foi possível ler o documento. Verifique o ficheiro e tente novamente.']
};
export function v20OcrProgress(message,language='it'){
 const c=COPY[language?.slice(0,2)]||COPY.it;
 if(typeof message!=='string')return c[7];
 if(message.startsWith('Preparazione riconoscimento testo italiano'))return c[0];
 const percent=message.match(/^Riconoscimento in corso \((\d{1,3})%\)…$/);
 if(percent)return c[1]+' ('+Math.min(100,Number(percent[1]))+'%)…';
 if(message==='Lettura del PDF…')return c[2];
 const page=message.match(/^Lettura testo PDF, pagina (\d+) di (\d+)…$/);
 if(page)return c[3]+' '+page[1]+'/'+page[2]+'…';
 const scan=message.match(/^Scansione PDF, pagina (\d+)…$/);
 if(scan)return c[4]+' '+scan[1]+'…';
 if(message==='Analisi della foto o dello screenshot…')return c[5];
 if(message==='Seconda lettura con contrasto migliorato…')return c[6];
 return c[7]; // No untrusted or untranslated provider messages in the UI.
}
export function v20OcrError(language='it'){return (COPY[language?.slice(0,2)]||COPY.it)[7]}

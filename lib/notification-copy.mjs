// Pure, provider-independent notification copy. The caller must resolve the recipient's
// own language (never the shared home's language) and authorize delivery separately.
import {normalizeLanguage,formatDate} from './i18n.mjs';
const COPY={
 it:['Promemoria scadenza bolletta','La bolletta {name} scade il {date}.','Apri Casa in Ordine per verificare i dettagli.'],
 en:['Bill due reminder','The bill {name} is due on {date}.','Open Casa in Ordine to review the details.'],
 es:['Recordatorio de vencimiento','La factura {name} vence el {date}.','Abre Casa in Ordine para consultar los detalles.'],
 fr:['Rappel d’échéance de facture','La facture {name} arrive à échéance le {date}.','Ouvrez Casa in Ordine pour vérifier les détails.'],
 de:['Erinnerung an Rechnungsfälligkeit','Die Rechnung {name} ist am {date} fällig.','Öffne Casa in Ordine, um die Details zu prüfen.'],
 pt:['Lembrete de vencimento da fatura','A fatura {name} vence em {date}.','Abra Casa in Ordine para consultar os detalhes.']
};
export function billReminderCopy({language='it',name='',dueDate}={}){
 const lang=normalizeLanguage(language),date=formatDate(dueDate,lang);
 if(date==='—')throw new TypeError('Invalid bill due date');
 if(typeof name!=='string')throw new TypeError('Invalid bill name');
 // Bound work before regex normalization and grapheme segmentation; keep the source untouched.
 if(name.length>32768)throw new TypeError('Bill name too long');
 const safeName=String(name).replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200c\u200e-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g,' ').replace(/(?<!\p{Extended_Pictographic})\u200d|\u200d(?!\p{Extended_Pictographic})/gu,' ').replace(/\s+/g,' ').trim();
 // Truncate by grapheme clusters to avoid splitting emoji sequences or combining marks.
 // Intl.Segmenter is available in supported runtimes; code-point fallback is safe for surrogate pairs.
 const segments=typeof Intl.Segmenter==='function'
  ? new Intl.Segmenter('it',{granularity:'grapheme'}).segment(safeName)
  : safeName;
 let limitedName='',count=0;
 for(const part of segments){
  if(count++===160)break;
  limitedName+=typeof part==='string'?part:part.segment;
 }
 limitedName=limitedName.trim();
 if(!limitedName)throw new TypeError('Missing bill name');
 const [subject,line,footer]=COPY[lang];
 return {subject,text:line.replace('{name}',limitedName).replace('{date}',date)+'\n\n'+footer};
}

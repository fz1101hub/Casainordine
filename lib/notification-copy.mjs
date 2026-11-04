// Pure, provider-independent notification copy. The caller must resolve the recipient's
// own language (never the shared home's language) and authorize delivery separately.
import {normalizeLanguage,formatDate} from './i18n.mjs';
const COPY={
 it:['Promemoria scadenza bolletta','La bolletta {name} scade il {date}.','Apri Casa in Ordine per verificare i dettagli.'],
 en:['Bill due reminder','The bill {name} is due on {date}.','Open Casa in Ordine to review the details.'],
 es:['Recordatorio de vencimiento','La factura {name} vence el {date}.','Abre Casa in Ordine para consultar los detalles.'],
 fr:['Rappel d’échéance de facture','La facture {name} arrive à échéance le {date}.','Ouvrez Casa in Ordine pour vérifier les détails.'],
 de:['Erinnerung an Rechnungsfälligkeit','Die Rechnung {name} ist am {date} fällig.','Öffnen Sie Casa in Ordine, um die Details zu prüfen.'],
 pt:['Lembrete de vencimento da fatura','A fatura {name} vence a {date}.','Abra Casa in Ordine para consultar os detalhes.']
};
export function billReminderCopy({language='it',name='',dueDate}={}){
 const lang=normalizeLanguage(language),date=formatDate(dueDate,lang);
 if(date==='—')throw new TypeError('Invalid bill due date');
 const safeName=String(name).trim().slice(0,160);
 if(!safeName)throw new TypeError('Missing bill name');
 const [subject,line,footer]=COPY[lang];
 return {subject,text:line.replace('{name}',safeName).replace('{date}',date)+'\n\n'+footer};
}

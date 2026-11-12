import {normalizeLanguage,localeFor,formatMoney} from './i18n-core.mjs';

// Pure notification text. Resolve the language for each recipient before calling.
const COPY={
 it:{dueTitle:'Scadenza vicina',dueBody:'{name} scade tra 3 giorni. Hai già pagato?',dueToday:'{name} scade oggi. Hai già pagato?',dueTomorrow:'{name} scade domani. Hai già pagato?',dueIn:'{name} scade tra {days} giorni. Hai già pagato?',summaryTitle:'Riepilogo del mese',summaryBody:'{count} scadenze ancora aperte, totale {total}.',summaryOne:'{count} scadenza ancora aperta, totale {total}.'},
 en:{dueTitle:'Bill due soon',dueBody:'{name} is due in 3 days. Have you paid?',dueToday:'{name} is due today. Have you paid?',dueTomorrow:'{name} is due tomorrow. Have you paid?',dueIn:'{name} is due in {days} days. Have you paid?',summaryTitle:'Monthly summary',summaryBody:'{count} upcoming bills remain unpaid, total {total}.',summaryOne:'{count} upcoming bill remains unpaid, total {total}.'},
 es:{dueTitle:'Vencimiento próximo',dueBody:'{name} vence en 3 días. ¿Ya has pagado?',dueToday:'{name} vence hoy. ¿Ya has pagado?',dueTomorrow:'{name} vence mañana. ¿Ya has pagado?',dueIn:'{name} vence en {days} días. ¿Ya has pagado?',summaryTitle:'Resumen mensual',summaryBody:'{count} facturas pendientes, total {total}.',summaryOne:'{count} factura pendiente, total {total}.'},
 fr:{dueTitle:'Échéance proche',dueBody:'{name} arrive à échéance dans 3 jours. Avez-vous payé ?',dueToday:'{name} arrive à échéance aujourd’hui. Avez-vous payé ?',dueTomorrow:'{name} arrive à échéance demain. Avez-vous payé ?',dueIn:'{name} arrive à échéance dans {days} jours. Avez-vous payé ?',summaryTitle:'Récapitulatif mensuel',summaryBody:'{count} factures restent à payer, total {total}.',summaryOne:'{count} facture reste à payer, total {total}.'},
 de:{dueTitle:'Rechnung bald fällig',dueBody:'{name} ist in 3 Tagen fällig. Schon bezahlt?',dueToday:'{name} ist heute fällig. Schon bezahlt?',dueTomorrow:'{name} ist morgen fällig. Schon bezahlt?',dueIn:'{name} ist in {days} Tagen fällig. Schon bezahlt?',summaryTitle:'Monatsübersicht',summaryBody:'{count} Rechnungen sind noch offen, insgesamt {total}.',summaryOne:'{count} Rechnung ist noch offen, insgesamt {total}.'},
 pt:{dueTitle:'Vencimento próximo',dueBody:'{name} vence dentro de 3 dias. Já pagou?',dueToday:'{name} vence hoje. Já pagou?',dueTomorrow:'{name} vence amanhã. Já pagou?',dueIn:'{name} vence dentro de {days} dias. Já pagou?',summaryTitle:'Resumo mensal',summaryBody:'{count} faturas por pagar, total {total}.',summaryOne:'{count} fatura por pagar, total {total}.'}
};
// days: giorni alla scadenza (0 oggi, 1 domani). Senza days resta il testo «tra 3 giorni».
export function billDuePushCopy({language='it',name,days=3}={}){
 if(!Number.isSafeInteger(days)||days<0||days>31)throw new TypeError('Invalid days');
 if(typeof name!=='string')throw new TypeError('Missing bill name');
 const safeName=name
  .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200c\u200e-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g,' ')
  .replace(/(?<!\p{Extended_Pictographic})\u200d|\u200d(?!\p{Extended_Pictographic})/gu,' ')
  .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g,' ')
  .replace(/\s+/g,' ').trim();
 const clusters=typeof Intl.Segmenter==='function'
  ? Array.from(new Intl.Segmenter('it',{granularity:'grapheme'}).segment(safeName),part=>part.segment)
  : Array.from(safeName);
 const value=clusters.slice(0,160).join('').trim();
 if(!value || !/[\p{L}\p{N}\p{Extended_Pictographic}]/u.test(value))throw new TypeError('Missing bill name');
 const c=COPY[normalizeLanguage(language)];
 const body=days===0?c.dueToday:days===1?c.dueTomorrow:days===3?c.dueBody:c.dueIn.replace('{days}',String(days));
 return {title:'Casa in Ordine · '+c.dueTitle,body:body.replace('{name}',value)};
}
export function billSummaryPushCopy({language='it',count,total}={}){
 if(!Number.isSafeInteger(count)||count<1)throw new TypeError('Invalid bill count');
 if(typeof total!=='number'||!Number.isFinite(total)||total<0)throw new TypeError('Invalid total');
 const lang=normalizeLanguage(language),c=COPY[lang];
 return {title:'Casa in Ordine · '+c.summaryTitle,body:(count===1?c.summaryOne:c.summaryBody).replace('{count}',new Intl.NumberFormat(localeFor(lang),{maximumFractionDigits:0}).format(count)).replace('{total}',formatMoney(total,lang))};
}

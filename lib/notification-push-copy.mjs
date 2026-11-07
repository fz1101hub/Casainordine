import {normalizeLanguage,localeFor,formatMoney} from './i18n.mjs';

// Pure notification text. Resolve the language for each recipient before calling.
const COPY={
 it:{dueTitle:'Scadenza vicina',dueBody:'{name} scade tra 3 giorni. Hai già pagato?',summaryTitle:'Riepilogo del mese',summaryBody:'{count} scadenze ancora aperte, totale {total}.',summaryOne:'{count} scadenza ancora aperta, totale {total}.'},
 en:{dueTitle:'Bill due soon',dueBody:'{name} is due in 3 days. Have you paid?',summaryTitle:'Monthly summary',summaryBody:'{count} upcoming bills remain unpaid, total {total}.',summaryOne:'{count} upcoming bill remains unpaid, total {total}.'},
 es:{dueTitle:'Vencimiento próximo',dueBody:'{name} vence en 3 días. ¿Ya has pagado?',summaryTitle:'Resumen mensual',summaryBody:'{count} facturas pendientes, total {total}.',summaryOne:'{count} factura pendiente, total {total}.'},
 fr:{dueTitle:'Échéance proche',dueBody:'{name} arrive à échéance dans 3 jours. Avez-vous payé ?',summaryTitle:'Récapitulatif mensuel',summaryBody:'{count} factures restent à payer, total {total}.',summaryOne:'{count} facture reste à payer, total {total}.'},
 de:{dueTitle:'Rechnung bald fällig',dueBody:'{name} ist in 3 Tagen fällig. Schon bezahlt?',summaryTitle:'Monatsübersicht',summaryBody:'{count} Rechnungen sind noch offen, insgesamt {total}.',summaryOne:'{count} Rechnung ist noch offen, insgesamt {total}.'},
 pt:{dueTitle:'Vencimento próximo',dueBody:'{name} vence dentro de 3 dias. Já pagou?',summaryTitle:'Resumo mensal',summaryBody:'{count} faturas por pagar, total {total}.',summaryOne:'{count} fatura por pagar, total {total}.'}
};
export function billDuePushCopy({language='it',name}={}){
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
 return {title:'Casa in Ordine · '+c.dueTitle,body:c.dueBody.replace('{name}',value)};
}
export function billSummaryPushCopy({language='it',count,total}={}){
 if(!Number.isSafeInteger(count)||count<1)throw new TypeError('Invalid bill count');
 if(typeof total!=='number'||!Number.isFinite(total)||total<0)throw new TypeError('Invalid total');
 const lang=normalizeLanguage(language),c=COPY[lang];
 return {title:'Casa in Ordine · '+c.summaryTitle,body:(count===1?c.summaryOne:c.summaryBody).replace('{count}',new Intl.NumberFormat(localeFor(lang),{maximumFractionDigits:0}).format(count)).replace('{total}',formatMoney(total,lang))};
}

import {normalizeLanguage,formatMoney} from './i18n.mjs';

// Pure notification text. Resolve the language for each recipient before calling.
const COPY={
 it:{dueTitle:'Scadenza vicina',dueBody:'{name} scade tra 3 giorni. Hai già pagato?',summaryTitle:'Riepilogo del mese',summaryBody:'{count} scadenze ancora aperte, totale {total}.'},
 en:{dueTitle:'Bill due soon',dueBody:'{name} is due in 3 days. Have you paid?',summaryTitle:'Monthly summary',summaryBody:'{count} upcoming bills remain unpaid, total {total}.'},
 es:{dueTitle:'Vencimiento próximo',dueBody:'{name} vence en 3 días. ¿Ya has pagado?',summaryTitle:'Resumen mensual',summaryBody:'{count} facturas pendientes, total {total}.'},
 fr:{dueTitle:'Échéance proche',dueBody:'{name} arrive à échéance dans 3 jours. Avez-vous payé ?',summaryTitle:'Récapitulatif mensuel',summaryBody:'{count} factures restent à payer, total {total}.'},
 de:{dueTitle:'Rechnung bald fällig',dueBody:'{name} ist in 3 Tagen fällig. Schon bezahlt?',summaryTitle:'Monatsübersicht',summaryBody:'{count} Rechnungen sind noch offen, insgesamt {total}.'},
 pt:{dueTitle:'Vencimento próximo',dueBody:'{name} vence dentro de 3 dias. Já pagou?',summaryTitle:'Resumo mensal',summaryBody:'{count} faturas por pagar, total {total}.'}
};
export function billDuePushCopy({language='it',name}={}){
 const value=String(name??'').trim().slice(0,160);
 if(!value)throw new TypeError('Missing bill name');
 const c=COPY[normalizeLanguage(language)];
 return {title:'Casa in Ordine · '+c.dueTitle,body:c.dueBody.replace('{name}',value)};
}
export function billSummaryPushCopy({language='it',count,total}={}){
 if(!Number.isSafeInteger(count)||count<1)throw new TypeError('Invalid bill count');
 if(typeof total!=='number'||!Number.isFinite(total)||total<0)throw new TypeError('Invalid total');
 const lang=normalizeLanguage(language),c=COPY[lang];
 return {title:'Casa in Ordine · '+c.summaryTitle,body:c.summaryBody.replace('{count}',String(count)).replace('{total}',formatMoney(total,lang))};
}

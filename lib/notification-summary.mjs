import {normalizeLanguage,formatDate,formatMoney} from './i18n-core.mjs';

const WORDS={
 it:['Riepilogo bollette del mese','Scadenze da oggi a fine mese','bollette ancora da pagare per un totale di','Apri Casa in Ordine'],
 en:['Monthly bill summary','Bills due before the end of the month','unpaid bills totalling','Open Casa in Ordine'],
 es:['Resumen mensual de facturas','Facturas pendientes hasta fin de mes','facturas pendientes por un total de','Abrir Casa in Ordine'],
 fr:['Récapitulatif mensuel des factures','Factures à régler avant la fin du mois','factures impayées pour un total de','Ouvrir Casa in Ordine'],
 de:['Monatliche Rechnungsübersicht','Fällige Rechnungen bis Monatsende','offene Rechnungen im Gesamtwert von','Casa in Ordine öffnen'],
 pt:['Resumo mensal das faturas','Faturas a pagar até ao fim do mês','faturas por pagar num total de','Abrir Casa in Ordine']
};
export function billSummaryCopy({language='it',today,bills=[]}={}){
 const lang=normalizeLanguage(language);
 if(formatDate(today,lang)==='—'||!/^\d{4}-\d{2}-\d{2}$/.test(today))throw new TypeError('Invalid summary date');
 if(!Array.isArray(bills)||!bills.length)throw new TypeError('Missing summary bills');
 const total=bills.reduce((sum,b)=>{
  const raw=b.amount;
  if(typeof raw!=='number' && (typeof raw!=='string'||!raw.trim()))throw new TypeError('Invalid bill amount');
  const amount=Number(raw);
  if(!Number.isFinite(amount)||amount<0)throw new TypeError('Invalid bill amount');
  if(formatDate(b.due_date,lang)==='—'||!/^\d{4}-\d{2}-\d{2}$/.test(b.due_date))throw new TypeError('Invalid bill date');
  const next=sum+amount;
  if(!Number.isFinite(next))throw new TypeError('Invalid summary total');
  return next;
 },0);
 const [subject,heading,countLabel,openLabel]=WORDS[lang];
 return {subject:subject+' ('+today.slice(0,7)+')',heading,description:`${bills.length} ${countLabel} ${formatMoney(total,lang)}.`,openLabel,
  rows:bills.map(b=>({title:String(b.title||''),supplier:String(b.supplier||''),date:formatDate(b.due_date,lang),amount:formatMoney(Number(b.amount),lang)}))};
}

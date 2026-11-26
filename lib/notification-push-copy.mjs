// Pure notification text. Resolve the language for each recipient before calling.
// Testi nel dizionario unico (chiavi «server.push.*»).
import {translate,normalizeLanguage,localeFor,formatMoney} from './i18n.mjs';
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
  ? Array.from(new Intl.Segmenter(normalizeLanguage(language),{granularity:'grapheme'}).segment(safeName),part=>part.segment)
  : Array.from(safeName);
 const value=clusters.slice(0,160).join('').trim();
 if(!value || !/[\p{L}\p{N}\p{Extended_Pictographic}]/u.test(value))throw new TypeError('Missing bill name');
 const lang=normalizeLanguage(language),key=days===0?'dueToday':days===1?'dueTomorrow':days===3?'dueBody':'dueIn';
 return {title:'Casa in Ordine · '+translate(lang,'server.push.dueTitle'),body:translate(lang,'server.push.'+key,{days,name:value})};
}
// extras: altre scadenze del riepilogo (rate, documenti, salute, animali); senza bollette basta quelle.
export function billSummaryPushCopy({language='it',count,total,extras=0}={}){
 if(!Number.isSafeInteger(extras)||extras<0)throw new TypeError('Invalid extras count');
 if(!Number.isSafeInteger(count)||count<0||(count<1&&extras<1))throw new TypeError('Invalid bill count');
 if(typeof total!=='number'||!Number.isFinite(total)||total<0)throw new TypeError('Invalid total');
 const lang=normalizeLanguage(language);
 const number=n=>new Intl.NumberFormat(localeFor(lang),{maximumFractionDigits:0}).format(n);
 const title='Casa in Ordine · '+translate(lang,'server.push.summaryTitle');
 if(!count)return {title,body:translate(lang,'server.push.summaryOnlyExtras',{count:extras})};
 const body=translate(lang,count===1?'server.push.summaryOne':'server.push.summaryBody',{count:number(count),total:formatMoney(total,lang)});
 return {title,body:extras?`${body} ${translate(lang,'server.push.summaryAlso',{count:extras})}`:body};
}

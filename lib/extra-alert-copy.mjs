// Recipient-specific copy; identifiers and original source records remain unchanged.
// Testi nel dizionario unico (chiavi «server.extra.*»).
import {translate,normalizeLanguage,formatDate,formatMoney} from './i18n.mjs';
const clean=value=>String(value??'').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g,' ').replace(/\s+/g,' ').trim().slice(0,160).trim();
export function extraAlertCopy(event,language='it'){
 const lang=normalizeLanguage(language),kind=event?.kind;
 if(!['contract','meter','maintenance','warranty'].includes(kind))throw new TypeError('Invalid alert kind');
 const source=event.source||{};
 const name=clean(kind==='contract'?source.supplier:kind==='meter'?source.meter_name:source.name);
 if(!name)throw new TypeError('Missing alert name');
 const dateValue=kind==='contract'?source.renewal_on:kind==='meter'?source.next_due_on:kind==='maintenance'?source.next_service_on:source.warranty_until;
 if(typeof dateValue!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(dateValue))throw new TypeError('Invalid alert date');
 const date=formatDate(dateValue,lang);
 if(date==='—')throw new TypeError('Invalid alert date');
 const service=kind==='contract'?clean(source.service):'';
 return {title:translate(lang,'server.extra.'+kind)+': '+name,body:translate(lang,'server.extra.'+kind+'Body',{date,service:service||name})};
}

// Avvisi delle automazioni personalizzate (lib/automations.mjs): source viene da simulateAutomation.
export function automationAlertCopy(kind,source,language='it'){
 const lang=normalizeLanguage(language),name=clean(source?.name);
 if(!name)throw new TypeError('Missing alert name');
 const date=typeof source.date==='string'&&/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(source.date)?formatDate(source.date,lang):'—';
 if(date==='—')throw new TypeError('Invalid alert date');
 if(kind==='bill_amount')return {title:translate(lang,'server.automation.amount',{name}),body:translate(lang,'server.automation.amountBody',{amount:formatMoney(source.amount,lang),date,threshold:formatMoney(source.threshold,lang)})};
 if(kind==='contract_renewal')return {title:translate(lang,'server.automation.renewal',{name}),body:translate(lang,'server.automation.renewalBody',{service:clean(source.service)||name,date})};
 if(kind==='recurring')return {title:translate(lang,'server.automation.recurring',{name}),body:translate(lang,'server.automation.recurringBody',{date})};
 throw new TypeError('Invalid automation kind');
}

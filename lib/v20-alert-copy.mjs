// Testi degli avvisi automatici (cron, solo server) nella lingua di chi li riceve: dizionario unico,
// chiavi «server.alert.*». Identificativi e dati di origine non cambiano.
import {translate,normalizeLanguage,formatDate} from './i18n.mjs';

const KINDS=['missing_bill','fraud','mail_sync','move','savings'];
const STATUSES=['reconnect','error','never','stale'];
const clean=value=>String(value??'').replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁩﻿]/g,' ').replace(/\s+/g,' ').trim().slice(0,160).trim();
export function v20AlertCopy(event,language='it'){
 const lang=normalizeLanguage(language),kind=event?.kind;
 if(!KINDS.includes(kind))throw new TypeError('Invalid alert kind');
 const source=event.source||{};
 const name=clean(kind==='missing_bill'||kind==='fraud'?source.supplier:kind==='move'?source.title:source.label);
 let date='';
 if(['missing_bill','move','savings'].includes(kind)){
  const iso=kind==='missing_bill'?source.expected_on:kind==='move'?source.move_on:source.deadline;
  date=formatDate(iso,lang);
  if(date==='—')throw new TypeError('Invalid alert date');
 }
 if(kind!=='mail_sync'&&!name)throw new TypeError('Missing alert name');
 const status=source.mail_status;
 if(kind==='mail_sync'&&!STATUSES.includes(status))throw new TypeError('Invalid mailbox status');
 const title=translate(lang,`server.alert.${kind}.title`);
 return {title:kind==='missing_bill'?title+': '+name:title,
  body:translate(lang,`server.alert.${kind}.body`,{date,name,status:kind==='mail_sync'?translate(lang,'v20.mail.'+status):''})};
}

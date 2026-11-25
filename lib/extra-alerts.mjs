import {extraAlertCopy} from './extra-alert-copy.mjs';
import {addDaysISO} from './dates.mjs';
import {readIn,readAll,upsertMany,byKey,groupBy,mapLimit,PUSH_PARALLEL} from './batch.mjs';
// Gli eventi portano solo dati: titolo e testo li scrive extraAlertCopy nella lingua di chi li riceve.
export function pendingContractEvents(contract,today){
 return contract?.renewal_on===addDaysISO(today,Number(contract.alert_days)||30)?[{kind:'contract',reference_id:contract.id,event_date:today}]:[];
}
export function pendingMeterEvents(meter,today){
 return meter?.next_due_on===addDaysISO(today,3)?[{kind:'meter',reference_id:meter.id,event_date:today}]:[];
}
// Prossima autolettura: dopo `months` mesi, nel giorno scelto (`dueDay`, meter_reminders.due_day
// dalla v55), o nell'ultimo giorno del mese se quel mese è più corto. Prima il giorno si prendeva
// dalla data precedente: 31 gennaio → 28 febbraio → 28 marzo… e il 31 non tornava più.
export function advanceMeterDate(iso,months,now,dueDay){
 if(!Number.isInteger(months)||months<=0)return iso;
 const [year,month,day]=iso.split('-').map(Number);
 const anchor=Number.isInteger(Number(dueDay))&&dueDay>=1&&dueDay<=31?Number(dueDay):day;
 let current=iso;
 for(let step=1;current<now&&step<=48;step++){
  const d=new Date(Date.UTC(year,month-1+months*step,1,12));
  const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0,12)).getUTCDate();
  current=`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(Math.min(last,anchor)).padStart(2,'0')}`;
 }
 return current;
}
export function pendingMaintenanceEvents(asset,today){
 const rows=[];
 if(asset?.next_service_on===addDaysISO(today,3))rows.push({kind:'maintenance',reference_id:asset.id,event_date:today});
 if(asset?.warranty_until===addDaysISO(today,30))rows.push({kind:'warranty',reference_id:asset.id,event_date:today});
 return rows;
}
import { quietTimeRome, pushKindAllowed, pushAllowed } from './push-preferences.mjs';
import { deferKey, quietOnly, deferPushes } from './push-deferred.mjs';
export { quietTimeRome, pushKindAllowed, pushAllowed };
export async function processExtraAlerts(admin,today,counts,{sendPush,configuredPush,now}={}){
 // Si leggono solo le voci che possono dare un avviso oggi (prima: le prime 1000 di ogni tabella,
 // con il rischio di saltare le altre). Il preavviso dei contratti va da 1 a 365 giorni.
 const in3=addDaysISO(today,3),in30=addDaysISO(today,30);
 let contracts,assets,meterSchedules;
 try{contracts=await readAll(admin,'home_contracts','id,user_id,home_id,supplier,service,renewal_on,alert_days',q=>q.gte('renewal_on',addDaysISO(today,1)).lte('renewal_on',addDaysISO(today,365)));}
 catch(e){counts.errors.push(`Contratti: ${e.message}`);return;}
 try{assets=await readAll(admin,'maintenance_assets','id,user_id,home_id,name,warranty_until,next_service_on',q=>q.or(`next_service_on.eq.${in3},warranty_until.eq.${in30}`));}
 catch(e){counts.errors.push(`Manutenzioni: ${e.message}`);return;}
 const meterColumns='id,user_id,home_id,meter_name,next_due_on,repeat_months',meterFilter=q=>q.or(`next_due_on.eq.${in3},next_due_on.lt.${today}`);
 // due_day arriva con la v55: senza la migrazione si legge come prima (il giorno viene dalla data).
 try{meterSchedules=await readAll(admin,'meter_reminders',meterColumns+',due_day',meterFilter).catch(e=>{if(e?.code==='42703')return readAll(admin,'meter_reminders',meterColumns,meterFilter);throw e;});}
 catch(e){counts.errors.push(`Autoletture: ${e.message}`);return;}
 const eventItems=[...meterSchedules.flatMap(m=>pendingMeterEvents(m,today).map(event=>({item:m,event}))),...contracts.flatMap(c=>pendingContractEvents(c,today).map(event=>({item:c,event}))),...assets.flatMap(a=>pendingMaintenanceEvents(a,today).map(event=>({item:a,event})))];
 // Move expired recurring meter notices forward without generating past notifications.
 for(const meter of meterSchedules){
  if(meter.repeat_months>0&&meter.next_due_on<today){
   const next=advanceMeterDate(meter.next_due_on,meter.repeat_months,today,meter.due_day);
   if(next!==meter.next_due_on){const {error}=await admin.from('meter_reminders').update({next_due_on:next}).eq('id',meter.id);if(error)counts.errors.push(`Autolettura ${meter.id}: ${error.message}`);}
  }
 }
 await deliverAlerts(admin,eventItems.map(({item,event})=>({item,event,copy:language=>extraAlertCopy({kind:event.kind,source:item},language)})),counts,{sendPush,configuredPush,now,today});
}

const alertKey=row=>`${row.user_id}|${row.kind}|${row.reference_id}|${row.event_date}`;

// Consegna comune degli avvisi, a blocchi: destinatari (chi ha creato la voce, oppure i membri
// della casa), testo nella lingua di ciascuno, un solo avviso per voce e giorno (user_alerts è
// unico su utente, tipo, voce e data) e notifica push solo per gli avvisi appena creati.
// Membri, lingue, preferenze e dispositivi si leggono una volta per tutti; gli avvisi si scrivono
// in blocco. Restano una richiesta per ogni notifica inviata.
// entries: [{item:{user_id,home_id}, event:{kind,reference_id,event_date,...}, copy:lingua=>{title,body}, recipients?:[id]}]
// counters: nomi dei contatori in counts (avvisi creati, push inviate); label: per gli errori.
// ignoreQuiet: promemoria chiesti per un'ora precisa (terapie): partono anche nell'orario silenzioso.
// copy(lingua, persona): il testo può dipendere anche da chi lo riceve (es. dettagli nelle notifiche).
export async function deliverAlerts(admin,entries,counts,{sendPush,configuredPush,label='avviso',created='extra_alerts_created',pushed='extra_push_sent',now=new Date(),today=entries[0]?.event?.event_date,ignoreQuiet=false}={}){
 if(!entries?.length)return;
 const fail=(what,e)=>counts.errors.push(`${what}: ${String(e?.message||e).slice(0,110)}`);
 let members;
 try{members=groupBy(await readIn(admin,'home_members','home_id,user_id','home_id',entries.map(e=>e.item?.home_id)),'home_id');}
 catch(e){fail('Membri casa',e);return;}
 const targets=entries.map(entry=>{
  const chosen=entry.recipients;let users=chosen||[entry.item.user_id];
  if(entry.item.home_id){
   const list=(members.get(entry.item.home_id)||[]).map(m=>m.user_id);
   // Senza destinatari scelti avvisa tutta la casa; con destinatari scelti, solo chi è ancora membro.
   users=chosen?chosen.filter(id=>list.includes(id)):list;
  }
  return {...entry,users:[...new Set(users.filter(Boolean))]};
 });
 let languages;
 try{languages=byKey(await readIn(admin,'user_language_preferences','user_id,language','user_id',targets.flatMap(t=>t.users)),'user_id');}
 catch(e){fail(`Lingua ${label}`,e);return;} // meglio nessun avviso che uno nella lingua sbagliata
 const rows=[],texts=new Map();
 for(const t of targets)for(const userId of t.users){
  let translated;
  try{translated=t.copy(languages.get(userId)?.language||'it',userId);}
  catch(e){fail(`Testo ${label} ${t.event.kind}`,e);continue;}
  const row={...t.event,...translated,user_id:userId},key=alertKey(row);
  if(texts.has(key))continue;
  texts.set(key,translated);rows.push(row);
 }
 let inserted;
 try{inserted=await upsertMany(admin,'user_alerts',rows,{onConflict:'user_id,kind,reference_id,event_date',ignoreDuplicates:true},'user_id,kind,reference_id,event_date');}
 catch(e){fail(`Avvisi ${label}`,e);return;}
 counts[created]=(counts[created]||0)+inserted.length;
 // Push solo per gli avvisi nuovi: mai due volte per lo stesso avviso.
 if(!inserted.length||!configuredPush?.())return;
 const users=[...new Set(inserted.map(r=>r.user_id))];
 let preferences,devices;
 try{
  preferences=byKey(await readIn(admin,'user_alert_preferences','*','user_id',users),'user_id');
  devices=groupBy(await readIn(admin,'push_subscriptions','id,user_id,endpoint,p256dh,auth_secret','user_id',users),'user_id');
 }catch(e){fail(`Push ${label}`,e);return;}
 const gone=new Set(),later=[];
 // Fino a PUSH_PARALLEL avvisi alla volta (in fila, con centinaia di persone, si superava il minuto di Vercel).
 await mapLimit(inserted,PUSH_PARALLEL,async row=>{
  const pref=preferences.get(row.user_id)||{};
  const translated=texts.get(alertKey(row));
  if(!translated)return;
  if(!(ignoreQuiet?pushKindAllowed(pref,row.kind):pushAllowed(pref,row.kind,now))){
   // Orario silenzioso: la push parte dopo (lib/push-deferred.mjs), non va persa.
   if(quietOnly(pref,row.kind,now)&&(devices.get(row.user_id)||[]).length)later.push({user_id:row.user_id,dedupe_key:deferKey.alert(row),kind:row.kind,payload:translated});
   return;
  }
  for(const device of (devices.get(row.user_id)||[]).slice(0,10)){
   if(gone.has(device.id))continue;
   try{await sendPush(device,translated);counts[pushed]=(counts[pushed]||0)+1;}
   catch(e){
    if([404,410].includes(e.statusCode)){gone.add(device.id);await admin.from('push_subscriptions').delete().eq('id',device.id).eq('user_id',row.user_id);}
    else fail(`Push ${label} ${row.kind}`,e);
   }
  }
 });
 try{counts.deferred_push=(counts.deferred_push||0)+await deferPushes(admin,later,today);}
 catch(e){fail(`Push rinviate ${label}`,e);}
}

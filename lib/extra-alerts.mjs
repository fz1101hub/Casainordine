import {extraAlertCopy} from './extra-alert-copy.mjs';
import {addDaysISO} from './dates.mjs';
export function pendingContractEvents(contract,today){
 return contract?.renewal_on===addDaysISO(today,Number(contract.alert_days)||30)?[{kind:'contract',reference_id:contract.id,title:`Contratto: ${contract.supplier}`,body:`${contract.service} scade o si rinnova il ${contract.renewal_on}. Verifica le condizioni.`,event_date:today}]:[];
}
export function pendingMeterEvents(meter,today){
 return meter?.next_due_on===addDaysISO(today,3)?[{kind:'meter',reference_id:meter.id,title:`Autolettura: ${meter.meter_name}`,body:`Comunicare l'autolettura entro il ${meter.next_due_on}.`,event_date:today}]:[];
}
export function advanceMeterDate(iso,months,now){
 if(!Number.isInteger(months)||months<=0)return iso;
 let current=iso;let count=0;while(current<now&&count<48){
  const [year,month,day]=current.split('-').map(Number);const d=new Date(Date.UTC(year,month-1+months,1,12));
  const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0,12)).getUTCDate();
  current=`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(Math.min(last,day)).padStart(2,'0')}`;count++;
 }return current;
}
export function pendingMaintenanceEvents(asset,today){
 const rows=[];
 if(asset?.next_service_on===addDaysISO(today,3))rows.push({kind:'maintenance',reference_id:asset.id,title:`Manutenzione: ${asset.name}`,body:`Intervento previsto il ${asset.next_service_on}.`,event_date:today});
 if(asset?.warranty_until===addDaysISO(today,30))rows.push({kind:'warranty',reference_id:asset.id,title:`Garanzia: ${asset.name}`,body:`Scade il ${asset.warranty_until}. Controlla la copertura.`,event_date:today});
 return rows;
}
export function quietTimeRome(preferences,instant=new Date()){
 const from=preferences?.quiet_from?.slice(0,5),to=preferences?.quiet_until?.slice(0,5);
 if(!from||!to||from===to)return false;
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Rome',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(instant);
 const time=parts.find(p=>p.type==='hour').value+':'+parts.find(p=>p.type==='minute').value;
 return from<to?time>=from&&time<to:time>=from||time<to;
}
export function pushAllowed(pref,kind,instant){
 const property={contract:'push_contracts',maintenance:'push_maintenance',warranty:'push_maintenance',meter:'push_maintenance',bill:'push_bills',digest:'push_digest',missing_bill:'push_monitor',mail_sync:'push_monitor',fraud:'push_monitor',move:'push_digest',savings:'push_digest'}[kind];
 return Boolean(property)&&pref?.[property]!==false&&!quietTimeRome(pref,instant);
}
export async function processExtraAlerts(admin,today,counts,{sendPush,configuredPush}={}){
 const {data:contracts,error:contractError}=await admin.from('home_contracts').select('id,user_id,home_id,supplier,service,renewal_on,alert_days').limit(1000);
 if(contractError){counts.errors.push(`Contratti: ${contractError.message}`);return;}
 const {data:assets,error:assetError}=await admin.from('maintenance_assets').select('id,user_id,home_id,name,warranty_until,next_service_on').limit(1000);
 if(assetError){counts.errors.push(`Manutenzioni: ${assetError.message}`);return;}
 const {data:meterSchedules,error:meterError}=await admin.from('meter_reminders').select('id,user_id,home_id,meter_name,next_due_on,repeat_months').limit(1000);
 if(meterError){counts.errors.push(`Autoletture: ${meterError.message}`);return;}
 const eventItems=[...(meterSchedules||[]).flatMap(m=>pendingMeterEvents(m,today).map(event=>({item:m,event}))),...(contracts||[]).flatMap(c=>pendingContractEvents(c,today).map(event=>({item:c,event}))),...(assets||[]).flatMap(a=>pendingMaintenanceEvents(a,today).map(event=>({item:a,event})))];
 // Move expired recurring meter notices forward without generating past notifications.
 for(const meter of meterSchedules||[]){
  if(meter.repeat_months>0&&meter.next_due_on<today){
   const next=advanceMeterDate(meter.next_due_on,meter.repeat_months,today);
   if(next!==meter.next_due_on){const {error}=await admin.from('meter_reminders').update({next_due_on:next}).eq('id',meter.id);if(error)counts.errors.push(`Autolettura ${meter.id}: ${error.message}`);}
  }
 }
 const houseMembers=new Map(),preferences=new Map(),devicesCache=new Map(),languageCache=new Map();
 for(const {item,event} of eventItems){
  let recipients=[item.user_id];
  if(item.home_id){
   if(!houseMembers.has(item.home_id)){
    const {data,error}=await admin.from('home_members').select('user_id').eq('home_id',item.home_id).limit(100);
    if(error){counts.errors.push(`Membri casa: ${error.message}`);continue;}houseMembers.set(item.home_id,(data||[]).map(m=>m.user_id));
   }
   recipients=houseMembers.get(item.home_id);
  }
  for(const userId of new Set(recipients)){
   if(!languageCache.has(userId)){
    const {data,error}=await admin.from('user_language_preferences').select('language').eq('user_id',userId).maybeSingle();
    if(error){counts.errors.push(`Lingua avviso ${userId}: ${error.message}`);continue;}
    languageCache.set(userId,data?.language||'it');
   }
   let translated;
   try{translated=extraAlertCopy({kind:event.kind,source:item},languageCache.get(userId));}
   catch(e){counts.errors.push(`Testo avviso ${event.kind}: ${String(e.message).slice(0,100)}`);continue;}
   const localizedEvent={...event,...translated};
   const {data:inserted,error}=await admin.from('user_alerts').upsert({...localizedEvent,user_id:userId},{onConflict:'user_id,kind,reference_id,event_date',ignoreDuplicates:true}).select('id').maybeSingle();
   if(error){counts.errors.push(`Avviso ${event.kind}: ${error.message}`);continue;}
   if(!inserted)continue; // never push more than once for the same notification
   counts.extra_alerts_created=(counts.extra_alerts_created||0)+1;
   if(!configuredPush?.())continue;
   if(!preferences.has(userId)){
    const {data,error:prefError}=await admin.from('user_alert_preferences').select('*').eq('user_id',userId).maybeSingle();if(prefError){counts.errors.push('Preferenze push: '+prefError.message);continue;}preferences.set(userId,data||{});
   }
   if(!pushAllowed(preferences.get(userId),event.kind))continue;
   if(!devicesCache.has(userId)){
    const {data,error:deviceError}=await admin.from('push_subscriptions').select('id,endpoint,p256dh,auth_secret').eq('user_id',userId).limit(10);if(deviceError){counts.errors.push('Dispositivi push: '+deviceError.message);continue;}devicesCache.set(userId,data||[]);
   }
   for(const device of devicesCache.get(userId)){
    try{await sendPush(device,translated);counts.extra_push_sent=(counts.extra_push_sent||0)+1;}
    catch(e){
     if([404,410].includes(e.statusCode))await admin.from('push_subscriptions').delete().eq('id',device.id).eq('user_id',userId);
     else counts.errors.push(`Push avviso ${event.kind}: ${String(e.message).slice(0,110)}`);
    }
   }
  }
 }
}

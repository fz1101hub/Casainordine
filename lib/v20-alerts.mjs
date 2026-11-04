import {v20AlertCopy} from './v20-alert-copy.mjs';
import {missingBillCandidates,mailHealth,billFraudSignals} from './v20-core.mjs';
import {pushAllowed} from './extra-alerts.mjs';
/** Server cron checks with daily deduplication. This module never marks bills paid. */
export async function processV20Alerts(admin,today,counts,{sendPush,configuredPush}={}){
 const {data:utilities,error:utilityErr}=await admin.from('utilities').select('id,user_id,home_id,supplier,category,frequency,active').eq('active',true).neq('frequency','none').limit(1000);
 if(utilityErr){counts.errors.push('Monitor utenze: '+utilityErr.message);return;}
 const {data:bills,error:billErr}=await admin.from('bills').select('id,utility_id,user_id,home_id,supplier,category,due_date,source,is_estimate,amount,created_at').order('due_date',{ascending:false}).limit(3000);
 if(billErr){counts.errors.push('Monitor bollette: '+billErr.message);return;}
 const {data:connections,error:mailErr}=await admin.from('mail_connections').select('id,user_id,status,last_sync_at').limit(1000);
 if(mailErr)counts.errors.push('Monitor email: '+mailErr.message);
 const {data:plans,error:planErr}=await admin.from('home_move_plans').select('id,user_id,home_id,title,move_on').limit(1000);
 if(planErr)counts.errors.push('Piani trasloco: '+planErr.message);
 const {data:goals,error:goalsErr}=await admin.from('home_savings_goals').select('id,user_id,home_id,label,deadline,target_amount,current_amount').limit(1000);
 if(goalsErr)counts.errors.push('Risparmio: '+goalsErr.message);
 const candidates=missingBillCandidates(utilities||[],bills||[],today).map(m=>({user_id:m.user_id,home_id:m.home_id,kind:'missing_bill',reference_id:m.utility_id,event_date:m.expected_on,title:'Bolletta da verificare: '+m.supplier,body:`Non risulta ricevuta la bolletta attesa intorno al ${m.expected_on}. Controlla la casella e il fornitore.`,source:m}));
 // Amount-only anomaly detection runs even without a manual security inspection.
 // No conclusion of fraud is drawn; no payment is changed.
 const recentCutoff=new Date(Date.parse(today+'T12:00:00Z')-14*86400000).toISOString().slice(0,10);
 for(const b of bills||[]){
  if(b.is_estimate||b.source==='recurring'||!b.created_at||b.created_at.slice(0,10)<recentCutoff)continue;
  const history=(bills||[]).filter(old=>old.id!==b.id&&old.home_id===b.home_id&&
   (b.home_id!==null||old.user_id===b.user_id)&&old.due_date<b.due_date);
  const result=billFraudSignals(b,history);
  if(result.flags.some(f=>f.id==='high_amount'))candidates.push({user_id:b.user_id,home_id:b.home_id||null,
   kind:'fraud',reference_id:b.id,event_date:b.due_date,title:'Importo insolito: verifica la bolletta',body:`${b.supplier}: l'importo supera nettamente gli importi precedenti. Non indica necessariamente una frode.`,source:b});
 }
 for(const c of connections||[]){const h=mailHealth(c,new Date(today+'T22:00:00Z'));if(h.level==='ok')continue;
  candidates.push({user_id:c.user_id,home_id:null,kind:'mail_sync',reference_id:c.id,event_date:today,title:'Controlla il collegamento email',body:h.message,source:{mail_status:c.status==='reconnect'?'reconnect':c.status==='error'?'error':!c.last_sync_at?'never':'stale'}});}
 for(const p of plans||[])if(p.move_on>=today&&p.move_on<=new Date(Date.parse(today+'T12:00:00Z')+7*86400000).toISOString().slice(0,10))
  candidates.push({user_id:p.user_id,home_id:p.home_id||null,kind:'move',reference_id:p.id,event_date:today,title:'Trasloco in programma',body:`${p.title}: previsto il ${p.move_on}. Controlla la checklist.`,source:p});
 for(const g of goals||[])if(g.deadline>=today&&g.deadline<=new Date(Date.parse(today+'T12:00:00Z')+30*86400000).toISOString().slice(0,10)&&Number(g.current_amount)<Number(g.target_amount))
  candidates.push({user_id:g.user_id,home_id:g.home_id||null,kind:'savings',reference_id:g.id,event_date:today,title:'Obiettivo di risparmio da rivedere',body:`${g.label} termina il ${g.deadline}; l'importo accantonato è ancora inferiore all'obiettivo.`,source:g});
 const membershipCache=new Map(),prefCache=new Map(),deviceCache=new Map(),languageCache=new Map();
 for(const event of candidates){
  let recipients=[event.user_id];
  if(event.home_id){if(!membershipCache.has(event.home_id)){const {data,error}=await admin.from('home_members').select('user_id').eq('home_id',event.home_id).limit(100);if(error){counts.errors.push(error.message);continue;}membershipCache.set(event.home_id,(data||[]).map(m=>m.user_id));}recipients=membershipCache.get(event.home_id);}
  for(const userId of new Set(recipients)){
   if(!languageCache.has(userId)){
    const {data,error}=await admin.from('user_language_preferences').select('language').eq('user_id',userId).maybeSingle();
    if(error){counts.errors.push('Lingua avviso v20 '+userId+': '+error.message);continue;}
    languageCache.set(userId,data?.language||'it');
   }
   let translated;
   try{translated=v20AlertCopy(event,languageCache.get(userId));}
   catch(e){counts.errors.push('Testo avviso v20 '+event.kind+': '+String(e.message).slice(0,100));continue;}
   const {source,...storedEvent}=event;
   const {data:added,error}=await admin.from('user_alerts').upsert({...storedEvent,...translated,user_id:userId},{onConflict:'user_id,kind,reference_id,event_date',ignoreDuplicates:true}).select('id').maybeSingle();
   if(error){counts.errors.push('Avvisi v20: '+error.message);continue;}
   if(!added)continue;
   counts.v20_alerts=(counts.v20_alerts||0)+1;
   if(!configuredPush?.())continue;
   if(!prefCache.has(userId)){const {data,error:prefError}=await admin.from('user_alert_preferences').select('*').eq('user_id',userId).maybeSingle();if(prefError){counts.errors.push('Preferenze push v20: '+prefError.message);continue;}prefCache.set(userId,data||{});}
   if(!pushAllowed(prefCache.get(userId),event.kind))continue;
   if(!deviceCache.has(userId)){const {data}=await admin.from('push_subscriptions').select('id,endpoint,p256dh,auth_secret').eq('user_id',userId).limit(10);deviceCache.set(userId,data||[]);}
   for(const device of deviceCache.get(userId))try{await sendPush(device,translated);counts.v20_push=(counts.v20_push||0)+1;}
    catch(e){if([404,410].includes(e.statusCode))await admin.from('push_subscriptions').delete().eq('id',device.id).eq('user_id',userId);else counts.errors.push('Push v20: '+String(e.message).slice(0,100));}
  }
 }
}

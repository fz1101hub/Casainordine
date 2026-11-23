import {v20AlertCopy} from './v20-alert-copy.mjs';
import {missingBillCandidates,mailHealth,billFraudSignals} from './v20-core.mjs';
import {deliverAlerts} from './extra-alerts.mjs';
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
 const candidates=missingBillCandidates(utilities||[],bills||[],today).map(m=>({user_id:m.user_id,home_id:m.home_id,kind:'missing_bill',reference_id:m.utility_id,event_date:m.expected_on,source:m}));
 // Amount-only anomaly detection runs even without a manual security inspection.
 // No conclusion of fraud is drawn; no payment is changed.
 const recentCutoff=new Date(Date.parse(today+'T12:00:00Z')-14*86400000).toISOString().slice(0,10);
 for(const b of bills||[]){
  if(b.is_estimate||b.source==='recurring'||!b.created_at||b.created_at.slice(0,10)<recentCutoff)continue;
  const history=(bills||[]).filter(old=>old.id!==b.id&&old.home_id===b.home_id&&
   (b.home_id!==null||old.user_id===b.user_id)&&old.due_date<b.due_date);
  const result=billFraudSignals(b,history);
  if(result.flags.some(f=>f.id==='high_amount'))candidates.push({user_id:b.user_id,home_id:b.home_id||null,
   kind:'fraud',reference_id:b.id,event_date:b.due_date,source:b});
 }
 for(const c of connections||[]){const h=mailHealth(c,new Date(today+'T22:00:00Z'));if(h.level==='ok')continue;
  candidates.push({user_id:c.user_id,home_id:null,kind:'mail_sync',reference_id:c.id,event_date:today,source:{mail_status:h.status}});}
 for(const p of plans||[])if(p.move_on>=today&&p.move_on<=new Date(Date.parse(today+'T12:00:00Z')+7*86400000).toISOString().slice(0,10))
  candidates.push({user_id:p.user_id,home_id:p.home_id||null,kind:'move',reference_id:p.id,event_date:today,source:p});
 for(const g of goals||[])if(g.deadline>=today&&g.deadline<=new Date(Date.parse(today+'T12:00:00Z')+30*86400000).toISOString().slice(0,10)&&Number(g.current_amount)<Number(g.target_amount))
  candidates.push({user_id:g.user_id,home_id:g.home_id||null,kind:'savings',reference_id:g.id,event_date:today,source:g});
 // Consegna comune a blocchi (deliverAlerts): avviso per i membri della casa o per chi ha creato
 // la voce, nella lingua di ciascuno, una volta sola, push solo per gli avvisi nuovi.
 await deliverAlerts(admin,candidates.map(({source,user_id,home_id,...event})=>({
  // user_alerts non ha la colonna home_id: la casa serve solo a trovare i destinatari. (Prima la
  // riga la conteneva e Supabase la rifiutava, quindi questi avvisi non venivano salvati.)
  item:{user_id,home_id},event,copy:language=>v20AlertCopy({user_id,home_id,source,...event},language)
 })),counts,{sendPush,configuredPush,label:'v20',created:'v20_alerts',pushed:'v20_push'});
}

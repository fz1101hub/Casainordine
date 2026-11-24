import {v20AlertCopy} from './v20-alert-copy.mjs';
import {missingBillCandidates,mailHealth,billFraudSignals} from './v20-core.mjs';
import {deliverAlerts} from './extra-alerts.mjs';
import {readAll,readIn} from './batch.mjs';
import {addDaysISO} from './dates.mjs';

// Bollette lette per i controlli: due anni e poco più bastano per due bollette annuali (bolletta
// mancante) e per le ultime otto bimestrali (importo insolito).
const HISTORY_DAYS=800;
const BILL_COLUMNS='id,utility_id,user_id,home_id,supplier,category,due_date,source,is_estimate,amount,created_at';
// Spazio di una voce: la casa condivisa, oppure lo spazio personale di chi l'ha creata.
const scopeOf=x=>x.home_id?`h:${x.home_id}`:`u:${x.user_id}`;
const read=async(counts,label,run)=>{try{return await run();}catch(error){counts.errors.push(`${label}: ${error?.message||error}`);return null;}};

/** Server cron checks with daily deduplication. This module never marks bills paid. */
// Letture a pagine e per spazio (readAll/readIn): prima le letture avevano un tetto (1000 utenze,
// «3000» bollette che Supabase riduce a 1000, le più lontane nel tempo di TUTTI) e con molte
// persone i controlli guardavano solo una piccola parte dei dati, scelta a caso
// (tests/avvisi-molti-dati.test.mjs).
export async function processV20Alerts(admin,today,counts,{sendPush,configuredPush,now}={}){
 const utilities=await read(counts,'Monitor utenze',()=>readAll(admin,'utilities','id,user_id,home_id,supplier,category,frequency,active',q=>q.eq('active',true).neq('frequency','none').order('id')));
 if(!utilities)return;
 const recentCutoff=addDaysISO(today,-14), since=addDaysISO(today,-HISTORY_DAYS);
 // Bollette inserite negli ultimi 14 giorni (né stimate né ricorrenti): quelle da controllare per l'importo.
 const recent=await read(counts,'Monitor bollette',()=>readAll(admin,'bills',BILL_COLUMNS,q=>q.gte('created_at',recentCutoff).eq('is_estimate',false).neq('source','recurring').order('id')));
 if(!recent)return;
 // Lo storico solo degli spazi che servono: quelli con utenze periodiche o con bollette nuove.
 const homes=new Set(),people=new Set();
 for(const x of [...utilities,...recent])if(x.home_id)homes.add(x.home_id);else if(x.user_id)people.add(x.user_id);
 const history=await read(counts,'Monitor bollette',async()=>[
  ...await readIn(admin,'bills',BILL_COLUMNS,'home_id',[...homes],q=>q.gte('due_date',since).eq('is_estimate',false).order('id')),
  ...await readIn(admin,'bills',BILL_COLUMNS,'user_id',[...people],q=>q.is('home_id',null).gte('due_date',since).eq('is_estimate',false).order('id')),
 ]);
 if(!history)return;
 const billsBy=new Map(),utilitiesBy=new Map();
 for(const b of history){const k=scopeOf(b);if(!billsBy.has(k))billsBy.set(k,[]);billsBy.get(k).push(b);}
 for(const u of utilities){const k=scopeOf(u);if(!utilitiesBy.has(k))utilitiesBy.set(k,[]);utilitiesBy.get(k).push(u);}
 const connections=await read(counts,'Monitor email',()=>readAll(admin,'mail_connections','id,user_id,status,last_sync_at',q=>q.order('id')));
 const plans=await read(counts,'Piani trasloco',()=>readAll(admin,'home_move_plans','id,user_id,home_id,title,move_on',q=>q.gte('move_on',today).lte('move_on',addDaysISO(today,7)).order('id')));
 const goals=await read(counts,'Risparmio',()=>readAll(admin,'home_savings_goals','id,user_id,home_id,label,deadline,target_amount,current_amount',q=>q.gte('deadline',today).lte('deadline',addDaysISO(today,30)).order('id')));
 // Ogni spazio con le sue utenze e le sue bollette (prima: ogni utenza contro tutte le bollette lette).
 const candidates=[];
 for(const [k,list] of utilitiesBy)for(const m of missingBillCandidates(list,billsBy.get(k)||[],today))
  candidates.push({user_id:m.user_id,home_id:m.home_id,kind:'missing_bill',reference_id:m.utility_id,event_date:m.expected_on,source:m});
 // Amount-only anomaly detection runs even without a manual security inspection.
 // No conclusion of fraud is drawn; no payment is changed.
 for(const b of recent){
  if(b.is_estimate||b.source==='recurring'||!b.created_at||b.created_at.slice(0,10)<recentCutoff)continue;
  const past=(billsBy.get(scopeOf(b))||[]).filter(old=>old.id!==b.id&&old.due_date<b.due_date);
  const result=billFraudSignals(b,past);
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
 })),counts,{sendPush,configuredPush,now,today,label:'v20',created:'v20_alerts',pushed:'v20_push'});
}

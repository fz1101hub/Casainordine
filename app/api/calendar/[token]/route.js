import { readAll, readIn } from '../../../../lib/batch.mjs';
import {getAdmin,hashToken} from '../../../../lib/server.mjs';
import {calendarText} from '../../../../lib/calendar.mjs';
import {todayRome,addDaysISO} from '../../../../lib/dates.mjs';
import {gardenCalendarEvents} from '../../../../lib/garden.mjs';
import {petCalendarEvents} from '../../../../lib/pets.mjs';
import {healthCalendarEvents} from '../../../../lib/health.mjs';
import {taxAgenda} from '../../../../lib/tax-calendar.mjs';

// Interventi del giardino e dell'orto dello spazio personale e delle case: se le tabelle non ci sono
// ancora (migrazione v57 non eseguita) il calendario resta quello delle bollette.
async function gardenEvents(admin,userId,homes,today){
 const columns='id,name,ended_on',personal=q=>q.eq('user_id',userId).is('home_id',null).order('id');
 const plants=[];
 try{
  plants.push(...await readAll(admin,'home_garden_plants',columns,personal).catch(e=>{if(e?.code==='42703')return readAll(admin,'home_garden_plants','id,name',personal);throw e;}));
  if(homes.length)plants.push(...await readIn(admin,'home_garden_plants',columns,'home_id',homes,q=>q.order('id')).catch(e=>{if(e?.code==='42703')return readIn(admin,'home_garden_plants','id,name','home_id',homes,q=>q.order('id'));throw e;}));
 }catch(error){if(['42P01','PGRST205'].includes(error?.code))return [];throw error;}
 const active=plants.filter(p=>!p.ended_on);
 if(!active.length)return [];
 const tasks=await readIn(admin,'home_garden_tasks','id,plant_id,title,product,months,every_days,next_on,last_done_on','plant_id',active.map(p=>p.id),q=>q.not('next_on','is',null).order('id'));
 return gardenCalendarEvents(active,tasks,today);
}
// Voci del piano degli animali (vaccini, antiparassitari…): senza la migrazione v59 nessun evento.
async function petEvents(admin,userId,homes,today){
 const columns='id,name,ended_on',pets=[];
 try{
  pets.push(...await readAll(admin,'home_pets',columns,q=>q.eq('user_id',userId).is('home_id',null).is('ended_on',null).order('id')));
  if(homes.length)pets.push(...await readIn(admin,'home_pets',columns,'home_id',homes,q=>q.is('ended_on',null).order('id')));
 }catch(error){if(['42P01','PGRST205'].includes(error?.code))return [];throw error;}
 if(!pets.length)return [];
 const tasks=await readIn(admin,'home_pet_tasks','id,pet_id,title,product,every_days,next_on','pet_id',pets.map(p=>p.id),q=>q.not('next_on','is',null).order('id'));
 return petCalendarEvents(pets,tasks,today);
}
// Visite e vaccinazioni (migrate_v60): il titolo solo se chi ha il calendario vuole i dettagli
// (user_alert_preferences.health_push_details), altrimenti il tipo. Senza la v60 nessun evento.
async function healthEvents(admin,userId,homes,today){
 const columns='id,name',people=[];
 try{
  people.push(...await readAll(admin,'health_people',columns,q=>q.eq('user_id',userId).is('home_id',null).order('id')));
  if(homes.length)people.push(...await readIn(admin,'health_people',columns,'home_id',homes,q=>q.order('id')));
 }catch(error){if(['42P01','PGRST205'].includes(error?.code))return [];throw error;}
 if(!people.length)return [];
 const appointments=await readIn(admin,'health_appointments','id,person_id,kind,title,on_date,at_time,place,done_on','person_id',people.map(p=>p.id),q=>q.is('done_on',null).gte('on_date',addDaysISO(today,-7)).order('id'));
 const {data:pref}=await admin.from('user_alert_preferences').select('health_push_details').eq('user_id',userId).maybeSingle();
 const details=pref?.health_push_details===true;
 return healthCalendarEvents(people,appointments,today).map(e=>({...e,what:details?e.title:'',place:details?e.place:''}));
}
// Rate non pagate (migrate_v64) e documenti con la scadenza (migrate_v63): senza le tabelle nessun evento.
async function deadlineEvents(admin,userId,homes,today){
 const scoped=async(table,columns,refine)=>{
  const rows=[...await readAll(admin,table,columns,q=>refine(q.eq('user_id',userId).is('home_id',null)).order('id'))];
  if(homes.length)rows.push(...await readIn(admin,table,columns,'home_id',homes,q=>refine(q).order('id')));
  return rows;
 };
 const out=[];
 try{
  const plans=await scoped('payment_plans','id,title,ended_on',q=>q.is('ended_on',null));
  if(plans.length){
   const titles=new Map(plans.map(p=>[p.id,p.title]));
   const items=await readIn(admin,'payment_installments','id,plan_id,label,due_on','plan_id',plans.map(p=>p.id),q=>q.is('paid_on',null).gte('due_on',addDaysISO(today,-7)).lte('due_on',addDaysISO(today,400)).order('id'));
   for(const i of items)out.push({uid:`installment-${i.id}`,date:i.due_on,key:'installment',params:{plan:titles.get(i.plan_id),label:i.label}});
  }
 }catch(error){if(!['42P01','PGRST205'].includes(error?.code))throw error;}
 try{
  const docs=await scoped('family_documents','id,holder,kind,label,expires_on',q=>q.not('expires_on','is',null).gte('expires_on',addDaysISO(today,-7)).lte('expires_on',addDaysISO(today,4000)));
  for(const d of docs)out.push({uid:`document-${d.id}`,date:d.expires_on,key:'document',params:{holder:d.holder,what:d.label,kind:d.kind}});
 }catch(error){if(!['42P01','PGRST205'].includes(error?.code))throw error;}
 // Scadenze fiscali seguite (migrate_v67), non ancora segnate come fatte.
 try{
  const settings=await scoped('tax_calendar_settings','id,groups,remind_days,done',q=>q);
  for(const s of settings)for(const a of taxAgenda(s,today))if(!a.done)out.push({uid:`tax-${s.id}-${a.key}-${a.year}`,date:a.date,key:'tax',params:{taxKey:a.key,year:a.year}});
 }catch(error){if(!['42P01','PGRST205'].includes(error?.code))throw error;}
 return out.sort((a,b)=>a.date.localeCompare(b.date)).slice(0,3000);
}
export const runtime='nodejs';
export async function GET(_request,{params}){
 try{
  const {token}=await params;
  if(!/^[A-Za-z0-9_-]{43}$/.test(token||''))return Response.json({error:'calendarNotFound'}, {status:404});
  const admin=getAdmin();
  const {data:feed,error}=await admin.from('calendar_feeds').select('user_id').eq('token_hash',hashToken(token)).maybeSingle();
  if(error||!feed)return Response.json({error:'calendarNotFound'}, {status:404});
  const today=todayRome(),start=addDaysISO(today,-45),end=addDaysISO(today,365);
  // A pagine (lib/batch.mjs): Supabase restituisce al massimo 1000 righe, «limit(1200)» non bastava.
  const period=q=>q.is('paid_at',null).gte('due_date',start).lte('due_date',end).order('due_date').order('id');
  let personal=null,e1=null;
  try{personal=await readAll(admin,'bills','id,title,supplier,amount,due_date,paid_at',q=>period(q.eq('user_id',feed.user_id).is('home_id',null)));}catch(error){e1=error;}
  const {data:members,error:e2}=await admin.from('home_members').select('home_id').eq('user_id',feed.user_id).limit(40);
  if(e1||e2)throw new Error('calendar unavailable');
  let shared=[];
  if(members?.length){try{shared=await readIn(admin,'bills','id,title,supplier,amount,due_date,paid_at','home_id',members.map(m=>m.home_id),period);}catch{throw new Error('calendar unavailable');}}
  const bills=[...new Map([...(personal||[]),...shared].map(b=>[b.id,b])).values()];
  let garden=[],health=[],extra=[];
  try{
   const homes=(members||[]).map(m=>m.home_id);
   const [plants,animals]=await Promise.all([gardenEvents(admin,feed.user_id,homes,today),petEvents(admin,feed.user_id,homes,today)]);
   garden=[...plants,...animals].sort((a,b)=>a.date.localeCompare(b.date)||a.uid.localeCompare(b.uid)).slice(0,3000);
   health=await healthEvents(admin,feed.user_id,homes,today);
   extra=await deadlineEvents(admin,feed.user_id,homes,today);
  }catch{throw new Error('calendar unavailable');}
  // Testi del calendario nella lingua scelta da chi lo ha creato (italiano se non l'ha mai scelta).
  const {data:preference}=await admin.from('user_language_preferences').select('language').eq('user_id',feed.user_id).maybeSingle();
  return new Response(calendarText(bills,undefined,preference?.language||'it',garden,health,extra),{status:200,headers:{'Content-Type':'text/calendar; charset=utf-8','Content-Disposition':'inline; filename="casa-in-ordine.ics"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }catch{return Response.json({error:'calendarUnavailable'}, {status:503});}
}

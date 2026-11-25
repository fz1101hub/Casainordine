import { readAll, readIn } from '../../../../lib/batch.mjs';
import {getAdmin,hashToken} from '../../../../lib/server.mjs';
import {calendarText} from '../../../../lib/calendar.mjs';
import {todayRome,addDaysISO} from '../../../../lib/dates.mjs';
import {gardenCalendarEvents} from '../../../../lib/garden.mjs';

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
  let garden=[];
  try{garden=await gardenEvents(admin,feed.user_id,(members||[]).map(m=>m.home_id),today);}catch{throw new Error('calendar unavailable');}
  // Testi del calendario nella lingua scelta da chi lo ha creato (italiano se non l'ha mai scelta).
  const {data:preference}=await admin.from('user_language_preferences').select('language').eq('user_id',feed.user_id).maybeSingle();
  return new Response(calendarText(bills,undefined,preference?.language||'it',garden),{status:200,headers:{'Content-Type':'text/calendar; charset=utf-8','Content-Disposition':'inline; filename="casa-in-ordine.ics"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }catch{return Response.json({error:'calendarUnavailable'}, {status:503});}
}

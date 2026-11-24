import { readAll, readIn } from '../../../../lib/batch.mjs';
import {getAdmin,hashToken} from '../../../../lib/server.mjs';
import {calendarText} from '../../../../lib/calendar.mjs';
import {todayRome,addDaysISO} from '../../../../lib/dates.mjs';
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
  // Testi del calendario nella lingua scelta da chi lo ha creato (italiano se non l'ha mai scelta).
  const {data:preference}=await admin.from('user_language_preferences').select('language').eq('user_id',feed.user_id).maybeSingle();
  return new Response(calendarText(bills,undefined,preference?.language||'it'),{status:200,headers:{'Content-Type':'text/calendar; charset=utf-8','Content-Disposition':'inline; filename="casa-in-ordine.ics"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }catch{return Response.json({error:'calendarUnavailable'}, {status:503});}
}

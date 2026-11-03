import {getAdmin,hashToken} from '../../../../lib/server.mjs';
import {calendarText} from '../../../../lib/calendar.mjs';
import {todayRome,addDaysISO} from '../../../../lib/dates.mjs';
export const runtime='nodejs';
export async function GET(_request,{params}){
 try{
  const {token}=await params;
  if(!/^[A-Za-z0-9_-]{43}$/.test(token||''))return Response.json({error:'Feed non trovato'}, {status:404});
  const admin=getAdmin();
  const {data:feed,error}=await admin.from('calendar_feeds').select('user_id').eq('token_hash',hashToken(token)).maybeSingle();
  if(error||!feed)return Response.json({error:'Feed non trovato'}, {status:404});
  const today=todayRome(),start=addDaysISO(today,-45),end=addDaysISO(today,365);
  const {data:personal,error:e1}=await admin.from('bills').select('id,title,supplier,amount,due_date,paid_at').eq('user_id',feed.user_id).is('home_id',null).is('paid_at',null).gte('due_date',start).lte('due_date',end).limit(1200);
  const {data:members,error:e2}=await admin.from('home_members').select('home_id').eq('user_id',feed.user_id).limit(40);
  if(e1||e2)throw new Error('Calendario indisponibile');
  let shared=[];
  if(members?.length){const {data,error:e3}=await admin.from('bills').select('id,title,supplier,amount,due_date,paid_at').in('home_id',members.map(m=>m.home_id)).is('paid_at',null).gte('due_date',start).lte('due_date',end).limit(1200);
   if(e3)throw new Error('Calendario indisponibile');shared=data||[];}
  const bills=[...new Map([...(personal||[]),...shared].map(b=>[b.id,b])).values()];
  return new Response(calendarText(bills),{status:200,headers:{'Content-Type':'text/calendar; charset=utf-8','Content-Disposition':'inline; filename="scadenze-casa.ics"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }catch{return Response.json({error:'Feed non disponibile'}, {status:503});}
}

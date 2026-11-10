'use client';
import {useState} from 'react';
import {Database,ShieldCheck,Plus,CheckCircle2} from 'lucide-react';
import {createDemoFixtures} from '../lib/test-fixtures.mjs';
import {useLanguage} from './LanguageProvider';

// Explicitly opt-in: creates fake records only for the signed-in user's brand-new account.
// Uses normal Supabase Auth + RLS. Never uses service-role credentials or writes to auth.users.
export default function SampleAccountSetup({client,user,homes=[],onCreated,onNotify=()=>{}}){
 const {t}=useLanguage();
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 if(!client||!user)return null;
 if(homes.length)return null;
 async function create(){
  if(busy)return;
  if(!window.confirm(t('sample.confirm')))return;
  setBusy(true);setMessage('');
  let homeId=null;
  try{
   const checks=await Promise.all([
    client.from('home_members').select('home_id',{count:'exact',head:true}),
    client.from('bills').select('id',{count:'exact',head:true}),
    client.from('house_tasks').select('id',{count:'exact',head:true}),
    client.from('utilities').select('id',{count:'exact',head:true})
   ]);
   const failure=checks.find(r=>r.error);
   if(failure)throw failure.error;
   if(checks.some(r=>(r.count||0)>0))throw new Error(t('sample.notEmpty'));
   const created=await client.rpc('create_home',{home_name:t('sample.homeName')});
   if(created.error)throw created.error;
   homeId=created.data;
   if(!homeId)throw new Error(t('sample.creationFailed'));
   const samples=createDemoFixtures();
   const bills=samples.bills.map(b=>({user_id:user.id,home_id:homeId,title:b.title,supplier:b.supplier,category:b.category,amount:b.amount,due_date:b.due_date,paid_at:b.paid_at,source:'manual',is_estimate:false}));
   const tasks=samples.tasks.map(t=>({user_id:user.id,home_id:homeId,title:t.title,due_date:t.due_date,done_at:t.done_at}));
   const shopping=samples.shopping.map(s=>({home_id:homeId,created_by:user.id,title:s.title,quantity:s.quantity,checked:s.checked}));
   for(const [table,items] of [['bills',bills],['house_tasks',tasks],['home_shopping',shopping]]){
    const result=await client.from(table).insert(items);
    if(result.error)throw result.error;
   }
   onNotify(t('sample.success'));
   setMessage(t('sample.created'));
   await onCreated?.(homeId);
  }catch(e){
   const extra=homeId?' '+t('sample.partial'):'';
   setMessage((e.message||'Errore durante la preparazione.')+extra);
  }finally{setBusy(false);}
 }
 return <section className="panel testdrive-seed">
  <div className="testdrive-seed-icon"><Database size={22}/></div>
  <div className="testdrive-seed-content"><h2>{t('sample.title')}</h2>
   <p>{t('sample.intro')} {t('sample.privacy')}</p>
   <small><ShieldCheck size={14}/> {t('sample.onlyEmpty')}</small>
   {message&&<p role="status" className="testdrive-seed-message">{message}</p>}
  </div>
  <button type="button" className="btn btn-soft" disabled={busy} onClick={create}><Plus size={16}/>{t(busy?'sample.loading':'sample.action')}</button>
 </section>;
}

import { authenticatedUser, getAdmin, json } from '../../../../lib/server.mjs';
import { supplierKey } from '../../../../lib/payment-recognition.mjs';
import { canEditBill } from '../../../../lib/home-access.mjs';
export const runtime='nodejs';
const validId=id=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id));

export async function GET(request){
  const user=await authenticatedUser(request);
  if(!user)return json({error:'unauthorized'},401);
  const admin=getAdmin();
  const {data,error}=await admin.from('mail_payment_evidence')
    .select('id,sender_email,subject,amount,received_at,bill_id,status,created_at')
    .eq('user_id',user.id).eq('status','pending').order('created_at',{ascending:false}).limit(100);
  if(error)return json({error:'paymentsLoad'},500);
  const {data:trusted,error:trustError}=await admin.from('mail_payment_trusted_senders').select('id,sender_email,supplier_key').eq('user_id',user.id).order('created_at',{ascending:false}).limit(100);
  return trustError?json({error:'paymentsTrustedLoad'},500):json({payments:data||[],trusted_senders:trusted||[]});
}

export async function PATCH(request){
  const user=await authenticatedUser(request);
  if(!user)return json({error:'unauthorized'},401);
  const {id,action,bill_id,trust_sender=false}=await request.json().catch(()=>({}));
  if(!validId(id)||!['confirm','dismiss'].includes(action)||typeof trust_sender!=='boolean')return json({error:'invalidRequest'},400);
  const admin=getAdmin();
  const {data:receipt,error:eError}=await admin.from('mail_payment_evidence')
    .select('id,sender_email,amount,bill_id,received_at,status').eq('id',id).eq('user_id',user.id).maybeSingle();
  if(eError)return json({error:'paymentsEvidenceRead'},500);
  if(!receipt||receipt.status!=='pending')return json({error:'paymentsProcessed'},409);
  if(action==='dismiss'){
    const {error}=await admin.from('mail_payment_evidence').update({status:'dismissed',reviewed_at:new Date().toISOString()}).eq('id',id).eq('user_id',user.id).eq('status','pending');
    return error?json({error:'paymentsDismiss'},500):json({ok:true});
  }
  const selected=bill_id||receipt.bill_id;
  if(!validId(selected))return json({error:'paymentsChooseBill'},400);
  const {data:bill,error:bError}=await admin.from('bills').select('id,user_id,home_id,supplier,amount,paid_at')
    .eq('id',selected).eq('user_id',user.id).maybeSingle();
  if(bError||!bill)return json({error:'billNotFound'},404);
  // In una casa condivisa serve ancora il ruolo di proprietario o editor (un lettore non paga).
  const allowed=await canEditBill(admin,bill,user.id).catch(()=>null);
  if(allowed===null)return json({error:'paymentsPermissionCheck'},500);
  if(!allowed)return json({error:'paymentsForbidden'},403);
  if(bill.paid_at)return json({error:'paymentsAlreadyPaid'},409);
  if(Math.round(Number(bill.amount)*100)!==Math.round(Number(receipt.amount)*100))return json({error:'paymentsAmountMismatch'},409);
  const {data:paid,error:paymentError}=await admin.from('bills').update({paid_at:receipt.received_at})
    .eq('id',bill.id).eq('user_id',user.id).is('paid_at',null).select('id').maybeSingle();
  if(paymentError)return json({error:'paymentsBillUpdate'},500);
  if(!paid)return json({error:'paymentsBillUpdated'},409);
  const {error:markedError}=await admin.from('mail_payment_evidence').update({status:'confirmed',bill_id:bill.id,reviewed_at:new Date().toISOString()})
    .eq('id',receipt.id).eq('user_id',user.id).eq('status','pending');
  if(markedError)return json({ok:true,warning:'paymentsArchiveWarning'});
  if(trust_sender){
    const {error:trustError}=await admin.from('mail_payment_trusted_senders')
      .upsert({user_id:user.id,sender_email:receipt.sender_email,supplier_key:supplierKey(bill.supplier)}, {onConflict:'user_id,sender_email,supplier_key',ignoreDuplicates:true});
    if(trustError)return json({ok:true,warning:'paymentsTrustWarning'});
  }
  return json({ok:true});
}

export async function DELETE(request){
  const user=await authenticatedUser(request);
  if(!user)return json({error:'unauthorized'},401);
  const {id}=await request.json().catch(()=>({}));
  if(!validId(id))return json({error:'invalidId'},400);
  const {error}=await getAdmin().from('mail_payment_trusted_senders').delete().eq('user_id',user.id).eq('id',id);
  return error?json({error:'paymentsRevoke'},500):json({ok:true});
}

import { extractPaymentEvidence, matchOutstandingBill, supplierKey, supplierMatches } from './payment-recognition.mjs';
import { canEditBill } from './home-access.mjs';

// Invoked only by authenticated mailbox jobs. Never stores entire messages/bodies.
export async function processPaymentMessage(admin,connection,message){
  const evidence=extractPaymentEvidence(message);
  if(!evidence)return 'ignored';
  const {data:existing,error:checkError}=await admin.from('mail_payment_evidence').select('id').eq('connection_id',connection.id).eq('message_id',message.messageId).maybeSingle();
  if(checkError)throw checkError;
  if(existing)return 'duplicate';
  const date=new Date(evidence.receivedAt).getTime();
  const oldest=new Date(date-90*86400000).toISOString().slice(0,10);
  const newest=new Date(date+65*86400000).toISOString().slice(0,10);
  // Anche le bollette già pagate: una ricevuta della bolletta del mese scorso (stesso importo)
  // non deve finire sulla bolletta aperta di questo mese (vedi matchOutstandingBill).
  const {data:bills,error:billsError}=await admin.from('bills').select('id,user_id,home_id,supplier,amount,due_date,paid_at').eq('user_id',connection.user_id).gte('due_date',oldest).lte('due_date',newest).limit(250);
  if(billsError)throw billsError;
  const bill=matchOutstandingBill(evidence,bills);
  if(!bill&&!evidence.billContext)return 'ignored';
  const row={user_id:connection.user_id,connection_id:connection.id,message_id:String(message.messageId).slice(0,500),sender_email:evidence.sender,subject:evidence.subject,amount:evidence.amount,received_at:evidence.receivedAt,bill_id:bill?.id||null,status:'pending'};
  const {data:created,error:insertError}=await admin.from('mail_payment_evidence').upsert(row,{onConflict:'connection_id,message_id',ignoreDuplicates:true}).select('id').maybeSingle();
  if(insertError)throw insertError;
  if(!created)return 'duplicate';
  if(!bill)return 'pending';
  // No automatic status changes based on a subject line alone or a generic body.
  // For an opted-in trusted sender, supplier must also appear in the subject/sender.
  if(!evidence.autoEligible || !supplierMatches(bill.supplier,{subject:evidence.subject,sender:evidence.sender}))return 'pending';
  const {data:profile,error:profileError}=await admin.from('profiles').select('auto_confirm_payments').eq('id',connection.user_id).maybeSingle();
  if(profileError)throw profileError;
  if(!profile?.auto_confirm_payments)return 'pending';
  const {data:trusted,error:trustError}=await admin.from('mail_payment_trusted_senders').select('id').eq('user_id',connection.user_id).eq('sender_email',evidence.sender).eq('supplier_key',supplierKey(bill.supplier)).maybeSingle();
  if(trustError)throw trustError;
  if(!trusted)return 'pending';
  if(bill.paid_at||!(await canEditBill(admin,bill,connection.user_id)))return 'pending';
  // L'indirizzo del mittente si può falsificare: si conferma da solo solo se Gmail/Outlook
  // riportano DMARC superato per il dominio del mittente (IMAP: mai, resta da confermare).
  const senderAuth=typeof message.senderAuth==='function'?await message.senderAuth().catch(()=>'unknown'):message.senderAuth;
  if(senderAuth!=='reported_pass')return 'pending';
  // Compare & set prevents overwriting payment date or performing two auto-confirmations.
  const {data:paid,error:paidError}=await admin.from('bills').update({paid_at:evidence.receivedAt}).eq('id',bill.id).eq('user_id',connection.user_id).is('paid_at',null).select('id').maybeSingle();
  if(paidError)throw paidError;
  if(!paid)return 'pending';
  const {error:statusError}=await admin.from('mail_payment_evidence').update({status:'auto_confirmed',reviewed_at:new Date().toISOString()}).eq('id',created.id).eq('user_id',connection.user_id);
  if(statusError)throw statusError;
  return 'auto_confirmed';
}

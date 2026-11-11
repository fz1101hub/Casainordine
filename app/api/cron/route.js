import { getAdmin, json, scheduledCallAuthorized, publicAppUrl } from '../../../lib/server.mjs';
import { isHomeMember } from '../../../lib/home-access.mjs';
import { addDaysISO, nextRecurringDue, todayRome, euro } from '../../../lib/dates.mjs';
import { reminderWindow, daysUntil, firstRecurringFrom } from '../../../lib/reminder-window.mjs';
import { shouldSendSummary, monthEndISO, upcomingSummaryBills } from '../../../lib/summary-schedule.mjs';
import { sendPush, configuredPush } from '../../../lib/push.mjs';
import { processExtraAlerts, pushAllowed } from '../../../lib/extra-alerts.mjs';
import { processV20Alerts } from '../../../lib/v20-alerts.mjs';
import { billReminderCopy } from '../../../lib/notification-copy.mjs';
import { billSummaryCopy } from '../../../lib/notification-summary.mjs';
import { billDuePushCopy, billSummaryPushCopy } from '../../../lib/notification-push-copy.mjs';
export const runtime = 'nodejs';
export const maxDuration = 60;

const htmlEscape = text => String(text || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function emailReminder(recipient, bill, language='it', appUrl=publicAppUrl()) {
  const apiKey = process.env.RESEND_API_KEY, from = process.env.RESEND_FROM;
  if (!apiKey || !from) return {skipped:true};
  const copy = billReminderCopy({language,name:bill.title,dueDate:bill.due_date});
  const response = await fetch('https://api.resend.com/emails', {
    method:'POST', headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
    body:JSON.stringify({from,to:recipient,
      subject:`Casa in Ordine · ${copy.subject}`,
      html:`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#24323a"><p style="white-space:pre-line">${htmlEscape(copy.text)}</p><p><a href="${htmlEscape(appUrl)}" style="display:inline-block;background:#156e65;color:white;padding:12px 18px;border-radius:9px;text-decoration:none">Casa in Ordine</a></p></div>`
    })
  });
  const result = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(String(result.message || `Email HTTP ${response.status}`).slice(0,160));
  return {sent:true};
}

async function emailSummary(recipient,bills,today,language='it',appUrl=publicAppUrl()){
  const key=process.env.RESEND_API_KEY,from=process.env.RESEND_FROM;
  if(!key||!from)return {skipped:true};
  const copy=billSummaryCopy({language,today,bills});
  const rows=copy.rows.map(b=>`<li>${htmlEscape(b.title)} (${htmlEscape(b.supplier)}) — ${htmlEscape(b.date)} — ${htmlEscape(b.amount)}</li>`).join('');
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
    body:JSON.stringify({from,to:recipient,subject:`Casa in Ordine · ${copy.subject}`,
      html:`<div style="font-family:Arial,sans-serif"><h2>${htmlEscape(copy.heading)}</h2><p>${htmlEscape(copy.description)}</p><ul>${rows}</ul><p><a href="${htmlEscape(appUrl)}">${htmlEscape(copy.openLabel)}</a></p></div>`})});
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(String(body.message||`Email HTTP ${response.status}`).slice(0,160));
  return {sent:true};
}

async function notifyPushForBill(admin,bill,today,counts){
  if(!configuredPush())return;
  let recipients=[bill.user_id];
  if(bill.home_id){
    const {data,error}=await admin.from('home_members').select('user_id').eq('home_id',bill.home_id).limit(40);
    if(error){counts.errors.push(`Membri casa ${bill.home_id}: ${error.message}`);return;}
    recipients=[...new Set((data||[]).map(m=>m.user_id))];
  }
  for(const userId of recipients){
    const {data:profile}=await admin.from('profiles').select('reminders_enabled').eq('id',userId).maybeSingle();
    if(!profile?.reminders_enabled)continue;
    const {data:pushPreferences}=await admin.from('user_alert_preferences').select('*').eq('user_id',userId).maybeSingle();
    if(!pushAllowed(pushPreferences||{},'bill'))continue;
    const {data:devices,error}=await admin.from('push_subscriptions').select('id,endpoint,p256dh,auth_secret').eq('user_id',userId).limit(10);
    if(error){counts.errors.push(`Push utente ${userId}: ${error.message}`);continue;}
    if(!devices?.length)continue;
    // Una sola notifica per bolletta e persona, anche se la bolletta resta nella finestra più giorni.
    const {data:earlier,error:earlierErr}=await admin.from('push_delivery_log').select('reminder_date').eq('bill_id',bill.id).eq('user_id',userId).not('sent_at','is',null).neq('reminder_date',today).limit(1);
    if(earlierErr){counts.errors.push(`Log push ${bill.id}: ${earlierErr.message}`);continue;}
    if(earlier?.length)continue;
    const {data:created,error:logErr}=await admin.from('push_delivery_log').upsert({bill_id:bill.id,user_id:userId,reminder_date:today},
      {onConflict:'bill_id,user_id,reminder_date',ignoreDuplicates:true}).select('sent_at').maybeSingle();
    if(logErr){counts.errors.push(`Log push ${bill.id}: ${logErr.message}`);continue;}
    if(!created){
      const {data:old}=await admin.from('push_delivery_log').select('sent_at').eq('bill_id',bill.id).eq('user_id',userId).eq('reminder_date',today).maybeSingle();
      if(old?.sent_at)continue;
    }
    const {data:languagePreference,error:languageError}=await admin.from('user_language_preferences').select('language').eq('user_id',userId).maybeSingle();
    if(languageError){counts.errors.push(`Lingua push ${userId}: ${languageError.message}`);continue;}
    const pushCopy=billDuePushCopy({language:languagePreference?.language||'it',name:bill.title,days:daysUntil(today,bill.due_date)});
    let successful=false;
    for(const device of devices){
      try{
        await sendPush(device,pushCopy);
        counts.push_sent++;successful=true;
      }catch(e){
        if(e.statusCode===404||e.statusCode===410)await admin.from('push_subscriptions').delete().eq('id',device.id).eq('user_id',userId);
        else counts.errors.push(`Push ${bill.id}: ${String(e.message).slice(0,120)}`);
      }
    }
    await admin.from('push_delivery_log').update({sent_at:successful?new Date().toISOString():null,error:successful?null:'Consegna non riuscita'}).eq('bill_id',bill.id).eq('user_id',userId).eq('reminder_date',today);
  }
}

export async function GET(request) {
  // Chiamato una volta al giorno da Vercel Cron e da Supabase Cron: ogni invio è registrato per
  // data (promemoria, notifiche, riepilogo), quindi una seconda chiamata nello stesso giorno non
  // manda nulla due volte.
  let admin;
  try { admin = getAdmin(); } catch { return json({error:'Configurazione del database incompleta'},503); }
  if (!(await scheduledCallAuthorized(request, admin))) return json({error:'Non autorizzato'},401);
  const today = todayRome(), horizon = addDaysISO(today, 45), reminderRange = reminderWindow(today);
  // Il pulsante delle email porta all'app vera anche se APP_URL manca (prima: http://localhost:3000).
  const appUrl = publicAppUrl(request);
  const counts = {recurring_created:0, notifications_created:0, emails_sent:0, summaries_created:0, summary_emails_sent:0, push_sent:0, summary_push_sent:0, errors:[]};
  try {
    // Fetch at most 1000 in one run; for larger installations, add keyset pagination.
    const {data:utilities,error:utilityError} = await admin.from('utilities').select('*')
      .eq('active',true).neq('frequency','none').lte('next_due_date',horizon).order('next_due_date').limit(1000);
    if (utilityError) throw utilityError;
    for (const u of utilities || []) {
      // Nessuna stima per scadenze già passate (utenza inserita con una prima data vecchia, o cron
      // fermo per giorni): si parte dalla prima scadenza da oggi in poi.
      let date = firstRecurringFrom(u.next_due_date,today,u.frequency,u.billing_day), n = 0;
      while (date && date <= horizon && n < 30) {
        // Existing manually imported invoices for the same provider/date can be reviewed by users.
        const {error} = await admin.from('bills').upsert({
          user_id:u.user_id,home_id:u.home_id||null,utility_id:u.id,title:`${u.category} · ${u.supplier}`,
          supplier:u.supplier,category:u.category,amount:u.estimated_amount,due_date:date,
          source:'recurring',is_estimate:true
        },{onConflict:'utility_id,due_date',ignoreDuplicates:true});
        if (error) { counts.errors.push(`Utenza ${u.id}: ${error.message}`); break; }
        counts.recurring_created++;
        date = nextRecurringDue(date,u.frequency,u.billing_day);
        if (!date) break;
        n++;
      }
      if (date && date !== u.next_due_date) {
        const {error} = await admin.from('utilities').update({next_due_date:date}).eq('id',u.id);
        if (error) counts.errors.push(`Aggiornamento utenza ${u.id} non riuscito`);
      }
    }
    // Finestra da oggi a 3 giorni: se il cron salta un giorno, o la bolletta arriva con meno di
    // 3 giorni di anticipo, il promemoria parte lo stesso (una sola volta per bolletta).
    const {data:bills,error:billError} = await admin.from('bills').select('id,user_id,home_id,title,supplier,amount,due_date')
      .gte('due_date',reminderRange.from).lte('due_date',reminderRange.to).is('paid_at',null).order('due_date').limit(1000);
    if (billError) throw billError;
    const billIds=(bills||[]).map(b=>b.id);
    const {data:previous,error:previousError}=billIds.length?await admin.from('reminders').select('bill_id').in('bill_id',billIds).neq('reminder_date',today).limit(5000):{data:[],error:null};
    if (previousError) throw previousError;
    const alreadyReminded=new Set((previous||[]).map(r=>r.bill_id));
    for (const bill of bills || []) {
      if (alreadyReminded.has(bill.id)) continue;
      await notifyPushForBill(admin,bill,today,counts);
      const {data:profile,error:pError} = await admin.from('profiles').select('email,reminders_enabled').eq('id',bill.user_id).maybeSingle();
      if (pError || !profile?.reminders_enabled) continue;
      // Chi ha creato la bolletta di una casa e poi ne è uscito non riceve più l'email.
      if (bill.home_id) {
        const member = await isHomeMember(admin,bill.home_id,bill.user_id).catch(e=>{counts.errors.push(`Membri casa ${bill.home_id}: ${String(e.message).slice(0,80)}`);return null;});
        if (!member) continue;
      }
      const {data:reminder,error:remErr} = await admin.from('reminders').upsert({
        user_id:bill.user_id,bill_id:bill.id,reminder_date:today
      },{onConflict:'bill_id,reminder_date',ignoreDuplicates:true}).select('id,email_sent_at').maybeSingle();
      if (remErr) {counts.errors.push(`Promemoria ${bill.id}: ${remErr.message}`);continue;}
      if (!reminder) continue; // already exists: no duplicate notification
      counts.notifications_created++;
      if (profile.email) {
        try {
          // Language is personal; a shared home's language must never override it.
          const {data:languagePreference,error:languageError}=await admin.from('user_language_preferences').select('language').eq('user_id',bill.user_id).maybeSingle();
          if(languageError)throw languageError; // fail closed rather than silently send the wrong language
          const res = await emailReminder(profile.email,bill,languagePreference?.language||'it',appUrl);
          if (res.sent) {
            await admin.from('reminders').update({email_sent_at:new Date().toISOString(),email_error:null}).eq('id',reminder.id);
            counts.emails_sent++;
          }
        } catch(e) {
          await admin.from('reminders').update({email_error:String(e.message).slice(0,150)}).eq('id',reminder.id);
          counts.errors.push(`Invio email ${bill.id} non riuscito`);
        }
      }
    }
    // A monthly list is independent of daily mailbox scans and the fixed T-3 reminder.
    const {data:profiles,error:summaryProfileError}=await admin.from('profiles').select('id,email,summary_frequency,summary_weekday,summary_month_day').neq('summary_frequency','off').limit(1000);
    if(summaryProfileError)throw summaryProfileError;
    for(const profile of profiles||[]){
      if(!shouldSendSummary(profile,today))continue;
      const {data:personalBills,error:queryError}=await admin.from('bills').select('id,title,supplier,amount,due_date,paid_at')
        .eq('user_id',profile.id).is('home_id',null).is('paid_at',null).gte('due_date',today).lte('due_date',monthEndISO(today)).order('due_date').limit(1000);
      if(queryError){counts.errors.push(`Riepilogo utente ${profile.id} non riuscito`);continue;}
      const {data:memberships,error:memberErr}=await admin.from('home_members').select('home_id').eq('user_id',profile.id).limit(30);
      if(memberErr){counts.errors.push(`Riepilogo casa ${profile.id} non riuscito`);continue;}
      let sharedBills=[];
      if(memberships?.length){
        const {data:shared,error:sharedErr}=await admin.from('bills').select('id,title,supplier,amount,due_date,paid_at')
          .in('home_id',memberships.map(m=>m.home_id)).is('paid_at',null).gte('due_date',today).lte('due_date',monthEndISO(today)).limit(1000);
        if(sharedErr){counts.errors.push(`Riepilogo casa ${profile.id}: ${sharedErr.message}`);continue;}
        sharedBills=shared||[];
      }
      const uniqueBills=[...new Map([...(personalBills||[]),...sharedBills].map(b=>[b.id,b])).values()];
      const items=upcomingSummaryBills(uniqueBills,today);
      if(!items.length)continue;
      const total=items.reduce((n,b)=>n+Number(b.amount),0);
      const {data:recap,error:recapErr}=await admin.from('bill_summaries').upsert({user_id:profile.id,summary_date:today,bill_count:items.length,total_amount:total},
        {onConflict:'user_id,summary_date',ignoreDuplicates:true}).select('id,email_sent_at').maybeSingle();
      if(recapErr){counts.errors.push(`Riepilogo: ${recapErr.message}`);continue;}
      if(!recap)continue;
      counts.summaries_created++;
      const {data:digestPreferences}=await admin.from('user_alert_preferences').select('*').eq('user_id',profile.id).maybeSingle();
      if(configuredPush()&&pushAllowed(digestPreferences||{},'digest')){
        const {data:devices}=await admin.from('push_subscriptions').select('id,endpoint,p256dh,auth_secret').eq('user_id',profile.id).limit(10);
        let pushCopy=null;
        if(devices?.length){
          const {data:languagePreference,error:languageError}=await admin.from('user_language_preferences').select('language').eq('user_id',profile.id).maybeSingle();
          if(languageError)counts.errors.push(`Lingua push riepilogo ${profile.id}: ${languageError.message}`);
          else pushCopy=billSummaryPushCopy({language:languagePreference?.language||'it',count:items.length,total});
        }
        let sent=false;
        for(const device of pushCopy?(devices||[]):[]){
          try{
            await sendPush(device,pushCopy);
            counts.summary_push_sent++;sent=true;
          }catch(e){
            if(e.statusCode===404||e.statusCode===410)await admin.from('push_subscriptions').delete().eq('id',device.id).eq('user_id',profile.id);
            else counts.errors.push(`Push riepilogo ${profile.id}: ${String(e.message).slice(0,120)}`);
          }
        }
        if(sent)await admin.from('bill_summaries').update({push_sent_at:new Date().toISOString()}).eq('id',recap.id);
      }
      if(profile.email){
        try{
          const {data:languagePreference,error:languageError}=await admin.from('user_language_preferences').select('language').eq('user_id',profile.id).maybeSingle();
          if(languageError)throw languageError;
          const result=await emailSummary(profile.email,items,today,languagePreference?.language||'it',appUrl);
          if(result.sent){await admin.from('bill_summaries').update({email_sent_at:new Date().toISOString(),email_error:null}).eq('id',recap.id);counts.summary_emails_sent++;}
        }catch(e){await admin.from('bill_summaries').update({email_error:String(e.message).slice(0,150)}).eq('id',recap.id);counts.errors.push(`Email riepilogo ${profile.id} non riuscita`);}
      }
    }
    await processExtraAlerts(admin,today,counts,{sendPush,configuredPush});
    await processV20Alerts(admin,today,counts,{sendPush,configuredPush});
    // Limit retention of recoverable deleted rows and household audit records.
    await admin.from('home_recycle_bin').delete().lt('deleted_at',new Date(Date.now()-30*86400000).toISOString());
    await admin.from('home_audit_log').delete().lt('created_at',new Date(Date.now()-365*86400000).toISOString());
    return json({ok:!counts.errors.length,date:today,reminder_window:reminderRange,...counts},counts.errors.length?207:200);
  } catch(e) {return json({error:'Elaborazione non riuscita',detail:String(e.message).slice(0,160),...counts},500);}
}

import { getAdmin, json, scheduledCallAuthorized, publicAppUrl } from '../../../lib/server.mjs';
import { processBillReminders, readIn } from '../../../lib/reminder-run.mjs';
import { processSummaries } from '../../../lib/summary-run.mjs';
import { addDaysISO, nextRecurringDue, todayRome, euro } from '../../../lib/dates.mjs';
import { reminderWindow, daysUntil, firstRecurringFrom } from '../../../lib/reminder-window.mjs';
import { sendPush, configuredPush } from '../../../lib/push.mjs';
import { processExtraAlerts, pushAllowed } from '../../../lib/extra-alerts.mjs';
import { processAutomations } from '../../../lib/automation-alerts.mjs';
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

export async function GET(request) {
  // Chiamato una volta al giorno da Vercel Cron e da Supabase Cron: ogni invio è registrato per
  // data (promemoria, notifiche, riepilogo), quindi una seconda chiamata nello stesso giorno non
  // manda nulla due volte.
  let admin;
  try { admin = getAdmin(); } catch { return json({error:'databaseConfig'},503); }
  if (!(await scheduledCallAuthorized(request, admin))) return json({error:'unauthorized'},401);
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
    // Le bollette già ricordate in un giorno precedente non si ripetono (una volta per bolletta).
    const previous=await readIn(admin,'reminders','bill_id','bill_id',(bills||[]).map(b=>b.id),q=>q.neq('reminder_date',today));
    const alreadyReminded=new Set(previous.map(r=>r.bill_id));
    // Tutto il resto a blocchi (lib/reminder-run.mjs): letture una volta per tipo di dato.
    await processBillReminders(admin,(bills||[]).filter(b=>!alreadyReminded.has(b.id)),{today,appUrl,counts,
      push:configuredPush()?{allowed:pref=>pushAllowed(pref,'bill'),copy:({language,bill})=>billDuePushCopy({language,name:bill.title,days:daysUntil(today,bill.due_date)}),send:sendPush}:null,
      email:process.env.RESEND_API_KEY&&process.env.RESEND_FROM?{send:emailReminder}:null});
    // A monthly list is independent of daily mailbox scans and the fixed T-3 reminder.
    const {data:profiles,error:summaryProfileError}=await admin.from('profiles').select('id,email,summary_frequency,summary_weekday,summary_month_day').neq('summary_frequency','off').limit(1000);
    if(summaryProfileError)throw summaryProfileError;
    // A blocchi (lib/summary-run.mjs): letture una volta per tipo di dato.
    await processSummaries(admin,profiles||[],{today,appUrl,counts,
      push:configuredPush()?{allowed:pref=>pushAllowed(pref,'digest'),copy:billSummaryPushCopy,send:sendPush}:null,
      email:process.env.RESEND_API_KEY&&process.env.RESEND_FROM?{send:emailSummary}:null});
    await processExtraAlerts(admin,today,counts,{sendPush,configuredPush});
    await processAutomations(admin,today,counts,{sendPush,configuredPush});
    await processV20Alerts(admin,today,counts,{sendPush,configuredPush});
    // Limit retention of recoverable deleted rows and household audit records.
    await admin.from('home_recycle_bin').delete().lt('deleted_at',new Date(Date.now()-30*86400000).toISOString());
    await admin.from('home_audit_log').delete().lt('created_at',new Date(Date.now()-365*86400000).toISOString());
    return json({ok:!counts.errors.length,date:today,reminder_window:reminderRange,...counts},counts.errors.length?207:200);
  } catch(e) {return json({error:'processingFailed',detail:String(e.message).slice(0,160),...counts},500);}
}

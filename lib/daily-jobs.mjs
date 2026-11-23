// Lavoro giornaliero (/api/cron): bollette delle utenze, promemoria, riepiloghi, avvisi e pulizia.
// Spostato qui da app/api/cron/route.js perché si possa provare dall'inizio alla fine
// (tests/promemoria-completi.test.mjs) con un giorno, un'ora e degli invii scelti dalla prova.
// La route controlla chi chiama e passa i valori veri; il comportamento è lo stesso di prima, più
// il rinvio delle push nell'orario silenzioso (lib/push-deferred.mjs).
import { addDaysISO, nextRecurringDue, todayRome } from './dates.mjs';
import { reminderWindow, daysUntil, firstRecurringFrom } from './reminder-window.mjs';
import { processBillReminders, readIn } from './reminder-run.mjs';
import { processSummaries } from './summary-run.mjs';
import { sendPush as realSendPush, configuredPush } from './push.mjs';
import { processExtraAlerts, pushAllowed } from './extra-alerts.mjs';
import { processAutomations } from './automation-alerts.mjs';
import { processV20Alerts } from './v20-alerts.mjs';
import { quietOnly, processDeferredPushes } from './push-deferred.mjs';
import { billDuePushCopy, billSummaryPushCopy } from './notification-push-copy.mjs';
import { emailReminder, emailSummary } from './reminder-email.mjs';

const emailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM);

// Chiamato una volta al giorno da Vercel Cron e da Supabase Cron: ogni invio è registrato per
// data (promemoria, notifiche, riepilogo), quindi una seconda chiamata nello stesso giorno non
// manda nulla due volte. Restituisce {status, body} per la risposta della route.
export async function runDailyJobs(admin, {
  today = todayRome(), now = new Date(), appUrl,
  push = { configured: configuredPush, send: realSendPush },
  email = { configured: emailConfigured, reminder: emailReminder, summary: emailSummary },
} = {}) {
  const horizon = addDaysISO(today, 45), reminderRange = reminderWindow(today);
  const pushOn = push.configured(), emailOn = email.configured(), sendPush = push.send;
  const counts = {recurring_created:0, notifications_created:0, emails_sent:0, summaries_created:0, summary_emails_sent:0, push_sent:0, summary_push_sent:0, deferred_push:0, errors:[]};
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
      push:pushOn?{allowed:pref=>pushAllowed(pref,'bill',now),quiet:pref=>quietOnly(pref,'bill',now),copy:({language,bill})=>billDuePushCopy({language,name:bill.title,days:daysUntil(today,bill.due_date)}),send:sendPush}:null,
      email:emailOn?{send:email.reminder}:null});
    // A monthly list is independent of daily mailbox scans and the fixed T-3 reminder.
    const {data:profiles,error:summaryProfileError}=await admin.from('profiles').select('id,email,summary_frequency,summary_weekday,summary_month_day').neq('summary_frequency','off').limit(1000);
    if(summaryProfileError)throw summaryProfileError;
    // A blocchi (lib/summary-run.mjs): letture una volta per tipo di dato.
    await processSummaries(admin,profiles||[],{today,appUrl,counts,
      push:pushOn?{allowed:pref=>pushAllowed(pref,'digest',now),quiet:pref=>quietOnly(pref,'digest',now),copy:billSummaryPushCopy,send:sendPush}:null,
      email:emailOn?{send:email.summary}:null});
    await processExtraAlerts(admin,today,counts,{sendPush,configuredPush:()=>pushOn,now});
    await processAutomations(admin,today,counts,{sendPush,configuredPush:()=>pushOn,now});
    await processV20Alerts(admin,today,counts,{sendPush,configuredPush:()=>pushOn,now});
    // Limit retention of recoverable deleted rows and household audit records.
    await admin.from('home_recycle_bin').delete().lt('deleted_at',new Date(now.getTime()-30*86400000).toISOString());
    await admin.from('home_audit_log').delete().lt('created_at',new Date(now.getTime()-365*86400000).toISOString());
    // Inviti già usati o scaduti: l'app non li mostra più e conservano un indirizzo email (v54).
    await admin.from('home_invites').delete().not('claimed_at','is',null);
    await admin.from('home_invites').delete().lt('expires_at',now.toISOString());
    return {status:counts.errors.length?207:200,body:{ok:!counts.errors.length,date:today,reminder_window:reminderRange,...counts}};
  } catch(e) { return {status:500,body:{error:'processingFailed',detail:String(e.message).slice(0,160),...counts}}; }
}

// Giro orario (/api/cron/push): le push rinviate dall'orario silenzioso.
export async function runDeferredPushes(admin, { today = todayRome(), now = new Date(), push = { configured: configuredPush, send: realSendPush } } = {}) {
  const counts = { deferred_push_sent: 0, deferred_expired: 0, errors: [] };
  if (!push.configured()) return { status: 200, body: { ok: true, skipped: 'push', ...counts } };
  await processDeferredPushes(admin, { today, now, send: push.send, counts });
  return { status: counts.errors.length ? 207 : 200, body: { ok: !counts.errors.length, date: today, ...counts } };
}

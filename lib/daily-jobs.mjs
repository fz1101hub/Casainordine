// Lavoro giornaliero (/api/cron): bollette delle utenze, promemoria, riepiloghi, avvisi e pulizia.
// Spostato qui da app/api/cron/route.js perché si possa provare dall'inizio alla fine
// (tests/promemoria-completi.test.mjs) con un giorno, un'ora e degli invii scelti dalla prova.
// La route controlla chi chiama e passa i valori veri; il comportamento è lo stesso di prima, più
// il rinvio delle push nell'orario silenzioso (lib/push-deferred.mjs).
import { addDaysISO, nextRecurringDue, todayRome } from './dates.mjs';
import { reminderWindow, daysUntil, firstRecurringFrom } from './reminder-window.mjs';
import { processBillReminders, readIn } from './reminder-run.mjs';
import { upsertMany, readAll } from './batch.mjs';
import { processSummaries } from './summary-run.mjs';
import { sendPush as realSendPush, configuredPush } from './push.mjs';
import { processExtraAlerts, pushAllowed } from './extra-alerts.mjs';
import { processAutomations } from './automation-alerts.mjs';
import { processGardenAlerts } from './garden-alerts.mjs';
import { processPetAlerts } from './pet-alerts.mjs';
import { processWeatherAlerts } from './weather-alerts.mjs';
import { processHealthStock, processVaccinePlan } from './health-reminders.mjs';
import { processDocumentAlerts } from './document-alerts.mjs';
import { processInstallmentAlerts } from './installment-alerts.mjs';
import { processV20Alerts } from './v20-alerts.mjs';
import { quietOnly, processDeferredPushes } from './push-deferred.mjs';
import { billDuePushCopy, billSummaryPushCopy } from './notification-push-copy.mjs';
import { emailReminder, emailSummary, sendReminderEmails, sendSummaryEmails } from './reminder-email.mjs';
import { runAccountCleanupJobs } from './account-deletion.mjs';

const emailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM);

// Chiamato una volta al giorno da Vercel Cron e da Supabase Cron: ogni invio è registrato per
// data (promemoria, notifiche, riepilogo), quindi una seconda chiamata nello stesso giorno non
// manda nulla due volte. Restituisce {status, body} per la risposta della route.
export async function runDailyJobs(admin, {
  today = todayRome(), now = new Date(), appUrl,
  push = { configured: configuredPush, send: realSendPush },
  email = { configured: emailConfigured, reminder: emailReminder, summary: emailSummary, reminderMany: sendReminderEmails, summaryMany: sendSummaryEmails },
} = {}) {
  const horizon = addDaysISO(today, 45), reminderRange = reminderWindow(today);
  const pushOn = push.configured(), emailOn = email.configured(), sendPush = push.send;
  const counts = {recurring_created:0, notifications_created:0, emails_sent:0, summaries_created:0, summary_emails_sent:0, push_sent:0, summary_push_sent:0, deferred_push:0, errors:[]};
  try {
    // Pagina tutte le utenze, non soltanto le prime 1000.
    const utilities = await readAll(admin, 'utilities', '*',
      q => q.eq('active',true).neq('frequency','none').lte('next_due_date',horizon).order('next_due_date').order('id'));
    // A blocchi: prima con molte utenze il lavoro faceva due richieste per bolletta stimata e una
    // per utenza (centinaia di richieste al primo giro). Ora le bollette stimate partono insieme e
    // le date si aggiornano con una richiesta per data. Se il blocco viene rifiutato (per esempio
    // un'utenza con dati sbagliati) si riprova utenza per utenza, così le altre vanno avanti.
    const plans = [];
    for (const u of utilities || []) {
      // Nessuna stima per scadenze già passate (utenza inserita con una prima data vecchia, o cron
      // fermo per giorni): si parte dalla prima scadenza da oggi in poi.
      let date = firstRecurringFrom(u.next_due_date,today,u.frequency,u.billing_day), n = 0;
      const rows = [];
      while (date && date <= horizon && n < 30) {
        // Existing manually imported invoices for the same provider/date can be reviewed by users.
        rows.push({
          user_id:u.user_id,home_id:u.home_id||null,utility_id:u.id,title:`${u.category} · ${u.supplier}`,
          supplier:u.supplier,category:u.category,amount:u.estimated_amount,due_date:date,
          source:'recurring',is_estimate:true
        });
        date = nextRecurringDue(date,u.frequency,u.billing_day);
        if (!date) break;
        n++;
      }
      plans.push({ u, rows, next: date && date !== u.next_due_date ? date : null });
    }
    const estimate = { onConflict:'utility_id,due_date', ignoreDuplicates:true };
    try { counts.recurring_created += (await upsertMany(admin,'bills',plans.flatMap(p=>p.rows),estimate,'id')).length; }
    catch {
      for (const plan of plans) {
        try { counts.recurring_created += (await upsertMany(admin,'bills',plan.rows,estimate,'id')).length; }
        catch (e) { counts.errors.push(`Utenza ${plan.u.id}: ${e.message}`); plan.next = null; }
      }
    }
    const moves = new Map();
    for (const plan of plans) if (plan.next) moves.set(plan.next, [...(moves.get(plan.next) || []), plan.u.id]);
    for (const [date, ids] of moves) for (let i = 0; i < ids.length; i += 100) {
      const {error} = await admin.from('utilities').update({next_due_date:date}).in('id',ids.slice(i,i+100));
      if (error) counts.errors.push(`Aggiornamento utenze al ${date} non riuscito`);
    }
    // Finestra da oggi a 3 giorni: se il cron salta un giorno, o la bolletta arriva con meno di
    // 3 giorni di anticipo, il promemoria parte lo stesso (una sola volta per bolletta).
    const bills = await readAll(admin, 'bills', 'id,user_id,home_id,title,supplier,amount,due_date',
      q => q.gte('due_date',reminderRange.from).lte('due_date',reminderRange.to).is('paid_at',null).order('due_date').order('id'));
    // I promemoria in app non si ripetono, ma le email e le push FALLITE vanno ritentate
    // anche se la bolletta era stata già ricordata nei giorni precedenti.
    const previous=await readIn(admin,'reminders','bill_id','bill_id',(bills||[]).map(b=>b.id),q=>q.neq('reminder_date',today));
    const alreadyReminded=new Set(previous.map(r=>r.bill_id));
    // L'in-app esclude alreadyReminded; i canali esterni consultano invece i propri log
    // di consegna e ritentano solo ciò che non era mai arrivato.
    await processBillReminders(admin,bills||[],{today,appUrl,counts,alreadyReminded,
      push:pushOn?{allowed:pref=>pushAllowed(pref,'bill',now),quiet:pref=>quietOnly(pref,'bill',now),copy:({language,bill})=>billDuePushCopy({language,name:bill.title,days:daysUntil(today,bill.due_date)}),send:sendPush}:null,
      email:emailOn?{send:email.reminder,sendMany:email.reminderMany}:null});
    // A monthly list is independent of daily mailbox scans and the fixed T-3 reminder.
    const profiles = await readAll(admin, 'profiles', 'id,email,summary_frequency,summary_weekday,summary_month_day',
      q => q.neq('summary_frequency','off').order('id'));
    // A blocchi (lib/summary-run.mjs): letture una volta per tipo di dato.
    await processSummaries(admin,profiles||[],{today,appUrl,counts,
      push:pushOn?{allowed:pref=>pushAllowed(pref,'digest',now),quiet:pref=>quietOnly(pref,'digest',now),copy:billSummaryPushCopy,send:sendPush}:null,
      email:emailOn?{send:email.summary,sendMany:email.summaryMany}:null});
    await processExtraAlerts(admin,today,counts,{sendPush,configuredPush:()=>pushOn,now});
    await processAutomations(admin,today,counts,{sendPush,configuredPush:()=>pushOn,now});
    await processGardenAlerts(admin,today,counts,{sendPush,configuredPush:()=>pushOn,now});
    await processPetAlerts(admin,today,counts,{sendPush,configuredPush:()=>pushOn,now});
    await processWeatherAlerts(admin,today,counts,{sendPush,configuredPush:()=>pushOn,now});
    await processHealthStock(admin,today,counts,{sendPush,configuredPush:()=>pushOn,now});
    await processVaccinePlan(admin,today,counts,{sendPush,configuredPush:()=>pushOn,now});
    await processDocumentAlerts(admin,today,counts,{sendPush,configuredPush:()=>pushOn,now});
    await processInstallmentAlerts(admin,today,counts,{sendPush,configuredPush:()=>pushOn,now});
    await processV20Alerts(admin,today,counts,{sendPush,configuredPush:()=>pushOn,now});
    // Limit retention of recoverable deleted rows and household audit records.
    await admin.from('home_recycle_bin').delete().lt('deleted_at',new Date(now.getTime()-30*86400000).toISOString());
    await admin.from('home_audit_log').delete().lt('created_at',new Date(now.getTime()-365*86400000).toISOString());
    // Inviti già usati o scaduti: l'app non li mostra più e conservano un indirizzo email (v54).
    await admin.from('home_invites').delete().not('claimed_at','is',null);
    await admin.from('home_invites').delete().lt('expires_at',now.toISOString());
    // Pulizia dei file di account eliminati: coda durevole, richiede verifica Auth=404.
    try {
      const accountCleanup = await runAccountCleanupJobs(admin);
      counts.account_cleanups = accountCleanup.cleaned;
      counts.errors.push(...accountCleanup.errors);
    } catch (error) { counts.errors.push(`Pulizia account: ${String(error?.message || error).slice(0, 120)}`); }
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

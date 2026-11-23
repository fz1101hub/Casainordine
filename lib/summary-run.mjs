// Riepilogo delle scadenze del mese (settimanale o mensile, scelto da ognuno), a blocchi.
// Prima il cron leggeva, per ogni persona, bollette personali, case, bollette delle case,
// preferenze, dispositivi e lingua: con molte persone rischiava di superare i 60 secondi.
// Ora legge tutto una volta per tipo di dato e scrive i riepiloghi in blocco. Restano una
// richiesta per ogni invio vero (push o email) e l'aggiornamento del suo esito.
// Comportamento invariato: un riepilogo per persona e giorno (bill_summaries è unico su utente e
// data), bollette non pagate da oggi a fine mese, personali e delle case di cui si è membri;
// push se permessa, email se c'è l'indirizzo; testi nella lingua di chi riceve.
import { readIn, upsertMany, byKey, groupBy, mapLimit, PUSH_PARALLEL } from './batch.mjs';
import { deferKey, deferPushes } from './push-deferred.mjs';
import { shouldSendSummary, monthEndISO, upcomingSummaryBills } from './summary-schedule.mjs';

const BILL_COLUMNS = 'id,user_id,home_id,title,supplier,amount,due_date,paid_at';

export async function processSummaries(admin, profiles, { today, appUrl, counts, push = null, email = null }) {
  const due = (profiles || []).filter(p => shouldSendSummary(p, today));
  if (!due.length) return;
  const fail = (what, e) => counts.errors.push(`${what}: ${String(e?.message || e).slice(0, 120)}`);
  const monthEnd = monthEndISO(today), ids = due.map(p => p.id);
  const open = q => q.is('paid_at', null).gte('due_date', today).lte('due_date', monthEnd);

  let personal, memberships, shared;
  try {
    personal = groupBy(await readIn(admin, 'bills', BILL_COLUMNS, 'user_id', ids, q => open(q.is('home_id', null))), 'user_id');
    memberships = groupBy(await readIn(admin, 'home_members', 'home_id,user_id', 'user_id', ids), 'user_id');
    const homeIds = [...new Set([...memberships.values()].flat().map(m => m.home_id))];
    shared = groupBy(await readIn(admin, 'bills', BILL_COLUMNS, 'home_id', homeIds, open), 'home_id');
  } catch (e) { fail('Riepiloghi: bollette', e); return; }

  const plans = [];
  for (const profile of due) {
    const homes = (memberships.get(profile.id) || []).map(m => m.home_id);
    const all = [...(personal.get(profile.id) || []), ...homes.flatMap(h => shared.get(h) || [])];
    const items = upcomingSummaryBills([...new Map(all.map(b => [b.id, b])).values()], today);
    if (!items.length) continue;
    plans.push({ profile, items, total: items.reduce((n, b) => n + Number(b.amount), 0) });
  }
  if (!plans.length) return;

  // Un riepilogo per persona e giorno: chi crea la riga lo manda (il secondo giro del cron no).
  let created;
  try {
    created = byKey(await upsertMany(admin, 'bill_summaries',
      plans.map(p => ({ user_id: p.profile.id, summary_date: today, bill_count: p.items.length, total_amount: p.total })),
      { onConflict: 'user_id,summary_date', ignoreDuplicates: true }, 'id,user_id'), 'user_id');
  } catch (e) { fail('Riepilogo', e); return; }
  const mine = plans.filter(p => created.has(p.profile.id));
  counts.summaries_created += mine.length;
  if (!mine.length || (!push && !email)) return;

  const users = mine.map(p => p.profile.id);
  let languages;
  try { languages = byKey(await readIn(admin, 'user_language_preferences', 'user_id,language', 'user_id', users), 'user_id'); }
  catch (e) { fail('Lingue dei riepiloghi', e); return; } // meglio nessun messaggio che uno nella lingua sbagliata
  const languageOf = id => languages.get(id)?.language || 'it';

  let preferences = new Map(), devices = new Map();
  if (push) {
    try {
      preferences = byKey(await readIn(admin, 'user_alert_preferences', '*', 'user_id', users), 'user_id');
      devices = groupBy(await readIn(admin, 'push_subscriptions', 'id,user_id,endpoint,p256dh,auth_secret', 'user_id', users), 'user_id');
    } catch (e) { fail('Push dei riepiloghi', e); push = null; }
  }

  const later = [], pushedIds = [];
  // Push: fino a PUSH_PARALLEL persone alla volta; email: a blocchi (email.sendMany), altrimenti una per una.
  await mapLimit(mine, PUSH_PARALLEL, async ({ profile, items, total }) => {
    const recap = created.get(profile.id);
    const pref = preferences.get(profile.id) || {};
    // Orario silenzioso: la push del riepilogo parte dopo (lib/push-deferred.mjs), non va persa.
    if (push && !push.allowed(pref) && push.quiet?.(pref) && (devices.get(profile.id) || []).length)
      later.push({ user_id: profile.id, dedupe_key: deferKey.summary(today), kind: 'digest', payload: push.copy({ language: languageOf(profile.id), count: items.length, total }) });
    if (push && push.allowed(pref)) {
      const copy = push.copy({ language: languageOf(profile.id), count: items.length, total });
      let sent = false;
      for (const device of (devices.get(profile.id) || []).slice(0, 10)) {
        try { await push.send(device, copy); counts.summary_push_sent++; sent = true; }
        catch (e) {
          if (e.statusCode === 404 || e.statusCode === 410) await admin.from('push_subscriptions').delete().eq('id', device.id).eq('user_id', profile.id);
          else fail(`Push riepilogo ${profile.id}`, e);
        }
      }
      if (sent) pushedIds.push(recap.id);
    }
  });
  const stamp = new Date().toISOString();
  for (let i = 0; i < pushedIds.length; i += 100) await admin.from('bill_summaries').update({ push_sent_at: stamp }).in('id', pushedIds.slice(i, i + 100));
  if (email) {
    const todo = mine.filter(p => p.profile.email);
    let outcomes;
    if (email.sendMany) {
      try { outcomes = await email.sendMany(todo.map(({ profile, items }) => ({ address: profile.email, bills: items, today, language: languageOf(profile.id), appUrl, userId: profile.id }))); }
      catch (e) { outcomes = todo.map(() => ({ error: String(e.message).slice(0, 150) })); }
    } else {
      outcomes = [];
      for (const { profile, items } of todo) {
        try { outcomes.push(await email.send(profile.email, items, today, languageOf(profile.id), appUrl, profile.id)); }
        catch (e) { outcomes.push({ error: String(e.message).slice(0, 150) }); }
      }
    }
    const sentIds = [];
    for (const [i, { profile }] of todo.entries()) {
      const recap = created.get(profile.id), result = outcomes[i];
      if (result?.sent) { sentIds.push(recap.id); counts.summary_emails_sent++; }
      else if (result?.error) {
        await admin.from('bill_summaries').update({ email_error: result.error }).eq('id', recap.id);
        counts.errors.push(`Email riepilogo ${profile.id} non riuscita`);
      }
    }
    for (let i = 0; i < sentIds.length; i += 100) await admin.from('bill_summaries').update({ email_sent_at: stamp, email_error: null }).in('id', sentIds.slice(i, i + 100));
  }
  try { counts.deferred_push = (counts.deferred_push || 0) + await deferPushes(admin, later, today); }
  catch (e) { fail('Push rinviate dei riepiloghi', e); }
}

// Promemoria delle bollette (3 giorni prima) a blocchi: S5 dell'audit dell'11 novembre, chiesto
// dall'utente il 23 novembre.
//
// Prima il cron faceva, per ogni bolletta e per ogni persona, letture separate (membri della casa,
// profilo, preferenze, lingua, dispositivi, registri): con qualche centinaio di bollette rischiava
// di superare i 60 secondi e di fermarsi a metà. Ora legge tutto all'inizio, una volta per tipo di
// dato (a gruppi di 100 id e pagine da 1000 righe), decide in memoria e scrive i registri in
// blocco. Restano una richiesta per ogni invio vero (push o email) e le scritture dei risultati.
//
// Il comportamento è lo stesso di prima:
// - promemoria nell'app a chi ha inserito la bolletta, se ha i promemoria accesi ed è ancora
//   nella casa; una riga per bolletta e giorno;
// - push a tutti i membri (o a chi l'ha inserita, se personale) con promemoria e push accesi;
//   una sola consegna riuscita per bolletta e persona; se nessun dispositivo la riceve, si
//   riprova al giro successivo;
// - email a proprietario ed editor (lib/reminder-recipients.mjs) che le vogliono; una sola per
//   bolletta e persona, registrata prima dell'invio;
// - testi nella lingua di chi riceve; se la lingua non si legge, niente invii (meglio nessun
//   messaggio che uno nella lingua sbagliata).
import { reminderEmailRecipients, wantsReminderEmail } from './reminder-recipients.mjs';

const ID_CHUNK = 100, PAGE = 1000;

// select ... where <column> in (values), a gruppi di id e a pagine.
export async function readIn(admin, table, columns, column, values, refine = q => q) {
  const ids = [...new Set((values || []).filter(Boolean))], rows = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const part = ids.slice(i, i + ID_CHUNK);
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await refine(admin.from(table).select(columns).in(column, part)).range(offset, offset + PAGE - 1);
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }
  }
  return rows;
}

// upsert in blocchi; con ignoreDuplicates restituisce solo le righe nuove.
async function upsertMany(admin, table, rows, options, columns) {
  const out = [];
  for (let i = 0; i < rows.length; i += 500) {
    let q = admin.from(table).upsert(rows.slice(i, i + 500), options);
    if (columns) q = q.select(columns);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...(data || []));
  }
  return out;
}

const pairKey = (billId, userId) => `${billId}:${userId}`;
const byKey = (rows, key) => { const map = new Map(); for (const r of rows) map.set(r[key], r); return map; };
const groupBy = (rows, key) => { const map = new Map(); for (const r of rows) { const list = map.get(r[key]) || []; list.push(r); map.set(r[key], list); } return map; };

export async function processBillReminders(admin, bills, { today, appUrl, counts, push = null, email = null }) {
  if (!bills?.length) return;
  const billIds = bills.map(b => b.id), homeIds = bills.map(b => b.home_id).filter(Boolean);
  const fail = (label, error) => counts.errors.push(`${label}: ${String(error?.message || error).slice(0, 120)}`);

  // 1. Letture, una per tipo di dato.
  let membersByHome;
  try { membersByHome = groupBy(await readIn(admin, 'home_members', 'home_id,user_id,role', 'home_id', homeIds), 'home_id'); }
  catch (e) { fail('Membri delle case', e); return; }
  const people = new Set(bills.map(b => b.user_id));
  for (const list of membersByHome.values()) for (const m of list) people.add(m.user_id);
  let profiles, languages = null;
  try { profiles = byKey(await readIn(admin, 'profiles', 'id,email,reminders_enabled,reminder_emails', 'id', [...people]), 'id'); }
  catch (e) { fail('Profili', e); return; }
  try { languages = byKey(await readIn(admin, 'user_language_preferences', 'user_id,language', 'user_id', [...people]), 'user_id'); }
  catch (e) { fail('Lingue', e); }
  const languageOf = userId => languages.get(userId)?.language || 'it';
  const membersOf = bill => membersByHome.get(bill.home_id) || [];

  // 2. Promemoria nell'app, per chi ha inserito la bolletta.
  const inApp = bills.filter(bill => profiles.get(bill.user_id)?.reminders_enabled
    && (!bill.home_id || membersOf(bill).some(m => m.user_id === bill.user_id)))
    .map(bill => ({ user_id: bill.user_id, bill_id: bill.id, reminder_date: today }));
  try {
    const created = await upsertMany(admin, 'reminders', inApp, { onConflict: 'bill_id,reminder_date', ignoreDuplicates: true }, 'id');
    counts.notifications_created += created.length;
  } catch (e) { fail('Promemoria', e); }

  // Senza le lingue niente push né email: meglio nessun messaggio che uno nella lingua sbagliata.
  if (!languages) return;

  // 3. Push.
  if (push) await pushReminders(admin, bills, { today, counts, push, profiles, languageOf, membersOf, people, fail });

  // 4. Email.
  if (email) await emailReminders(admin, bills, { today, appUrl, counts, email, profiles, languageOf, membersOf, fail, billIds });
}

async function pushReminders(admin, bills, { today, counts, push, profiles, languageOf, membersOf, people, fail }) {
  let preferences, devicesByUser, log;
  try {
    preferences = byKey(await readIn(admin, 'user_alert_preferences', '*', 'user_id', [...people]), 'user_id');
    devicesByUser = groupBy(await readIn(admin, 'push_subscriptions', 'id,user_id,endpoint,p256dh,auth_secret', 'user_id', [...people]), 'user_id');
    log = await readIn(admin, 'push_delivery_log', 'bill_id,user_id,reminder_date,sent_at', 'bill_id', bills.map(b => b.id));
  } catch (e) { fail('Dati delle push', e); return; }
  const deliveredBefore = new Set(log.filter(r => r.sent_at && r.reminder_date !== today).map(r => pairKey(r.bill_id, r.user_id)));
  const today_ = new Map(log.filter(r => r.reminder_date === today).map(r => [pairKey(r.bill_id, r.user_id), r]));
  const wanted = [];
  for (const bill of bills) {
    const recipients = bill.home_id ? [...new Set(membersOf(bill).map(m => m.user_id))] : [bill.user_id];
    for (const userId of recipients) {
      if (!profiles.get(userId)?.reminders_enabled) continue;
      if (!push.allowed(preferences.get(userId) || {})) continue;
      const devices = (devicesByUser.get(userId) || []).slice(0, 10);
      if (!devices.length || deliveredBefore.has(pairKey(bill.id, userId))) continue;
      const existing = today_.get(pairKey(bill.id, userId));
      if (existing?.sent_at) continue;
      wanted.push({ bill, userId, devices, existing: !!existing });
    }
  }
  // Le righe nuove si scrivono in blocco prima dell'invio: chi le crea manda la push. Una riga di
  // oggi già presente ma senza consegna si riprova, come prima.
  let mine;
  try {
    const created = await upsertMany(admin, 'push_delivery_log', wanted.filter(w => !w.existing).map(w => ({ bill_id: w.bill.id, user_id: w.userId, reminder_date: today })),
      { onConflict: 'bill_id,user_id,reminder_date', ignoreDuplicates: true }, 'bill_id,user_id');
    mine = new Set(created.map(r => pairKey(r.bill_id, r.user_id)));
  } catch (e) { fail('Log push', e); return; }
  const results = [], gone = new Set();
  for (const w of wanted) {
    if (!w.existing && !mine.has(pairKey(w.bill.id, w.userId))) continue;
    const copy = push.copy({ language: languageOf(w.userId), bill: w.bill });
    let successful = false;
    for (const device of w.devices) {
      if (gone.has(device.id)) continue;
      try { await push.send(device, copy); counts.push_sent++; successful = true; }
      catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) {
          gone.add(device.id);
          await admin.from('push_subscriptions').delete().eq('id', device.id).eq('user_id', w.userId);
        } else fail(`Push ${w.bill.id}`, e);
      }
    }
    results.push({ bill_id: w.bill.id, user_id: w.userId, reminder_date: today, sent_at: successful ? new Date().toISOString() : null, error: successful ? null : 'Consegna non riuscita' });
  }
  try { await upsertMany(admin, 'push_delivery_log', results, { onConflict: 'bill_id,user_id,reminder_date' }); }
  catch (e) { fail('Esito push', e); }
}

async function emailReminders(admin, bills, { today, appUrl, counts, email, profiles, languageOf, membersOf, fail, billIds }) {
  let sentBefore;
  try { sentBefore = new Set((await readIn(admin, 'reminder_email_log', 'bill_id,user_id', 'bill_id', billIds)).map(r => pairKey(r.bill_id, r.user_id))); }
  catch (e) { fail('Log email', e); return; }
  const wanted = [];
  for (const bill of bills) for (const userId of reminderEmailRecipients(bill, membersOf(bill))) {
    const profile = profiles.get(userId);
    if (!wantsReminderEmail(profile) || sentBefore.has(pairKey(bill.id, userId))) continue;
    wanted.push({ bill, userId, address: profile.email });
  }
  let mine;
  try {
    const created = await upsertMany(admin, 'reminder_email_log', wanted.map(w => ({ bill_id: w.bill.id, user_id: w.userId, reminder_date: today })),
      { onConflict: 'bill_id,user_id', ignoreDuplicates: true }, 'bill_id,user_id');
    mine = new Set(created.map(r => pairKey(r.bill_id, r.user_id)));
  } catch (e) { fail('Log email', e); return; }
  const results = [];
  for (const w of wanted) {
    if (!mine.has(pairKey(w.bill.id, w.userId))) continue; // già presa dall'altro giro del cron
    try {
      const res = await email.send(w.address, w.bill, languageOf(w.userId), appUrl);
      if (res?.sent) { counts.emails_sent++; results.push({ bill_id: w.bill.id, user_id: w.userId, reminder_date: today, sent_at: new Date().toISOString(), error: null }); }
    } catch (e) {
      results.push({ bill_id: w.bill.id, user_id: w.userId, reminder_date: today, sent_at: null, error: String(e.message).slice(0, 150) });
      counts.errors.push(`Invio email ${w.bill.id} non riuscito`);
    }
  }
  try { await upsertMany(admin, 'reminder_email_log', results, { onConflict: 'bill_id,user_id' }); }
  catch (e) { fail('Esito email', e); }
}

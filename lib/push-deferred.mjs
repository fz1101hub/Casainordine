// Notifiche rinviate dall'orario silenzioso («Non disturbare dalle … alle …», ora di Roma).
//
// Prima: il lavoro giornaliero (/api/cron, alle 08:00–08:07 in inverno e alle 09:00–09:07 in
// estate) saltava la push di chi era nell'orario silenzioso, e non la mandava più: i promemoria
// delle bollette si riprovano solo nello stesso giorno, i riepiloghi e gli avvisi solo la prima
// volta. Chi aveva un orario come 22:00–08:30 non riceveva mai una notifica sul telefono.
// Ora la push si mette da parte (tabella push_deferred, solo server) e parte dopo la fine
// dell'orario silenzioso, con il giro orario di /api/cron/push (Supabase Cron). Le voci valgono
// per il giorno in cui sono nate: il testo dice «scade tra 3 giorni», il giorno dopo sarebbe falso.
import { readIn, readAll, upsertMany, byKey, groupBy, mapLimit, PUSH_PARALLEL } from './batch.mjs';
import { quietTimeRome, pushKindAllowed } from './push-preferences.mjs';

// Chiavi: una voce per persona e cosa da avvisare, così due giri del cron non la raddoppiano.
export const deferKey = {
  bill: (billId, date) => `bill:${billId}:${date}`,
  summary: date => `summary:${date}`,
  alert: row => `alert:${row.kind}:${row.reference_id}:${row.event_date}`,
};

// Da chiamare quando la push non parte: true se il motivo è solo l'orario silenzioso (allora la
// voce va rinviata); false se quel tipo di notifica è spento (allora niente, come prima).
export const quietOnly = (preferences, kind, now) => pushKindAllowed(preferences, kind) && quietTimeRome(preferences, now);

// Mette da parte le push; una voce già presente resta com'è.
export async function deferPushes(admin, rows, today) {
  if (!rows.length) return 0;
  const clean = rows.map(r => ({ user_id: r.user_id, dedupe_key: r.dedupe_key, kind: r.kind, payload: r.payload, created_on: today }));
  return (await upsertMany(admin, 'push_deferred', clean, { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true }, 'user_id')).length;
}

// Una push partita senza rinvio toglie la voce rinviata uguale (per esempio: alle 08:00 c'era
// l'orario silenzioso, alle 08:07 non più).
export async function clearDeferred(admin, userId, key) {
  await admin.from('push_deferred').delete().eq('user_id', userId).eq('dedupe_key', key);
}

// Giro orario: manda le push rinviate di chi non è più nell'orario silenzioso.
export async function processDeferredPushes(admin, { today, now = new Date(), send, counts }) {
  const fail = (what, e) => counts.errors.push(`${what}: ${String(e?.message || e).slice(0, 120)}`);
  let rows;
  try { rows = await readAll(admin, 'push_deferred', 'user_id,dedupe_key,kind,payload,created_on'); }
  catch (e) { fail('Push rinviate', e); return; }
  const remove = async row => {
    const { error } = await admin.from('push_deferred').delete().eq('user_id', row.user_id).eq('dedupe_key', row.dedupe_key);
    if (error) fail('Push rinviate: cancellazione', error);
  };
  // Voci di un giorno passato: il testo non è più vero.
  for (const row of rows.filter(r => r.created_on < today)) { await remove(row); counts.deferred_expired++; }
  const fresh = rows.filter(r => r.created_on >= today);
  if (!fresh.length) return;
  const users = [...new Set(fresh.map(r => r.user_id))];
  let preferences, devices;
  try {
    preferences = byKey(await readIn(admin, 'user_alert_preferences', '*', 'user_id', users), 'user_id');
    devices = groupBy(await readIn(admin, 'push_subscriptions', 'id,user_id,endpoint,p256dh,auth_secret', 'user_id', users), 'user_id');
  } catch (e) { fail('Push rinviate: preferenze', e); return; }
  const gone = new Set();
  // Fino a PUSH_PARALLEL voci alla volta.
  await mapLimit(fresh, PUSH_PARALLEL, async row => {
    const pref = preferences.get(row.user_id) || {};
    // Tipo di notifica spento nel frattempo, o nessun dispositivo: la voce non serve più.
    const mine = (devices.get(row.user_id) || []).filter(d => !gone.has(d.id)).slice(0, 10);
    if (!pushKindAllowed(pref, row.kind) || !mine.length) { await remove(row); return; }
    if (quietTimeRome(pref, now)) return; // ancora nell'orario silenzioso: al prossimo giro
    let sent = false;
    for (const device of mine) {
      try { await send(device, row.payload); counts.deferred_push_sent++; sent = true; }
      catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) {
          gone.add(device.id);
          await admin.from('push_subscriptions').delete().eq('id', device.id).eq('user_id', row.user_id);
        } else fail(`Push rinviata ${row.kind}`, e);
      }
    }
    // Nessuna consegna per un errore del servizio: si riprova al prossimo giro (entro la giornata).
    if (!sent && (devices.get(row.user_id) || []).some(d => !gone.has(d.id))) return;
    if (sent) await markDelivered(admin, row, fail);
    await remove(row);
  });
}

// I registri delle push dicono che la notifica è arrivata: un altro giro del cron non la rimanda.
async function markDelivered(admin, row, fail) {
  const [type, id, date] = row.dedupe_key.split(':');
  const at = new Date().toISOString();
  if (type === 'bill') {
    const { error } = await admin.from('push_delivery_log').upsert({ bill_id: id, user_id: row.user_id, reminder_date: date, sent_at: at, error: null }, { onConflict: 'bill_id,user_id,reminder_date' });
    if (error) fail('Push rinviate: registro', error);
  } else if (type === 'summary') {
    const { error } = await admin.from('bill_summaries').update({ push_sent_at: at }).eq('user_id', row.user_id).eq('summary_date', id);
    if (error) fail('Push rinviate: riepilogo', error);
  }
}

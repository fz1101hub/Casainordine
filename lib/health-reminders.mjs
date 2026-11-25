// Promemoria della salute (lib/health.mjs). Ogni 5 minuti (/api/cron/health, pg_cron):
// - le dosi arrivate all'orario negli ultimi 30 minuti diventano righe «in attesa» di health_doses
//   (una per terapia e orario: se la dose è già segnata presa o saltata non parte niente) e avvisi
//   «health» a chi segue la persona, o a tutti i membri della casa;
// - i promemoria delle visite (il giorno prima alle 18, la mattina alle 8, un'ora prima) si segnano
//   in health_reminders_sent, una volta sola, e diventano avvisi.
// Le push partono anche nell'orario silenzioso: sono promemoria chiesti per quell'ora. Il nome del
// farmaco o della visita c'è solo per chi ha acceso health_push_details.
// Ogni giorno (lavoro giornaliero) le confezioni delle Scorte che finiscono entro 5 giorni.
import { romeParts, hhmm, dueDoses, dueAppointmentReminders, stockEstimates, addDays, HEALTH_LIMITS } from './health.mjs';
import { deliverAlerts } from './extra-alerts.mjs';
import { readAll, readIn, upsertMany, byKey } from './batch.mjs';
import { translate, normalizeLanguage, formatDate } from './i18n.mjs';
import { sendPush as realSendPush, configuredPush } from './push.mjs';

const SKIP = new Set(['42P01', 'PGRST205', '42703', 'PGRST204']); // migrate_v60 non ancora eseguita
const clean = value => String(value ?? '').replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁩﻿]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120).trim();
const fail = (counts, what, error) => counts.errors.push(`${what}: ${String(error?.message || error).slice(0, 110)}`);

export function doseAlertCopy(source, language = 'it', details = false) {
  const lang = normalizeLanguage(language), person = clean(source?.person), name = clean(source?.name), dose = clean(source?.dose);
  const time = hhmm(source?.time);
  if (!person || !/^\d{2}:\d{2}$/.test(time)) throw new TypeError('Invalid dose alert');
  return { title: translate(lang, 'server.health.doseTitle', { person }),
    body: details && name ? translate(lang, 'server.health.doseBody', { time, name, dose: dose ? ` (${dose})` : '' }) : translate(lang, 'server.health.doseBodyPrivate', { time }) };
}

export function appointmentAlertCopy(source, language = 'it', details = false) {
  const lang = normalizeLanguage(language), person = clean(source?.person), title = clean(source?.title), place = clean(source?.place);
  if (!person || !['day_before', 'same_morning', 'hour_before'].includes(source?.code)) throw new TypeError('Invalid appointment alert');
  const time = source.time ? hhmm(source.time) : '';
  const what = details && title ? `${title}${place ? ` (${place})` : ''}` : translate(lang, 'server.health.kind.' + (source.kind || 'other'));
  const at = time ? translate(lang, 'server.health.at', { time }) : '';
  const key = { day_before: 'server.health.dayBefore', same_morning: 'server.health.sameMorning', hour_before: 'server.health.hourBefore' }[source.code];
  return { title: translate(lang, 'server.health.appointmentTitle', { person }), body: translate(lang, key, { at, time, what }) };
}

export function stockAlertCopy(source, language = 'it', details = false) {
  const lang = normalizeLanguage(language), name = clean(source?.name);
  if (typeof source?.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(source.date)) throw new TypeError('Invalid stock alert');
  const date = formatDate(source.date, lang);
  return { title: details && name ? translate(lang, 'server.health.stockTitle', { name }) : translate(lang, 'server.health.stockTitlePrivate'),
    body: translate(lang, 'server.health.stockBody', { count: Math.max(0, Number(source.days) || 0), date }) };
}

// Chi riceve gli avvisi di una persona (chi l'ha scritta, o i membri della casa) e chi vuole i dettagli.
async function detailsFor(admin, people) {
  const homes = [...new Set(people.map(p => p.home_id).filter(Boolean))];
  const members = homes.length ? await readIn(admin, 'home_members', 'home_id,user_id', 'home_id', homes) : [];
  const users = [...new Set([...people.map(p => p.user_id), ...members.map(m => m.user_id)])];
  const prefs = users.length ? await readIn(admin, 'user_alert_preferences', 'user_id,health_push_details', 'user_id', users) : [];
  return new Set(prefs.filter(p => p.health_push_details === true).map(p => p.user_id));
}

export async function processHealthReminders(admin, now, counts, options = {}) {
  const today = romeParts(now).date;
  let therapies, appointments;
  try {
    therapies = (await readAll(admin, 'health_therapies', 'id,person_id,name,dose,times,every_days,weekdays,start_on,end_on,remind',
      q => q.eq('remind', true).lte('start_on', today).order('id'))).filter(t => !t.end_on || t.end_on >= addDays(today, -1));
    appointments = await readAll(admin, 'health_appointments', 'id,person_id,kind,title,on_date,at_time,place,reminders,done_on',
      q => q.is('done_on', null).gte('on_date', today).lte('on_date', addDays(today, 1)).order('id'));
  } catch (error) { if (!SKIP.has(error?.code)) fail(counts, 'Salute', error); return; }
  const doses = dueDoses(therapies, now);
  const visits = dueAppointmentReminders(appointments, now);
  if (!doses.length && !visits.length) return;
  let people, details;
  try {
    people = byKey(await readIn(admin, 'health_people', 'id,user_id,home_id,name', 'id', [...new Set([...doses.map(d => d.therapy.person_id), ...visits.map(v => v.appointment.person_id)])]), 'id');
    details = await detailsFor(admin, [...people.values()]);
  } catch (error) { fail(counts, 'Salute (persone)', error); return; }
  const entries = [];
  // Dosi: si scrivono «in attesa»; solo quelle nuove (non già segnate) fanno partire l'avviso.
  if (doses.length) {
    let inserted = [];
    try { inserted = await upsertMany(admin, 'health_doses', doses.map(d => ({ therapy_id: d.therapy.id, due_at: d.due_at, status: 'pending' })), { onConflict: 'therapy_id,due_at', ignoreDuplicates: true }, 'id,therapy_id,due_at'); }
    catch (error) { fail(counts, 'Salute (dosi)', error); }
    for (const row of inserted) {
      const dose = doses.find(d => d.therapy.id === row.therapy_id && Date.parse(d.due_at) === Date.parse(row.due_at));
      const person = dose && people.get(dose.therapy.person_id);
      if (!person) continue;
      entries.push({ item: { user_id: person.user_id, home_id: person.home_id }, event: { kind: 'health', reference_id: row.id, event_date: romeParts(row.due_at).date },
        copy: (language, userId) => doseAlertCopy({ person: person.name, name: dose.therapy.name, dose: dose.therapy.dose, time: dose.time }, language, details.has(userId)) });
    }
  }
  if (visits.length) {
    let inserted = [];
    try { inserted = await upsertMany(admin, 'health_reminders_sent', visits.map(v => ({ appointment_id: v.appointment.id, code: v.code, due_at: v.due_at })), { onConflict: 'appointment_id,code,due_at', ignoreDuplicates: true }, 'id,appointment_id,code,due_at'); }
    catch (error) { fail(counts, 'Salute (visite)', error); }
    for (const row of inserted) {
      const visit = visits.find(v => v.appointment.id === row.appointment_id && v.code === row.code);
      const person = visit && people.get(visit.appointment.person_id);
      if (!person) continue;
      const a = visit.appointment;
      entries.push({ item: { user_id: person.user_id, home_id: person.home_id }, event: { kind: 'health', reference_id: row.id, event_date: romeParts(row.due_at).date },
        copy: (language, userId) => appointmentAlertCopy({ person: person.name, code: row.code, kind: a.kind, title: a.title, place: a.place, time: a.at_time }, language, details.has(userId)) });
    }
  }
  counts.health_reminders = entries.length;
  if (entries.length) await deliverAlerts(admin, entries, counts, { today, label: 'salute', ignoreQuiet: true, now, ...options });
}

// Lavoro giornaliero: medicine delle Scorte che finiscono entro 5 giorni (un avviso per confezione e data).
export async function processHealthStock(admin, today, counts, options = {}) {
  let therapies;
  try { therapies = await readAll(admin, 'health_therapies', 'id,person_id,name,times,every_days,weekdays,start_on,end_on,stock_item_id,stock_use', q => q.not('stock_item_id', 'is', null).lte('start_on', today).order('id')); }
  catch (error) { if (!SKIP.has(error?.code)) fail(counts, 'Salute (scorte)', error); return; }
  therapies = therapies.filter(t => !t.end_on || t.end_on >= today);
  if (!therapies.length) return;
  let stock, people, details;
  try {
    stock = await readIn(admin, 'home_stock_items', 'id,name,quantity', 'id', [...new Set(therapies.map(t => t.stock_item_id))]);
    people = byKey(await readIn(admin, 'health_people', 'id,user_id,home_id,name', 'id', [...new Set(therapies.map(t => t.person_id))]), 'id');
    details = await detailsFor(admin, [...people.values()]);
  } catch (error) { fail(counts, 'Salute (scorte)', error); return; }
  const entries = [];
  for (const estimate of stockEstimates(therapies, stock, today).values()) {
    if (!estimate.low) continue;
    const person = people.get(therapies.find(t => t.stock_item_id === estimate.item.id)?.person_id);
    if (!person) continue;
    entries.push({ item: { user_id: person.user_id, home_id: person.home_id }, event: { kind: 'health', reference_id: estimate.item.id, event_date: estimate.runs_out_on },
      copy: (language, userId) => stockAlertCopy({ name: estimate.item.name, days: estimate.days, date: estimate.runs_out_on }, language, details.has(userId)) });
  }
  counts.health_stock = entries.length;
  if (entries.length) await deliverAlerts(admin, entries, counts, { today, label: 'salute (scorte)', ...options });
}

// Il giro ogni 5 minuti (app/api/cron/health).
export async function runHealthReminders(admin, { now = new Date(), push = { configured: configuredPush, send: realSendPush } } = {}) {
  const counts = { errors: [] };
  await processHealthReminders(admin, now, counts, { sendPush: push.send, configuredPush: () => push.configured() });
  return { status: counts.errors.length ? 207 : 200, body: { ok: !counts.errors.length, at: now.toISOString(), ...counts } };
}
export { HEALTH_LIMITS };

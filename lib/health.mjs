// Salute: medicine, terapie e visite per sé o per altri (richiesta dell'utente del 25 novembre
// 2026, sera), con il promemoria all'ora della terapia e il giorno della visita o vaccinazione.
// Orari sempre nell'ora di Roma, anche al cambio dell'ora legale. Usato dal browser (app/Health.jsx),
// dal giro dei promemoria (lib/health-reminders.mjs) e dal calendario. Niente dizionari qui.
import { addDaysISO as addDays } from './dates.mjs';

export { addDays };
export const RELATIONS = Object.freeze(['self', 'partner', 'child', 'parent', 'other']);
export const THERAPY_KINDS = Object.freeze(['medicine', 'supplement', 'therapy', 'other']);
export const APPOINTMENT_KINDS = Object.freeze(['visit', 'vaccine', 'exam', 'prescription', 'therapy', 'other']);
export const REMINDER_CODES = Object.freeze(['day_before', 'same_morning', 'hour_before']);
export const REMINDER_TIMES = Object.freeze({ day_before: '18:00', same_morning: '08:00' });
export const HEALTH_LIMITS = Object.freeze({ name: 80, therapyName: 120, dose: 120, instructions: 300, notes: 1000, title: 120, place: 120,
  times: 12, maxEvery: 90, peoplePerSpace: 30, therapiesPerPerson: 50, appointmentsPerPerson: 500, maxRepeat: 120, maxStockUse: 1000,
  windowMinutes: 30, lowDays: 5, upcomingDays: 60 });
export const EVERY_CHOICES = Object.freeze([1, 2, 3, 7, 14, 28, 30]);
export const REPEAT_CHOICES = Object.freeze([0, 1, 3, 6, 12, 24, 36, 60, 120]);

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const validDate = value => ISO.test(value || '') && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
const text = (value, max) => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
const daysBetween = (from, to) => Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000);
// «08:00:00» del database → «08:00».
export const hhmm = value => String(value ?? '').slice(0, 5);

// ===== Ora di Roma =====
const ROME = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export function romeParts(instant) {
  const p = Object.fromEntries(ROME.formatToParts(new Date(instant)).filter(x => x.type !== 'literal').map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}
// Giorno e ora di Roma → istante. Un'ora che non esiste (cambio dell'ora a marzo) va all'ora dopo.
export function romeInstant(dateISO, time) {
  const [y, m, d] = dateISO.split('-').map(Number), [hh, mm] = hhmm(time).split(':').map(Number);
  const wanted = Date.UTC(y, m - 1, d, hh, mm);
  for (const offset of [60, 120]) {
    const candidate = wanted - offset * 60000;
    const back = romeParts(candidate);
    if (back.date === dateISO && back.time === hhmm(time)) return new Date(candidate);
  }
  return new Date(wanted - 60 * 60000);
}
const isoWeekday = dateISO => { const d = new Date(dateISO + 'T12:00:00Z').getUTCDay(); return d === 0 ? 7 : d; };

// ===== Controlli dei dati =====
export function normalizePerson(input = {}, today = null) {
  const name = text(input.name, HEALTH_LIMITS.name);
  if (!name) return { error: 'health.error.name' };
  const birth_on = input.birth_on ? String(input.birth_on) : null;
  if (birth_on && (!validDate(birth_on) || (today && birth_on > today))) return { error: 'health.error.birth' };
  return { value: { name, relation: RELATIONS.includes(input.relation) ? input.relation : 'other', birth_on, notes: text(input.notes, HEALTH_LIMITS.notes) } };
}

export function normalizeTimes(list = []) {
  const times = [...new Set((Array.isArray(list) ? list : String(list).split(',')).map(t => hhmm(String(t).trim())).filter(t => HHMM.test(t)))].sort();
  return times.slice(0, HEALTH_LIMITS.times);
}

export function normalizeTherapy(input = {}) {
  const name = text(input.name, HEALTH_LIMITS.therapyName);
  if (name.length < 2) return { error: 'health.error.therapyName' };
  const times = normalizeTimes(input.times);
  if (!times.length) return { error: 'health.error.times' };
  const start_on = String(input.start_on || '');
  if (!validDate(start_on)) return { error: 'health.error.date' };
  const end_on = input.end_on ? String(input.end_on) : null;
  if (end_on && (!validDate(end_on) || end_on < start_on)) return { error: 'health.error.end' };
  const weekdays = Array.isArray(input.weekdays) && input.weekdays.length ? [...new Set(input.weekdays.map(Number))].filter(n => n >= 1 && n <= 7).sort((a, b) => a - b) : null;
  if (Array.isArray(input.weekdays) && input.weekdays.length && !weekdays.length) return { error: 'health.error.weekdays' };
  const every = Number(input.every_days ?? 1);
  if (!Number.isInteger(every) || every < 1 || every > HEALTH_LIMITS.maxEvery) return { error: 'health.error.every' };
  const stock_item_id = input.stock_item_id || null;
  const use = input.stock_use === '' || input.stock_use === null || input.stock_use === undefined ? null : Number(input.stock_use);
  if (stock_item_id && use !== null && !(Number.isFinite(use) && use > 0 && use <= HEALTH_LIMITS.maxStockUse)) return { error: 'health.error.stockUse' };
  return { value: { kind: THERAPY_KINDS.includes(input.kind) ? input.kind : 'medicine', name, dose: text(input.dose, HEALTH_LIMITS.dose),
    instructions: text(input.instructions, HEALTH_LIMITS.instructions), times, every_days: weekdays ? 1 : every, weekdays,
    start_on, end_on, remind: input.remind !== false, stock_item_id, stock_use: stock_item_id && use !== null ? Math.round(use * 100) / 100 : null,
    notes: text(input.notes, HEALTH_LIMITS.notes) } };
}

export function normalizeAppointment(input = {}) {
  const title = text(input.title, HEALTH_LIMITS.title);
  if (title.length < 2) return { error: 'health.error.title' };
  const on_date = String(input.on_date || '');
  if (!validDate(on_date)) return { error: 'health.error.date' };
  const at_time = input.at_time ? hhmm(input.at_time) : null;
  if (at_time && !HHMM.test(at_time)) return { error: 'health.error.time' };
  const reminders = [...new Set((input.reminders || []).filter(r => REMINDER_CODES.includes(r)))].filter(r => r !== 'hour_before' || at_time);
  const repeat = Number(input.repeat_months ?? 0);
  if (!Number.isInteger(repeat) || repeat < 0 || repeat > HEALTH_LIMITS.maxRepeat) return { error: 'health.error.repeat' };
  const done_on = input.done_on ? String(input.done_on) : null;
  if (done_on && !validDate(done_on)) return { error: 'health.error.date' };
  const schedule_key = input.schedule_key && /^[a-z0-9_]{2,40}$/.test(input.schedule_key) ? input.schedule_key : null;
  return { value: { kind: APPOINTMENT_KINDS.includes(input.kind) ? input.kind : 'visit', title, on_date, at_time, place: text(input.place, HEALTH_LIMITS.place),
    notes: text(input.notes, HEALTH_LIMITS.notes), reminders: REMINDER_CODES.filter(r => reminders.includes(r)), repeat_months: repeat, done_on, schedule_key } };
}

// ===== Terapie: in quali giorni e a che ora =====
export function therapyOnDate(therapy, dateISO) {
  if (!validDate(dateISO) || !validDate(therapy?.start_on) || dateISO < therapy.start_on) return false;
  if (therapy.end_on && dateISO > therapy.end_on) return false;
  if (Array.isArray(therapy.weekdays) && therapy.weekdays.length) return therapy.weekdays.map(Number).includes(isoWeekday(dateISO));
  return daysBetween(therapy.start_on, dateISO) % (Number(therapy.every_days) || 1) === 0;
}

// Le dosi di un giorno, in ordine di ora: { therapy, time, due_at (istante ISO) }.
export function dosesOnDate(therapies = [], dateISO) {
  const out = [];
  for (const therapy of therapies) {
    if (!therapyOnDate(therapy, dateISO)) continue;
    for (const time of normalizeTimes(therapy.times)) out.push({ therapy, time, due_at: romeInstant(dateISO, time).toISOString() });
  }
  return out.sort((a, b) => a.due_at.localeCompare(b.due_at) || String(a.therapy.name).localeCompare(String(b.therapy.name)));
}

// Stato di una dose: quella registrata (presa, saltata, in attesa) o «da prendere»/«passata».
export function doseState(dose, doses = [], now = new Date()) {
  const found = doses.find(d => d.therapy_id === dose.therapy.id && Date.parse(d.due_at) === Date.parse(dose.due_at));
  if (found?.status === 'taken' || found?.status === 'skipped') return { state: found.status, row: found };
  return { state: Date.parse(dose.due_at) <= new Date(now).getTime() ? 'due' : 'later', row: found || null };
}

// Promemoria delle dosi arrivate all'orario negli ultimi minuti (il giro gira ogni 5 minuti; la
// finestra di 30 minuti copre un giro saltato). Si guarda anche ieri per la mezzanotte.
export function dueDoses(therapies = [], now = new Date(), windowMinutes = HEALTH_LIMITS.windowMinutes) {
  const end = new Date(now).getTime(), start = end - windowMinutes * 60000;
  const today = romeParts(now).date;
  return [...dosesOnDate(therapies, addDays(today, -1)), ...dosesOnDate(therapies, today)]
    .filter(d => d.therapy.remind !== false && Date.parse(d.due_at) > start && Date.parse(d.due_at) <= end);
}

// Media delle dosi al giorno (per la scorta): orari × giorni della settimana / 7, oppure ÷ ogni quanti giorni.
export function dosesPerDay(therapy) {
  const times = normalizeTimes(therapy.times).length;
  if (Array.isArray(therapy.weekdays) && therapy.weekdays.length) return (times * therapy.weekdays.length) / 7;
  return times / (Number(therapy.every_days) || 1);
}

// Quanti giorni dura ancora la confezione delle Scorte: tutte le terapie che la usano.
export function stockEstimates(therapies = [], stock = [], today) {
  const perItem = new Map();
  for (const t of therapies) {
    if (!t.stock_item_id || !(Number(t.stock_use) > 0) || (t.end_on && t.end_on < today)) continue;
    perItem.set(t.stock_item_id, (perItem.get(t.stock_item_id) || 0) + Number(t.stock_use) * dosesPerDay(t));
  }
  const out = new Map();
  for (const item of stock) {
    const daily = perItem.get(item.id);
    if (!daily) continue;
    const days = Math.floor(Number(item.quantity) / daily + 1e-9);
    out.set(item.id, { item, daily: Math.round(daily * 100) / 100, days, runs_out_on: addDays(today, days), low: days <= HEALTH_LIMITS.lowDays });
  }
  return out;
}

// ===== Visite e vaccinazioni =====
// Istanti dei promemoria scelti: il giorno prima alle 18, la mattina stessa alle 8, un'ora prima.
export function reminderInstants(appointment) {
  const out = [];
  if (!validDate(appointment?.on_date)) return out;
  const at = appointment.at_time ? romeInstant(appointment.on_date, appointment.at_time) : null;
  for (const code of appointment.reminders || []) {
    let when = null;
    if (code === 'day_before') when = romeInstant(addDays(appointment.on_date, -1), REMINDER_TIMES.day_before);
    else if (code === 'same_morning') when = romeInstant(appointment.on_date, REMINDER_TIMES.same_morning);
    else if (code === 'hour_before' && at) when = new Date(at.getTime() - 3600000);
    // La mattina stessa dopo l'ora della visita non serve più.
    if (when && (!at || when < at)) out.push({ code, due_at: when.toISOString() });
  }
  return out;
}

export function dueAppointmentReminders(appointments = [], now = new Date(), windowMinutes = HEALTH_LIMITS.windowMinutes) {
  const end = new Date(now).getTime(), start = end - windowMinutes * 60000;
  return appointments.filter(a => !a.done_on).flatMap(a => reminderInstants(a).filter(r => Date.parse(r.due_at) > start && Date.parse(r.due_at) <= end).map(r => ({ appointment: a, ...r })));
}

// Prossimi appuntamenti non fatti (anche quelli passati da poco e non segnati), in ordine.
export function upcomingAppointments(appointments = [], today, days = HEALTH_LIMITS.upcomingDays) {
  const from = addDays(today, -7), to = addDays(today, days);
  return appointments.filter(a => !a.done_on && a.on_date >= from && a.on_date <= to)
    .sort((a, b) => a.on_date.localeCompare(b.on_date) || hhmm(a.at_time || '99:99').localeCompare(hhmm(b.at_time || '99:99')));
}

// Ripetizione: stessa data dopo N mesi (il 31 diventa l'ultimo giorno del mese, se serve).
export function addMonths(dateISO, months) {
  const [y, m, d] = dateISO.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

// Eventi del calendario del telefono: gli appuntamenti non fatti, da una settimana fa a un anno.
export function healthCalendarEvents(people = [], appointments = [], today, { days = 365, max = 1000 } = {}) {
  const byId = new Map(people.map(p => [p.id, p]));
  const from = addDays(today, -7), to = addDays(today, days);
  return appointments.filter(a => !a.done_on && byId.has(a.person_id) && a.on_date >= from && a.on_date <= to)
    .map(a => ({ uid: `health-${a.id}`, date: a.on_date, time: a.at_time ? hhmm(a.at_time) : null, kind: a.kind, title: a.title, place: a.place || '', person: byId.get(a.person_id).name }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.uid.localeCompare(b.uid)).slice(0, max);
}

// ===== Calendario vaccinale dei bambini =====
// Tappe del Calendario nazionale vaccinale (PNPV 2023-2025, prorogato senza modifiche per il 2026):
// le 10 vaccinazioni obbligatorie (legge 119/2017, da 0 a 16 anni: esavalente, MPRV e richiami) e,
// se si sceglie, le raccomandate più comuni. «from» è il giorno dal quale si fa (giorni o mesi
// compiuti dalla nascita), «until» quello entro cui di solito si completa. Le date esatte le dà la
// convocazione della ASL o il pediatra (alcune regioni anticipano: la schermata lo dice).
const V = (key, from, until, mandatory = true) => Object.freeze({ key, from, until, mandatory });
export const VACCINE_SCHEDULE = Object.freeze([
  V('hexa_1', { days: 60 }, { months: 3 }), V('pcv_1', { days: 60 }, { months: 3 }, false),
  V('hexa_2', { months: 4 }, { months: 5 }), V('pcv_2', { months: 4 }, { months: 5 }, false),
  V('hexa_3', { months: 10 }, { months: 13 }), V('pcv_3', { months: 10 }, { months: 13 }, false),
  V('mprv_1', { months: 12 }, { months: 15 }), V('menacwy_1', { months: 12 }, { months: 15 }, false),
  V('dtpa_ipv_5', { months: 60 }, { months: 72 }), V('mprv_2', { months: 60 }, { months: 72 }),
  V('hpv', { months: 132 }, { months: 144 }, false),
  V('dtpa_ipv_teen', { months: 144 }, { months: 204 }),
]);
export const VACCINE_PLANS = Object.freeze(['off', 'mandatory', 'all']);
export const VACCINE_NOTICE_DAYS = 14;
const offset = (birth, o) => (o.days !== undefined ? addDays(birth, o.days) : addMonths(birth, o.months));

// Tappe di un bambino con lo stato: done (fatta), booked (prenotata), late (oltre il termine),
// due (si può fare ora), soon (entro due settimane), later (più avanti).
export function vaccinePlan(person, appointments = [], today, plan = person?.vaccine_plan) {
  if (!validDate(person?.birth_on) || !['mandatory', 'all'].includes(plan)) return [];
  const byKey = new Map(appointments.filter(a => a.person_id === person.id && a.schedule_key).map(a => [a.schedule_key, a]));
  return VACCINE_SCHEDULE.filter(v => v.mandatory || plan === 'all').map(v => {
    const from = offset(person.birth_on, v.from), until = offset(person.birth_on, v.until), appointment = byKey.get(v.key) || null;
    let state = 'later';
    if (appointment?.done_on) state = 'done';
    else if (appointment) state = 'booked';
    else if (today > until) state = 'late';
    else if (today >= from) state = 'due';
    else if (addDays(today, VACCINE_NOTICE_DAYS) >= from) state = 'soon';
    return { ...v, from, until, appointment, state };
  });
}

// Avvisi del lavoro giornaliero: le tappe che cominciano entro due settimane (o sono cominciate da
// poco) e non sono né prenotate né fatte, una notizia per bambino e data.
export function vaccineNotices(people = [], appointments = [], today) {
  const out = [];
  for (const person of people) {
    const groups = new Map();
    for (const item of vaccinePlan(person, appointments, today)) {
      if (!['soon', 'due'].includes(item.state) || addDays(item.from, VACCINE_NOTICE_DAYS) < today) continue;
      if (!groups.has(item.from)) groups.set(item.from, []);
      groups.get(item.from).push(item);
    }
    for (const [from, items] of groups) out.push({ person, from, items });
  }
  return out;
}

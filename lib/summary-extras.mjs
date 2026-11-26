// Altre scadenze nel riepilogo (scelta dell'utente del 26 novembre 2026, mattina): oltre alle
// bollette, rate da pagare, documenti da rinnovare, visite e controlli da prenotare, cure degli
// animali. Si leggono una volta per tipo di dato per tutte le persone del giro (come le bollette in
// lib/summary-run.mjs), personali e delle case di cui si è membri. Senza una tabella (migrazione non
// ancora eseguita) quella parte manca e basta.
// Salute: nomi di visite, vaccini e controlli solo per chi ha acceso i dettagli
// (user_alert_preferences.health_push_details), come negli avvisi; altrimenti il tipo e il numero.
import { readIn } from './batch.mjs';
import { addDaysISO } from './dates.mjs';
import { monthEndISO } from './summary-schedule.mjs';
import { documentAgenda } from './family-documents.mjs';
import { vaccinePlan, checkupPlan, screeningPlan } from './health.mjs';
import { petAgenda } from './pets.mjs';
import { taxAgenda } from './tax-calendar.mjs';
import { translate, normalizeLanguage, formatDate, formatMoney } from './i18n.mjs';

const SKIP = new Set(['42P01', 'PGRST205']);
export const SUMMARY_EXTRAS = Object.freeze({ lateDays: 30, weekDays: 7, maxRows: 8 });
export const EXTRA_SECTIONS = Object.freeze(['installments', 'documents', 'health', 'pets', 'taxes']);

// Fino a fine mese, come le bollette, ma almeno una settimana avanti (negli ultimi giorni del mese).
export function extrasHorizon(today) {
  const end = monthEndISO(today), week = addDaysISO(today, SUMMARY_EXTRAS.weekDays);
  return end > week ? end : week;
}
const empty = () => ({ installments: [], documents: [], visits: [], toBook: [], pets: [], taxes: [], details: false });
export function summaryExtraCount(extra) {
  if (!extra) return 0;
  return extra.installments.length + extra.documents.length + extra.visits.length + extra.toBook.length + extra.pets.length + (extra.taxes?.length || 0);
}

// Righe personali (home_id nullo) delle persone del giro e righe delle loro case.
async function scoped(admin, table, columns, ids, homeIds, refine = q => q) {
  try {
    const own = await readIn(admin, table, columns, 'user_id', ids, q => refine(q.is('home_id', null)));
    const shared = homeIds.length ? await readIn(admin, table, columns, 'home_id', homeIds, refine) : [];
    return [...own, ...shared];
  } catch (error) {
    if (SKIP.has(error?.code)) return [];
    throw error;
  }
}
async function children(admin, table, columns, column, ids, refine) {
  if (!ids.length) return [];
  try { return await readIn(admin, table, columns, column, ids, refine); }
  catch (error) { if (SKIP.has(error?.code)) return []; throw error; }
}

// memberships: Map utente → [{ home_id }] (già letta da processSummaries).
export async function loadSummaryExtras(admin, { ids, memberships, today }) {
  const out = new Map((ids || []).map(id => [id, empty()]));
  if (!out.size) return out;
  const homeUsers = new Map();
  for (const id of ids) for (const m of memberships.get(id) || []) homeUsers.set(m.home_id, [...(homeUsers.get(m.home_id) || []), id]);
  const homeIds = [...homeUsers.keys()];
  const ownersOf = row => (row.home_id ? homeUsers.get(row.home_id) || [] : out.has(row.user_id) ? [row.user_id] : []);
  const horizon = extrasHorizon(today), late = addDaysISO(today, -SUMMARY_EXTRAS.lateDays);

  // Rate non pagate: in ritardo (fino a un mese) e fino all'orizzonte.
  const plans = await scoped(admin, 'payment_plans', 'id,user_id,home_id,title,ended_on', ids, homeIds, q => q.is('ended_on', null));
  const planById = new Map(plans.map(p => [p.id, p]));
  const installments = await children(admin, 'payment_installments', 'id,plan_id,label,due_on,amount_cents', 'plan_id', [...planById.keys()],
    q => q.is('paid_on', null).gte('due_on', late).lte('due_on', horizon));
  for (const r of installments.sort((a, b) => a.due_on.localeCompare(b.due_on))) {
    const plan = planById.get(r.plan_id);
    for (const user of ownersOf(plan)) out.get(user).installments.push({ plan: plan.title, label: r.label, date: r.due_on, cents: r.amount_cents ?? null, late: r.due_on < today });
  }

  // Documenti scaduti o nel periodo di preavviso.
  const docs = await scoped(admin, 'family_documents', 'id,user_id,home_id,holder,kind,label,expires_on,notice_days', ids, homeIds,
    q => q.not('expires_on', 'is', null).lte('expires_on', addDaysISO(today, 366)));
  for (const a of documentAgenda(docs, today)) {
    if (a.state !== 'expired' && a.state !== 'renew') continue;
    for (const user of ownersOf(a.doc)) out.get(user).documents.push({ holder: a.doc.holder, kind: a.doc.kind, label: a.doc.label || '', date: a.doc.expires_on, expired: a.state === 'expired' });
  }

  // Salute: visite prenotate fino all'orizzonte; vaccini, bilanci e screening da prenotare.
  const people = await scoped(admin, 'health_people', 'id,user_id,home_id,name,birth_on,vaccine_plan,checkup_plan,screening_plan,sex', ids, homeIds);
  if (people.length) {
    const personById = new Map(people.map(p => [p.id, p]));
    const personIds = [...personById.keys()];
    const visits = await children(admin, 'health_appointments', 'id,person_id,kind,title,on_date,at_time', 'person_id', personIds,
      q => q.is('done_on', null).gte('on_date', today).lte('on_date', horizon));
    for (const v of visits.sort((a, b) => a.on_date.localeCompare(b.on_date) || String(a.at_time || '').localeCompare(String(b.at_time || '')))) {
      const person = personById.get(v.person_id);
      for (const user of ownersOf(person)) out.get(user).visits.push({ person: person.name, kind: v.kind || 'other', title: v.title, date: v.on_date, time: v.at_time ? String(v.at_time).slice(0, 5) : '' });
    }
    const planned = people.filter(p => p.birth_on && ((p.vaccine_plan && p.vaccine_plan !== 'off') || p.checkup_plan === true || p.screening_plan === true));
    if (planned.length) {
      const steps = await children(admin, 'health_appointments', 'id,person_id,schedule_key,on_date,done_on', 'person_id', planned.map(p => p.id),
        q => q.not('schedule_key', 'is', null));
      for (const person of planned) {
        const keys = [...vaccinePlan(person, steps, today), ...checkupPlan(person, steps, today)].filter(s => s.state === 'due' || s.state === 'soon').map(s => s.key)
          .concat(screeningPlan(person, steps, today).filter(s => s.state === 'due').map(s => `scr:${s.key}`));
        if (keys.length) for (const user of ownersOf(person)) out.get(user).toBook.push({ person: person.name, keys });
      }
    }
  }

  // Cure degli animali della settimana (e quelle in ritardo).
  const pets = await scoped(admin, 'home_pets', 'id,user_id,home_id,name,ended_on', ids, homeIds, q => q.is('ended_on', null));
  if (pets.length) {
    const petById = new Map(pets.map(p => [p.id, p]));
    const tasks = await children(admin, 'home_pet_tasks', 'id,pet_id,title,next_on', 'pet_id', [...petById.keys()],
      q => q.not('next_on', 'is', null).lte('next_on', addDaysISO(today, SUMMARY_EXTRAS.weekDays)));
    for (const { task, state } of petAgenda(tasks, today, SUMMARY_EXTRAS.weekDays)) {
      const pet = petById.get(task.pet_id);
      for (const user of ownersOf(pet)) out.get(user).pets.push({ pet: pet.name, title: task.title, date: task.next_on, late: state === 'late' });
    }
  }

  // Scadenze fiscali seguite (migrate_v67) fino all'orizzonte, non ancora fatte.
  const taxes = await scoped(admin, 'tax_calendar_settings', 'id,user_id,home_id,groups,remind_days,done', ids, homeIds);
  for (const row of taxes) {
    for (const a of taxAgenda(row, today)) {
      if (a.done || a.date < today || a.date > horizon) continue;
      for (const user of ownersOf(row)) out.get(user).taxes.push({ key: a.key, year: a.year, date: a.date });
    }
  }

  // Preferenza per i dettagli della salute.
  try {
    const prefs = await readIn(admin, 'user_alert_preferences', 'user_id,health_push_details', 'user_id', ids);
    for (const p of prefs) if (p.health_push_details === true && out.has(p.user_id)) out.get(p.user_id).details = true;
  } catch (error) { if (!SKIP.has(error?.code)) throw error; }
  return out;
}

// Testi per l'email: sezioni con titolo e righe, al massimo maxRows righe per sezione.
const stepName = (lang, key) => {
  if (key.startsWith('scr:')) return translate(lang, 'health.screening.' + key.slice(4));
  if (/^bds_\d+$/.test(key)) return translate(lang, 'health.checkup', { number: Number(key.slice(4)) });
  return translate(lang, 'health.vaccine.' + key);
};
export function summaryExtrasCopy({ language = 'it', extra }) {
  const lang = normalizeLanguage(language);
  if (!extra) return [];
  const t = (key, params) => translate(lang, 'server.summary.' + key, params);
  const date = iso => formatDate(iso, lang);
  const limit = rows => (rows.length > SUMMARY_EXTRAS.maxRows ? [...rows.slice(0, SUMMARY_EXTRAS.maxRows), t('more', { count: rows.length - SUMMARY_EXTRAS.maxRows })] : rows);
  const sections = [];
  if (extra.installments.length) sections.push({ id: 'installments', heading: t('installments'), rows: limit(extra.installments.map(i =>
    t(i.late ? 'installmentLate' : 'installmentRow', { plan: i.plan, label: i.label, date: date(i.date), amount: i.cents ? formatMoney(i.cents / 100, lang) : t('noAmount') }))) });
  if (extra.documents.length) sections.push({ id: 'documents', heading: t('documents'), rows: limit(extra.documents.map(d =>
    t(d.expired ? 'documentExpired' : 'documentRenew', { what: d.label || translate(lang, 'iddocs.kind.' + d.kind), holder: d.holder, date: date(d.date) }))) });
  const health = [
    ...extra.visits.map(v => (extra.details
      ? t('visitRow', { person: v.person, what: v.title, date: date(v.date), time: v.time ? ` ${v.time}` : '' })
      : t('visitRow', { person: v.person, what: translate(lang, 'server.health.kind.' + v.kind), date: date(v.date), time: v.time ? ` ${v.time}` : '' }))),
    ...extra.toBook.map(b => (extra.details
      ? t('toBookRow', { person: b.person, names: b.keys.map(k => stepName(lang, k)).join(', ') })
      : t('toBookPrivate', { person: b.person, count: b.keys.length }))),
  ];
  if (health.length) sections.push({ id: 'health', heading: t('health'), rows: limit(health) });
  if (extra.pets.length) sections.push({ id: 'pets', heading: t('pets'), rows: limit(extra.pets.map(p =>
    t(p.late ? 'petLate' : 'petRow', { pet: p.pet, what: p.title, date: date(p.date) }))) });
  if (extra.taxes?.length) sections.push({ id: 'taxes', heading: t('taxes'), rows: limit(extra.taxes.map(x =>
    t('taxRow', { what: translate(lang, 'taxes.cal.deadline.' + x.key, { year: x.year }), date: date(x.date) }))) });
  return sections;
}

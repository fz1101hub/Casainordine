'use client';
// Salute: medicine, terapie e visite per sé o per altri (richiesta dell'utente del 25 novembre 2026,
// sera), con il promemoria all'ora della terapia e il giorno della visita o vaccinazione.
// «Oggi»: le dosi del giorno con presa e saltata; prossimi appuntamenti con «Fatto» (e il prossimo,
// se si ripete); medicine delle Scorte che finiscono. Per ogni persona: terapie e appuntamenti.
// I promemoria li manda /api/cron/health ogni 5 minuti (lib/health-reminders.mjs).
// Dal 26 novembre 2026: scheda d'emergenza da stampare (HealthCard.jsx), spese sanitarie che vanno
// nel 730 (HealthExpenses.jsx) e bilanci di salute del pediatra accanto al calendario vaccinale.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { HeartPulse, Pill, Stethoscope, Plus, Pencil, Trash2, Info, Check, X, Undo2, UserPlus, ShoppingBasket, BellRing, CalendarClock, Syringe, Printer, Receipt, ClipboardCheck } from 'lucide-react';
import { useLanguage, useSection } from './LanguageProvider';
import { askConfirm } from './ConfirmDialog';
import { friendlyError } from '../lib/friendly-error.mjs';
import { todayRome } from '../lib/dates.mjs';
import { selectAll, selectIn } from '../lib/select-all.mjs';
import { titleKey } from '../lib/stock.mjs';
import DecimalInput from './DecimalInput';
import HealthCards from './HealthCard';
import HealthExpenses, { blankExpense } from './HealthExpenses';
import {
  RELATIONS, THERAPY_KINDS, APPOINTMENT_KINDS, REMINDER_CODES, HEALTH_LIMITS, EVERY_CHOICES, REPEAT_CHOICES, normalizePerson, normalizeTherapy, normalizeAppointment,
  dosesOnDate, doseState, stockEstimates, upcomingAppointments, addMonths, addDays, hhmm, romeInstant, vaccinePlan, VACCINE_PLANS, checkupPlan, BLOOD_TYPES,
} from '../lib/health.mjs';

const MISSING_TABLE = new Set(['42P01', 'PGRST205', 'PGRST202']);
const uid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
const WEEK = [1, 2, 3, 4, 5, 6, 7];
const blankPerson = () => ({ id: null, name: '', relation: 'self', birth_on: '', notes: '', blood_type: '', allergies: '', conditions: '', doctor_name: '', doctor_phone: '', emergency_name: '', emergency_phone: '' });
// Tappe dei calendari: «bds_N» sono i bilanci di salute, le altre i vaccini.
const isCheckup = key => /^bds_\d+$/.test(key || '');
const blankTherapy = (personId, today) => ({ id: null, personId, kind: 'medicine', name: '', dose: '', instructions: '', times: ['08:00'], every_days: 1, weekdays: [], useWeekdays: false, start_on: today, end_on: '', remind: true, stock_item_id: '', stock_use: '', notes: '' });
const blankAppointment = (personId, today) => ({ id: null, personId, kind: 'visit', title: '', on_date: addDays(today, 7), at_time: '', place: '', notes: '', reminders: ['day_before'], repeat_months: 0, schedule_key: null });

function Field({ label, children }) { return <label className="extra-field">{label}{children}</label>; }

function HealthSection({ client, demo, user, homeId, canWrite, onNotify = () => {} }) {
  const { t: tr, locale, date } = useLanguage();
  const [people, setPeople] = useState([]), [therapies, setTherapies] = useState([]), [appointments, setAppointments] = useState([]), [doses, setDoses] = useState([]);
  const [stock, setStock] = useState([]), [shopping, setShopping] = useState([]), [details, setDetails] = useState(false), [prefsRow, setPrefsRow] = useState(null);
  const [loading, setLoading] = useState(!demo), [missing, setMissing] = useState(false), [working, setWorking] = useState(false);
  const [selected, setSelected] = useState(null), [personForm, setPersonForm] = useState(null), [therapyForm, setTherapyForm] = useState(null), [appointmentForm, setAppointmentForm] = useState(null), [showDone, setShowDone] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [doneForm, setDoneForm] = useState(null);
  const [expenses, setExpenses] = useState([]), [taxLinks, setTaxLinks] = useState(() => new Map()), [expenseForm, setExpenseForm] = useState(null), [cardFor, setCardFor] = useState(null);
  const today = todayRome(now);
  const writable = demo || canWrite;
  const day = iso => (iso ? date(iso, { weekday: 'short', day: 'numeric', month: 'short' }) : '—');
  const number = value => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(Number(value) || 0);
  const weekdayName = useCallback(n => new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 10, 22 + n))), [locale]);
  const scope = useCallback(query => (homeId ? query.eq('home_id', homeId) : query.eq('user_id', user?.id).is('home_id', null)), [homeId, user?.id]);
  // L'ora passa: «Da prendere» diventa vera all'orario senza ricaricare.
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(timer); }, []);

  const load = useCallback(async () => {
    if (demo || !client || !user?.id) { setLoading(false); return; }
    setLoading(true);
    const list = await selectAll(count => scope(client.from('health_people').select('*', count ? { count: 'exact' } : undefined)).order('name').order('id'));
    if (list.error) { setLoading(false); if (MISSING_TABLE.has(list.error.code)) setMissing(true); else onNotify(friendlyError(list.error, tr)); return; }
    const ids = (list.data || []).map(p => p.id);
    const [plan, visits, items, list2, prefs, spent, links] = await Promise.all([
      selectIn((part, count) => client.from('health_therapies').select('*', count ? { count: 'exact' } : undefined).in('person_id', part).order('person_id').order('id'), ids),
      selectIn((part, count) => client.from('health_appointments').select('*', count ? { count: 'exact' } : undefined).in('person_id', part).order('on_date').order('id'), ids),
      scope(client.from('home_stock_items').select('id,name,unit,quantity,threshold,usual_buy')).order('name').limit(300),
      homeId ? client.from('home_shopping').select('title').eq('home_id', homeId).eq('checked', false).limit(300) : { data: [] },
      client.from('user_alert_preferences').select('user_id,health_push_details').eq('user_id', user.id).maybeSingle(),
      selectIn((part, count) => client.from('health_expenses').select('*', count ? { count: 'exact' } : undefined).in('person_id', part).order('spent_on', { ascending: false }).order('id'), ids),
      selectAll(count => scope(client.from('home_tax_items').select('id,source_id', count ? { count: 'exact' } : undefined)).eq('source', 'health_expense').order('id')),
    ]);
    const failed = plan.error || visits.error;
    if (failed) { setLoading(false); onNotify(friendlyError(failed, tr)); return; }
    const therapyIds = (plan.data || []).map(t => t.id);
    const recent = therapyIds.length ? await selectIn((part, count) => client.from('health_doses').select('*', count ? { count: 'exact' } : undefined).in('therapy_id', part).gte('due_at', romeInstant(addDays(todayRome(), -7), '00:00').toISOString()).order('due_at').order('id'), therapyIds) : { data: [] };
    setLoading(false);
    setMissing(false); setPeople(list.data || []); setTherapies(plan.data || []); setAppointments(visits.data || []); setDoses(recent.data || []);
    setStock(items.error ? [] : items.data || []); setShopping(list2.error ? [] : (list2.data || []).map(r => r.title));
    setExpenses(spent.error ? [] : spent.data || []); setTaxLinks(new Map(links.error ? [] : (links.data || []).map(l => [l.source_id, l.id])));
    if (!prefs.error) { setPrefsRow(prefs.data || null); setDetails(prefs.data?.health_push_details === true); }
    setSelected(s => (s && (list.data || []).some(p => p.id === s) ? s : (list.data || [])[0]?.id || null));
  }, [client, demo, scope, user?.id]);
  useEffect(() => { setPeople([]); setTherapies([]); setAppointments([]); setDoses([]); setExpenses([]); setTaxLinks(new Map()); setPersonForm(null); setTherapyForm(null); setAppointmentForm(null); setExpenseForm(null); setCardFor(null); load(); }, [load]);

  const peopleById = useMemo(() => new Map(people.map(p => [p.id, p])), [people]);
  const stockById = useMemo(() => new Map(stock.map(s => [s.id, s])), [stock]);
  const todayDoses = useMemo(() => dosesOnDate(therapies.filter(t => peopleById.has(t.person_id)), today), [therapies, peopleById, today]);
  const upcoming = useMemo(() => upcomingAppointments(appointments, today), [appointments, today]);
  const lowStock = useMemo(() => [...stockEstimates(therapies, stock, today).values()].filter(e => e.low), [therapies, stock, today]);
  const person = selected ? peopleById.get(selected) : null;
  const personTherapies = useMemo(() => therapies.filter(t => t.person_id === selected).sort((a, b) => a.name.localeCompare(b.name, locale)), [therapies, selected, locale]);
  const personAppointments = useMemo(() => appointments.filter(a => a.person_id === selected), [appointments, selected]);
  const vaccines = useMemo(() => (person ? vaccinePlan(person, appointments, today) : []), [person, appointments, today]);
  const checkups = useMemo(() => (person ? checkupPlan(person, appointments, today) : []), [person, appointments, today]);
  // Calendario vaccinale: per i figli e per chi ha meno di 17 anni.
  const young = p => p && (p.relation === 'child' || (p.birth_on && p.birth_on > addDays(today, -17 * 366)));

  const timeText = list => list.map(hhmm).join(', ');
  const scheduleText = t => {
    const when = Array.isArray(t.weekdays) && t.weekdays.length ? t.weekdays.map(weekdayName).join(', ')
      : Number(t.every_days) === 1 ? tr('health.everyDay') : tr('health.everyDays', { days: Number(t.every_days) });
    const span = t.end_on ? tr('health.fromTo', { from: day(t.start_on), to: day(t.end_on) }) : tr('health.from', { from: day(t.start_on) });
    return `${when} · ${timeText(t.times)} · ${span}`;
  };
  const appointmentWhen = a => `${day(a.on_date)}${a.at_time ? ' · ' + hhmm(a.at_time) : ''}`;
  const kindLabel = a => tr('health.appointmentKind.' + a.kind);

  // ===== Persone =====
  async function savePerson(event) {
    event.preventDefault();
    const result = normalizePerson(personForm, today);
    if (result.error) { onNotify(tr(result.error)); return; }
    if (!personForm.id && people.length >= HEALTH_LIMITS.peoplePerSpace) { onNotify(tr('health.error.peopleLimit')); return; }
    setWorking(true);
    try {
      if (personForm.id) {
        if (!demo) { const { error } = await client.from('health_people').update(result.value).eq('id', personForm.id); if (error) { onNotify(friendlyError(error, tr)); return; } }
        setPeople(list => list.map(p => (p.id === personForm.id ? { ...p, ...result.value } : p)));
        onNotify(tr('health.personUpdated'));
      } else {
        let made;
        if (demo) made = { ...result.value, id: uid(), home_id: homeId || null };
        else {
          const { data, error } = await client.from('health_people').insert({ ...result.value, user_id: user.id, home_id: homeId || null }).select('*').single();
          if (error) { onNotify(friendlyError(error, tr)); return; }
          made = data;
        }
        setPeople(list => [...list, made]); setSelected(made.id);
        onNotify(tr('health.personSaved', { name: made.name }));
      }
      setPersonForm(null);
    } finally { setWorking(false); }
  }

  async function deletePerson(p) {
    if (!(await askConfirm(tr('health.personDeleteConfirm', { name: p.name }), { danger: true }))) return;
    if (!demo) { const { error } = await client.from('health_people').delete().eq('id', p.id); if (error) { onNotify(friendlyError(error, tr)); return; } }
    const gone = new Set(therapies.filter(t => t.person_id === p.id).map(t => t.id));
    setPeople(list => list.filter(x => x.id !== p.id)); setTherapies(list => list.filter(t => t.person_id !== p.id));
    setAppointments(list => list.filter(a => a.person_id !== p.id)); setDoses(list => list.filter(d => !gone.has(d.therapy_id)));
    const spentGone = new Set(expenses.filter(e => e.person_id === p.id).map(e => e.id));
    setExpenses(list => list.filter(e => e.person_id !== p.id)); setTaxLinks(map => new Map([...map].filter(([id]) => !spentGone.has(id))));
    setSelected(people.find(x => x.id !== p.id)?.id || null);
    onNotify(tr('health.personDeleted'));
  }

  // ===== Terapie =====
  async function saveTherapy(event) {
    event.preventDefault();
    const { id, personId, useWeekdays, ...input } = therapyForm;
    const result = normalizeTherapy({ ...input, weekdays: useWeekdays ? input.weekdays : [] });
    if (result.error) { onNotify(tr(result.error)); return; }
    if (!id && personTherapies.length >= HEALTH_LIMITS.therapiesPerPerson) { onNotify(tr('health.error.therapyLimit')); return; }
    setWorking(true);
    try {
      if (id) {
        if (!demo) { const { error } = await client.from('health_therapies').update(result.value).eq('id', id); if (error) { onNotify(friendlyError(error, tr)); return; } }
        setTherapies(list => list.map(t => (t.id === id ? { ...t, ...result.value } : t)));
        onNotify(tr('health.therapyUpdated'));
      } else {
        let made;
        if (demo) made = { ...result.value, id: uid(), person_id: personId };
        else {
          const { data, error } = await client.from('health_therapies').insert({ ...result.value, person_id: personId }).select('*').single();
          if (error) { onNotify(friendlyError(error, tr)); return; }
          made = data;
        }
        setTherapies(list => [...list, made]);
        onNotify(tr(made.remind ? 'health.therapySavedRemind' : 'health.therapySaved', { times: timeText(made.times) }));
      }
      setTherapyForm(null);
    } finally { setWorking(false); }
  }

  async function deleteTherapy(t) {
    if (!(await askConfirm(tr('health.therapyDeleteConfirm', { name: t.name }), { danger: true }))) return;
    if (!demo) { const { error } = await client.from('health_therapies').delete().eq('id', t.id); if (error) { onNotify(friendlyError(error, tr)); return; } }
    setTherapies(list => list.filter(x => x.id !== t.id)); setDoses(list => list.filter(d => d.therapy_id !== t.id));
    onNotify(tr('health.therapyDeleted'));
  }

  // Presa o saltata: la dose «in attesa» scritta dal promemoria si aggiorna; se non c'è si crea.
  async function markDose(dose, status) {
    const { row } = doseState(dose, doses, now);
    const patch = { status, done_at: status === 'pending' ? null : new Date().toISOString() };
    let saved;
    if (demo) saved = { ...(row || { id: uid(), therapy_id: dose.therapy.id, due_at: dose.due_at }), ...patch };
    else if (row) {
      const { data, error } = await client.from('health_doses').update(patch).eq('id', row.id).select('*').single();
      if (error) { onNotify(friendlyError(error, tr)); return; }
      saved = data;
    } else {
      const { data, error } = await client.from('health_doses').insert({ therapy_id: dose.therapy.id, due_at: dose.due_at, ...patch }).select('*').single();
      if (error) { onNotify(friendlyError(error, tr)); await load(); return; }
      saved = data;
    }
    setDoses(list => [...list.filter(d => d.id !== saved.id && !(d.therapy_id === saved.therapy_id && Date.parse(d.due_at) === Date.parse(saved.due_at))), saved]);
    // Confezione delle Scorte: una dose presa la scala, annullare la rimette.
    const item = dose.therapy.stock_item_id ? stockById.get(dose.therapy.stock_item_id) : null;
    const use = Number(dose.therapy.stock_use) || 0;
    const delta = item && use ? (status === 'taken' ? -use : row?.status === 'taken' ? use : 0) : 0;
    const messages = [tr(status === 'taken' ? 'health.doseTaken' : status === 'skipped' ? 'health.doseSkipped' : 'health.doseUndone', { name: dose.therapy.name, time: dose.time })];
    if (delta) {
      let quantity = Math.max(0, Math.round((Number(item.quantity) + delta) * 100) / 100);
      if (!demo) { const { data, error } = await client.rpc('v46_adjust_stock', { p_item: item.id, p_delta: delta }); if (error) messages.push(friendlyError(error, tr)); else quantity = Number(data); }
      setStock(list => list.map(s => (s.id === item.id ? { ...s, quantity } : s)));
      if (delta < 0) messages.push(tr('health.stockLeft', { name: item.name, amount: number(quantity) }));
    }
    onNotify(messages.join(' '));
  }

  // ===== Appuntamenti =====
  async function saveAppointment(event) {
    event.preventDefault();
    const { id, personId, ...input } = appointmentForm;
    const result = normalizeAppointment(input);
    if (result.error) { onNotify(tr(result.error)); return; }
    if (!id && personAppointments.length >= HEALTH_LIMITS.appointmentsPerPerson) { onNotify(tr('health.error.appointmentLimit')); return; }
    setWorking(true);
    try {
      if (id) {
        if (!demo) { const { error } = await client.from('health_appointments').update(result.value).eq('id', id); if (error) { onNotify(friendlyError(error, tr)); return; } }
        setAppointments(list => list.map(a => (a.id === id ? { ...a, ...result.value } : a)));
        onNotify(tr('health.appointmentUpdated'));
      } else {
        const made = await insertAppointment({ ...result.value, person_id: personId });
        if (!made) return;
        onNotify(tr('health.appointmentSaved', { date: appointmentWhen(made) }));
      }
      setAppointmentForm(null);
    } finally { setWorking(false); }
  }

  async function insertAppointment(row) {
    if (demo) { const made = { ...row, id: uid() }; setAppointments(list => [...list, made]); return made; }
    const { data, error } = await client.from('health_appointments').insert(row).select('*').single();
    if (error) { onNotify(error.code === '23505' ? tr('health.error.vaccineAlready') : friendlyError(error, tr)); return null; }
    setAppointments(list => [...list, data]);
    return data;
  }

  // «Fatto»: se si ripete, il prossimo appuntamento è già in agenda con gli stessi promemoria.
  async function appointmentDone(a) {
    if (!demo) { const { error } = await client.from('health_appointments').update({ done_on: today }).eq('id', a.id); if (error) { onNotify(friendlyError(error, tr)); return; } }
    setAppointments(list => list.map(x => (x.id === a.id ? { ...x, done_on: today } : x)));
    if (Number(a.repeat_months) > 0) {
      const next = await insertAppointment({ person_id: a.person_id, kind: a.kind, title: a.title, on_date: addMonths(a.on_date, Number(a.repeat_months)), at_time: a.at_time || null,
        place: a.place || '', notes: '', reminders: a.reminders || [], repeat_months: a.repeat_months, done_on: null });
      if (next) { onNotify(tr('health.appointmentDoneNext', { date: day(next.on_date) })); return; }
    }
    onNotify(tr('health.appointmentDone'));
  }

  async function deleteAppointment(a) {
    if (!(await askConfirm(tr('health.appointmentDeleteConfirm', { title: a.title }), { danger: true }))) return;
    if (!demo) { const { error } = await client.from('health_appointments').delete().eq('id', a.id); if (error) { onNotify(friendlyError(error, tr)); return; } }
    setAppointments(list => list.filter(x => x.id !== a.id));
    onNotify(tr('health.appointmentDeleted'));
  }

  // ===== Calendario vaccinale e bilanci di salute =====
  const stepTitle = key => (isCheckup(key) ? tr('health.checkup', { number: Number(key.slice(4)) }) : tr('health.vaccine.' + key));
  async function saveCheckups(p, on) {
    if (!demo) { const { error } = await client.from('health_people').update({ checkup_plan: on }).eq('id', p.id); if (error) { onNotify(friendlyError(error, tr)); return; } }
    setPeople(list => list.map(x => (x.id === p.id ? { ...x, checkup_plan: on } : x)));
    onNotify(tr(on ? 'health.checkupsOn' : 'health.checkupsOff', { name: p.name }));
  }
  async function savePlan(p, plan) {
    if (!demo) { const { error } = await client.from('health_people').update({ vaccine_plan: plan }).eq('id', p.id); if (error) { onNotify(friendlyError(error, tr)); return; } }
    setPeople(list => list.map(x => (x.id === p.id ? { ...x, vaccine_plan: plan } : x)));
    onNotify(tr(plan === 'off' ? 'health.vaccinePlanOff' : 'health.vaccinePlanOn', { name: p.name }));
  }
  function bookVaccine(item) {
    setTherapyForm(null); setExpenseForm(null);
    setAppointmentForm({ ...blankAppointment(person.id, today), kind: isCheckup(item.key) ? 'visit' : 'vaccine', title: stepTitle(item.key), on_date: item.from > today ? item.from : today, reminders: ['day_before', 'same_morning'], schedule_key: item.key });
  }
  async function vaccineDone(event) {
    event.preventDefault();
    const { key, date: doneDate } = doneForm;
    if (!doneDate || doneDate > today) { onNotify(tr('health.error.date')); return; }
    setWorking(true);
    try {
      const made = await insertAppointment({ person_id: person.id, kind: isCheckup(key) ? 'visit' : 'vaccine', title: stepTitle(key), on_date: doneDate, at_time: null, place: '', notes: '', reminders: [], repeat_months: 0, done_on: doneDate, schedule_key: key });
      if (made) { onNotify(tr(isCheckup(key) ? 'health.checkupMarked' : 'health.vaccineMarked', { name: made.title })); setDoneForm(null); }
    } finally { setWorking(false); }
  }
  const vaccineState = item => { const k = item.type === 'checkup' ? 'health.cState.' : 'health.vState.';
    return item.state === 'done' ? tr(k + 'done', { date: day(item.appointment.done_on) }) : item.state === 'booked' ? tr(k + 'booked', { date: day(item.appointment.on_date) }) : tr(k + item.state); };
  // La spesa di una visita fatta: modulo già compilato.
  function expenseFor(a) {
    setTherapyForm(null); setAppointmentForm(null);
    setExpenseForm(blankExpense(today, { kind: a.kind === 'exam' ? 'exam' : 'visit', description: a.title, spent_on: a.done_on && a.done_on <= today ? a.done_on : today, appointment_id: a.id }));
  }

  // Nomi nelle notifiche: di partenza no (sono dati sanitari sullo schermo bloccato).
  async function saveDetails(on) {
    setDetails(on);
    if (demo) return;
    const { error } = await client.from('user_alert_preferences').upsert({ ...(prefsRow || {}), user_id: user.id, health_push_details: on }, { onConflict: 'user_id' });
    if (error) { setDetails(!on); onNotify(friendlyError(error, tr)); return; }
    setPrefsRow(r => ({ ...(r || {}), user_id: user.id, health_push_details: on }));
    onNotify(tr(on ? 'health.detailsOn' : 'health.detailsOff'));
  }

  async function addToShopping(item) {
    if (shopping.some(title => titleKey(title) === titleKey(item.name))) return;
    const { error } = await client.from('home_shopping').insert({ home_id: homeId, title: item.name });
    if (error) { onNotify(friendlyError(error, tr)); return; }
    setShopping(list => [...list, item.name]);
    onNotify(tr('health.addedToList', { name: item.name }));
  }

  // Elenco delle tappe (vaccini o bilanci) con stato, «Prenota» e «Già fatta/o».
  const stepList = (items, className) => <ul className={`health-list ${className}`}>{items.map(item => {
    const name = stepTitle(item.key), checkup = item.type === 'checkup';
    return <li key={item.key} className={`vaccine-${item.state}`}>
      <span><b>{name}</b>
        <small>{tr(checkup ? 'health.checkupAge.' + item.key : 'health.vaccineAge.' + item.key)} · {tr('health.vaccineFrom', { date: day(item.from) })}</small>
        <small>{!checkup && <><span className={`extra-pill ${item.mandatory ? 'health-mandatory' : 'health-recommended'}`}>{tr(item.mandatory ? 'health.mandatory' : 'health.recommended')}</span> </>}<span className={`extra-pill health-v-${item.state}`}>{vaccineState(item)}</span></small></span>
      {writable && item.state !== 'done' && item.state !== 'booked' && <span className="extra-buttons">
        <button className="btn btn-soft" aria-label={tr('health.bookAria', { name })} onClick={() => bookVaccine(item)}><CalendarClock size={15} /> {tr('health.book')}</button>
        <button className="btn btn-soft" aria-label={tr(checkup ? 'health.alreadyDoneCheckupAria' : 'health.alreadyDoneAria', { name })} onClick={() => setDoneForm({ key: item.key, date: item.from < today ? item.from : today })}><Check size={15} /> {tr(checkup ? 'health.alreadyDoneCheckup' : 'health.alreadyDone')}</button>
      </span>}
      {doneForm?.key === item.key && <form className="health-done-form" onSubmit={vaccineDone}>
        <Field label={tr('health.doneDate')}><input type="date" required max={today} value={doneForm.date} onChange={e => setDoneForm(f => ({ ...f, date: e.target.value }))} /></Field>
        <span className="extra-buttons"><button className="btn btn-primary" disabled={working}>{tr('health.save')}</button><button type="button" className="btn btn-soft" onClick={() => setDoneForm(null)}>{tr('health.cancel')}</button></span>
      </form>}
    </li>;
  })}</ul>;

  const setT = patch => setTherapyForm(f => ({ ...f, ...patch }));
  const setA = patch => setAppointmentForm(f => ({ ...f, ...patch }));
  const editTherapy = t => setTherapyForm({ ...t, personId: t.person_id, times: (t.times || []).map(hhmm), useWeekdays: Array.isArray(t.weekdays) && t.weekdays.length > 0, weekdays: t.weekdays || [], end_on: t.end_on || '', stock_item_id: t.stock_item_id || '', stock_use: t.stock_use ?? '' });
  const editAppointment = a => setAppointmentForm({ ...a, personId: a.person_id, at_time: a.at_time ? hhmm(a.at_time) : '', reminders: a.reminders || [] });
  const formItem = therapyForm?.stock_item_id ? stockById.get(therapyForm.stock_item_id) : null;

  return <div className="extra-main health">
    <div className="page-heading"><div><div className="eyebrow">{tr('health.eyebrow')}</div><h1>{tr('nav.health')}</h1><p>{tr('health.help')}</p></div>
      {people.length > 0 && !cardFor && <div className="heading-actions"><button className="btn btn-soft" onClick={() => setCardFor('all')}><Printer size={15} /> {tr('health.card.open')}</button></div>}</div>
    <div className="informative health-privacy"><Info size={17} /><p>{tr(homeId ? 'health.privacyHome' : 'health.privacyPersonal')} {tr('health.notMedical')}</p></div>
    {missing && <div className="informative"><Info size={17} /><p>{tr('health.migration')}</p></div>}
    {demo && <div className="informative"><Info size={17} /><p>{tr('health.demo')}</p></div>}
    {!demo && !missing && !canWrite && <div className="informative"><Info size={17} /><p>{tr('health.readOnly')}</p></div>}
    {cardFor && people.length > 0 && <HealthCards key={cardFor} people={people} therapies={therapies} appointments={appointments} today={today} initial={cardFor === 'all' ? null : cardFor} onClose={() => setCardFor(null)} />}
    {!missing && <div className="extra-layout">
      <section className="panel extra-panel">
        <h2><Pill size={19} /> {tr('health.today')}</h2>
        {loading ? <p className="muted">{tr('general.loading')}</p> : !todayDoses.length ? <p className="muted">{tr(people.length ? 'health.todayEmpty' : 'health.start')}</p> :
        <ul className="health-doses">{todayDoses.map(dose => {
          const { state } = doseState(dose, doses, now);
          const who = peopleById.get(dose.therapy.person_id);
          return <li key={`${dose.therapy.id}-${dose.due_at}`} className={`health-dose ${state}`}>
            <span className="health-time">{dose.time}</span>
            <span className="health-what"><b>{dose.therapy.name}</b><small>{[who?.name, dose.therapy.dose, dose.therapy.instructions].filter(Boolean).join(' · ')}</small>
              <small><span className={`extra-pill health-${state}`}>{tr('health.doseState.' + state)}</span></small></span>
            {writable && <span className="extra-buttons">
              {(state === 'due' || state === 'later') ? <>
                <button className="btn btn-primary" aria-label={tr('health.takenAria', { name: dose.therapy.name, time: dose.time, person: who?.name || '' })} onClick={() => markDose(dose, 'taken')}><Check size={15} /> {tr('health.taken')}</button>
                <button className="icon-button" aria-label={tr('health.skippedAria', { name: dose.therapy.name, time: dose.time, person: who?.name || '' })} title={tr('health.skipped')} onClick={() => markDose(dose, 'skipped')}><X size={16} /></button>
              </> : <button className="icon-button" aria-label={tr('health.undoAria', { name: dose.therapy.name, time: dose.time })} title={tr('health.undo')} onClick={() => markDose(dose, 'pending')}><Undo2 size={16} /></button>}
            </span>}
          </li>;
        })}</ul>}

        <h2><CalendarClock size={19} /> {tr('health.upcoming')}</h2>
        {loading ? null : !upcoming.length ? <p className="muted">{tr('health.upcomingEmpty')}</p> :
        <ul className="health-appointments">{upcoming.map(a => <li key={a.id} className={a.on_date < today ? 'late' : ''}>
          <span><b>{appointmentWhen(a)} · {a.title}</b><small>{[peopleById.get(a.person_id)?.name, kindLabel(a), a.place, a.repeat_months ? tr('health.repeatShort', { months: a.repeat_months }) : ''].filter(Boolean).join(' · ')}</small>
            {a.reminders?.length > 0 && <small><BellRing size={12} /> {a.reminders.map(r => tr('health.reminder.' + r)).join(', ')}</small>}</span>
          {writable && <span className="extra-buttons"><button className="btn btn-soft" aria-label={tr('health.appointmentDoneAria', { title: a.title })} onClick={() => appointmentDone(a)}><Check size={15} /> {tr('health.done')}</button></span>}
        </li>)}</ul>}

        {lowStock.length > 0 && <div className="garden-tobuy">
          <h3><ShoppingBasket size={16} /> {tr('health.toBuy')}</h3>
          <ul>{lowStock.map(e => <li key={e.item.id}><span><b>{e.item.name}</b> · {tr('health.stockDays', { days: e.days, date: day(e.runs_out_on) })}</span>
            {homeId && canWrite && !demo && (shopping.some(title => titleKey(title) === titleKey(e.item.name)) ? <small className="muted">{tr('health.inList')}</small>
              : <button className="btn btn-soft" aria-label={tr('health.addToListAria', { name: e.item.name })} onClick={() => addToShopping(e.item)}><Plus size={15} /> {tr('health.addToList')}</button>)}</li>)}</ul>
        </div>}

        <div className="health-notify">
          <h3><BellRing size={16} /> {tr('health.notifications')}</h3>
          <p className="muted">{tr('health.notificationsHelp')}</p>
          {!demo && <label className="extra-toggle"><input type="checkbox" checked={details} onChange={e => saveDetails(e.target.checked)} />{tr('health.details')}</label>}
        </div>
      </section>

      <section className="panel extra-panel">
        <h2><HeartPulse size={19} /> {tr('health.people')}</h2>
        <div className="health-people" role="group" aria-label={tr('health.people')}>
          {people.map(p => <button key={p.id} className={`btn ${p.id === selected ? 'btn-primary' : 'btn-soft'}`} aria-pressed={p.id === selected} onClick={() => { setSelected(p.id); setTherapyForm(null); setAppointmentForm(null); setExpenseForm(null); setDoneForm(null); }}>{p.name}</button>)}
          {writable && !personForm && <button className="btn btn-soft" onClick={() => setPersonForm({ ...blankPerson(), relation: people.some(p => p.relation === 'self') ? 'other' : 'self' })}><UserPlus size={15} /> {tr('health.addPerson')}</button>}
        </div>
        {personForm && <form className="extra-form garden-inline" onSubmit={savePerson}>
          <h3>{tr(personForm.id ? 'health.editPerson' : 'health.addPerson')}</h3>
          <div className="extra-row">
            <Field label={tr('health.personName')}><input required maxLength={HEALTH_LIMITS.name} value={personForm.name} placeholder={tr('health.personNamePlaceholder')} onChange={e => setPersonForm(f => ({ ...f, name: e.target.value }))} /></Field>
            <Field label={tr('health.relation')}><select value={personForm.relation} onChange={e => setPersonForm(f => ({ ...f, relation: e.target.value }))}>{RELATIONS.map(r => <option key={r} value={r}>{tr('health.relation.' + r)}</option>)}</select></Field>
          </div>
          <Field label={tr('health.birthOn')}><input type="date" max={today} value={personForm.birth_on || ''} onChange={e => setPersonForm(f => ({ ...f, birth_on: e.target.value }))} /></Field>
          <Field label={tr('health.personNotes')}><textarea rows={2} maxLength={HEALTH_LIMITS.notes} value={personForm.notes} placeholder={tr('health.personNotesPlaceholder')} onChange={e => setPersonForm(f => ({ ...f, notes: e.target.value }))} /></Field>
          <fieldset className="health-card-fields"><legend>{tr('health.card.fields')}</legend>
            <small className="muted">{tr('health.card.fieldsHelp')}</small>
            <div className="extra-row">
              <Field label={tr('health.card.bloodType')}><select value={personForm.blood_type || ''} onChange={e => setPersonForm(f => ({ ...f, blood_type: e.target.value }))}><option value="">{tr('health.card.bloodUnknown')}</option>{BLOOD_TYPES.map(b => <option key={b} value={b}>{b}</option>)}</select></Field>
              <Field label={tr('health.card.allergies')}><input maxLength={HEALTH_LIMITS.allergies} value={personForm.allergies || ''} placeholder={tr('health.card.allergiesPlaceholder')} onChange={e => setPersonForm(f => ({ ...f, allergies: e.target.value }))} /></Field>
            </div>
            <Field label={tr('health.card.conditions')}><textarea rows={2} maxLength={HEALTH_LIMITS.conditions} value={personForm.conditions || ''} placeholder={tr('health.card.conditionsPlaceholder')} onChange={e => setPersonForm(f => ({ ...f, conditions: e.target.value }))} /></Field>
            <div className="extra-row">
              <Field label={tr('health.card.doctorName')}><input maxLength={HEALTH_LIMITS.contactName} value={personForm.doctor_name || ''} onChange={e => setPersonForm(f => ({ ...f, doctor_name: e.target.value }))} /></Field>
              <Field label={tr('health.card.doctorPhone')}><input type="tel" inputMode="tel" maxLength={HEALTH_LIMITS.phone} value={personForm.doctor_phone || ''} onChange={e => setPersonForm(f => ({ ...f, doctor_phone: e.target.value }))} /></Field>
            </div>
            <div className="extra-row">
              <Field label={tr('health.card.contactName')}><input maxLength={HEALTH_LIMITS.contactName} value={personForm.emergency_name || ''} placeholder={tr('health.card.contactPlaceholder')} onChange={e => setPersonForm(f => ({ ...f, emergency_name: e.target.value }))} /></Field>
              <Field label={tr('health.card.contactPhone')}><input type="tel" inputMode="tel" maxLength={HEALTH_LIMITS.phone} value={personForm.emergency_phone || ''} onChange={e => setPersonForm(f => ({ ...f, emergency_phone: e.target.value }))} /></Field>
            </div>
          </fieldset>
          <div className="extra-buttons"><button className="btn btn-primary" disabled={working}>{tr('health.save')}</button><button type="button" className="btn btn-soft" onClick={() => setPersonForm(null)}>{tr('health.cancel')}</button></div>
        </form>}
        {!loading && !people.length && !personForm && <p className="muted">{tr('health.peopleEmpty')}</p>}

        {person && !personForm && <div className="health-person">
          <div className="health-person-head">
            <span><b>{person.name}</b><small>{[tr('health.relation.' + person.relation), person.birth_on ? tr('health.born', { date: date(person.birth_on, { day: 'numeric', month: 'short', year: 'numeric' }) }) : '', person.notes].filter(Boolean).join(' · ')}</small></span>
            {writable && <span className="extra-buttons">
              <button className="icon-button" aria-label={tr('health.editPersonAria', { name: person.name })} title={tr('health.editPerson')} onClick={() => setPersonForm({ ...blankPerson(), ...Object.fromEntries(Object.entries(person).filter(([, v]) => v !== null)), birth_on: person.birth_on || '' })}><Pencil size={16} /></button>
              <button className="icon-button danger" aria-label={tr('health.deletePersonAria', { name: person.name })} title={tr('health.delete')} onClick={() => deletePerson(person)}><Trash2 size={16} /></button>
            </span>}
          </div>
          <div className="health-card-summary">
            {person.allergies && <p className="garden-warning"><b>{tr('health.card.allergies')}:</b> {person.allergies}</p>}
            <p className="muted">{[person.blood_type ? `${tr('health.card.bloodType')}: ${person.blood_type}` : '', person.doctor_name || person.doctor_phone ? `${tr('health.card.doctor')}: ${[person.doctor_name, person.doctor_phone].filter(Boolean).join(' ')}` : '',
              person.emergency_name || person.emergency_phone ? `${tr('health.card.contact')}: ${[person.emergency_name, person.emergency_phone].filter(Boolean).join(' ')}` : ''].filter(Boolean).join(' · ') || tr('health.card.empty')}</p>
            <button className="btn btn-soft" aria-label={tr('health.card.printFor', { name: person.name })} onClick={() => setCardFor(person.id)}><Printer size={15} /> {tr('health.card.print')}</button>
          </div>

          <h3><Pill size={16} /> {tr('health.therapies')}</h3>
          {!personTherapies.length ? <p className="muted">{tr('health.therapiesEmpty')}</p> : <ul className="health-list">{personTherapies.map(t => {
            const ended = t.end_on && t.end_on < today;
            const taken = doses.filter(d => d.therapy_id === t.id && d.status === 'taken').length, skipped = doses.filter(d => d.therapy_id === t.id && d.status === 'skipped').length;
            const est = t.stock_item_id ? stockEstimates([t], stock, today).get(t.stock_item_id) : null;
            return <li key={t.id} className={ended ? 'is-off' : ''}>
              <span><b>{t.name}{t.dose ? ` · ${t.dose}` : ''}</b><small>{tr('health.kind.' + t.kind)} · {scheduleText(t)}{t.remind === false ? ' · ' + tr('health.noReminder') : ''}</small>
                {t.instructions && <small>{t.instructions}</small>}
                {(taken + skipped) > 0 && <small>{tr('health.lastWeek', { taken, skipped })}</small>}
                {est && <small className={est.low ? 'garden-warning' : ''}>{tr('health.stockDays', { days: est.days, date: day(est.runs_out_on) })}</small>}
                {ended && <small>{tr('health.ended')}</small>}</span>
              {writable && <span className="extra-buttons">
                <button className="icon-button" aria-label={tr('health.editTherapyAria', { name: t.name })} title={tr('health.edit')} onClick={() => editTherapy(t)}><Pencil size={16} /></button>
                <button className="icon-button danger" aria-label={tr('health.deleteTherapyAria', { name: t.name })} title={tr('health.delete')} onClick={() => deleteTherapy(t)}><Trash2 size={16} /></button>
              </span>}
            </li>;
          })}</ul>}
          {writable && !therapyForm && <button className="btn btn-soft" onClick={() => { setTherapyForm(blankTherapy(person.id, today)); setAppointmentForm(null); }}><Plus size={15} /> {tr('health.addTherapy')}</button>}
          {therapyForm && <form className="extra-form garden-inline" onSubmit={saveTherapy}>
            <h3>{tr(therapyForm.id ? 'health.editTherapy' : 'health.addTherapy')}</h3>
            <div className="extra-row">
              <Field label={tr('health.therapyKind')}><select value={therapyForm.kind} onChange={e => setT({ kind: e.target.value })}>{THERAPY_KINDS.map(k => <option key={k} value={k}>{tr('health.kind.' + k)}</option>)}</select></Field>
              <Field label={tr('health.therapyName')}><input required minLength={2} maxLength={HEALTH_LIMITS.therapyName} value={therapyForm.name} placeholder={tr('health.therapyNamePlaceholder')} onChange={e => setT({ name: e.target.value })} /></Field>
            </div>
            <div className="extra-row">
              <Field label={tr('health.dose')}><input maxLength={HEALTH_LIMITS.dose} value={therapyForm.dose} placeholder={tr('health.dosePlaceholder')} onChange={e => setT({ dose: e.target.value })} /></Field>
              <Field label={tr('health.instructions')}><input maxLength={HEALTH_LIMITS.instructions} value={therapyForm.instructions} placeholder={tr('health.instructionsPlaceholder')} onChange={e => setT({ instructions: e.target.value })} /></Field>
            </div>
            <fieldset className="health-times"><legend>{tr('health.times')}</legend>
              {therapyForm.times.map((time, i) => <span key={i} className="health-time-field">
                <input type="time" required aria-label={tr('health.timeN', { number: i + 1 })} value={time} onChange={e => setT({ times: therapyForm.times.map((x, j) => (j === i ? e.target.value : x)) })} />
                {therapyForm.times.length > 1 && <button type="button" className="icon-button" aria-label={tr('health.removeTime', { time })} onClick={() => setT({ times: therapyForm.times.filter((_, j) => j !== i) })}><X size={14} /></button>}
              </span>)}
              {therapyForm.times.length < HEALTH_LIMITS.times && <button type="button" className="btn btn-soft" onClick={() => setT({ times: [...therapyForm.times, therapyForm.times.length ? '20:00' : '08:00'] })}><Plus size={14} /> {tr('health.addTime')}</button>}
            </fieldset>
            <Field label={tr('health.frequency')}><select value={therapyForm.useWeekdays ? 'weekdays' : String(therapyForm.every_days)} onChange={e => (e.target.value === 'weekdays' ? setT({ useWeekdays: true, weekdays: therapyForm.weekdays.length ? therapyForm.weekdays : [1] }) : setT({ useWeekdays: false, every_days: Number(e.target.value) }))}>
              {(EVERY_CHOICES.includes(Number(therapyForm.every_days)) ? EVERY_CHOICES : [...EVERY_CHOICES, Number(therapyForm.every_days)].sort((a, b) => a - b)).map(n => <option key={n} value={n}>{n === 1 ? tr('health.everyDay') : tr('health.everyDays', { days: n })}</option>)}
              <option value="weekdays">{tr('health.onWeekdays')}</option></select></Field>
            {therapyForm.useWeekdays && <fieldset className="garden-months"><legend>{tr('health.weekdays')}</legend><div>
              {WEEK.map(n => <button type="button" key={n} aria-pressed={therapyForm.weekdays.includes(n)} onClick={() => setT({ weekdays: therapyForm.weekdays.includes(n) ? therapyForm.weekdays.filter(x => x !== n) : [...therapyForm.weekdays, n].sort() })}>{weekdayName(n)}</button>)}
            </div></fieldset>}
            <div className="extra-row">
              <Field label={tr('health.startOn')}><input type="date" required value={therapyForm.start_on} onChange={e => setT({ start_on: e.target.value })} /></Field>
              <Field label={tr('health.endOn')}><input type="date" min={therapyForm.start_on} value={therapyForm.end_on} onChange={e => setT({ end_on: e.target.value })} /></Field>
            </div>
            <small className="muted">{tr('health.endHelp')}</small>
            {!demo && stock.length > 0 && <div className="extra-row">
              <Field label={tr('health.stockItem')}><select value={therapyForm.stock_item_id} onChange={e => setT({ stock_item_id: e.target.value })}><option value="">{tr('health.stockNone')}</option>{stock.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
              {formItem && <Field label={tr('health.stockUse')}><DecimalInput decimals={2} min="0.01" max={HEALTH_LIMITS.maxStockUse} value={therapyForm.stock_use} onChange={e => setT({ stock_use: e.target.value })} /></Field>}
            </div>}
            <label className="extra-toggle"><input type="checkbox" checked={therapyForm.remind} onChange={e => setT({ remind: e.target.checked })} />{tr('health.remindTherapy')}</label>
            <Field label={tr('health.notes')}><textarea rows={2} maxLength={HEALTH_LIMITS.notes} value={therapyForm.notes} onChange={e => setT({ notes: e.target.value })} /></Field>
            <div className="extra-buttons"><button className="btn btn-primary" disabled={working}>{tr('health.save')}</button><button type="button" className="btn btn-soft" onClick={() => setTherapyForm(null)}>{tr('health.cancel')}</button></div>
          </form>}

          <h3><Stethoscope size={16} /> {tr('health.appointments')}</h3>
          {(() => {
            const open = personAppointments.filter(a => !a.done_on).sort((a, b) => a.on_date.localeCompare(b.on_date));
            const done = personAppointments.filter(a => a.done_on).sort((a, b) => b.on_date.localeCompare(a.on_date));
            return <>
              {!open.length ? <p className="muted">{tr('health.appointmentsEmpty')}</p> : <ul className="health-list">{open.map(a => <li key={a.id}>
                <span><b>{appointmentWhen(a)} · {a.title}</b><small>{[kindLabel(a), a.place, a.repeat_months ? tr('health.repeatShort', { months: a.repeat_months }) : ''].filter(Boolean).join(' · ')}</small>
                  <small>{a.reminders?.length ? a.reminders.map(r => tr('health.reminder.' + r)).join(', ') : tr('health.noReminder')}</small></span>
                {writable && <span className="extra-buttons">
                  <button className="icon-button" aria-label={tr('health.editAppointmentAria', { title: a.title })} title={tr('health.edit')} onClick={() => { editAppointment(a); setTherapyForm(null); }}><Pencil size={16} /></button>
                  <button className="icon-button danger" aria-label={tr('health.deleteAppointmentAria', { title: a.title })} title={tr('health.delete')} onClick={() => deleteAppointment(a)}><Trash2 size={16} /></button>
                </span>}
              </li>)}</ul>}
              {done.length > 0 && <details className="garden-ended" open={showDone} onToggle={e => { const isOpen = e.currentTarget.open; setShowDone(isOpen); }}><summary>{tr('health.doneList', { count: done.length })}</summary>
                <ul className="health-list">{done.map(a => <li key={a.id}><span><b>{day(a.on_date)} · {a.title}</b><small>{kindLabel(a)} · {tr('health.doneOn', { date: day(a.done_on) })}</small></span>
                  {writable && <span className="extra-buttons">
                    {!expenses.some(e => e.appointment_id === a.id) && <button className="btn btn-soft" aria-label={tr('health.expenseForAria', { title: a.title })} onClick={() => expenseFor(a)}><Receipt size={15} /> {tr('health.expenseFor')}</button>}
                    <button className="icon-button danger" aria-label={tr('health.deleteAppointmentAria', { title: a.title })} title={tr('health.delete')} onClick={() => deleteAppointment(a)}><Trash2 size={16} /></button></span>}</li>)}</ul>
              </details>}
            </>;
          })()}
          {writable && !appointmentForm && <button className="btn btn-soft" onClick={() => { setAppointmentForm(blankAppointment(person.id, today)); setTherapyForm(null); setExpenseForm(null); }}><Plus size={15} /> {tr('health.addAppointment')}</button>}
          {appointmentForm && <form className="extra-form garden-inline" onSubmit={saveAppointment}>
            <h3>{tr(appointmentForm.id ? 'health.editAppointment' : 'health.addAppointment')}</h3>
            {appointmentForm.schedule_key && <small className="muted">{isCheckup(appointmentForm.schedule_key) ? <ClipboardCheck size={13} /> : <Syringe size={13} />} {tr(isCheckup(appointmentForm.schedule_key) ? 'health.checkupStep' : 'health.vaccineStep', { name: stepTitle(appointmentForm.schedule_key) })}</small>}
            <div className="extra-row">
              <Field label={tr('health.appointmentKind')}><select value={appointmentForm.kind} onChange={e => setA({ kind: e.target.value })}>{APPOINTMENT_KINDS.map(k => <option key={k} value={k}>{tr('health.appointmentKind.' + k)}</option>)}</select></Field>
              <Field label={tr('health.appointmentTitle')}><input required minLength={2} maxLength={HEALTH_LIMITS.title} value={appointmentForm.title} placeholder={tr('health.appointmentTitlePlaceholder')} onChange={e => setA({ title: e.target.value })} /></Field>
            </div>
            <div className="extra-row">
              <Field label={tr('health.onDate')}><input type="date" required value={appointmentForm.on_date} onChange={e => setA({ on_date: e.target.value })} /></Field>
              <Field label={tr('health.atTime')}><input type="time" value={appointmentForm.at_time} onChange={e => setA({ at_time: e.target.value, reminders: e.target.value ? appointmentForm.reminders : appointmentForm.reminders.filter(r => r !== 'hour_before') })} /></Field>
            </div>
            <Field label={tr('health.place')}><input maxLength={HEALTH_LIMITS.place} value={appointmentForm.place} placeholder={tr('health.placePlaceholder')} onChange={e => setA({ place: e.target.value })} /></Field>
            <fieldset className="health-reminders"><legend>{tr('health.reminders')}</legend>
              {REMINDER_CODES.map(code => <label key={code} className="extra-toggle"><input type="checkbox" disabled={code === 'hour_before' && !appointmentForm.at_time} checked={appointmentForm.reminders.includes(code)}
                onChange={e => setA({ reminders: e.target.checked ? [...appointmentForm.reminders, code] : appointmentForm.reminders.filter(r => r !== code) })} />{tr('health.reminder.' + code)}</label>)}
              {!appointmentForm.at_time && <small className="muted">{tr('health.hourBeforeNeedsTime')}</small>}
            </fieldset>
            <Field label={tr('health.repeat')}><select value={String(appointmentForm.repeat_months)} onChange={e => setA({ repeat_months: Number(e.target.value) })}>
              {REPEAT_CHOICES.map(m => <option key={m} value={m}>{m ? tr('health.repeatEvery', { months: m }) : tr('health.repeatNone')}</option>)}</select></Field>
            <Field label={tr('health.notes')}><textarea rows={2} maxLength={HEALTH_LIMITS.notes} value={appointmentForm.notes} placeholder={tr('health.appointmentNotesPlaceholder')} onChange={e => setA({ notes: e.target.value })} /></Field>
            <div className="extra-buttons"><button className="btn btn-primary" disabled={working}>{tr('health.save')}</button><button type="button" className="btn btn-soft" onClick={() => setAppointmentForm(null)}>{tr('health.cancel')}</button></div>
          </form>}

          {writable || expenses.some(e => e.person_id === person.id) ? <HealthExpenses client={client} demo={demo} user={user} homeId={homeId} person={person} appointments={appointments}
            expenses={expenses} setExpenses={setExpenses} taxLinks={taxLinks} setTaxLinks={setTaxLinks} writable={writable} today={today}
            form={expenseForm} setForm={f => { setExpenseForm(f); if (f) { setTherapyForm(null); setAppointmentForm(null); } }} onNotify={onNotify} /> : null}

          {young(person) && <div className="health-vaccines">
            <h3><Syringe size={16} /> {tr('health.vaccines')}</h3>
            {!person.birth_on ? <p className="muted">{tr('health.vaccinesNeedBirth')}</p> : <>
              {writable && <Field label={tr('health.vaccinePlan')}><select value={person.vaccine_plan || 'off'} onChange={e => savePlan(person, e.target.value)}>{VACCINE_PLANS.map(p => <option key={p} value={p}>{tr('health.vaccinePlan.' + p)}</option>)}</select></Field>}
              {!vaccines.length ? <p className="muted">{tr('health.vaccinesHelp')}</p> : <>
                <p className="muted">{tr('health.vaccinesSource')}</p>
                {stepList(vaccines, 'health-vaccine-list')}
                {person.vaccine_plan === 'all' && <p className="muted">{tr('health.vaccinesOthers')}</p>}
              </>}
            </>}
          </div>}

          {young(person) && <div className="health-vaccines health-checkups">
            <h3><ClipboardCheck size={16} /> {tr('health.checkups')}</h3>
            {!person.birth_on ? <p className="muted">{tr('health.checkupsNeedBirth')}</p> : <>
              {writable && <label className="extra-toggle"><input type="checkbox" checked={person.checkup_plan === true} onChange={e => saveCheckups(person, e.target.checked)} />{tr('health.checkupsFollow')}</label>}
              {!checkups.length ? <p className="muted">{tr('health.checkupsHelp')}</p> : <>
                <p className="muted">{tr('health.checkupsSource')}</p>
                {stepList(checkups, 'health-checkup-list')}
              </>}
            </>}
          </div>}
        </div>}
      </section>
    </div>}
  </div>;
}

// I testi della sezione arrivano quando la si apre (lib/i18n-dicts/<lingua>.health.json).
export default function Health(props) {
  const { t } = useLanguage();
  const ready = useSection('health');
  return ready ? <HealthSection {...props} /> : <p className="import-progress" role="status">{t('general.loading')}</p>;
}

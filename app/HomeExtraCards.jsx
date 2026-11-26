'use client';
// Riquadri della Home per le sezioni nuove (scelta dell'utente del 26 novembre 2026, notte):
// medicine di oggi (con «Presa»), visite, vaccini e bilanci da prenotare, animali, giardino e
// documenti in scadenza. Si leggono solo i dati dei riquadri scelti, nello spazio attivo.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pill, Stethoscope, PawPrint, Sprout, IdCard, Check, CalendarRange, TrendingUp } from 'lucide-react';
import { useLanguage, useSection } from './LanguageProvider';
import { friendlyError } from '../lib/friendly-error.mjs';
import { todayRome } from '../lib/dates.mjs';
import { selectIn } from '../lib/select-all.mjs';
import { dosesOnDate, doseState, romeInstant, addDays, upcomingAppointments, vaccinePlan, checkupPlan, hhmm } from '../lib/health.mjs';
import { saveDose } from '../lib/health-doses.mjs';
import { petAgenda } from '../lib/pets.mjs';
import { gardenAgenda } from '../lib/garden.mjs';
import { documentAgenda } from '../lib/family-documents.mjs';
import { installmentAgenda } from '../lib/installments.mjs';
import { spendingForecast, forecastRange, FORECAST_PARTS } from '../lib/spending-forecast.mjs';

export const EXTRA_WIDGETS = Object.freeze(['medicines', 'health', 'pets', 'garden', 'documents', 'installments', 'spending']);
const EMPTY = Object.freeze({ people: [], therapies: [], doses: [], stock: [], appointments: [], pets: [], petTasks: [], plants: [], gardenTasks: [], documents: [], plans: [], installments: [], spendPlans: [], spendInstallments: [] });
const safe = result => (result?.error ? [] : result?.data || []);

export function useExtraCards({ ids, client, demo, user, homeId, canWrite, limit, refreshKey, onNavigate, onNotify, HomeWidget, bills = [], utilities = [] }) {
  const { t: tr, date, money } = useLanguage();
  const wanted = useMemo(() => EXTRA_WIDGETS.filter(id => ids.includes(id)), [ids.join('|')]);
  // Nomi dei vaccini, dei bilanci e stati delle dosi: testi della sezione Salute, caricati solo se servono.
  const healthTexts = useSection(wanted.includes('medicines') || wanted.includes('health') ? 'health' : null);
  const [data, setData] = useState(EMPTY), [loading, setLoading] = useState(false), [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const today = todayRome(now);
  const day = iso => date(iso, { weekday: 'short', day: 'numeric', month: 'short' });
  // L'ora passa: una dose «più tardi» diventa «da prendere» senza ricaricare.
  useEffect(() => { if (!wanted.includes('medicines')) return undefined; const timer = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(timer); }, [wanted.join('|')]);

  const load = useCallback(async () => {
    if (!wanted.length || demo || !client || !user?.id) { setData(EMPTY); setLoading(false); return; }
    setLoading(true);
    const scope = q => (homeId ? q.eq('home_id', homeId) : q.eq('user_id', user.id).is('home_id', null));
    const has = id => wanted.includes(id);
    const healthNeeded = has('medicines') || has('health');
    const [people, pets, plants, documents, plans, spendPlans] = await Promise.all([
      healthNeeded ? scope(client.from('health_people').select('id,name,birth_on,relation,vaccine_plan,checkup_plan')).limit(100) : null,
      has('pets') ? scope(client.from('home_pets').select('id,name,ended_on')).is('ended_on', null).limit(200) : null,
      has('garden') ? scope(client.from('home_garden_plants').select('id,name,ended_on')).limit(500) : null,
      has('documents') ? scope(client.from('family_documents').select('id,holder,kind,label,expires_on,notice_days')).not('expires_on', 'is', null).lte('expires_on', addDays(todayRome(), 365)).limit(300) : null,
      has('installments') ? scope(client.from('payment_plans').select('id,title,remind_days,ended_on')).is('ended_on', null).limit(200) : null,
      // Uscite del mese: tutti i piani (anche finiti da poco) per le rate di questo mese e del prossimo.
      has('spending') ? scope(client.from('payment_plans').select('id,title,ended_on')).limit(500) : null,
    ]);
    const personIds = safe(people).map(p => p.id), petIds = safe(pets).map(p => p.id), plantIds = safe(plants).filter(p => !p.ended_on).map(p => p.id);
    const soon = addDays(todayRome(), 30);
    const planIds = safe(plans).map(p => p.id);
    const range = forecastRange(todayRome(), 2);
    const spendIds = safe(spendPlans).filter(p => !p.ended_on || p.ended_on >= range.first).map(p => p.id);
    const [therapies, appointments, steps, petTasks, gardenTasks, installments, spendInstallments] = await Promise.all([
      has('medicines') && personIds.length ? selectIn((part, count) => client.from('health_therapies').select('*', count ? { count: 'exact' } : undefined).in('person_id', part).lte('start_on', todayRome()).order('id'), personIds) : null,
      has('health') && personIds.length ? selectIn((part, count) => client.from('health_appointments').select('id,person_id,kind,title,on_date,at_time,place,done_on,schedule_key', count ? { count: 'exact' } : undefined).in('person_id', part).is('done_on', null).lte('on_date', soon).order('on_date').order('id'), personIds) : null,
      has('health') && personIds.length ? selectIn((part, count) => client.from('health_appointments').select('id,person_id,schedule_key,on_date,done_on', count ? { count: 'exact' } : undefined).in('person_id', part).not('schedule_key', 'is', null).order('id'), personIds) : null,
      has('pets') && petIds.length ? selectIn((part, count) => client.from('home_pet_tasks').select('id,pet_id,title,next_on', count ? { count: 'exact' } : undefined).in('pet_id', part).not('next_on', 'is', null).lte('next_on', addDays(todayRome(), 14)).order('id'), petIds) : null,
      has('garden') && plantIds.length ? selectIn((part, count) => client.from('home_garden_tasks').select('id,plant_id,title,next_on,months,every_days', count ? { count: 'exact' } : undefined).in('plant_id', part).not('next_on', 'is', null).lte('next_on', addDays(todayRome(), 7)).order('id'), plantIds) : null,
      planIds.length ? selectIn((part, count) => client.from('payment_installments').select('id,plan_id,label,due_on,amount_cents,paid_on', count ? { count: 'exact' } : undefined).in('plan_id', part).is('paid_on', null).lte('due_on', addDays(todayRome(), 30)).order('id'), planIds) : null,
      spendIds.length ? selectIn((part, count) => client.from('payment_installments').select('id,plan_id,label,due_on,amount_cents,paid_on,paid_cents', count ? { count: 'exact' } : undefined).in('plan_id', part).gte('due_on', range.first).lte('due_on', range.last).order('id'), spendIds) : null,
    ]);
    const therapyList = safe(therapies).filter(t => !t.end_on || t.end_on >= todayRome());
    const stockIds = [...new Set(therapyList.map(t => t.stock_item_id).filter(Boolean))];
    const [doses, stock] = await Promise.all([
      therapyList.length ? selectIn((part, count) => client.from('health_doses').select('*', count ? { count: 'exact' } : undefined).in('therapy_id', part).gte('due_at', romeInstant(todayRome(), '00:00').toISOString()).order('id'), therapyList.map(t => t.id)) : null,
      stockIds.length ? client.from('home_stock_items').select('id,name,quantity').in('id', stockIds) : null,
    ]);
    setData({ people: safe(people), therapies: therapyList, doses: safe(doses), stock: safe(stock), appointments: [...safe(appointments), ...safe(steps)],
      pets: safe(pets), petTasks: safe(petTasks), plants: safe(plants), gardenTasks: safe(gardenTasks), documents: safe(documents), plans: safe(plans), installments: safe(installments),
      spendPlans: safe(spendPlans), spendInstallments: safe(spendInstallments) });
    setLoading(false);
  }, [client, demo, homeId, user?.id, wanted.join('|')]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const peopleById = useMemo(() => new Map(data.people.map(p => [p.id, p])), [data.people]);
  const todayDoses = useMemo(() => dosesOnDate(data.therapies, today).map(dose => ({ dose, ...doseState(dose, data.doses, now) })), [data.therapies, data.doses, today, now]);
  const openDoses = todayDoses.filter(d => d.state === 'due' || d.state === 'later');
  const visits = useMemo(() => upcomingAppointments(data.appointments.filter(a => a.title), today, 30), [data.appointments, today]);
  const steps = useMemo(() => data.people.flatMap(p => [...vaccinePlan(p, data.appointments, today), ...checkupPlan(p, data.appointments, today)]
    .filter(s => s.state === 'due' || s.state === 'soon').map(s => ({ ...s, person: p }))).sort((a, b) => a.from.localeCompare(b.from)), [data.people, data.appointments, today]);
  const petName = useMemo(() => new Map(data.pets.map(p => [p.id, p.name])), [data.pets]);
  const plantName = useMemo(() => new Map(data.plants.map(p => [p.id, p.name])), [data.plants]);
  const petItems = useMemo(() => petAgenda(data.petTasks.filter(t => petName.has(t.pet_id)), today, 14), [data.petTasks, petName, today]);
  const gardenItems = useMemo(() => gardenAgenda(data.gardenTasks.filter(t => plantName.has(t.plant_id)), today, 7), [data.gardenTasks, plantName, today]);
  const instItems = useMemo(() => installmentAgenda(data.installments, data.plans, today, 30), [data.installments, data.plans, today]);
  // Uscite di questo mese e del prossimo: bollette e utenze arrivano dalla pagina (anche nella prova).
  const spending = useMemo(() => (wanted.includes('spending') ? spendingForecast({ bills, utilities, plans: data.spendPlans, installments: data.spendInstallments, months: 2, today }) : null),
    [wanted.join('|'), bills, utilities, data.spendPlans, data.spendInstallments, today]);
  const docItems = useMemo(() => documentAgenda(data.documents, today).filter(a => a.state === 'expired' || a.state === 'renew'), [data.documents, today]);

  async function take(entry) {
    if (busy || !canWrite) return;
    setBusy(true);
    try {
      const stockItem = entry.dose.therapy.stock_item_id ? data.stock.find(s => s.id === entry.dose.therapy.stock_item_id) : null;
      const result = await saveDose(client, { dose: entry.dose, status: 'taken', row: entry.row, stockItem });
      if (result.error) { onNotify(friendlyError(result.error, tr)); load(); return; }
      setData(d => ({ ...d, doses: [...d.doses.filter(x => x.id !== result.saved.id), result.saved],
        stock: result.delta ? d.stock.map(s => (s.id === stockItem.id ? { ...s, quantity: result.quantity } : s)) : d.stock }));
      onNotify(tr('home.medicines.taken', { name: entry.dose.therapy.name, time: entry.dose.time }));
    } finally { setBusy(false); }
  }

  const empty = text => <p className="home3-empty">{loading || !healthTexts ? tr('general.loading') : demo ? tr('home.extra.demo') : text}</p>;
  const stateKey = s => (s === 'late' ? 'home.extra.late' : s === 'due' ? 'home.extra.today' : 'home.extra.soon');
  return {
    medicines: <HomeWidget key="medicines" icon={Pill} title={tr('home.widget.medicines')} count={tr('home.widget.medicines.count', { count: openDoses.length })}
      actionLabel={tr('home.openAll')} onAction={() => onNavigate('health')}>
      {healthTexts && todayDoses.length ? <div className="home3-rows">{todayDoses.slice(0, limit + 2).map(d => { const who = peopleById.get(d.dose.therapy.person_id)?.name;
        return <div className="home3-item" key={`${d.dose.therapy.id}-${d.dose.due_at}`}>
          <div><b>{d.dose.time} · {d.dose.therapy.name}</b><small>{[who, d.dose.therapy.dose, tr('health.doseState.' + d.state)].filter(Boolean).join(' · ')}</small></div>
          {(d.state === 'due' || d.state === 'later') && <div className="home3-item-actions"><button type="button" className="home3-check" disabled={!canWrite || busy}
            aria-label={tr('home.medicines.takeAria', { name: d.dose.therapy.name, time: d.dose.time, person: who || '' })} title={tr('home.medicines.take')} onClick={() => take(d)}><Check size={17} /></button></div>}
        </div>; })}</div> : empty(tr('home.widget.medicines.empty'))}
    </HomeWidget>,
    health: <HomeWidget key="health" icon={Stethoscope} title={tr('home.widget.health')} count={tr('home.widget.health.count', { count: visits.length + steps.length })}
      actionLabel={tr('home.openAll')} onAction={() => onNavigate('health')}>
      {healthTexts && (visits.length || steps.length) ? <div className="home3-rows">
        {visits.slice(0, limit).map(a => <div className="home3-item" key={a.id}><div><b>{a.title}</b>
          <small>{[peopleById.get(a.person_id)?.name, day(a.on_date) + (a.at_time ? ' · ' + hhmm(a.at_time) : ''), a.place].filter(Boolean).join(' · ')}</small></div></div>)}
        {steps.slice(0, limit).map(s => <div className="home3-item" key={s.person.id + s.key}><div>
          <b>{s.type === 'checkup' ? tr('health.checkup', { number: s.number }) : tr('health.vaccine.' + s.key)}</b>
          <small>{[s.person.name, tr('home.health.toBook', { date: day(s.from) })].join(' · ')}</small></div></div>)}
      </div> : empty(tr('home.widget.health.empty'))}
    </HomeWidget>,
    pets: <HomeWidget key="pets" icon={PawPrint} title={tr('home.widget.pets')} count={tr('home.widget.pets.count', { count: petItems.length })}
      actionLabel={tr('home.openAll')} onAction={() => onNavigate('pets')}>
      {petItems.length ? <div className="home3-rows">{petItems.slice(0, limit).map(({ task, state }) => <div className="home3-item" key={task.id}><div>
        <b>{task.title}</b><small>{[petName.get(task.pet_id), tr(stateKey(state), { date: day(task.next_on) })].join(' · ')}</small></div></div>)}</div> : empty(tr('home.widget.pets.empty'))}
    </HomeWidget>,
    garden: <HomeWidget key="garden" icon={Sprout} title={tr('home.widget.garden')} count={tr('home.widget.garden.count', { count: gardenItems.length })}
      actionLabel={tr('home.openAll')} onAction={() => onNavigate('garden')}>
      {gardenItems.length ? <div className="home3-rows">{gardenItems.slice(0, limit).map(({ task, state }) => <div className="home3-item" key={task.id}><div>
        <b>{task.title}</b><small>{[plantName.get(task.plant_id), tr(stateKey(state), { date: day(task.next_on) })].join(' · ')}</small></div></div>)}</div> : empty(tr('home.widget.garden.empty'))}
    </HomeWidget>,
    installments: <HomeWidget key="installments" icon={CalendarRange} title={tr('home.widget.installments')} count={tr('home.widget.installments.count', { count: instItems.length })}
      actionLabel={tr('home.openAll')} onAction={() => onNavigate('installments')}>
      {instItems.length ? <div className="home3-rows">{instItems.slice(0, limit).map(({ inst, plan, state }) => <div className="home3-item" key={inst.id}><div>
        <b>{inst.label}</b><small className={state === 'late' ? 'home3-alert' : ''}>{[plan.title, day(inst.due_on), inst.amount_cents ? money(inst.amount_cents / 100) : tr('home.installments.unknown')].join(' · ')}</small></div></div>)}</div>
        : empty(tr('home.widget.installments.empty'))}
    </HomeWidget>,
    documents: <HomeWidget key="documents" icon={IdCard} title={tr('home.widget.documents')} count={tr('home.widget.documents.count', { count: docItems.length })}
      actionLabel={tr('home.openAll')} onAction={() => onNavigate('iddocs')}>
      {docItems.length ? <div className="home3-rows">{docItems.slice(0, limit).map(a => <div className="home3-item" key={a.doc.id}><div>
        <b>{(a.doc.label || tr('home.docKind.' + a.doc.kind))} · {a.doc.holder}</b>
        <small className={a.state === 'expired' ? 'home3-alert' : ''}>{tr(a.state === 'expired' ? 'home.documents.expired' : 'home.documents.renew', { date: day(a.doc.expires_on), days: a.days })}</small></div></div>)}</div>
        : empty(tr('home.widget.documents.empty'))}
    </HomeWidget>,
    // Nella prova (demo) si vede con le bollette e le utenze di esempio; le rate arrivano dopo il caricamento.
    spending: <HomeWidget key="spending" icon={TrendingUp} title={tr('home.widget.spending')}
      count={spending ? tr('home.widget.spending.count', { amount: money(spending.months[0].total / 100) }) : ''}
      actionLabel={tr('home.widget.spending.open')} onAction={() => onNavigate('insights')}>
      {spending && (!loading || demo) && spending.months.some(m => m.total > 0) ? <div className="home3-rows">{spending.months.map((m, index) => <div className="home3-item" key={m.month}><div>
        <b>{tr(index ? 'home.spending.next' : 'home.spending.this', { month: date(`${m.month}-01`, { month: 'long' }) })}</b>
        <small>{[...FORECAST_PARTS.filter(part => m[part] > 0).map(part => `${tr(`extra.forecast.part.${part}`)} ${money(m[part] / 100)}`),
          ...(m.unknown ? [tr('extra.forecast.unknown', { count: m.unknown })] : [])].join(' · ')}</small></div>
        <div className="home3-item-actions"><strong>{money(m.total / 100)}</strong></div></div>)}</div>
        : <p className="home3-empty">{loading && !demo ? tr('general.loading') : tr('home.widget.spending.empty')}</p>}
    </HomeWidget>,
  };
}

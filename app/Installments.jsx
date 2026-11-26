'use client';
// Rate e scadenze (richiesta dell'utente del 26 novembre 2026, notte): tasse universitarie, rette
// della scuola o del nido, sport e attività, stipendio e contributi INPS del collaboratore domestico,
// contributi INPS, imposte e IVA del libero professionista. Ogni impegno ha le sue rate (anche con
// l'importo da definire), con «Pagata»; i modelli preparano le rate con le date di legge.
// Gli avvisi li manda il lavoro giornaliero (lib/installment-alerts.mjs); le rate pagate di un
// impegno detraibile compaiono tra le proposte delle Spese detraibili.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, Plus, Pencil, Trash2, Info, Check, Undo2, Wallet, Archive, RotateCcw } from 'lucide-react';
import { useLanguage, useSection } from './LanguageProvider';
import { askConfirm } from './ConfirmDialog';
import { friendlyError } from '../lib/friendly-error.mjs';
import { todayRome, addDaysISO } from '../lib/dates.mjs';
import { selectAll, selectIn } from '../lib/select-all.mjs';
import DecimalInput from './DecimalInput';
import ShowMore from './ShowMore';
import { PLAN_KINDS, PLAN_TAX, TAX_CHOICES, TEMPLATES, KIND_TEMPLATES, REMIND_CHOICES, INST_LIMITS, normalizePlan, normalizeInstallment,
  generateInstallments, installmentState, installmentAgenda, monthTotal, planSummary } from '../lib/installments.mjs';

const MISSING_TABLE = new Set(['42P01', 'PGRST205', 'PGRST202']);
const DEMO_KEY = 'casainordine-installments-demo';
const uid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
const blankPlan = () => ({ id: null, title: '', kind: 'school', payee: '', person: '', tax_category: PLAN_TAX.school, remind_days: 3, notes: '' });
function Field({ label, children }) { return <label className="extra-field">{label}{children}</label>; }

function InstallmentsSection({ client, demo, user, homeId, canWrite, onNotify = () => {} }) {
  const { t: tr, date, locale } = useLanguage();
  const [plans, setPlans] = useState([]), [items, setItems] = useState([]);
  const [loading, setLoading] = useState(!demo), [missing, setMissing] = useState(false), [working, setWorking] = useState(false);
  const [planForm, setPlanForm] = useState(null), [gen, setGen] = useState(null), [itemForm, setItemForm] = useState(null), [payForm, setPayForm] = useState(null);
  const [open, setOpen] = useState({}), [agendaShown, setAgendaShown] = useState(30);
  const today = todayRome();
  const writable = demo || canWrite;
  const day = iso => date(iso, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const money = cents => new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format((Number(cents) || 0) / 100);
  const monthName = useCallback(m => new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, m - 1, 15))), [locale]);
  const scope = useCallback(query => (homeId ? query.eq('home_id', homeId) : query.eq('user_id', user?.id).is('home_id', null)), [homeId, user?.id]);

  const load = useCallback(async () => {
    if (demo) { try { const saved = JSON.parse(localStorage.getItem(DEMO_KEY) || '{}'); setPlans(saved.plans || []); setItems(saved.items || []); } catch { setPlans([]); setItems([]); } setLoading(false); return; }
    if (!client || !user?.id) { setLoading(false); return; }
    setLoading(true);
    const list = await selectAll(count => scope(client.from('payment_plans').select('*', count ? { count: 'exact' } : undefined)).order('title').order('id'));
    if (list.error) { setLoading(false); if (MISSING_TABLE.has(list.error.code)) setMissing(true); else onNotify(friendlyError(list.error, tr)); return; }
    const ids = (list.data || []).map(p => p.id);
    const rows = ids.length ? await selectIn((part, count) => client.from('payment_installments').select('*', count ? { count: 'exact' } : undefined).in('plan_id', part).order('due_on').order('id'), ids) : { data: [] };
    setLoading(false);
    if (rows.error) { onNotify(friendlyError(rows.error, tr)); return; }
    setMissing(false); setPlans(list.data || []); setItems(rows.data || []);
  }, [client, demo, scope, user?.id]);
  useEffect(() => { setPlans([]); setItems([]); setPlanForm(null); setGen(null); setItemForm(null); setPayForm(null); load(); }, [load]);
  // Prova senza account: restano in questo browser.
  const keepDemo = (nextPlans, nextItems) => { if (demo) { try { localStorage.setItem(DEMO_KEY, JSON.stringify({ plans: nextPlans, items: nextItems })); } catch { /* spazio pieno */ } } };
  useEffect(() => { if (demo && !loading) keepDemo(plans, items); }, [demo, loading, plans, items]);

  const agenda = useMemo(() => installmentAgenda(items, plans, today, 60), [items, plans, today]);
  const thisMonth = useMemo(() => monthTotal(items, plans, today.slice(0, 7)), [items, plans, today]);
  const nextMonth = useMemo(() => monthTotal(items, plans, addDaysISO(today.slice(0, 7) + '-28', 7).slice(0, 7)), [items, plans, today]);
  const active = plans.filter(p => !p.ended_on), ended = plans.filter(p => p.ended_on);
  const stateText = (inst, plan) => { const s = installmentState(inst, today, plan?.remind_days);
    return s === 'paid' ? tr('inst.state.paid', { date: day(inst.paid_on), amount: money(inst.paid_cents ?? inst.amount_cents) }) : tr('inst.state.' + s); };

  // ===== Impegni =====
  async function savePlan(event) {
    event.preventDefault();
    const { id, ...input } = planForm;
    const result = normalizePlan(input);
    if (result.error) { onNotify(tr(result.error)); return; }
    if (!id && plans.length >= INST_LIMITS.plansPerSpace) { onNotify(tr('inst.error.plansLimit')); return; }
    setWorking(true);
    try {
      if (id) {
        if (!demo) { const { error } = await client.from('payment_plans').update(result.value).eq('id', id); if (error) { onNotify(friendlyError(error, tr)); return; } }
        setPlans(list => list.map(p => (p.id === id ? { ...p, ...result.value } : p)));
        onNotify(tr('inst.planUpdated'));
        setPlanForm(null);
      } else {
        let made;
        if (demo) made = { ...result.value, id: uid(), ended_on: null };
        else {
          const { data, error } = await client.from('payment_plans').insert({ ...result.value, user_id: user.id, home_id: homeId || null }).select('*').single();
          if (error) { onNotify(friendlyError(error, tr)); return; }
          made = data;
        }
        setPlans(list => [...list, made]); setOpen(o => ({ ...o, [made.id]: true }));
        onNotify(tr('inst.planSaved', { title: made.title }));
        setPlanForm(null);
        startGen(made);
      }
    } finally { setWorking(false); }
  }
  async function endPlan(plan, ended_on) {
    if (!demo) { const { error } = await client.from('payment_plans').update({ ended_on }).eq('id', plan.id); if (error) { onNotify(friendlyError(error, tr)); return; } }
    setPlans(list => list.map(p => (p.id === plan.id ? { ...p, ended_on } : p)));
    onNotify(tr(ended_on ? 'inst.planEnded' : 'inst.planRestored', { title: plan.title }));
  }
  async function deletePlan(plan) {
    if (!(await askConfirm(tr('inst.planDeleteConfirm', { title: plan.title }), { danger: true }))) return;
    if (!demo) { const { error } = await client.from('payment_plans').delete().eq('id', plan.id); if (error) { onNotify(friendlyError(error, tr)); return; } }
    setPlans(list => list.filter(p => p.id !== plan.id)); setItems(list => list.filter(i => i.plan_id !== plan.id));
    onNotify(tr('inst.planDeleted'));
  }

  // ===== Modelli di rate =====
  function startGen(plan) {
    const template = (KIND_TEMPLATES[plan.kind] || ['custom'])[0];
    setItemForm(null); setPayForm(null);
    setGen({ planId: plan.id, template, from: today, count: template === 'domestic_pay' ? 12 : template === 'monthly' ? 10 : 2, every: 1, day: Number(today.slice(8)), amount: '', thirteenth: true,
      schoolYear: Number(today.slice(5, 7)) >= 7 ? Number(today.slice(0, 4)) : Number(today.slice(0, 4)) - 1, skip: {} });
  }
  const preview = useMemo(() => (gen ? generateInstallments(gen.template, { ...gen, today, amount_cents: gen.amount ? Math.round(Number(gen.amount) * 100) : null }, tr, monthName) : []), [gen, today, tr, monthName]);
  // Di partenza si aggiungono le rate da oggi in poi; quelle passate si possono spuntare.
  const included = (row, index) => (gen.skip[index] === undefined ? row.due_on >= today : !gen.skip[index]);
  async function saveGen(event) {
    event.preventDefault();
    const rows = preview.filter(included).map(r => normalizeInstallment(r)).filter(r => r.value).map(r => ({ ...r.value, plan_id: gen.planId }));
    if (!rows.length) { onNotify(tr('inst.error.noRows')); return; }
    if (items.filter(i => i.plan_id === gen.planId).length + rows.length > INST_LIMITS.perPlan) { onNotify(tr('inst.error.itemsLimit')); return; }
    setWorking(true);
    try {
      let made;
      if (demo) made = rows.map(r => ({ ...r, id: uid(), paid_on: null, paid_cents: null }));
      else {
        const { data, error } = await client.from('payment_installments').insert(rows).select('*');
        if (error) { onNotify(friendlyError(error, tr)); return; }
        made = data;
      }
      setItems(list => [...list, ...made]);
      onNotify(tr('inst.added', { count: made.length }));
      setGen(null);
    } finally { setWorking(false); }
  }

  // ===== Singole rate =====
  async function saveItem(event) {
    event.preventDefault();
    const { id, planId, ...input } = itemForm;
    const result = normalizeInstallment(input);
    if (result.error) { onNotify(tr(result.error)); return; }
    setWorking(true);
    try {
      if (id) {
        if (!demo) { const { error } = await client.from('payment_installments').update(result.value).eq('id', id); if (error) { onNotify(friendlyError(error, tr)); return; } }
        setItems(list => list.map(i => (i.id === id ? { ...i, ...result.value } : i)));
      } else {
        let made;
        if (demo) made = { ...result.value, id: uid(), plan_id: planId, paid_on: null, paid_cents: null };
        else {
          const { data, error } = await client.from('payment_installments').insert({ ...result.value, plan_id: planId }).select('*').single();
          if (error) { onNotify(friendlyError(error, tr)); return; }
          made = data;
        }
        setItems(list => [...list, made]);
      }
      onNotify(tr('inst.itemSaved'));
      setItemForm(null);
    } finally { setWorking(false); }
  }
  async function pay(event) {
    event.preventDefault();
    const inst = items.find(i => i.id === payForm.id);
    const paid_cents = payForm.amount === '' ? inst.amount_cents : Math.round(Number(payForm.amount) * 100);
    if (!payForm.date || payForm.date > today || !(paid_cents === null || (Number.isInteger(paid_cents) && paid_cents >= 0))) { onNotify(tr('inst.error.pay')); return; }
    const patch = { paid_on: payForm.date, paid_cents };
    setWorking(true);
    try {
      if (!demo) { const { error } = await client.from('payment_installments').update(patch).eq('id', inst.id); if (error) { onNotify(friendlyError(error, tr)); return; } }
      setItems(list => list.map(i => (i.id === inst.id ? { ...i, ...patch } : i)));
      const plan = plans.find(p => p.id === inst.plan_id);
      onNotify([tr('inst.paidDone', { label: inst.label }), plan?.tax_category ? tr('inst.paid730') : ''].filter(Boolean).join(' '));
      setPayForm(null);
    } finally { setWorking(false); }
  }
  async function unpay(inst) {
    if (!demo) { const { error } = await client.from('payment_installments').update({ paid_on: null, paid_cents: null }).eq('id', inst.id); if (error) { onNotify(friendlyError(error, tr)); return; } }
    setItems(list => list.map(i => (i.id === inst.id ? { ...i, paid_on: null, paid_cents: null } : i)));
    onNotify(tr('inst.unpaid', { label: inst.label }));
  }
  async function deleteItem(inst) {
    if (!(await askConfirm(tr('inst.itemDeleteConfirm', { label: inst.label }), { danger: true }))) return;
    if (!demo) { const { error } = await client.from('payment_installments').delete().eq('id', inst.id); if (error) { onNotify(friendlyError(error, tr)); return; } }
    setItems(list => list.filter(i => i.id !== inst.id));
    onNotify(tr('inst.itemDeleted'));
  }
  const openPay = inst => { setItemForm(null); setGen(null); setPayForm({ id: inst.id, date: inst.due_on <= today ? inst.due_on : today, amount: inst.amount_cents ? (inst.amount_cents / 100).toFixed(2) : '' }); };

  const payFormFor = inst => payForm?.id === inst.id && <form className="health-done-form" onSubmit={pay}>
    <Field label={tr('inst.paidOn')}><input type="date" required max={today} value={payForm.date} onChange={e => setPayForm(f => ({ ...f, date: e.target.value }))} /></Field>
    <Field label={tr('inst.paidAmount')}><DecimalInput decimals={2} min="0" max={INST_LIMITS.maxCents / 100} value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} /></Field>
    <span className="extra-buttons"><button className="btn btn-primary" disabled={working}>{tr('inst.save')}</button><button type="button" className="btn btn-soft" onClick={() => setPayForm(null)}>{tr('inst.cancel')}</button></span>
  </form>;
  const payButton = inst => <button className="btn btn-soft" aria-label={tr('inst.payAria', { label: inst.label })} onClick={() => openPay(inst)}><Check size={15} /> {tr('inst.pay')}</button>;
  const amountText = inst => (inst.amount_cents ? money(inst.amount_cents) : tr('inst.amountUnknown'));

  const planCard = plan => {
    const mine = items.filter(i => i.plan_id === plan.id).sort((a, b) => a.due_on.localeCompare(b.due_on) || a.label.localeCompare(b.label));
    const sum = planSummary(plan, items, today), isOpen = !!open[plan.id];
    return <details key={plan.id} className="garden-plant" open={isOpen} onToggle={e => { const o = e.currentTarget.open; setOpen(x => (x[plan.id] === o ? x : { ...x, [plan.id]: o })); }}>
      <summary><span className="garden-plant-name"><b>{plan.title}</b>
        <small>{[tr('inst.kind.' + plan.kind), plan.person, plan.payee, plan.tax_category ? tr('inst.tax.' + plan.tax_category) : ''].filter(Boolean).join(' · ')}</small>
        {sum.next && <small className="garden-when">{tr('inst.next', { label: sum.next.label, date: day(sum.next.due_on), amount: amountText(sum.next) })}</small>}
        {sum.late > 0 && <small className="garden-warning">{tr('inst.lateCount', { count: sum.late })}</small>}</span></summary>
      {isOpen && <div className="garden-plant-body">
        {plan.notes && <p className="garden-notes">{plan.notes}</p>}
        <p className="muted">{tr('inst.paidYear', { year: today.slice(0, 4), amount: money(sum.paidYear) })}{' · '}{tr('inst.remindShort', { count: plan.remind_days })}</p>
        {writable && <div className="extra-buttons">
          <button className="btn btn-soft" onClick={() => startGen(plan)}><Plus size={15} /> {tr('inst.addRates')}</button>
          <button className="btn btn-soft" onClick={() => { setGen(null); setPayForm(null); setItemForm({ id: null, planId: plan.id, label: '', due_on: today, amount: '' }); }}><Plus size={15} /> {tr('inst.addOne')}</button>
          <button className="icon-button" aria-label={tr('inst.editPlanAria', { title: plan.title })} title={tr('inst.edit')} onClick={() => setPlanForm({ ...plan, tax_category: plan.tax_category || '' })}><Pencil size={15} /></button>
          {plan.ended_on ? <button className="icon-button" aria-label={tr('inst.restoreAria', { title: plan.title })} title={tr('inst.restore')} onClick={() => endPlan(plan, null)}><RotateCcw size={15} /></button>
            : <button className="icon-button" aria-label={tr('inst.endAria', { title: plan.title })} title={tr('inst.end')} onClick={() => endPlan(plan, today)}><Archive size={15} /></button>}
          <button className="icon-button danger" aria-label={tr('inst.deletePlanAria', { title: plan.title })} title={tr('inst.delete')} onClick={() => deletePlan(plan)}><Trash2 size={15} /></button>
        </div>}
        {gen?.planId === plan.id && <form className="extra-form garden-inline" onSubmit={saveGen}>
          <h3>{tr('inst.addRates')}</h3>
          <Field label={tr('inst.template')}><select value={gen.template} onChange={e => setGen(g => ({ ...g, template: e.target.value, skip: {} }))}>
            {[...new Set([...(KIND_TEMPLATES[plan.kind] || []), ...TEMPLATES])].map(k => <option key={k} value={k}>{tr('inst.template.' + k)}</option>)}</select></Field>
          <small className="muted">{tr('inst.templateHelp.' + gen.template)}</small>
          {['custom', 'monthly', 'domestic_pay'].includes(gen.template) && <div className="extra-row">
            <Field label={tr('inst.from')}><input type="date" required value={gen.from} onChange={e => setGen(g => ({ ...g, from: e.target.value, day: Number(e.target.value.slice(8)) || g.day, skip: {} }))} /></Field>
            <Field label={tr('inst.count')}><input type="number" min="1" max={INST_LIMITS.maxCount} value={gen.count} onChange={e => setGen(g => ({ ...g, count: e.target.value, skip: {} }))} /></Field>
          </div>}
          {gen.template === 'custom' && <Field label={tr('inst.every')}><select value={String(gen.every)} onChange={e => setGen(g => ({ ...g, every: Number(e.target.value), skip: {} }))}>
            {[0, 1, 2, 3, 4, 6, 12].map(n => <option key={n} value={n}>{n ? tr('inst.everyMonths', { count: n }) : tr('inst.once')}</option>)}</select></Field>}
          {gen.template === 'school_year' && <div className="extra-row">
            <Field label={tr('inst.schoolYear')}><select value={String(gen.schoolYear)} onChange={e => setGen(g => ({ ...g, schoolYear: Number(e.target.value), skip: {} }))}>
              {[0, 1].map(n => { const y = Number(today.slice(0, 4)) - 1 + n; return <option key={y} value={y}>{`${y}/${y + 1}`}</option>; })}</select></Field>
            <Field label={tr('inst.dayOfMonth')}><input type="number" min="1" max="31" value={gen.day} onChange={e => setGen(g => ({ ...g, day: e.target.value, skip: {} }))} /></Field>
          </div>}
          {!['domestic_inps', 'artisans_inps', 'income_taxes', 'vat_quarterly'].includes(gen.template) && <Field label={tr('inst.amountEach')}><DecimalInput decimals={2} min="0" max={INST_LIMITS.maxCents / 100} value={gen.amount} onChange={e => setGen(g => ({ ...g, amount: e.target.value }))} /></Field>}
          {gen.template === 'domestic_pay' && <label className="extra-toggle"><input type="checkbox" checked={gen.thirteenth} onChange={e => setGen(g => ({ ...g, thirteenth: e.target.checked }))} />{tr('inst.thirteenth')}</label>}
          {preview.length > 0 ? <fieldset className="inst-preview"><legend>{tr('inst.preview', { count: preview.filter(included).length })}</legend>
            {preview.map((row, index) => <label key={index} className="extra-toggle"><input type="checkbox" checked={included(row, index)} onChange={e => setGen(g => ({ ...g, skip: { ...g.skip, [index]: !e.target.checked } }))} />
              {row.label} · {day(row.due_on)}{row.amount_cents ? ' · ' + money(row.amount_cents) : ''}</label>)}</fieldset> : <p className="muted">{tr('inst.previewEmpty')}</p>}
          <div className="extra-buttons"><button className="btn btn-primary" disabled={working}>{tr('inst.addSelected')}</button><button type="button" className="btn btn-soft" onClick={() => setGen(null)}>{tr('inst.cancel')}</button></div>
        </form>}
        {itemForm?.planId === plan.id && <form className="extra-form garden-inline" onSubmit={saveItem}>
          <h3>{tr(itemForm.id ? 'inst.editItem' : 'inst.addOne')}</h3>
          <Field label={tr('inst.label')}><input required maxLength={INST_LIMITS.label} value={itemForm.label} placeholder={tr('inst.labelPlaceholder')} onChange={e => setItemForm(f => ({ ...f, label: e.target.value }))} /></Field>
          <div className="extra-row">
            <Field label={tr('inst.dueOn')}><input type="date" required value={itemForm.due_on} onChange={e => setItemForm(f => ({ ...f, due_on: e.target.value }))} /></Field>
            <Field label={tr('inst.amount')}><DecimalInput decimals={2} min="0.01" max={INST_LIMITS.maxCents / 100} value={itemForm.amount} onChange={e => setItemForm(f => ({ ...f, amount: e.target.value }))} /></Field>
          </div>
          <small className="muted">{tr('inst.amountHelp')}</small>
          <div className="extra-buttons"><button className="btn btn-primary" disabled={working}>{tr('inst.save')}</button><button type="button" className="btn btn-soft" onClick={() => setItemForm(null)}>{tr('inst.cancel')}</button></div>
        </form>}
        {!mine.length ? <p className="muted">{tr('inst.noItems')}</p> : <ul className="health-list inst-items">{mine.map(inst => {
          const s = installmentState(inst, today, plan.remind_days);
          return <li key={inst.id} className={`inst-${s}`}>
            <span><b>{inst.label} · {amountText(inst)}</b><small>{day(inst.due_on)} · <span className={`extra-pill inst-pill-${s}`}>{stateText(inst, plan)}</span></small></span>
            {writable && <span className="extra-buttons">
              {inst.paid_on ? <button className="icon-button" aria-label={tr('inst.unpayAria', { label: inst.label })} title={tr('inst.unpay')} onClick={() => unpay(inst)}><Undo2 size={15} /></button> : payButton(inst)}
              <button className="icon-button" aria-label={tr('inst.editItemAria', { label: inst.label })} title={tr('inst.edit')} onClick={() => { setGen(null); setPayForm(null); setItemForm({ id: inst.id, planId: plan.id, label: inst.label, due_on: inst.due_on, amount: inst.amount_cents ? (inst.amount_cents / 100).toFixed(2) : '' }); }}><Pencil size={15} /></button>
              <button className="icon-button danger" aria-label={tr('inst.deleteItemAria', { label: inst.label })} title={tr('inst.delete')} onClick={() => deleteItem(inst)}><Trash2 size={15} /></button>
            </span>}
            {payFormFor(inst)}
          </li>;
        })}</ul>}
      </div>}
    </details>;
  };

  const setP = patch => setPlanForm(f => ({ ...f, ...patch }));
  return <div className="extra-main installments">
    <div className="page-heading"><div><div className="eyebrow">{tr('inst.eyebrow')}</div><h1>{tr('nav.installments')}</h1><p>{tr('inst.help')}</p></div></div>
    <div className="informative"><Info size={17} /><p>{tr('inst.legalNote')}</p></div>
    {missing && <div className="informative"><Info size={17} /><p>{tr('inst.migration')}</p></div>}
    {demo && <div className="informative"><Info size={17} /><p>{tr('inst.demo')}</p></div>}
    {!demo && !missing && !canWrite && <div className="informative"><Info size={17} /><p>{tr('inst.readOnly')}</p></div>}
    {!missing && <div className="extra-layout">
      <section className="panel extra-panel">
        <h2><CalendarClock size={19} /> {tr('inst.upcoming')}</h2>
        <p className="inst-totals">{tr('inst.thisMonth', { amount: money(thisMonth.cents), count: thisMonth.count })}{thisMonth.unknown ? ' · ' + tr('inst.unknownCount', { count: thisMonth.unknown }) : ''}
          <br />{tr('inst.nextMonth', { amount: money(nextMonth.cents), count: nextMonth.count })}{nextMonth.unknown ? ' · ' + tr('inst.unknownCount', { count: nextMonth.unknown }) : ''}</p>
        {loading ? <p className="muted">{tr('general.loading')}</p> : !agenda.length ? <p className="muted">{tr('inst.upcomingEmpty')}</p> : <>
          <ul className="health-list inst-agenda">{agenda.slice(0, agendaShown).map(({ inst, plan, state }) => <li key={inst.id} className={`inst-${state}`}>
            <span><b>{inst.label} · {amountText(inst)}</b><small>{plan.title} · {day(inst.due_on)} · <span className={`extra-pill inst-pill-${state}`}>{tr('inst.state.' + state)}</span></small></span>
            {writable && !payForm && <span className="extra-buttons">{payButton(inst)}</span>}
            {payFormFor(inst)}
          </li>)}</ul>
          <ShowMore shown={Math.min(agendaShown, agenda.length)} total={agenda.length} onMore={setAgendaShown} /></>}
      </section>
      <section className="panel extra-panel">
        <h2><Wallet size={19} /> {tr('inst.plans')}</h2>
        {writable && !planForm && <button className="btn btn-soft" onClick={() => setPlanForm(blankPlan())}><Plus size={15} /> {tr('inst.addPlan')}</button>}
        {planForm && <form className="extra-form garden-inline" onSubmit={savePlan}>
          <h3>{tr(planForm.id ? 'inst.editPlan' : 'inst.addPlan')}</h3>
          <div className="extra-row">
            <Field label={tr('inst.kind')}><select value={planForm.kind} onChange={e => setP({ kind: e.target.value, ...(planForm.id ? {} : { tax_category: PLAN_TAX[e.target.value] || '' }) })}>{PLAN_KINDS.map(k => <option key={k} value={k}>{tr('inst.kind.' + k)}</option>)}</select></Field>
            <Field label={tr('inst.title')}><input required minLength={2} maxLength={INST_LIMITS.title} value={planForm.title} placeholder={tr('inst.titlePlaceholder.' + planForm.kind)} onChange={e => setP({ title: e.target.value })} /></Field>
          </div>
          <div className="extra-row">
            <Field label={tr('inst.person')}><input maxLength={INST_LIMITS.person} value={planForm.person} placeholder={tr('inst.personPlaceholder')} onChange={e => setP({ person: e.target.value })} /></Field>
            <Field label={tr('inst.payee')}><input maxLength={INST_LIMITS.payee} value={planForm.payee} placeholder={tr('inst.payeePlaceholder')} onChange={e => setP({ payee: e.target.value })} /></Field>
          </div>
          <div className="extra-row">
            <Field label={tr('inst.taxCategory')}><select value={planForm.tax_category || ''} onChange={e => setP({ tax_category: e.target.value })}><option value="">{tr('inst.tax.none')}</option>{TAX_CHOICES.map(c => <option key={c} value={c}>{tr('inst.tax.' + c)}</option>)}</select></Field>
            <Field label={tr('inst.remind')}><select value={String(planForm.remind_days)} onChange={e => setP({ remind_days: Number(e.target.value) })}>{REMIND_CHOICES.map(n => <option key={n} value={n}>{n ? tr('inst.remindDays', { count: n }) : tr('inst.remindSameDay')}</option>)}</select></Field>
          </div>
          {planForm.tax_category && <small className="muted">{tr('inst.taxHelp.' + planForm.tax_category)}</small>}
          <Field label={tr('inst.notes')}><textarea rows={2} maxLength={INST_LIMITS.notes} value={planForm.notes} onChange={e => setP({ notes: e.target.value })} /></Field>
          <div className="extra-buttons"><button className="btn btn-primary" disabled={working}>{tr('inst.save')}</button><button type="button" className="btn btn-soft" onClick={() => setPlanForm(null)}>{tr('inst.cancel')}</button></div>
        </form>}
        {loading ? null : !plans.length && !planForm ? <p className="muted">{tr('inst.plansEmpty')}</p> : <div className="garden-plants">{active.map(planCard)}</div>}
        {ended.length > 0 && <details className="garden-ended"><summary>{tr('inst.endedList', { count: ended.length })}</summary><div className="garden-plants">{ended.map(planCard)}</div></details>}
      </section>
    </div>}
  </div>;
}

// I testi della sezione arrivano quando la si apre (lib/i18n-dicts/<lingua>.inst.json).
export default function Installments(props) {
  const { t } = useLanguage();
  const ready = useSection('inst');
  return ready ? <InstallmentsSection {...props} /> : <p className="import-progress" role="status">{t('general.loading')}</p>;
}

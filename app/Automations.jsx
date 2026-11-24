'use client';
// Automazioni personalizzate (Fase 2, 3.3): regole di avviso scelte dalla persona, con prova
// prima di salvare, sospensione ed eliminazione. Il calcolo è lo stesso del controllo programmato
// (lib/automations.mjs), quindi la prova mostra davvero cosa farà la regola.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Zap, FlaskConical, Pause, Play, Trash2, Info } from 'lucide-react';
import { useLanguage, useSection } from './LanguageProvider';
import { askConfirm } from './ConfirmDialog';
import { friendlyError } from '../lib/friendly-error.mjs';
import { todayRome } from '../lib/dates.mjs';
import { BILL_CATEGORIES } from '../lib/bill-categories.mjs';
import { AUTOMATION_KINDS, AUTOMATION_LIMITS, normalizeAutomation, simulateAutomation, nextOccurrence } from '../lib/automations.mjs';
import DecimalInput from './DecimalInput';

const MISSING_TABLE = new Set(['42P01', 'PGRST205']);
const SHOWN = 8;
const blank = kind => ({ kind, name: '', amount_threshold: '', category: '', supplier_match: '', days_before: kind === 'recurring' ? 0 : 30, service_match: '', every_months: 3, next_on: todayRome(), notify_all: false });

function Field({ label, children }) { return <label className="extra-field">{label}{children}</label>; }

function AutomationsSection({ client, demo, user, homeId, canWrite, bills = [], onNotify = () => {} }) {
  const { t: tr, money, date } = useLanguage();
  const day = iso => date(iso, { day: 'numeric', month: 'short', year: 'numeric' });
  const [rules, setRules] = useState([]), [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(!demo), [missing, setMissing] = useState(false), [working, setWorking] = useState(false);
  const [form, setForm] = useState(blank('bill_amount'));
  const [preview, setPreview] = useState(null); // {key, rule}: 'form' oppure l'id della regola provata
  const today = todayRome();
  const writable = demo || canWrite;

  const load = useCallback(async () => {
    if (demo || !client || !user?.id) { setLoading(false); return; }
    setLoading(true);
    const scope = query => (homeId ? query.eq('home_id', homeId) : query.eq('user_id', user.id).is('home_id', null));
    const [ruleResult, contractResult] = await Promise.all([
      scope(client.from('home_automations').select('*')).order('created_at', { ascending: true }).limit(AUTOMATION_LIMITS.perSpace + 5),
      scope(client.from('home_contracts').select('id,supplier,service,renewal_on')).limit(500),
    ]);
    setLoading(false);
    if (ruleResult.error) {
      if (MISSING_TABLE.has(ruleResult.error.code)) setMissing(true);
      else onNotify(friendlyError(ruleResult.error, tr));
      return;
    }
    setMissing(false); setRules(ruleResult.data || []); setContracts(contractResult.data || []);
  }, [client, demo, homeId, user?.id]);
  useEffect(() => { setRules([]); setPreview(null); load(); }, [load]);

  const data = useMemo(() => ({ bills, contracts }), [bills, contracts]);

  function summary(rule) {
    const parts = [];
    if (rule.kind === 'bill_amount') {
      parts.push(tr('automation.summary.amount', { amount: money(Number(rule.amount_threshold)) }));
      if (rule.category) parts.push(tr('billCategory.' + rule.category));
      if (rule.supplier_match) parts.push(tr('automation.summary.contains', { text: rule.supplier_match }));
    } else if (rule.kind === 'contract_renewal') {
      parts.push(Number(rule.days_before) === 1 ? tr('automation.summary.renewalOne') : tr('automation.summary.renewal', { days: rule.days_before }));
      if (rule.service_match) parts.push(tr('automation.summary.contains', { text: rule.service_match }));
    } else {
      const next = nextOccurrence(rule.next_on, Number(rule.every_months), today);
      parts.push(Number(rule.every_months) === 1 ? tr('automation.summary.recurringMonthly', { date: day(next) }) : tr('automation.summary.recurring', { months: rule.every_months, date: day(next) }));
      const ahead = Number(rule.days_before) || 0;
      if (ahead) parts.push(ahead === 1 ? tr('automation.summary.aheadOne') : tr('automation.summary.ahead', { days: ahead }));
    }
    if (homeId) parts.push(rule.notify_all ? tr('automation.notifyAll') : tr('automation.notifyCreator'));
    return parts.join(' · ');
  }

  function itemText(rule, item) {
    const s = item.source;
    if (rule.kind === 'bill_amount') return tr('automation.sim.bill', { name: s.name, amount: money(s.amount), date: day(s.date) });
    if (rule.kind === 'contract_renewal') return tr('automation.sim.renewal', { name: s.name, service: s.service, date: day(s.date) });
    return tr('automation.sim.recurring', { name: s.name, date: day(s.date) });
  }

  // Una funzione, non un componente: così non si rimonta a ogni modifica del modulo.
  function simulation(rule) {
    const items = simulateAutomation(rule, data, today);
    return <div className="automation-sim" role="status">
      <b>{tr('automation.sim.title')}</b>
      {rule.paused && <p className="muted">{tr('automation.sim.paused')}</p>}
      {items.length ? <ul>{items.slice(0, SHOWN).map((item, i) => <li key={(item.reference_id || 'r') + i}>
        <span className={`extra-pill${item.fire_on === today ? '' : ' later'}`}>{item.fire_on === today ? tr('automation.sim.today') : tr('automation.sim.from', { date: day(item.fire_on) })}</span> {itemText(rule, item)}
      </li>)}</ul> : <p className="muted">{tr('automation.sim.none')}</p>}
      {items.length > SHOWN && <p className="muted">{tr('automation.sim.more', { count: items.length - SHOWN })}</p>}
      <small>{tr('automation.sim.once')}</small>
    </div>;
  }

  function checked() {
    const result = normalizeAutomation(form);
    if (result.error) { onNotify(tr(result.error)); return null; }
    if (!homeId) result.value.notify_all = false;
    return result.value;
  }
  function tryForm() { const value = checked(); if (value) setPreview({ key: 'form', rule: value }); }

  async function save(event) {
    event.preventDefault();
    const value = checked(); if (!value) return;
    if (rules.length >= AUTOMATION_LIMITS.perSpace) { onNotify(tr('automation.error.limit')); return; }
    if (demo) {
      setRules(list => [...list, { ...value, id: crypto.randomUUID(), created_at: new Date().toISOString() }]);
    } else {
      setWorking(true);
      const { error } = await client.from('home_automations').insert({ ...value, home_id: homeId || null });
      setWorking(false);
      if (error) { onNotify(friendlyError(error, tr)); return; }
      await load();
    }
    onNotify(tr('automation.saved'));
    setForm(blank(form.kind)); setPreview(null);
  }

  async function togglePause(rule) {
    const paused = !rule.paused;
    if (!demo) {
      const { error } = await client.from('home_automations').update({ paused }).eq('id', rule.id);
      if (error) { onNotify(friendlyError(error, tr)); return; }
    }
    setRules(list => list.map(r => (r.id === rule.id ? { ...r, paused } : r)));
    onNotify(tr(paused ? 'automation.pausedDone' : 'automation.resumedDone'));
  }

  async function remove(rule) {
    if (!(await askConfirm(tr('automation.deleteConfirm'), { danger: true }))) return;
    if (!demo) {
      const { error } = await client.from('home_automations').delete().eq('id', rule.id);
      if (error) { onNotify(friendlyError(error, tr)); return; }
    }
    setRules(list => list.filter(r => r.id !== rule.id));
    if (preview?.key === rule.id) setPreview(null);
    onNotify(tr('automation.deleted'));
  }

  const set = patch => { setForm(f => ({ ...f, ...patch })); if (preview?.key === 'form') setPreview(null); };
  const kind = form.kind;

  return <div className="extra-main automations">
    <div className="page-heading"><div><div className="eyebrow">{tr('automation.eyebrow')}</div><h1>{tr('nav.automations')}</h1><p>{tr('automation.help')}</p></div></div>
    {missing && <div className="informative"><Info size={17} /><p>{tr('automation.migration')}</p></div>}
    {demo && <div className="informative"><Info size={17} /><p>{tr('automation.demo')}</p></div>}
    {!missing && <div className="extra-layout">
      <section className="panel extra-panel">
        <h2><Zap size={19} /> {tr('automation.new')}</h2>
        {!writable ? <p className="muted">{tr('automation.readOnly')}</p> :
        <form className="extra-form" onSubmit={save}>
          <Field label={tr('automation.kind')}><select value={kind} onChange={e => { setForm(blank(e.target.value)); setPreview(null); }}>
            {AUTOMATION_KINDS.map(k => <option key={k} value={k}>{tr('automation.kind.' + k)}</option>)}
          </select></Field>
          <Field label={tr('automation.name')}><input required maxLength={80} value={form.name} placeholder={tr('automation.placeholder.' + kind)} onChange={e => set({ name: e.target.value })} /></Field>
          {kind === 'bill_amount' && <>
            <div className="extra-row">
              <Field label={tr('automation.threshold')}><DecimalInput required min="0.01" max={AUTOMATION_LIMITS.maxAmount} value={form.amount_threshold} onChange={e => set({ amount_threshold: e.target.value })} /></Field>
              <Field label={tr('automation.category')}><select value={form.category} onChange={e => set({ category: e.target.value })}>
                <option value="">{tr('automation.anyCategory')}</option>
                {BILL_CATEGORIES.map(c => <option key={c} value={c}>{tr('billCategory.' + c)}</option>)}
              </select></Field>
            </div>
            <Field label={tr('automation.supplierMatch')}><input maxLength={80} value={form.supplier_match} onChange={e => set({ supplier_match: e.target.value })} /></Field>
          </>}
          {kind === 'contract_renewal' && <div className="extra-row">
            <Field label={tr('automation.daysBefore')}><input required type="number" inputMode="numeric" min="1" max={AUTOMATION_LIMITS.maxDaysBefore} value={form.days_before} onChange={e => set({ days_before: e.target.value })} /></Field>
            <Field label={tr('automation.serviceMatch')}><input maxLength={80} value={form.service_match} onChange={e => set({ service_match: e.target.value })} /></Field>
          </div>}
          {kind === 'recurring' && <div className="extra-row">
            <Field label={tr('automation.everyMonths')}><input required type="number" inputMode="numeric" min="1" max={AUTOMATION_LIMITS.maxEveryMonths} value={form.every_months} onChange={e => set({ every_months: e.target.value })} /></Field>
            <Field label={tr('automation.firstDate')}><input required type="date" value={form.next_on} onChange={e => set({ next_on: e.target.value })} /></Field>
            <Field label={tr('automation.ahead')}><input type="number" inputMode="numeric" min="0" max={AUTOMATION_LIMITS.maxDaysBefore} value={form.days_before} onChange={e => set({ days_before: e.target.value })} /></Field>
          </div>}
          {homeId && <fieldset className="automation-notify"><legend>{tr('automation.notify')}</legend>
            <label className="extra-toggle"><input type="radio" name="automation-notify" checked={!form.notify_all} onChange={() => set({ notify_all: false })} /> {tr('automation.notifyMe')}</label>
            <label className="extra-toggle"><input type="radio" name="automation-notify" checked={form.notify_all} onChange={() => set({ notify_all: true })} /> {tr('automation.notifyAll')}</label>
          </fieldset>}
          <div className="extra-buttons">
            <button type="button" className="btn btn-soft" onClick={tryForm}><FlaskConical size={16} /> {tr('automation.try')}</button>
            <button type="submit" className="btn btn-primary" disabled={working}>{tr('automation.save')}</button>
          </div>
          {preview?.key === 'form' && simulation(preview.rule)}
        </form>}
      </section>
      <section className="panel extra-panel">
        <h2>{tr('automation.list')}</h2>
        {loading ? <p className="muted">{tr('general.loading')}</p> : !rules.length ? <p className="muted">{tr('automation.empty')}</p> :
        <div className="extra-list">{rules.map(rule => <div key={rule.id} className="automation-rule">
          <div className="extra-item">
            <div><b>{rule.name} <span className={`extra-pill${rule.paused ? ' paused' : ''}`}>{tr(rule.paused ? 'automation.paused' : 'automation.active')}</span></b>
              <small>{tr('automation.kind.' + rule.kind)} · {summary(rule)}</small></div>
            <div className="extra-buttons">
              <button className="btn btn-soft" onClick={() => setPreview(preview?.key === rule.id ? null : { key: rule.id, rule })} aria-expanded={preview?.key === rule.id}><FlaskConical size={15} /> {tr('automation.try')}</button>
              {writable && <button className="btn btn-soft" onClick={() => togglePause(rule)}>{rule.paused ? <Play size={15} /> : <Pause size={15} />} {tr(rule.paused ? 'automation.resume' : 'automation.pause')}</button>}
              {writable && <button className="icon-button danger" title={tr('automation.delete')} aria-label={tr('automation.delete')} onClick={() => remove(rule)}><Trash2 size={16} /></button>}
            </div>
          </div>
          {preview?.key === rule.id && simulation(rule)}
        </div>)}</div>}
      </section>
    </div>}
  </div>;
}

// I testi della sezione arrivano quando la si apre (lib/i18n-dicts/<lingua>.automation.json).
export default function Automations(props) {
  const { t } = useLanguage();
  const ready = useSection('automation');
  return ready ? <AutomationsSection {...props} /> : <p className="import-progress" role="status">{t('general.loading')}</p>;
}

'use client';
// Giardino e orto (richiesta dell'utente del 25 novembre 2026): piante con il loro piano di
// concimazioni, trattamenti, potature e rinvasi; proposte per tipo di pianta da accettare o
// cambiare prima di salvare; «Da fare» con fatto e rimanda; registro di quello che si è fatto.
// I promemoria li manda il lavoro giornaliero (lib/garden-alerts.mjs).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Sprout, CalendarCheck, Clock, BellOff, Pencil, Trash2, Plus, Info, Check, NotebookPen } from 'lucide-react';
import { useLanguage, useSection } from './LanguageProvider';
import { askConfirm } from './ConfirmDialog';
import { friendlyError } from '../lib/friendly-error.mjs';
import { todayRome } from '../lib/dates.mjs';
import { selectAll, selectIn } from '../lib/select-all.mjs';
import {
  TASK_KINDS, PLANT_KINDS, GARDEN_LIMITS, EVERY_CHOICES, PRESETS, PRESET_KEYS, ALL_MONTHS, monthWindows, normalizePlant, normalizeTask, normalizeLog,
  presetTasks, missingPresetTasks, gardenAgenda, taskState, deadlineOf, markDone, postpone,
} from '../lib/garden.mjs';

const MISSING_TABLE = new Set(['42P01', 'PGRST205', 'PGRST202']);
const uid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
const blankPlant = () => ({ id: null, preset: '', name: '', kind: 'other', location: '', notes: '' });
const blankTask = () => ({ id: null, kind: 'fertilize', title: '', product: '', dose: '', notes: '', months: [], every_days: 0, remind: true });
const blankLog = today => ({ done_on: today, task_id: '', kind: 'other', title: '', product: '', dose: '', notes: '' });

function Field({ label, children }) { return <label className="extra-field">{label}{children}</label>; }

// Dodici mesi da accendere o spegnere. Il nome accessibile è quello scritto (WCAG 2.5.3: chi usa
// la voce dice quello che vede); il nome intero è nel suggerimento.
function MonthPicker({ value, onChange, legend, locale }) {
  const names = useMemo(() => ALL_MONTHS.map(m => new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, m - 1, 15)))), [locale]);
  const full = useMemo(() => ALL_MONTHS.map(m => new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, m - 1, 15)))), [locale]);
  const set = new Set(value || []);
  return <fieldset className="garden-months"><legend>{legend}</legend><div>
    {ALL_MONTHS.map((m, i) => <button type="button" key={m} aria-pressed={set.has(m)} title={full[i]}
      onClick={() => onChange(set.has(m) ? [...set].filter(x => x !== m) : [...set, m].sort((a, b) => a - b))}>{names[i]}</button>)}
  </div></fieldset>;
}

// Campi di un intervento (nuovo, da cambiare o proposto).
function TaskFields({ task, onChange, tr, locale, notes = true }) {
  const set = patch => onChange({ ...task, ...patch });
  const choices = EVERY_CHOICES.includes(Number(task.every_days)) ? EVERY_CHOICES : [...EVERY_CHOICES, Number(task.every_days)].sort((a, b) => a - b);
  return <>
    <div className="extra-row">
      <Field label={tr('garden.taskKind')}><select value={task.kind} onChange={e => set({ kind: e.target.value })}>{TASK_KINDS.map(k => <option key={k} value={k}>{tr('garden.kind.' + k)}</option>)}</select></Field>
      <Field label={tr('garden.taskTitle')}><input required minLength={2} maxLength={GARDEN_LIMITS.title} value={task.title} placeholder={tr('garden.taskTitlePlaceholder')} onChange={e => set({ title: e.target.value })} /></Field>
    </div>
    <div className="extra-row">
      <Field label={tr('garden.product')}><input maxLength={GARDEN_LIMITS.product} value={task.product} placeholder={tr('garden.productPlaceholder')} onChange={e => set({ product: e.target.value })} /></Field>
      <Field label={tr('garden.dose')}><input maxLength={GARDEN_LIMITS.dose} value={task.dose} placeholder={tr('garden.dosePlaceholder')} onChange={e => set({ dose: e.target.value })} /></Field>
    </div>
    <MonthPicker value={task.months} onChange={months => set({ months })} legend={tr('garden.months')} locale={locale} />
    <Field label={tr('garden.every')}><select value={String(task.every_days)} onChange={e => set({ every_days: Number(e.target.value) })}>
      {choices.map(n => <option key={n} value={n}>{n ? tr('garden.everyDays', { count: n }) : tr('garden.everyOnce')}</option>)}</select></Field>
    <label className="extra-toggle"><input type="checkbox" checked={task.remind !== false} onChange={e => set({ remind: e.target.checked })} />{tr('garden.remind')}</label>
    {notes && <Field label={tr('garden.notes')}><textarea rows={2} maxLength={GARDEN_LIMITS.notes} value={task.notes || ''} onChange={e => set({ notes: e.target.value })} /></Field>}
  </>;
}

function GardenSection({ client, demo, user, homeId, canWrite, onNotify = () => {} }) {
  const { t: tr, locale, date } = useLanguage();
  const [plants, setPlants] = useState([]), [tasks, setTasks] = useState([]), [log, setLog] = useState([]);
  const [loading, setLoading] = useState(!demo), [missing, setMissing] = useState(false), [working, setWorking] = useState(false);
  const [form, setForm] = useState(blankPlant());
  const [proposal, setProposal] = useState([]);
  const [open, setOpen] = useState({});              // piante aperte
  const [taskForm, setTaskForm] = useState(null);    // {plantId, ...intervento}
  const [extra, setExtra] = useState(null);          // {plantId, items}: proposte che mancano a una pianta
  const [logForm, setLogForm] = useState(null);      // {plantId, ...voce}
  const [fullLog, setFullLog] = useState({});
  const today = todayRome();
  const writable = demo || canWrite;
  const day = iso => (iso ? date(iso, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

  const load = useCallback(async () => {
    if (demo || !client || !user?.id) { setLoading(false); return; }
    setLoading(true);
    const scope = query => (homeId ? query.eq('home_id', homeId) : query.eq('user_id', user.id).is('home_id', null));
    const list = await selectAll(count => scope(client.from('home_garden_plants').select('*', count ? { count: 'exact' } : undefined)).order('name').order('id'));
    if (list.error) {
      setLoading(false);
      if (MISSING_TABLE.has(list.error.code)) setMissing(true); else onNotify(friendlyError(list.error, tr));
      return;
    }
    const ids = (list.data || []).map(p => p.id);
    const [plan, done] = await Promise.all([
      selectIn((part, count) => client.from('home_garden_tasks').select('*', count ? { count: 'exact' } : undefined).in('plant_id', part).order('plant_id').order('id'), ids),
      selectIn((part, count) => client.from('home_garden_log').select('*', count ? { count: 'exact' } : undefined).in('plant_id', part).order('done_on', { ascending: false }).order('id'), ids),
    ]);
    setLoading(false);
    const failed = plan.error || done.error;
    if (failed) { onNotify(friendlyError(failed, tr)); return; }
    setMissing(false); setPlants(list.data || []); setTasks(plan.data || []); setLog(done.data || []);
  }, [client, demo, homeId, user?.id]);
  useEffect(() => { setPlants([]); setTasks([]); setLog([]); setForm(blankPlant()); setProposal([]); setTaskForm(null); setExtra(null); setLogForm(null); load(); }, [load]);

  const plantsById = useMemo(() => new Map(plants.map(p => [p.id, p])), [plants]);
  const tasksBy = useMemo(() => { const m = new Map(); for (const t of tasks) { if (!m.has(t.plant_id)) m.set(t.plant_id, []); m.get(t.plant_id).push(t); } return m; }, [tasks]);
  const logBy = useMemo(() => { const m = new Map(); for (const l of log) { if (!m.has(l.plant_id)) m.set(l.plant_id, []); m.get(l.plant_id).push(l); } return m; }, [log]);
  const agenda = useMemo(() => gardenAgenda(tasks, today).filter(x => plantsById.has(x.task.plant_id)), [tasks, today, plantsById]);
  const sortedPlants = useMemo(() => [...plants].sort((a, b) => a.name.localeCompare(b.name, locale)), [plants, locale]);
  const presetChoices = useMemo(() => PRESET_KEYS.map(key => ({ key, label: tr('garden.preset.' + key) })).sort((a, b) => a.label.localeCompare(b.label, locale)), [tr, locale]);

  const monthName = useCallback(m => new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, m - 1, 15))), [locale]);
  const monthsText = months => {
    const windows = monthWindows(months);
    if (windows.length === 1 && windows[0].length === 12) return tr('garden.monthsAll');
    return windows.map(w => (w.length === 1 ? monthName(w[0]) : `${monthName(w[0])}–${monthName(w[w.length - 1])}`)).join(', ');
  };
  const summary = task => [monthsText(task.months), Number(task.every_days) > 0 ? tr('garden.everyShort', { count: Number(task.every_days) }) : tr('garden.onceShort'),
    task.product, task.dose].filter(Boolean).join(' · ');
  const when = task => {
    const state = taskState(task, today);
    if (state === 'none') return '';
    if (state === 'due' || state === 'late') return tr('garden.until', { date: day(deadlineOf(task)) });
    return tr('garden.from', { date: day(task.next_on) });
  };

  // Scelta della proposta: il nome si riempie se è vuoto (o era il nome di un'altra proposta).
  function choosePreset(key) {
    const previous = form.preset ? tr('garden.preset.' + form.preset) : '';
    setForm(f => ({ ...f, preset: key, kind: key ? PRESETS[key].kind : f.kind,
      name: !f.name.trim() || f.name === previous ? (key ? tr('garden.preset.' + key) : '') : f.name }));
    setProposal(key ? presetTasks(key, tr, today).map(t => ({ ...t, use: true, open: false })) : []);
  }

  async function insertTasks(plantId, list) {
    const rows = [];
    for (const item of list) {
      const result = normalizeTask(item, today);
      if (result.error) { onNotify(tr(result.error)); return null; }
      rows.push({ ...result.value, plant_id: plantId });
    }
    if (!rows.length) return [];
    if ((tasksBy.get(plantId) || []).length + rows.length > GARDEN_LIMITS.tasksPerPlant) { onNotify(tr('garden.error.taskLimit')); return null; }
    if (demo) { const made = rows.map(r => ({ ...r, id: uid() })); setTasks(all => [...all, ...made]); return made; }
    const { data, error } = await client.from('home_garden_tasks').insert(rows).select('*');
    if (error) { onNotify(friendlyError(error, tr)); return null; }
    setTasks(all => [...all, ...(data || [])]);
    return data || [];
  }

  async function savePlant(event) {
    event.preventDefault();
    const result = normalizePlant(form);
    if (result.error) { onNotify(tr(result.error)); return; }
    const chosen = form.id ? [] : proposal.filter(p => p.use);
    for (const item of chosen) { const check = normalizeTask(item, today); if (check.error) { onNotify(`${item.title || tr('garden.taskTitle')}: ${tr(check.error)}`); return; } }
    if (!form.id && plants.length >= GARDEN_LIMITS.plantsPerSpace) { onNotify(tr('garden.error.limit')); return; }
    setWorking(true);
    try {
      if (form.id) {
        if (demo) setPlants(list => list.map(p => (p.id === form.id ? { ...p, ...result.value } : p)));
        else {
          const { error } = await client.from('home_garden_plants').update(result.value).eq('id', form.id);
          if (error) { onNotify(friendlyError(error, tr)); return; }
          setPlants(list => list.map(p => (p.id === form.id ? { ...p, ...result.value } : p)));
        }
        onNotify(tr('garden.updated'));
      } else {
        let plant;
        if (demo) plant = { ...result.value, id: uid(), home_id: homeId || null };
        else {
          const { data, error } = await client.from('home_garden_plants').insert({ ...result.value, user_id: user.id, home_id: homeId || null }).select('*').single();
          if (error) { onNotify(friendlyError(error, tr)); return; }
          plant = data;
        }
        setPlants(list => [...list, plant]);
        const made = await insertTasks(plant.id, chosen);
        setOpen(o => ({ ...o, [plant.id]: true }));
        if (made !== null) onNotify(made.length ? tr('garden.savedWith', { count: made.length }) : tr('garden.saved'));
      }
      setForm(blankPlant()); setProposal([]);
    } finally { setWorking(false); }
  }

  function editPlant(plant) {
    setForm({ id: plant.id, preset: plant.preset || '', name: plant.name, kind: plant.kind, location: plant.location || '', notes: plant.notes || '' });
    setProposal([]);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function deletePlant(plant) {
    if (!(await askConfirm(tr('garden.deleteConfirm'), { danger: true }))) return;
    if (!demo) {
      const { error } = await client.from('home_garden_plants').delete().eq('id', plant.id);
      if (error) { onNotify(friendlyError(error, tr)); return; }
    }
    setPlants(list => list.filter(p => p.id !== plant.id));
    setTasks(list => list.filter(t => t.plant_id !== plant.id));
    setLog(list => list.filter(l => l.plant_id !== plant.id));
    if (form.id === plant.id) setForm(blankPlant());
    onNotify(tr('garden.deleted'));
  }

  async function saveTask(event) {
    event.preventDefault();
    const { plantId, id, ...input } = taskForm;
    const old = id ? tasks.find(t => t.id === id) : null;
    // Mesi o frequenza cambiati: la prossima data si ricalcola dall'ultima volta.
    const changed = old && (String(old.months) !== String(input.months) || Number(old.every_days) !== Number(input.every_days));
    const result = normalizeTask({ ...input, last_done_on: old?.last_done_on || null, next_on: old && !changed ? old.next_on : null }, today);
    if (result.error) { onNotify(tr(result.error)); return; }
    setWorking(true);
    try {
      if (!id) {
        const made = await insertTasks(plantId, [result.value]);
        if (made === null) return;
        onNotify(tr('garden.taskSaved'));
      } else {
        if (!demo) {
          const { error } = await client.from('home_garden_tasks').update(result.value).eq('id', id);
          if (error) { onNotify(friendlyError(error, tr)); return; }
        }
        setTasks(list => list.map(t => (t.id === id ? { ...t, ...result.value } : t)));
        onNotify(tr('garden.taskUpdated'));
      }
      setTaskForm(null);
    } finally { setWorking(false); }
  }

  async function deleteTask(task) {
    if (!(await askConfirm(tr('garden.taskDeleteConfirm'), { danger: true }))) return;
    if (!demo) {
      const { error } = await client.from('home_garden_tasks').delete().eq('id', task.id);
      if (error) { onNotify(friendlyError(error, tr)); return; }
    }
    setTasks(list => list.filter(t => t.id !== task.id));
    setLog(list => list.map(l => (l.task_id === task.id ? { ...l, task_id: null } : l)));
    onNotify(tr('garden.taskDeleted'));
  }

  // Aggiorna l'intervento solo se nessun altro l'ha cambiato nel frattempo.
  async function updateTask(task, patch) {
    if (demo) { setTasks(list => list.map(t => (t.id === task.id ? { ...t, ...patch } : t))); return true; }
    let query = client.from('home_garden_tasks').update(patch).eq('id', task.id);
    query = task.next_on ? query.eq('next_on', task.next_on) : query.is('next_on', null);
    const { data, error } = await query.select('id');
    if (error) { onNotify(friendlyError(error, tr)); return false; }
    if (!data?.length) { onNotify(tr('v32.flow.changedByOther')); await load(); return false; }
    setTasks(list => list.map(t => (t.id === task.id ? { ...t, ...patch } : t)));
    return true;
  }

  async function writeLog(plantId, entry) {
    if (demo) { const row = { ...entry, plant_id: plantId, id: uid(), created_at: new Date().toISOString() }; setLog(list => [row, ...list]); return true; }
    const { data, error } = await client.from('home_garden_log').insert({ ...entry, plant_id: plantId }).select('*').single();
    if (error) { onNotify(friendlyError(error, tr)); return false; }
    setLog(list => [data, ...list].sort((a, b) => b.done_on.localeCompare(a.done_on)));
    return true;
  }

  async function done(task) {
    const patch = markDone(task, today);
    if (!(await updateTask(task, patch))) return;
    await writeLog(task.plant_id, { task_id: task.id, done_on: today, kind: task.kind, title: task.title, product: task.product || '', dose: task.dose || '', notes: '' });
    onNotify(tr('garden.doneSaved', { date: day(patch.next_on) }));
  }

  async function later(task) {
    const next = postpone(today);
    if (await updateTask(task, { next_on: next })) onNotify(tr('garden.postponed', { date: day(next) }));
  }

  async function addExtra(event) {
    event.preventDefault();
    const chosen = extra.items.filter(i => i.use);
    setWorking(true);
    try {
      const made = await insertTasks(extra.plantId, chosen);
      if (made === null) return;
      onNotify(tr('garden.tasksAdded', { count: made.length }));
      setExtra(null);
    } finally { setWorking(false); }
  }

  async function saveLog(event) {
    event.preventDefault();
    const { plantId, ...input } = logForm;
    const result = normalizeLog(input, today);
    if (result.error) { onNotify(tr(result.error)); return; }
    setWorking(true);
    try {
      if (!(await writeLog(plantId, result.value))) return;
      // Un intervento del piano fatto in una data più recente dell'ultima: si sposta la prossima data.
      const task = result.value.task_id ? tasks.find(t => t.id === result.value.task_id) : null;
      if (task && (!task.last_done_on || result.value.done_on > task.last_done_on)) await updateTask(task, markDone(task, result.value.done_on, today));
      onNotify(tr('garden.logSaved'));
      setLogForm(null);
    } finally { setWorking(false); }
  }

  async function deleteLog(entry) {
    if (!(await askConfirm(tr('garden.logDeleteConfirm'), { danger: true }))) return;
    if (!demo) {
      const { error } = await client.from('home_garden_log').delete().eq('id', entry.id);
      if (error) { onNotify(friendlyError(error, tr)); return; }
    }
    setLog(list => list.filter(l => l.id !== entry.id));
    onNotify(tr('garden.logDeleted'));
  }

  const setPlantField = patch => setForm(f => ({ ...f, ...patch }));
  const chosenCount = proposal.filter(p => p.use).length;

  // Elenco di interventi proposti: si tolgono con la casella, si cambiano con «Cambia».
  // Funzione e non componente: così i campi aperti non perdono il cursore a ogni lettera.
  const proposalList = (items, setItems) => <ul className="garden-proposal">{items.map((item, index) => {
    const set = patch => setItems(list => list.map((x, i) => (i === index ? { ...x, ...patch } : x)));
    return <li key={index} className={item.use ? '' : 'is-off'}>
      <div className="garden-proposal-head">
        <label className="extra-toggle"><input type="checkbox" checked={item.use} aria-label={tr('garden.useTask', { title: item.title })} onChange={e => set({ use: e.target.checked })} />
          <span><b>{item.title}</b><small>{summary(item)}</small></span></label>
        {item.use && <button type="button" className="btn btn-soft" aria-expanded={item.open} onClick={() => set({ open: !item.open })}>{tr(item.open ? 'garden.close' : 'garden.change')}</button>}
      </div>
      {item.use && item.open && <div className="garden-proposal-edit"><TaskFields task={item} onChange={next => set(next)} tr={tr} locale={locale} notes={false} /></div>}
    </li>;
  })}</ul>;

  return <div className="extra-main garden">
    <div className="page-heading"><div><div className="eyebrow">{tr('garden.eyebrow')}</div><h1>{tr('nav.garden')}</h1><p>{tr('garden.help')}</p></div></div>
    {missing && <div className="informative"><Info size={17} /><p>{tr('garden.migration')}</p></div>}
    {demo && <div className="informative"><Info size={17} /><p>{tr('garden.demo')}</p></div>}
    {!demo && !missing && !canWrite && <div className="informative"><Info size={17} /><p>{tr('garden.readOnly')}</p></div>}
    {!missing && <div className="extra-layout">
      <section className="panel extra-panel">
        <h2><CalendarCheck size={19} /> {tr('garden.agenda')}</h2>
        <p className="muted">{tr('garden.agendaHelp')}</p>
        {loading ? <p className="muted">{tr('general.loading')}</p> : !agenda.length ? <p className="muted">{tr('garden.agendaEmpty')}</p> :
        <div className="garden-agenda">{agenda.map(({ task, state }) => {
          const plant = plantsById.get(task.plant_id);
          return <div key={task.id} className={`garden-due ${state}`}>
            <div><b>{task.title}</b><small>{plant.name}{task.product ? ' · ' + task.product : ''}{task.dose ? ' · ' + task.dose : ''}</small>
              <small className="garden-when"><span className={`extra-pill garden-${state}`}>{tr('garden.state.' + state)}</span> {when(task)}</small></div>
            {writable && <div className="extra-buttons">
              <button className="btn btn-primary" aria-label={tr('garden.doneAria', { title: task.title, plant: plant.name })} onClick={() => done(task)}><Check size={15} /> {tr('garden.done')}</button>
              <button className="icon-button" aria-label={tr('garden.postponeAria', { title: task.title, plant: plant.name })} title={tr('garden.postpone')} onClick={() => later(task)}><Clock size={16} /></button>
            </div>}
          </div>;
        })}</div>}

        <h2 className="garden-form-title"><Sprout size={19} /> {tr(form.id ? 'garden.editPlant' : 'garden.newPlant')}</h2>
        {!writable ? <p className="muted">{tr('garden.readOnly')}</p> :
        <form className="extra-form" onSubmit={savePlant}>
          {!form.id && <Field label={tr('garden.preset')}><select value={form.preset} onChange={e => choosePreset(e.target.value)}>
            <option value="">{tr('garden.presetNone')}</option>{presetChoices.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}</select></Field>}
          {!form.id && <small className="muted">{tr('garden.presetHelp')}</small>}
          <Field label={tr('garden.name')}><input required minLength={2} maxLength={GARDEN_LIMITS.name} value={form.name} placeholder={tr('garden.namePlaceholder')} onChange={e => setPlantField({ name: e.target.value })} /></Field>
          <div className="extra-row">
            <Field label={tr('garden.plantKind')}><select value={form.kind} onChange={e => setPlantField({ kind: e.target.value })}>{PLANT_KINDS.map(k => <option key={k} value={k}>{tr('garden.plantKind.' + k)}</option>)}</select></Field>
            <Field label={tr('garden.location')}><input maxLength={GARDEN_LIMITS.location} value={form.location} placeholder={tr('garden.locationPlaceholder')} onChange={e => setPlantField({ location: e.target.value })} /></Field>
          </div>
          <Field label={tr('garden.notes')}><textarea rows={2} maxLength={GARDEN_LIMITS.notes} value={form.notes} onChange={e => setPlantField({ notes: e.target.value })} /></Field>
          {!form.id && proposal.length > 0 && <div className="garden-proposal-box">
            <h3>{tr('garden.proposal')}</h3>
            <small className="muted">{tr('garden.proposalHelp')}</small>
            {proposalList(proposal, setProposal)}
          </div>}
          <div className="extra-buttons">
            <button className="btn btn-primary" disabled={working}>{form.id ? tr('garden.update') : chosenCount ? tr('garden.savePlantWith', { count: chosenCount }) : tr('garden.savePlant')}</button>
            {(form.id || form.preset || form.name) && <button type="button" className="btn btn-soft" onClick={() => { setForm(blankPlant()); setProposal([]); }}>{tr('garden.cancel')}</button>}
          </div>
        </form>}
      </section>

      <section className="panel extra-panel">
        <h2><Sprout size={19} /> {tr('garden.plants')}</h2>
        {loading ? <p className="muted">{tr('general.loading')}</p> : !plants.length ? <p className="muted">{tr('garden.empty')}</p> :
        <div className="garden-plants">{sortedPlants.map(plant => {
          const plan = [...(tasksBy.get(plant.id) || [])].sort((a, b) => String(a.next_on || '9999').localeCompare(String(b.next_on || '9999')) || a.title.localeCompare(b.title, locale));
          const entries = logBy.get(plant.id) || [];
          const next = plan.find(t => t.next_on);
          const missingTasks = writable && plant.preset ? missingPresetTasks(plant, plan, tr, today) : [];
          const shownLog = fullLog[plant.id] ? entries : entries.slice(0, 5);
          return <details key={plant.id} className="garden-plant" open={Boolean(open[plant.id])} onToggle={e => { const isOpen = e.currentTarget.open; setOpen(o => (o[plant.id] === isOpen ? o : { ...o, [plant.id]: isOpen })); }}>
            <summary><span className="garden-plant-name"><b>{plant.name}</b>
              <small>{[tr('garden.plantKind.' + plant.kind), plant.location, tr('garden.taskCount', { count: plan.length })].filter(Boolean).join(' · ')}</small>
              {next && <small className="garden-when">{tr('garden.next', { title: next.title, date: day(next.next_on) })}</small>}</span></summary>
            <div className="garden-plant-body">
              {plant.notes && <p className="garden-notes">{plant.notes}</p>}
              {writable && <div className="extra-buttons">
                <button className="icon-button" aria-label={tr('garden.editPlantAria', { name: plant.name })} title={tr('garden.edit')} onClick={() => editPlant(plant)}><Pencil size={15} /></button>
                <button className="icon-button danger" aria-label={tr('garden.deletePlantAria', { name: plant.name })} title={tr('garden.delete')} onClick={() => deletePlant(plant)}><Trash2 size={15} /></button>
              </div>}
              <h3>{tr('garden.plan')}</h3>
              {!plan.length ? <p className="muted">{tr('garden.noTasks')}</p> : <ul className="garden-tasks">{plan.map(task => {
                const state = taskState(task, today);
                const editing = taskForm?.id === task.id;
                return <li key={task.id} className={`garden-task ${state}`}>
                  <div className="garden-task-head">
                    <div><b>{task.title}</b>
                      <small>{tr('garden.kind.' + task.kind)} · {summary(task)}</small>
                      <small className="garden-when">{state !== 'none' && <span className={`extra-pill garden-${state}`}>{tr('garden.state.' + state)}</span>} {when(task)}{task.last_done_on ? ' · ' + tr('garden.lastDone', { date: day(task.last_done_on) }) : ''}{task.remind === false ? <> · <BellOff size={12} aria-hidden="true" /> {tr('garden.noReminder')}</> : null}</small>
                      {task.notes && <small>{task.notes}</small>}</div>
                    {writable && <div className="extra-buttons">
                      {(state === 'due' || state === 'late' || state === 'soon') && <button className="btn btn-soft" aria-label={tr('garden.doneAria', { title: task.title, plant: plant.name })} onClick={() => done(task)}><Check size={15} /> {tr('garden.done')}</button>}
                      <button className="icon-button" aria-label={tr('garden.editTaskAria', { title: task.title })} title={tr('garden.edit')} onClick={() => setTaskForm(editing ? null : { ...blankTask(), ...task, plantId: plant.id })}><Pencil size={15} /></button>
                      <button className="icon-button danger" aria-label={tr('garden.deleteTaskAria', { title: task.title })} title={tr('garden.delete')} onClick={() => deleteTask(task)}><Trash2 size={15} /></button>
                    </div>}
                  </div>
                  {editing && <form className="extra-form garden-inline" onSubmit={saveTask}>
                    <TaskFields task={taskForm} onChange={next => setTaskForm(f => ({ ...f, ...next }))} tr={tr} locale={locale} />
                    <div className="extra-buttons"><button className="btn btn-primary" disabled={working}>{tr('garden.saveTask')}</button><button type="button" className="btn btn-soft" onClick={() => setTaskForm(null)}>{tr('garden.cancel')}</button></div>
                  </form>}
                </li>;
              })}</ul>}
              {writable && <div className="extra-buttons garden-plant-actions">
                <button className="btn btn-soft" aria-expanded={taskForm?.plantId === plant.id && !taskForm.id} onClick={() => setTaskForm(taskForm?.plantId === plant.id && !taskForm.id ? null : { ...blankTask(), plantId: plant.id })}><Plus size={15} /> {tr('garden.addTask')}</button>
                {missingTasks.length > 0 && <button className="btn btn-soft" aria-expanded={extra?.plantId === plant.id} onClick={() => setExtra(extra?.plantId === plant.id ? null : { plantId: plant.id, items: missingTasks.map(t => ({ ...t, use: true, open: false })) })}>{tr('garden.addMissing', { count: missingTasks.length })}</button>}
                <button className="btn btn-soft" aria-expanded={logForm?.plantId === plant.id} onClick={() => setLogForm(logForm?.plantId === plant.id ? null : { ...blankLog(today), plantId: plant.id })}><NotebookPen size={15} /> {tr('garden.logAdd')}</button>
              </div>}
              {taskForm?.plantId === plant.id && !taskForm.id && <form className="extra-form garden-inline" onSubmit={saveTask}>
                <h3>{tr('garden.addTask')}</h3>
                <TaskFields task={taskForm} onChange={next => setTaskForm(f => ({ ...f, ...next }))} tr={tr} locale={locale} />
                <div className="extra-buttons"><button className="btn btn-primary" disabled={working}>{tr('garden.saveTask')}</button><button type="button" className="btn btn-soft" onClick={() => setTaskForm(null)}>{tr('garden.cancel')}</button></div>
              </form>}
              {extra?.plantId === plant.id && <form className="extra-form garden-inline" onSubmit={addExtra}>
                <h3>{tr('garden.proposal')}</h3>
                <small className="muted">{tr('garden.proposalHelp')}</small>
                {proposalList(extra.items, update => setExtra(e => ({ ...e, items: typeof update === 'function' ? update(e.items) : update })))}
                <div className="extra-buttons"><button className="btn btn-primary" disabled={working || !extra.items.some(i => i.use)}>{tr('garden.addSelected', { count: extra.items.filter(i => i.use).length })}</button><button type="button" className="btn btn-soft" onClick={() => setExtra(null)}>{tr('garden.cancel')}</button></div>
              </form>}
              {logForm?.plantId === plant.id && <form className="extra-form garden-inline" onSubmit={saveLog}>
                <h3>{tr('garden.logAdd')}</h3>
                <div className="extra-row">
                  <Field label={tr('garden.logDate')}><input type="date" required max={today} value={logForm.done_on} onChange={e => setLogForm(f => ({ ...f, done_on: e.target.value }))} /></Field>
                  <Field label={tr('garden.task')}><select value={logForm.task_id} onChange={e => {
                    const task = plan.find(t => t.id === e.target.value);
                    setLogForm(f => ({ ...f, task_id: e.target.value, ...(task ? { kind: task.kind, title: task.title, product: task.product || '', dose: task.dose || '' } : {}) }));
                  }}><option value="">{tr('garden.taskNone')}</option>{plan.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select></Field>
                </div>
                <div className="extra-row">
                  <Field label={tr('garden.taskKind')}><select value={logForm.kind} onChange={e => setLogForm(f => ({ ...f, kind: e.target.value }))}>{TASK_KINDS.map(k => <option key={k} value={k}>{tr('garden.kind.' + k)}</option>)}</select></Field>
                  <Field label={tr('garden.taskTitle')}><input required minLength={2} maxLength={GARDEN_LIMITS.title} value={logForm.title} placeholder={tr('garden.taskTitlePlaceholder')} onChange={e => setLogForm(f => ({ ...f, title: e.target.value }))} /></Field>
                </div>
                <div className="extra-row">
                  <Field label={tr('garden.product')}><input maxLength={GARDEN_LIMITS.product} value={logForm.product} placeholder={tr('garden.productPlaceholder')} onChange={e => setLogForm(f => ({ ...f, product: e.target.value }))} /></Field>
                  <Field label={tr('garden.dose')}><input maxLength={GARDEN_LIMITS.dose} value={logForm.dose} placeholder={tr('garden.dosePlaceholder')} onChange={e => setLogForm(f => ({ ...f, dose: e.target.value }))} /></Field>
                </div>
                <Field label={tr('garden.notes')}><textarea rows={2} maxLength={GARDEN_LIMITS.notes} value={logForm.notes} onChange={e => setLogForm(f => ({ ...f, notes: e.target.value }))} /></Field>
                <div className="extra-buttons"><button className="btn btn-primary" disabled={working}>{tr('garden.logSave')}</button><button type="button" className="btn btn-soft" onClick={() => setLogForm(null)}>{tr('garden.cancel')}</button></div>
              </form>}
              <h3>{tr('garden.log')}</h3>
              {!entries.length ? <p className="muted">{tr('garden.logEmpty')}</p> : <ul className="garden-log">{shownLog.map(entry => <li key={entry.id}>
                <span><b>{day(entry.done_on)}</b> · {entry.title}{entry.product ? ' · ' + entry.product : ''}{entry.dose ? ' · ' + entry.dose : ''}{entry.notes ? <small>{entry.notes}</small> : null}</span>
                {writable && <button className="icon-button danger" aria-label={tr('garden.logDeleteAria', { title: entry.title, date: day(entry.done_on) })} title={tr('garden.delete')} onClick={() => deleteLog(entry)}><Trash2 size={14} /></button>}
              </li>)}</ul>}
              {entries.length > shownLog.length && <button className="btn btn-soft" onClick={() => setFullLog(f => ({ ...f, [plant.id]: true }))}>{tr('garden.logMore')}</button>}
            </div>
          </details>;
        })}</div>}
      </section>
    </div>}
  </div>;
}

// I testi della sezione arrivano quando la si apre (lib/i18n-dicts/<lingua>.garden.json).
export default function Garden(props) {
  const { t } = useLanguage();
  const ready = useSection('garden');
  return ready ? <GardenSection {...props} /> : <p className="import-progress" role="status">{t('general.loading')}</p>;
}

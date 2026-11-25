'use client';
// Giardino e orto (richiesta dell'utente del 25 novembre 2026): piante con il loro piano di
// concimazioni, trattamenti, potature e rinvasi; proposte per tipo di pianta da accettare o
// cambiare prima di salvare; «Da fare» con fatto e rimanda; registro di quello che si è fatto.
// I promemoria li manda il lavoro giornaliero (lib/garden-alerts.mjs).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Sprout, CalendarCheck, CalendarDays, Clock, BellOff, Pencil, Trash2, Plus, Info, Check, NotebookPen, ShoppingBasket, ShieldAlert, LayoutGrid, Archive, RotateCcw } from 'lucide-react';
import { useLanguage, useSection } from './LanguageProvider';
import { askConfirm } from './ConfirmDialog';
import { friendlyError } from '../lib/friendly-error.mjs';
import { todayRome } from '../lib/dates.mjs';
import { selectAll, selectIn } from '../lib/select-all.mjs';
import { stockStatus, titleKey } from '../lib/stock.mjs';
import DecimalInput from './DecimalInput';
import {
  TASK_KINDS, PLANT_KINDS, GARDEN_LIMITS, EVERY_CHOICES, PRESET_KEYS, ALL_MONTHS, CLIMATES, FAMILIES, EDIBLE_KINDS, monthWindows, normalizePlant, normalizeTask, normalizeLog,
  presetTasks, presetPlant, missingPresetTasks, gardenAgenda, taskState, deadlineOf, markDone, postpone, yearCalendar, expectedHarvest, safeHarvestFrom,
  rotationCheck, bedsOverview, addDays,
} from '../lib/garden.mjs';

const MISSING_TABLE = new Set(['42P01', 'PGRST205', 'PGRST202']);
const uid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
const blankPlant = () => ({ id: null, preset: '', name: '', kind: 'other', location: '', notes: '', planted_on: '', harvest_days: '', bed: '', family: '' });
const blankTask = () => ({ id: null, kind: 'fertilize', title: '', product: '', dose: '', notes: '', months: [], every_days: 0, remind: true, wait_days: '', stock_item_id: '', stock_use: '' });
const blankLog = today => ({ done_on: today, task_id: '', kind: 'other', title: '', product: '', dose: '', notes: '', wait_days: '' });
const GARDEN_CROPS = ['vegetable', 'herb'];

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
function TaskFields({ task, onChange, tr, locale, notes = true, stock = [], edible = false }) {
  const set = patch => onChange({ ...task, ...patch });
  const item = stock.find(s => s.id === task.stock_item_id);
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
    {(task.kind === 'treatment' || task.wait_days !== '' && task.wait_days !== null && task.wait_days !== undefined) && <>
      <Field label={tr('garden.waitDays')}><input type="number" inputMode="numeric" min="0" max={GARDEN_LIMITS.maxWaitDays} step="1" value={task.wait_days ?? ''} onChange={e => set({ wait_days: e.target.value })} /></Field>
      <small className={edible && task.kind === 'treatment' && (task.wait_days === '' || task.wait_days === null || task.wait_days === undefined) ? 'garden-warning' : 'muted'}>
        {edible && task.kind === 'treatment' && (task.wait_days === '' || task.wait_days === null || task.wait_days === undefined) ? tr('garden.waitMissing') : tr('garden.waitHelp')}</small>
    </>}
    {stock.length > 0 && <div className="extra-row">
      <Field label={tr('garden.stockItem')}><select value={task.stock_item_id || ''} onChange={e => { const chosen = stock.find(s => s.id === e.target.value); set({ stock_item_id: e.target.value, ...(chosen && !String(task.product || '').trim() ? { product: chosen.name } : {}) }); }}>
        <option value="">{tr('garden.stockNone')}</option>{stock.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
      {item && <Field label={tr('garden.stockUse', { unit: tr('garden.unit.' + item.unit) })}><DecimalInput decimals={3} min="0.01" max={GARDEN_LIMITS.maxStockUse} value={task.stock_use ?? ''} onChange={e => set({ stock_use: e.target.value })} /></Field>}
    </div>}
    {stock.length > 0 && task.stock_item_id && <small className="muted">{tr('garden.stockHelp')}</small>}
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
  const [climate, setClimate] = useState('mild'), [climateRow, setClimateRow] = useState(null);
  const [stock, setStock] = useState([]), [shopping, setShopping] = useState([]);
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
    // Clima del Programma stagionale e scorte dello spazio: se mancano, il giardino funziona lo stesso.
    const [settings, items, list2] = await Promise.all([
      scope(client.from('home_seasonal_settings').select('id,climate')).limit(1).maybeSingle(),
      scope(client.from('home_stock_items').select('id,name,unit,quantity,threshold,usual_buy')).order('name').limit(300),
      homeId ? client.from('home_shopping').select('title').eq('home_id', homeId).eq('checked', false).limit(300) : { data: [] },
    ]);
    if (!settings.error) { setClimateRow(settings.data || null); setClimate(CLIMATES.includes(settings.data?.climate) ? settings.data.climate : 'mild'); }
    setStock(items.error ? [] : items.data || []);
    setShopping(list2.error ? [] : (list2.data || []).map(r => r.title));
    const [plan, done] = await Promise.all([
      selectIn((part, count) => client.from('home_garden_tasks').select('*', count ? { count: 'exact' } : undefined).in('plant_id', part).order('plant_id').order('id'), ids),
      selectIn((part, count) => client.from('home_garden_log').select('*', count ? { count: 'exact' } : undefined).in('plant_id', part).order('done_on', { ascending: false }).order('id'), ids),
    ]);
    setLoading(false);
    const failed = plan.error || done.error;
    if (failed) { onNotify(friendlyError(failed, tr)); return; }
    setMissing(false); setPlants(list.data || []); setTasks(plan.data || []); setLog(done.data || []);
  }, [client, demo, homeId, user?.id]);
  useEffect(() => { setPlants([]); setTasks([]); setLog([]); setStock([]); setShopping([]); setForm(blankPlant()); setProposal([]); setTaskForm(null); setExtra(null); setLogForm(null); load(); }, [load]);

  const plantsById = useMemo(() => new Map(plants.map(p => [p.id, p])), [plants]);
  const activePlants = useMemo(() => plants.filter(p => !p.ended_on), [plants]);
  const endedPlants = useMemo(() => plants.filter(p => p.ended_on).sort((a, b) => b.ended_on.localeCompare(a.ended_on)), [plants]);
  const activeTasks = useMemo(() => tasks.filter(t => plantsById.has(t.plant_id) && !plantsById.get(t.plant_id).ended_on), [tasks, plantsById]);
  const calendar = useMemo(() => yearCalendar(activeTasks, today), [activeTasks, today]);
  const beds = useMemo(() => bedsOverview(plants, Number(today.slice(0, 4))), [plants, today]);
  const bedNames = useMemo(() => [...new Set(plants.map(p => (p.bed || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, locale)), [plants, locale]);
  const stockById = useMemo(() => new Map(stock.map(s => [s.id, s])), [stock]);
  // Prodotti del giardino da ricomprare: scorte collegate a un intervento, finite o sotto la soglia.
  const toBuy = useMemo(() => [...new Set(activeTasks.map(t => t.stock_item_id).filter(Boolean))].map(id => stockById.get(id)).filter(item => item && stockStatus(item) !== 'ok'), [activeTasks, stockById]);
  const tasksBy = useMemo(() => { const m = new Map(); for (const t of tasks) { if (!m.has(t.plant_id)) m.set(t.plant_id, []); m.get(t.plant_id).push(t); } return m; }, [tasks]);
  const logBy = useMemo(() => { const m = new Map(); for (const l of log) { if (!m.has(l.plant_id)) m.set(l.plant_id, []); m.get(l.plant_id).push(l); } return m; }, [log]);
  const agenda = useMemo(() => gardenAgenda(activeTasks, today), [activeTasks, today]);
  const sortedPlants = useMemo(() => [...activePlants].sort((a, b) => a.name.localeCompare(b.name, locale)), [activePlants, locale]);
  const number = value => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(Number(value) || 0);
  const amount = item => `${number(item.quantity)} ${tr('garden.unit.' + item.unit)}`;
  const familyLabel = family => tr('garden.family.' + family).split(' (')[0];
  const presetChoices = useMemo(() => PRESET_KEYS.map(key => ({ key, label: tr('garden.preset.' + key) })).sort((a, b) => a.label.localeCompare(b.label, locale)), [tr, locale]);

  const monthName = useCallback(m => new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, m - 1, 15))), [locale]);
  const monthsText = months => {
    const windows = monthWindows(months);
    if (windows.length === 1 && windows[0].length === 12) return tr('garden.monthsAll');
    return windows.map(w => (w.length === 1 ? monthName(w[0]) : `${monthName(w[0])}–${monthName(w[w.length - 1])}`)).join(', ');
  };
  const summary = task => [monthsText(task.months), Number(task.every_days) > 0 ? tr('garden.everyShort', { count: Number(task.every_days) }) : tr('garden.onceShort'),
    task.product, task.dose, Number(task.wait_days) > 0 ? tr('garden.waitShort', { count: Number(task.wait_days) }) : ''].filter(Boolean).join(' · ');
  const when = task => {
    const state = taskState(task, today);
    if (state === 'none') return '';
    if (state === 'due' || state === 'late') return tr('garden.until', { date: day(deadlineOf(task)) });
    return tr('garden.from', { date: day(task.next_on) });
  };

  // Scelta della proposta: il nome si riempie se è vuoto (o era il nome di un'altra proposta).
  function choosePreset(key) {
    const previous = form.preset ? tr('garden.preset.' + form.preset) : '';
    const defaults = key ? presetPlant(key) : null;
    setForm(f => ({ ...f, preset: key, kind: defaults ? defaults.kind : f.kind,
      family: defaults ? defaults.family || '' : f.family, harvest_days: defaults ? (defaults.harvest_days ? String(defaults.harvest_days) : '') : f.harvest_days,
      name: !f.name.trim() || f.name === previous ? (key ? tr('garden.preset.' + key) : '') : f.name }));
    setProposal(key ? presetTasks(key, tr, today, climate).map(t => ({ ...t, use: true, open: false, wait_days: '', stock_item_id: '', stock_use: '' })) : []);
  }

  // Clima della zona: lo stesso del Programma stagionale (una riga per spazio).
  async function saveClimate(value) {
    setClimate(value);
    if (form.preset && !form.id) setProposal(presetTasks(form.preset, tr, today, value).map(t => ({ ...t, use: true, open: false, wait_days: '', stock_item_id: '', stock_use: '' })));
    if (demo) { onNotify(tr('garden.climateSaved')); return; }
    const { data, error } = climateRow?.id
      ? await client.from('home_seasonal_settings').update({ climate: value }).eq('id', climateRow.id).select('id,climate').maybeSingle()
      : await client.from('home_seasonal_settings').insert({ climate: value, home_id: homeId || null }).select('id,climate').maybeSingle();
    if (error) { onNotify(friendlyError(error, tr)); return; }
    if (data) setClimateRow(data);
    onNotify(tr('garden.climateSaved'));
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
    setForm({ id: plant.id, preset: plant.preset || '', name: plant.name, kind: plant.kind, location: plant.location || '', notes: plant.notes || '',
      planted_on: plant.planted_on || '', harvest_days: plant.harvest_days ? String(plant.harvest_days) : '', bed: plant.bed || '', family: plant.family || '', ended_on: plant.ended_on || null });
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

  async function setEnded(plant, ended) {
    if (!demo) {
      const { error } = await client.from('home_garden_plants').update({ ended_on: ended }).eq('id', plant.id);
      if (error) { onNotify(friendlyError(error, tr)); return; }
    }
    setPlants(list => list.map(p => (p.id === plant.id ? { ...p, ended_on: ended } : p)));
    onNotify(tr(ended ? 'garden.ended' : 'garden.restored'));
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
    const wait = Number(task.wait_days) > 0 ? Number(task.wait_days) : null;
    await writeLog(task.plant_id, { task_id: task.id, done_on: today, kind: task.kind, title: task.title, product: task.product || '', dose: task.dose || '', notes: '', ...(wait ? { wait_days: wait } : {}) });
    const messages = [tr('garden.doneSaved', { date: day(patch.next_on) })];
    if (wait) messages.push(tr('garden.safeFromToast', { date: day(addDays(today, wait)) }));
    // Prodotto delle Scorte: si scala quanto se ne usa ogni volta (funzione del database, come «−»).
    const item = task.stock_item_id ? stockById.get(task.stock_item_id) : null;
    if (item && Number(task.stock_use) > 0) {
      let quantity = Math.max(0, Math.round((Number(item.quantity) - Number(task.stock_use)) * 100) / 100);
      if (!demo) {
        const { data, error } = await client.rpc('v46_adjust_stock', { p_item: item.id, p_delta: -Number(task.stock_use) });
        if (error) messages.push(friendlyError(error, tr)); else quantity = Number(data);
      }
      const updated = { ...item, quantity };
      setStock(list => list.map(s => (s.id === item.id ? updated : s)));
      if (stockStatus(updated) !== 'ok') messages.push(tr('garden.stockLow', { name: item.name, amount: amount(updated) }));
    }
    onNotify(messages.join(' '));
  }

  // Nella lista della spesa della casa: solo il prodotto scelto, una volta.
  async function addToShopping(item) {
    if (shopping.some(title => titleKey(title) === titleKey(item.name))) return;
    const { error } = await client.from('home_shopping').insert({ home_id: homeId, title: item.name, quantity: `${number(item.usual_buy)} ${tr('garden.unit.' + item.unit)}`.slice(0, 40) });
    if (error) { onNotify(friendlyError(error, tr)); return; }
    setShopping(list => [...list, item.name]);
    onNotify(tr('garden.addedToList', { name: item.name }));
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
  const cropYearOf = plant => Number(String(plant.planted_on || plant.created_at || '').slice(0, 4));
  const rotation = form.bed.trim() && form.family ? rotationCheck(plants, { id: form.id, bed: form.bed, family: form.family, year: Number((form.planted_on || today).slice(0, 4)) }) : null;
  const chosenCount = proposal.filter(p => p.use).length;

  // Elenco di interventi proposti: si tolgono con la casella, si cambiano con «Cambia».
  // Funzione e non componente: così i campi aperti non perdono il cursore a ogni lettera.
  const proposalList = (items, setItems, edible) => <ul className="garden-proposal">{items.map((item, index) => {
    const set = patch => setItems(list => list.map((x, i) => (i === index ? { ...x, ...patch } : x)));
    return <li key={index} className={item.use ? '' : 'is-off'}>
      <div className="garden-proposal-head">
        <label className="extra-toggle"><input type="checkbox" checked={item.use} aria-label={tr('garden.useTask', { title: item.title })} onChange={e => set({ use: e.target.checked })} />
          <span><b>{item.title}</b><small>{summary(item)}</small></span></label>
        {item.use && <button type="button" className="btn btn-soft" aria-expanded={item.open} onClick={() => set({ open: !item.open })}>{tr(item.open ? 'garden.close' : 'garden.change')}</button>}
      </div>
      {item.use && item.open && <div className="garden-proposal-edit"><TaskFields task={item} onChange={next => set(next)} tr={tr} locale={locale} notes={false} stock={demo ? [] : stock} edible={edible} /></div>}
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
        {toBuy.length > 0 && <div className="garden-tobuy">
          <h3><ShoppingBasket size={16} /> {tr('garden.toBuy')}</h3>
          <ul>{toBuy.map(item => <li key={item.id}><span><b>{item.name}</b> · {tr('garden.toBuyLine', { amount: amount(item) })}</span>
            {homeId && canWrite && !demo && (shopping.some(title => titleKey(title) === titleKey(item.name)) ? <small className="muted">{tr('garden.inList')}</small>
              : <button className="btn btn-soft" aria-label={tr('garden.addToListAria', { name: item.name })} onClick={() => addToShopping(item)}><Plus size={15} /> {tr('garden.addToList')}</button>)}</li>)}</ul>
          {!homeId && <small className="muted">{tr('garden.toBuyPersonal')}</small>}
        </div>}

        <h2 className="garden-form-title"><Sprout size={19} /> {tr(form.id ? 'garden.editPlant' : 'garden.newPlant')}</h2>
        {!writable ? <p className="muted">{tr('garden.readOnly')}</p> :
        <form className="extra-form" onSubmit={savePlant}>
          {!form.id && <div className="garden-climate">
            <Field label={tr('garden.climate')}><select value={climate} onChange={e => saveClimate(e.target.value)}>{CLIMATES.map(c => <option key={c} value={c}>{tr('garden.climate.' + c)}</option>)}</select></Field>
            <small className="muted">{tr('garden.climateHelp')}</small>
          </div>}
          {!form.id && <Field label={tr('garden.preset')}><select value={form.preset} onChange={e => choosePreset(e.target.value)}>
            <option value="">{tr('garden.presetNone')}</option>{presetChoices.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}</select></Field>}
          {!form.id && <small className="muted">{tr('garden.presetHelp')}</small>}
          <Field label={tr('garden.name')}><input required minLength={2} maxLength={GARDEN_LIMITS.name} value={form.name} placeholder={tr('garden.namePlaceholder')} onChange={e => setPlantField({ name: e.target.value })} /></Field>
          <div className="extra-row">
            <Field label={tr('garden.plantKind')}><select value={form.kind} onChange={e => setPlantField({ kind: e.target.value })}>{PLANT_KINDS.map(k => <option key={k} value={k}>{tr('garden.plantKind.' + k)}</option>)}</select></Field>
            <Field label={tr('garden.location')}><input maxLength={GARDEN_LIMITS.location} value={form.location} placeholder={tr('garden.locationPlaceholder')} onChange={e => setPlantField({ location: e.target.value })} /></Field>
          </div>
          <Field label={tr('garden.notes')}><textarea rows={2} maxLength={GARDEN_LIMITS.notes} value={form.notes} onChange={e => setPlantField({ notes: e.target.value })} /></Field>
          {(GARDEN_CROPS.includes(form.kind) || form.bed || form.family || form.planted_on) && <fieldset className="garden-crop">
            <legend>{tr('garden.vegetableGarden')}</legend>
            <div className="extra-row">
              <Field label={tr('garden.plantedOn')}><input type="date" value={form.planted_on} onChange={e => setPlantField({ planted_on: e.target.value })} /></Field>
              <Field label={tr('garden.harvestDays')}><input type="number" inputMode="numeric" min="1" max={GARDEN_LIMITS.maxHarvestDays} step="1" value={form.harvest_days} onChange={e => setPlantField({ harvest_days: e.target.value })} /></Field>
            </div>
            {expectedHarvest(form) && <small className="garden-when">{tr('garden.expectedHarvest', { date: day(expectedHarvest(form)) })}</small>}
            <div className="extra-row">
              <Field label={tr('garden.bed')}><input list="garden-beds" maxLength={GARDEN_LIMITS.bed} value={form.bed} placeholder={tr('garden.bedPlaceholder')} onChange={e => setPlantField({ bed: e.target.value })} /></Field>
              <Field label={tr('garden.family')}><select value={form.family} onChange={e => setPlantField({ family: e.target.value })}><option value="">{tr('garden.familyNone')}</option>{FAMILIES.map(f => <option key={f} value={f}>{tr('garden.family.' + f)}</option>)}</select></Field>
            </div>
            <datalist id="garden-beds">{bedNames.map(b => <option key={b} value={b} />)}</datalist>
            {rotation && <p className={rotation.conflicts.length ? 'garden-warning' : 'garden-ok'} role="status">{rotation.conflicts.length
              ? tr('garden.rotationConflict', { year: cropYearOf(rotation.conflicts[0]), names: rotation.conflicts.map(p => p.name).join(', ') })
              : tr('garden.rotationOk')}</p>}
          </fieldset>}
          {!form.id && proposal.length > 0 && <div className="garden-proposal-box">
            <h3>{tr('garden.proposal')}</h3>
            <small className="muted">{tr('garden.proposalHelp')}</small>
            {proposalList(proposal, setProposal, EDIBLE_KINDS.includes(form.kind))}
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
          const missingTasks = writable && plant.preset ? missingPresetTasks(plant, plan, tr, today, climate).map(t => ({ ...t, wait_days: '', stock_item_id: '', stock_use: '' })) : [];
          const shownLog = fullLog[plant.id] ? entries : entries.slice(0, 5);
          const safeFrom = EDIBLE_KINDS.includes(plant.kind) ? safeHarvestFrom(entries, today) : null;
          const harvest = expectedHarvest(plant);
          return <details key={plant.id} className="garden-plant" open={Boolean(open[plant.id])} onToggle={e => { const isOpen = e.currentTarget.open; setOpen(o => (o[plant.id] === isOpen ? o : { ...o, [plant.id]: isOpen })); }}>
            <summary><span className="garden-plant-name"><b>{plant.name}</b>
              <small>{[tr('garden.plantKind.' + plant.kind), plant.location, plant.bed, tr('garden.taskCount', { count: plan.length })].filter(Boolean).join(' · ')}</small>
              {safeFrom && <small className="garden-safe"><ShieldAlert size={13} aria-hidden="true" /> {tr('garden.safeFrom', { date: day(safeFrom) })}</small>}
              {next && <small className="garden-when">{tr('garden.next', { title: next.title, date: day(next.next_on) })}</small>}</span></summary>
            <div className="garden-plant-body">
              {plant.notes && <p className="garden-notes">{plant.notes}</p>}
              {(harvest || plant.family) && <p className="garden-notes">{[plant.family ? familyLabel(plant.family) : '', harvest ? tr('garden.expectedHarvest', { date: day(harvest) }) : ''].filter(Boolean).join(' · ')}</p>}
              {writable && <div className="extra-buttons">
                <button className="btn btn-soft" aria-label={tr('garden.endCropAria', { name: plant.name })} onClick={() => setEnded(plant, today)}><Archive size={15} /> {tr('garden.endCrop')}</button>
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
                      <small>{tr('garden.kind.' + task.kind)} · {summary(task)}{task.stock_item_id && stockById.get(task.stock_item_id) ? ` · ${tr('garden.stockItem')}: ${stockById.get(task.stock_item_id).name}` : ''}</small>
                      <small className="garden-when">{state !== 'none' && <span className={`extra-pill garden-${state}`}>{tr('garden.state.' + state)}</span>} {when(task)}{task.last_done_on ? ' · ' + tr('garden.lastDone', { date: day(task.last_done_on) }) : ''}{task.remind === false ? <> · <BellOff size={12} aria-hidden="true" /> {tr('garden.noReminder')}</> : null}</small>
                      {task.notes && <small>{task.notes}</small>}</div>
                    {writable && <div className="extra-buttons">
                      {(state === 'due' || state === 'late' || state === 'soon') && <button className="btn btn-soft" aria-label={tr('garden.doneAria', { title: task.title, plant: plant.name })} onClick={() => done(task)}><Check size={15} /> {tr('garden.done')}</button>}
                      <button className="icon-button" aria-label={tr('garden.editTaskAria', { title: task.title })} title={tr('garden.edit')} onClick={() => setTaskForm(editing ? null : { ...blankTask(), ...task, wait_days: task.wait_days ?? '', stock_item_id: task.stock_item_id || '', stock_use: task.stock_use ?? '', plantId: plant.id })}><Pencil size={15} /></button>
                      <button className="icon-button danger" aria-label={tr('garden.deleteTaskAria', { title: task.title })} title={tr('garden.delete')} onClick={() => deleteTask(task)}><Trash2 size={15} /></button>
                    </div>}
                  </div>
                  {editing && <form className="extra-form garden-inline" onSubmit={saveTask}>
                    <TaskFields task={taskForm} onChange={next => setTaskForm(f => ({ ...f, ...next }))} tr={tr} locale={locale} stock={demo ? [] : stock} edible={EDIBLE_KINDS.includes(plant.kind)} />
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
                <TaskFields task={taskForm} onChange={next => setTaskForm(f => ({ ...f, ...next }))} tr={tr} locale={locale} stock={demo ? [] : stock} edible={EDIBLE_KINDS.includes(plant.kind)} />
                <div className="extra-buttons"><button className="btn btn-primary" disabled={working}>{tr('garden.saveTask')}</button><button type="button" className="btn btn-soft" onClick={() => setTaskForm(null)}>{tr('garden.cancel')}</button></div>
              </form>}
              {extra?.plantId === plant.id && <form className="extra-form garden-inline" onSubmit={addExtra}>
                <h3>{tr('garden.proposal')}</h3>
                <small className="muted">{tr('garden.proposalHelp')}</small>
                {proposalList(extra.items, update => setExtra(e => ({ ...e, items: typeof update === 'function' ? update(e.items) : update })), EDIBLE_KINDS.includes(plant.kind))}
                <div className="extra-buttons"><button className="btn btn-primary" disabled={working || !extra.items.some(i => i.use)}>{tr('garden.addSelected', { count: extra.items.filter(i => i.use).length })}</button><button type="button" className="btn btn-soft" onClick={() => setExtra(null)}>{tr('garden.cancel')}</button></div>
              </form>}
              {logForm?.plantId === plant.id && <form className="extra-form garden-inline" onSubmit={saveLog}>
                <h3>{tr('garden.logAdd')}</h3>
                <div className="extra-row">
                  <Field label={tr('garden.logDate')}><input type="date" required max={today} value={logForm.done_on} onChange={e => setLogForm(f => ({ ...f, done_on: e.target.value }))} /></Field>
                  <Field label={tr('garden.task')}><select value={logForm.task_id} onChange={e => {
                    const task = plan.find(t => t.id === e.target.value);
                    setLogForm(f => ({ ...f, task_id: e.target.value, ...(task ? { kind: task.kind, title: task.title, product: task.product || '', dose: task.dose || '', wait_days: task.wait_days ?? '' } : {}) }));
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
                {(logForm.kind === 'treatment' || logForm.wait_days !== '') && <Field label={tr('garden.waitDays')}><input type="number" inputMode="numeric" min="0" max={GARDEN_LIMITS.maxWaitDays} step="1" value={logForm.wait_days ?? ''} onChange={e => setLogForm(f => ({ ...f, wait_days: e.target.value }))} /></Field>}
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
        {endedPlants.length > 0 && <details className="garden-ended">
          <summary>{tr('garden.endedList', { count: endedPlants.length })}</summary>
          <ul>{endedPlants.map(plant => <li key={plant.id}>
            <span><b>{plant.name}</b><small>{[plant.bed, plant.family ? familyLabel(plant.family) : '', tr('garden.endedOn', { date: day(plant.ended_on) })].filter(Boolean).join(' · ')}</small></span>
            {writable && <span className="extra-buttons">
              <button className="icon-button" aria-label={tr('garden.restoreAria', { name: plant.name })} title={tr('garden.restore')} onClick={() => setEnded(plant, null)}><RotateCcw size={15} /></button>
              <button className="icon-button danger" aria-label={tr('garden.deletePlantAria', { name: plant.name })} title={tr('garden.delete')} onClick={() => deletePlant(plant)}><Trash2 size={15} /></button>
            </span>}
          </li>)}</ul>
        </details>}
      </section>
    </div>}

    {!missing && !loading && activeTasks.length > 0 && <section className="panel extra-panel garden-calendar">
      <h2><CalendarDays size={19} /> {tr('garden.calendar')}</h2>
      <p className="muted">{tr('garden.calendarHelp')}</p>
      <div className="garden-months-grid">{calendar.map((month, index) => <details key={month.key} open={index < 2}>
        <summary><b>{new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(month.year, month.month - 1, 15)))}</b>
          <small>{month.entries.length ? tr('garden.calendarCount', { count: month.entries.length }) : tr('garden.calendarEmpty')}</small></summary>
        {month.entries.length > 0 && <ul>{month.entries.map(({ task, dates }) => <li key={task.id}>
          <span className="garden-days">{dates.map(d => Number(d.slice(8))).join(', ')}</span>
          <span><b>{task.title}</b><small>{plantsById.get(task.plant_id)?.name}{task.product ? ' · ' + task.product : ''}</small></span>
        </li>)}</ul>}
      </details>)}</div>
    </section>}

    {!missing && !loading && beds.length > 0 && <section className="panel extra-panel garden-beds">
      <h2><LayoutGrid size={19} /> {tr('garden.beds')}</h2>
      <p className="muted">{tr('garden.bedsHelp')}</p>
      <div className="garden-beds-grid">{beds.map(bed => <div key={bed.bed} className="garden-bed">
        <b>{bed.bed}</b>
        <small>{bed.now.length ? tr('garden.bedNow', { names: bed.now.map(p => p.name).join(', ') }) : tr('garden.bedEmpty')}</small>
        {bed.years.map(([year, list]) => <small key={year}>{tr('garden.bedYear', { year, names: list.map(p => p.family ? `${p.name} (${familyLabel(p.family)})` : p.name).join(', ') })}</small>)}
        {bed.suggestions.length > 0 && <small className="garden-ok">{tr('garden.bedNext', { families: bed.suggestions.map(familyLabel).join(', ') })}</small>}
      </div>)}</div>
    </section>}
  </div>;
}

// I testi della sezione arrivano quando la si apre (lib/i18n-dicts/<lingua>.garden.json).
export default function Garden(props) {
  const { t } = useLanguage();
  const ready = useSection('garden');
  return ready ? <GardenSection {...props} /> : <p className="import-progress" role="status">{t('general.loading')}</p>;
}

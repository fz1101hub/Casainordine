'use client';
// Animali di casa (scelta dell'utente del 25 novembre 2026, sera): scheda di ogni animale con il
// veterinario e il cibo delle Scorte; piano di vaccini, antiparassitari, vermifughi, visite e cure
// con proposte per specie da accettare o cambiare; «Da fare» con fatto e rimanda; registro con peso
// e spese. I promemoria e l'avviso del cibo che finisce li manda il lavoro giornaliero (lib/pet-alerts.mjs).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PawPrint, CalendarCheck, Clock, Pencil, Trash2, Plus, Info, Check, NotebookPen, ShoppingBasket, Archive, RotateCcw, Phone, Scale } from 'lucide-react';
import { useLanguage, useSection } from './LanguageProvider';
import ShowMore from './ShowMore';
import { askConfirm } from './ConfirmDialog';
import { friendlyError } from '../lib/friendly-error.mjs';
import { todayRome } from '../lib/dates.mjs';
import { selectAll, selectIn } from '../lib/select-all.mjs';
import { stockStatus, titleKey } from '../lib/stock.mjs';
import DecimalInput from './DecimalInput';
import {
  SPECIES, PET_TASK_KINDS, PET_LOG_KINDS, PET_LIMITS, PET_EVERY_CHOICES, PET_PRESET_KEYS, PET_PRESETS, normalizePet, normalizePetTask, normalizePetLog,
  petPresetTasks, missingPetPresetTasks, petAgenda, petTaskState, markPetDone, postponePet, petAge, weightSeries, weightChange, foodEstimates, vetCosts,
} from '../lib/pets.mjs';

const MISSING_TABLE = new Set(['42P01', 'PGRST205', 'PGRST202']);
const uid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
const blankPet = () => ({ id: null, preset: '', name: '', species: 'dog', breed: '', sex: '', birth_on: '', neutered: false, microchip: '', weight_kg: '', food_stock_item_id: '', food_daily: '', vet_name: '', vet_phone: '', notes: '' });
const blankTask = today => ({ id: null, kind: 'vaccine', title: '', product: '', dose: '', notes: '', every_days: 365, next_on: today, remind: true, stock_item_id: '', stock_use: '' });
const blankLog = today => ({ done_on: today, task_id: '', kind: 'vet_visit', title: '', product: '', dose: '', notes: '', weight_kg: '', cost: '' });

function Field({ label, children }) { return <label className="extra-field">{label}{children}</label>; }

// «Ogni quanto» in parole: anni, mesi, settimane o giorni.
export function everyLabel(tr, days) {
  const n = Number(days) || 0;
  if (!n) return tr('pets.everyOnce');
  if (n % 365 === 0) return tr('pets.everyYears', { years: n / 365 });
  if (n % 30 === 0) return tr('pets.everyMonths', { months: n / 30 });
  if (n % 7 === 0) return tr('pets.everyWeeks', { count: n / 7 });
  return tr('pets.everyDays', { days: n });
}

// Campi di una voce del piano (nuova, da cambiare o proposta).
function TaskFields({ task, onChange, tr, notes = true, stock = [] }) {
  const set = patch => onChange({ ...task, ...patch });
  const item = stock.find(s => s.id === task.stock_item_id);
  const choices = PET_EVERY_CHOICES.includes(Number(task.every_days)) ? PET_EVERY_CHOICES : [...PET_EVERY_CHOICES, Number(task.every_days)].sort((a, b) => a - b);
  return <>
    <div className="extra-row">
      <Field label={tr('pets.taskKind')}><select value={task.kind} onChange={e => set({ kind: e.target.value })}>{PET_TASK_KINDS.map(k => <option key={k} value={k}>{tr('pets.kind.' + k)}</option>)}</select></Field>
      <Field label={tr('pets.taskTitle')}><input required minLength={2} maxLength={PET_LIMITS.title} value={task.title} placeholder={tr('pets.taskTitlePlaceholder')} onChange={e => set({ title: e.target.value })} /></Field>
    </div>
    <div className="extra-row">
      <Field label={tr('pets.product')}><input maxLength={PET_LIMITS.product} value={task.product} placeholder={tr('pets.productPlaceholder')} onChange={e => set({ product: e.target.value })} /></Field>
      <Field label={tr('pets.dose')}><input maxLength={PET_LIMITS.dose} value={task.dose} placeholder={tr('pets.dosePlaceholder')} onChange={e => set({ dose: e.target.value })} /></Field>
    </div>
    <div className="extra-row">
      <Field label={tr('pets.every')}><select value={String(task.every_days)} onChange={e => set({ every_days: Number(e.target.value) })}>
        {choices.map(n => <option key={n} value={n}>{everyLabel(tr, n)}</option>)}</select></Field>
      <Field label={tr('pets.nextOn')}><input type="date" value={task.next_on || ''} onChange={e => set({ next_on: e.target.value })} /></Field>
    </div>
    {stock.length > 0 && <div className="extra-row">
      <Field label={tr('pets.stockItem')}><select value={task.stock_item_id || ''} onChange={e => { const chosen = stock.find(s => s.id === e.target.value); set({ stock_item_id: e.target.value, ...(chosen && !String(task.product || '').trim() ? { product: chosen.name } : {}) }); }}>
        <option value="">{tr('pets.stockNone')}</option>{stock.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
      {item && <Field label={tr('pets.stockUse', { unit: tr('pets.unit.' + item.unit) })}><DecimalInput decimals={3} min="0.01" max={PET_LIMITS.maxFood} value={task.stock_use ?? ''} onChange={e => set({ stock_use: e.target.value })} /></Field>}
    </div>}
    <label className="extra-toggle"><input type="checkbox" checked={task.remind !== false} onChange={e => set({ remind: e.target.checked })} />{tr('pets.remind')}</label>
    {notes && <Field label={tr('pets.notes')}><textarea rows={2} maxLength={PET_LIMITS.notes} value={task.notes || ''} onChange={e => set({ notes: e.target.value })} /></Field>}
  </>;
}

function PetsSection({ client, demo, user, homeId, canWrite, onNotify = () => {} }) {
  const { t: tr, locale, date } = useLanguage();
  const [pets, setPets] = useState([]), [tasks, setTasks] = useState([]), [log, setLog] = useState([]), [stock, setStock] = useState([]), [shopping, setShopping] = useState([]);
  const [loading, setLoading] = useState(!demo), [missing, setMissing] = useState(false), [working, setWorking] = useState(false);
  const [form, setForm] = useState(blankPet()), [proposal, setProposal] = useState([]);
  const [open, setOpen] = useState({}), [taskForm, setTaskForm] = useState(null), [extra, setExtra] = useState(null), [logForm, setLogForm] = useState(null), [fullLog, setFullLog] = useState({});
  const [agendaShown, setAgendaShown] = useState(40); // voci dell'agenda mostrate
  const today = todayRome();
  const writable = demo || canWrite;
  const day = iso => (iso ? date(iso, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
  const number = value => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(Number(value) || 0);
  const money = cents => new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format((Number(cents) || 0) / 100);

  const load = useCallback(async () => {
    if (demo || !client || !user?.id) { setLoading(false); return; }
    setLoading(true);
    const scope = query => (homeId ? query.eq('home_id', homeId) : query.eq('user_id', user.id).is('home_id', null));
    const list = await selectAll(count => scope(client.from('home_pets').select('*', count ? { count: 'exact' } : undefined)).order('name').order('id'));
    if (list.error) {
      setLoading(false);
      if (MISSING_TABLE.has(list.error.code)) setMissing(true); else onNotify(friendlyError(list.error, tr));
      return;
    }
    const ids = (list.data || []).map(p => p.id);
    const [items, list2, plan, done] = await Promise.all([
      scope(client.from('home_stock_items').select('id,name,unit,quantity,threshold,usual_buy,updated_at')).order('name').limit(300),
      homeId ? client.from('home_shopping').select('title').eq('home_id', homeId).eq('checked', false).limit(300) : { data: [] },
      selectIn((part, count) => client.from('home_pet_tasks').select('*', count ? { count: 'exact' } : undefined).in('pet_id', part).order('pet_id').order('id'), ids),
      selectIn((part, count) => client.from('home_pet_log').select('*', count ? { count: 'exact' } : undefined).in('pet_id', part).order('done_on', { ascending: false }).order('id'), ids),
    ]);
    setLoading(false);
    setStock(items.error ? [] : items.data || []);
    setShopping(list2.error ? [] : (list2.data || []).map(r => r.title));
    const failed = plan.error || done.error;
    if (failed) { onNotify(friendlyError(failed, tr)); return; }
    setMissing(false); setPets(list.data || []); setTasks(plan.data || []); setLog(done.data || []);
  }, [client, demo, homeId, user?.id]);
  useEffect(() => { setPets([]); setTasks([]); setLog([]); setStock([]); setShopping([]); setForm(blankPet()); setProposal([]); setTaskForm(null); setExtra(null); setLogForm(null); load(); }, [load]);

  const petsById = useMemo(() => new Map(pets.map(p => [p.id, p])), [pets]);
  const activePets = useMemo(() => pets.filter(p => !p.ended_on).sort((a, b) => a.name.localeCompare(b.name, locale)), [pets, locale]);
  const endedPets = useMemo(() => pets.filter(p => p.ended_on).sort((a, b) => b.ended_on.localeCompare(a.ended_on)), [pets]);
  const activeTasks = useMemo(() => tasks.filter(t => petsById.has(t.pet_id) && !petsById.get(t.pet_id).ended_on), [tasks, petsById]);
  const agenda = useMemo(() => petAgenda(activeTasks, today), [activeTasks, today]);
  const stockById = useMemo(() => new Map(stock.map(s => [s.id, s])), [stock]);
  const food = useMemo(() => [...foodEstimates(pets, stock, today).values()], [pets, stock, today]);
  const tasksBy = useMemo(() => { const m = new Map(); for (const t of tasks) { if (!m.has(t.pet_id)) m.set(t.pet_id, []); m.get(t.pet_id).push(t); } return m; }, [tasks]);
  const logBy = useMemo(() => { const m = new Map(); for (const l of log) { if (!m.has(l.pet_id)) m.set(l.pet_id, []); m.get(l.pet_id).push(l); } return m; }, [log]);
  const presetChoices = useMemo(() => PET_PRESET_KEYS.map(key => ({ key, label: tr('pets.preset.' + key) })), [tr]);
  const year = Number(today.slice(0, 4));

  const ageText = pet => {
    const age = petAge(pet.birth_on, today);
    if (!age) return '';
    if (!age.years) return tr('pets.ageMonths', { months: age.months });
    return age.months ? `${tr('pets.ageYears', { years: age.years })} ${tr('pets.ageMonths', { months: age.months })}` : tr('pets.ageYears', { years: age.years });
  };
  const summary = task => [everyLabel(tr, task.every_days), task.product, task.dose].filter(Boolean).join(' · ');
  const when = task => (task.next_on ? tr('pets.nextDate', { date: day(task.next_on) }) : tr('pets.noDate'));

  // Scelta della proposta: specie e nome si riempiono (il nome solo se vuoto o era quello di un'altra proposta).
  function choosePreset(key) {
    const previous = form.preset ? tr('pets.preset.' + form.preset) : '';
    setForm(f => ({ ...f, preset: key, species: key ? PET_PRESETS[key].species : f.species, name: f.name === previous ? '' : f.name }));
    setProposal(key ? petPresetTasks(key, tr, today).map(t => ({ ...t, open: false, stock_item_id: '', stock_use: '' })) : []);
  }

  async function insertTasks(petId, list) {
    const rows = [];
    for (const item of list) {
      const result = normalizePetTask(item);
      if (result.error) { onNotify(`${item.title || tr('pets.taskTitle')}: ${tr(result.error)}`); return null; }
      rows.push({ ...result.value, pet_id: petId });
    }
    if (!rows.length) return [];
    if ((tasksBy.get(petId) || []).length + rows.length > PET_LIMITS.tasksPerPet) { onNotify(tr('pets.error.taskLimit')); return null; }
    if (demo) { const made = rows.map(r => ({ ...r, id: uid() })); setTasks(all => [...all, ...made]); return made; }
    const { data, error } = await client.from('home_pet_tasks').insert(rows).select('*');
    if (error) { onNotify(friendlyError(error, tr)); return null; }
    setTasks(all => [...all, ...(data || [])]);
    return data || [];
  }

  async function savePet(event) {
    event.preventDefault();
    const result = normalizePet(form, today);
    if (result.error) { onNotify(tr(result.error)); return; }
    const chosen = form.id ? [] : proposal.filter(p => p.use);
    for (const item of chosen) { const check = normalizePetTask(item); if (check.error) { onNotify(`${item.title || tr('pets.taskTitle')}: ${tr(check.error)}`); return; } }
    if (!form.id && pets.length >= PET_LIMITS.petsPerSpace) { onNotify(tr('pets.error.limit')); return; }
    setWorking(true);
    try {
      if (form.id) {
        const { ended_on, ...changes } = result.value;
        if (!demo) {
          const { error } = await client.from('home_pets').update(changes).eq('id', form.id);
          if (error) { onNotify(friendlyError(error, tr)); return; }
        }
        setPets(list => list.map(p => (p.id === form.id ? { ...p, ...changes } : p)));
        onNotify(tr('pets.updated'));
      } else {
        let pet;
        if (demo) pet = { ...result.value, id: uid(), home_id: homeId || null };
        else {
          const { data, error } = await client.from('home_pets').insert({ ...result.value, user_id: user.id, home_id: homeId || null }).select('*').single();
          if (error) { onNotify(friendlyError(error, tr)); return; }
          pet = data;
        }
        setPets(list => [...list, pet]);
        const made = await insertTasks(pet.id, chosen);
        setOpen(o => ({ ...o, [pet.id]: true }));
        if (made !== null) onNotify(made.length ? tr('pets.savedWith', { count: made.length }) : tr('pets.saved'));
      }
      setForm(blankPet()); setProposal([]);
    } finally { setWorking(false); }
  }

  function editPet(pet) {
    setForm({ id: pet.id, preset: pet.preset || '', name: pet.name, species: pet.species, breed: pet.breed || '', sex: pet.sex || '', birth_on: pet.birth_on || '', neutered: !!pet.neutered,
      microchip: pet.microchip || '', weight_kg: pet.weight_kg ?? '', food_stock_item_id: pet.food_stock_item_id || '', food_daily: pet.food_daily ?? '', vet_name: pet.vet_name || '', vet_phone: pet.vet_phone || '', notes: pet.notes || '' });
    setProposal([]);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function deletePet(pet) {
    if (!(await askConfirm(tr('pets.deleteConfirm', { name: pet.name }), { danger: true }))) return;
    if (!demo) {
      const { error } = await client.from('home_pets').delete().eq('id', pet.id);
      if (error) { onNotify(friendlyError(error, tr)); return; }
    }
    setPets(list => list.filter(p => p.id !== pet.id));
    setTasks(list => list.filter(t => t.pet_id !== pet.id));
    setLog(list => list.filter(l => l.pet_id !== pet.id));
    if (form.id === pet.id) setForm(blankPet());
    onNotify(tr('pets.deleted'));
  }

  async function setEnded(pet, ended) {
    if (!demo) {
      const { error } = await client.from('home_pets').update({ ended_on: ended }).eq('id', pet.id);
      if (error) { onNotify(friendlyError(error, tr)); return; }
    }
    setPets(list => list.map(p => (p.id === pet.id ? { ...p, ended_on: ended } : p)));
    onNotify(tr(ended ? 'pets.endedSaved' : 'pets.restored'));
  }

  async function saveTask(event) {
    event.preventDefault();
    const { petId, id, ...input } = taskForm;
    const old = id ? tasks.find(t => t.id === id) : null;
    const result = normalizePetTask({ ...input, last_done_on: old?.last_done_on || null });
    if (result.error) { onNotify(tr(result.error)); return; }
    setWorking(true);
    try {
      if (!id) {
        const made = await insertTasks(petId, [result.value]);
        if (made === null) return;
        onNotify(tr('pets.taskSaved'));
      } else {
        if (!demo) {
          const { error } = await client.from('home_pet_tasks').update(result.value).eq('id', id);
          if (error) { onNotify(friendlyError(error, tr)); return; }
        }
        setTasks(list => list.map(t => (t.id === id ? { ...t, ...result.value } : t)));
        onNotify(tr('pets.taskUpdated'));
      }
      setTaskForm(null);
    } finally { setWorking(false); }
  }

  async function deleteTask(task) {
    if (!(await askConfirm(tr('pets.taskDeleteConfirm', { title: task.title }), { danger: true }))) return;
    if (!demo) {
      const { error } = await client.from('home_pet_tasks').delete().eq('id', task.id);
      if (error) { onNotify(friendlyError(error, tr)); return; }
    }
    setTasks(list => list.filter(t => t.id !== task.id));
    setLog(list => list.map(l => (l.task_id === task.id ? { ...l, task_id: null } : l)));
    onNotify(tr('pets.taskDeleted'));
  }

  // Aggiorna la voce solo se nessun altro l'ha cambiata nel frattempo.
  async function updateTask(task, patch) {
    if (demo) { setTasks(list => list.map(t => (t.id === task.id ? { ...t, ...patch } : t))); return true; }
    let query = client.from('home_pet_tasks').update(patch).eq('id', task.id);
    query = task.next_on ? query.eq('next_on', task.next_on) : query.is('next_on', null);
    const { data, error } = await query.select('id');
    if (error) { onNotify(friendlyError(error, tr)); return false; }
    if (!data?.length) { onNotify(tr('v32.flow.changedByOther')); await load(); return false; }
    setTasks(list => list.map(t => (t.id === task.id ? { ...t, ...patch } : t)));
    return true;
  }

  async function writeLog(petId, entry) {
    if (demo) { const row = { ...entry, pet_id: petId, id: uid(), created_at: new Date().toISOString() }; setLog(list => [row, ...list]); return row; }
    const { data, error } = await client.from('home_pet_log').insert({ ...entry, pet_id: petId }).select('*').single();
    if (error) { onNotify(friendlyError(error, tr)); return null; }
    setLog(list => [data, ...list].sort((a, b) => b.done_on.localeCompare(a.done_on)));
    return data;
  }

  // Scala dalle Scorte quanto si usa ogni volta (funzione del database, come «−» nelle Scorte).
  async function useStock(item, amount, messages) {
    let quantity = Math.max(0, Math.round((Number(item.quantity) - amount) * 100) / 100);
    if (!demo) {
      const { data, error } = await client.rpc('v46_adjust_stock', { p_item: item.id, p_delta: -amount });
      if (error) { messages.push(friendlyError(error, tr)); return; }
      quantity = Number(data);
    }
    const updated = { ...item, quantity, updated_at: new Date().toISOString() };
    setStock(list => list.map(s => (s.id === item.id ? updated : s)));
    if (stockStatus(updated) !== 'ok') messages.push(tr('pets.stockLow', { name: item.name, amount: `${number(quantity)} ${tr('pets.unit.' + item.unit)}` }));
  }

  async function done(task) {
    const patch = markPetDone(task, today);
    if (!(await updateTask(task, patch))) return;
    await writeLog(task.pet_id, { task_id: task.id, done_on: today, kind: task.kind, title: task.title, product: task.product || '', dose: task.dose || '', notes: '' });
    const messages = [patch.next_on ? tr('pets.doneSaved', { date: day(patch.next_on) }) : tr('pets.doneOnce')];
    const item = task.stock_item_id ? stockById.get(task.stock_item_id) : null;
    if (item && Number(task.stock_use) > 0) await useStock(item, Number(task.stock_use), messages);
    onNotify(messages.join(' '));
  }

  async function later(task) {
    const patch = postponePet(task, today);
    if (await updateTask(task, patch)) onNotify(tr('pets.postponed', { date: day(patch.next_on) }));
  }

  async function addToShopping(item) {
    if (shopping.some(title => titleKey(title) === titleKey(item.name))) return;
    const { error } = await client.from('home_shopping').insert({ home_id: homeId, title: item.name, quantity: `${number(item.usual_buy)} ${tr('pets.unit.' + item.unit)}`.slice(0, 40) });
    if (error) { onNotify(friendlyError(error, tr)); return; }
    setShopping(list => [...list, item.name]);
    onNotify(tr('pets.addedToList', { name: item.name }));
  }

  async function addExtra(event) {
    event.preventDefault();
    setWorking(true);
    try {
      const made = await insertTasks(extra.petId, extra.items.filter(i => i.use));
      if (made === null) return;
      onNotify(tr('pets.tasksAdded', { count: made.length }));
      setExtra(null);
    } finally { setWorking(false); }
  }

  async function saveLog(event) {
    event.preventDefault();
    const { petId, ...input } = logForm;
    const result = normalizePetLog(input, today);
    if (result.error) { onNotify(tr(result.error)); return; }
    setWorking(true);
    try {
      if (!(await writeLog(petId, result.value))) return;
      // Una voce del piano fatta in una data più recente dell'ultima: si sposta la prossima data.
      const task = result.value.task_id ? tasks.find(t => t.id === result.value.task_id) : null;
      if (task && (!task.last_done_on || result.value.done_on > task.last_done_on)) await updateTask(task, markPetDone(task, result.value.done_on));
      // Pesata più recente: diventa il peso della scheda.
      const pet = petsById.get(petId);
      const newest = (logBy.get(petId) || []).filter(l => Number(l.weight_kg) > 0).every(l => l.done_on <= result.value.done_on);
      if (pet && result.value.weight_kg && newest) {
        if (!demo) await client.from('home_pets').update({ weight_kg: result.value.weight_kg }).eq('id', petId);
        setPets(list => list.map(p => (p.id === petId ? { ...p, weight_kg: result.value.weight_kg } : p)));
      }
      onNotify(tr('pets.logSaved'));
      setLogForm(null);
    } finally { setWorking(false); }
  }

  async function deleteLog(entry) {
    if (!(await askConfirm(tr('pets.logDeleteConfirm'), { danger: true }))) return;
    if (!demo) {
      const { error } = await client.from('home_pet_log').delete().eq('id', entry.id);
      if (error) { onNotify(friendlyError(error, tr)); return; }
    }
    setLog(list => list.filter(l => l.id !== entry.id));
    onNotify(tr('pets.logDeleted'));
  }

  const setPetField = patch => setForm(f => ({ ...f, ...patch }));
  const foodItem = form.food_stock_item_id ? stockById.get(form.food_stock_item_id) : null;
  const chosenCount = proposal.filter(p => p.use).length;
  const proposalList = (items, setItems) => <ul className="garden-proposal">{items.map((item, index) => {
    const set = patch => setItems(list => list.map((x, i) => (i === index ? { ...x, ...patch } : x)));
    return <li key={index} className={item.use ? '' : 'is-off'}>
      <div className="garden-proposal-head">
        <label className="extra-toggle"><input type="checkbox" checked={item.use} aria-label={tr('pets.useTask', { title: item.title })} onChange={e => set({ use: e.target.checked })} />
          <span><b>{item.title}</b><small>{summary(item)}{item.next_on ? ' · ' + when(item) : ''}</small></span></label>
        {item.use && <button type="button" className="btn btn-soft" aria-expanded={item.open} onClick={() => set({ open: !item.open })}>{tr(item.open ? 'pets.close' : 'pets.change')}</button>}
      </div>
      {item.use && item.open && <div className="garden-proposal-edit"><TaskFields task={item} onChange={next => set(next)} tr={tr} notes={false} stock={demo ? [] : stock} /></div>}
    </li>;
  })}</ul>;

  const petCard = pet => {
    const plan = (tasksBy.get(pet.id) || []).slice().sort((a, b) => String(a.next_on || '9999').localeCompare(String(b.next_on || '9999')));
    const entries = logBy.get(pet.id) || [];
    const shown = fullLog[pet.id] ? entries : entries.slice(0, 5);
    const series = weightSeries(pet, entries);
    const change = weightChange(series);
    const costs = vetCosts(entries, year);
    // Dentro la scheda chiusa non si disegna niente (con tanti animali e anni di registro la pagina restava ferma).
    const isOpen = !!open[pet.id];
    const missingTasks = isOpen && pet.preset ? missingPetPresetTasks(pet.preset, plan, tr, today) : [];
    const estimate = pet.food_stock_item_id ? food.find(f => f.item.id === pet.food_stock_item_id) : null;
    return <details key={pet.id} className="garden-plant" open={!!open[pet.id]} onToggle={e => { const isOpen = e.currentTarget.open; setOpen(o => (o[pet.id] === isOpen ? o : { ...o, [pet.id]: isOpen })); }}>
      <summary><b>{pet.name}</b> <small>{[tr('pets.species.' + pet.species), pet.breed, ageText(pet), Number(pet.weight_kg) > 0 ? tr('pets.kg', { value: number(pet.weight_kg) }) : ''].filter(Boolean).join(' · ')}</small></summary>
      {isOpen && <div className="garden-plant-body">
        <div className="extra-buttons">
          {writable && !pet.ended_on && <button className="btn btn-soft" onClick={() => editPet(pet)}><Pencil size={15} /> {tr('pets.edit')}</button>}
          {writable && (pet.ended_on ? <button className="btn btn-soft" onClick={() => setEnded(pet, null)}><RotateCcw size={15} /> {tr('pets.restore')}</button>
            : <button className="btn btn-soft" onClick={() => setEnded(pet, today)}><Archive size={15} /> {tr('pets.endedAction')}</button>)}
          {writable && <button className="icon-button danger" aria-label={tr('pets.deleteAria', { name: pet.name })} title={tr('pets.delete')} onClick={() => deletePet(pet)}><Trash2 size={16} /></button>}
        </div>
        {(pet.vet_name || pet.vet_phone || pet.microchip) && <p className="muted">
          {pet.vet_name && <>{tr('pets.vet')}: {pet.vet_name} </>}
          {pet.vet_phone && <a href={`tel:${pet.vet_phone.replace(/[^\d+]/g, '')}`} aria-label={tr('pets.callVet', { phone: pet.vet_phone })}><Phone size={14} /> {pet.vet_phone}</a>}
          {pet.microchip && <> · {tr('pets.microchip')}: {pet.microchip}</>}</p>}
        {estimate && <p className={estimate.low ? 'garden-warning' : 'muted'}>{tr('pets.foodLine', { food: estimate.item.name, days: estimate.days, date: day(estimate.runs_out_on) })}</p>}
        {pet.notes && <p className="muted">{pet.notes}</p>}

        <h3>{tr('pets.plan')}</h3>
        {!plan.length ? <p className="muted">{tr('pets.planEmpty')}</p> : <ul className="garden-tasks">{plan.map(task => <li key={task.id} className={`garden-task ${petTaskState(task, today)}`}><div className="garden-task-head">
          <span><b>{task.title}</b><small>{tr('pets.kind.' + task.kind)} · {summary(task)}</small>
            <small className="garden-when"><span className={`extra-pill garden-${petTaskState(task, today)}`}>{tr('pets.state.' + petTaskState(task, today))}</span> {when(task)}{task.last_done_on ? ' · ' + tr('pets.lastDone', { date: day(task.last_done_on) }) : ''}{task.remind === false ? ' · ' + tr('pets.noReminder') : ''}</small></span>
          {writable && <span className="extra-buttons">
            <button className="icon-button" aria-label={tr('pets.editTaskAria', { title: task.title })} title={tr('pets.editTask')} onClick={() => setTaskForm({ petId: pet.id, ...task, stock_item_id: task.stock_item_id || '', stock_use: task.stock_use ?? '' })}><Pencil size={16} /></button>
            <button className="icon-button danger" aria-label={tr('pets.deleteTaskAria', { title: task.title })} title={tr('pets.deleteTask')} onClick={() => deleteTask(task)}><Trash2 size={16} /></button>
          </span>}
        </div></li>)}</ul>}
        {writable && !pet.ended_on && !(taskForm?.petId === pet.id) && <div className="extra-buttons">
          <button className="btn btn-soft" onClick={() => setTaskForm({ petId: pet.id, ...blankTask(today) })}><Plus size={15} /> {tr('pets.addTask')}</button>
          {missingTasks.length > 0 && !(extra?.petId === pet.id) && <button className="btn btn-soft" onClick={() => setExtra({ petId: pet.id, items: missingTasks.map(t => ({ ...t, open: false, stock_item_id: '', stock_use: '' })) })}>{tr('pets.missingTasks', { count: missingTasks.length })}</button>}
        </div>}
        {taskForm?.petId === pet.id && <form className="extra-form garden-inline" onSubmit={saveTask}>
          <h4>{tr(taskForm.id ? 'pets.editTask' : 'pets.addTask')}</h4>
          <TaskFields task={taskForm} onChange={next => setTaskForm(next)} tr={tr} stock={demo ? [] : stock} />
          <div className="extra-buttons"><button className="btn btn-primary" disabled={working}>{tr('pets.saveTask')}</button><button type="button" className="btn btn-soft" onClick={() => setTaskForm(null)}>{tr('pets.cancel')}</button></div>
        </form>}
        {extra?.petId === pet.id && <form className="extra-form garden-inline" onSubmit={addExtra}>
          <h4>{tr('pets.missingTitle')}</h4>
          {proposalList(extra.items, update => setExtra(e => ({ ...e, items: typeof update === 'function' ? update(e.items) : update })))}
          <div className="extra-buttons"><button className="btn btn-primary" disabled={working || !extra.items.some(i => i.use)}>{tr('pets.addChosen')}</button><button type="button" className="btn btn-soft" onClick={() => setExtra(null)}>{tr('pets.cancel')}</button></div>
        </form>}

        <h3><Scale size={16} /> {tr('pets.weightTitle')}</h3>
        {!series.length ? <p className="muted">{tr('pets.weightNone')}</p> : <p className="muted">
          {series.slice(-4).map(p => `${p.date ? day(p.date) + ': ' : ''}${tr('pets.kg', { value: number(p.kg) })}`).join(' → ')}
          {change !== null && Math.abs(change) >= 10 && <><br /><span className="garden-warning">{tr('pets.weightBigChange', { percent: number(change) })}</span></>}</p>}
        {costs.length > 0 && <p className="muted">{tr('pets.costYear', { year, amount: money(costs.reduce((s, l) => s + Number(l.cost_cents), 0)) })}</p>}

        <h3><NotebookPen size={16} /> {tr('pets.log')}</h3>
        {!entries.length ? <p className="muted">{tr('pets.logEmpty')}</p> : <ul className="garden-log">{shown.map(entry => <li key={entry.id} className="garden-task"><div className="garden-task-head">
          <span><b>{day(entry.done_on)} · {entry.title}</b>
            <small>{[tr('pets.logKind.' + entry.kind), entry.product, entry.dose, Number(entry.weight_kg) > 0 ? tr('pets.kg', { value: number(entry.weight_kg) }) : '', Number(entry.cost_cents) > 0 ? money(entry.cost_cents) : '', entry.notes].filter(Boolean).join(' · ')}</small></span>
          {writable && <button className="icon-button danger" aria-label={tr('pets.deleteLogAria', { title: entry.title, date: day(entry.done_on) })} title={tr('pets.deleteLog')} onClick={() => deleteLog(entry)}><Trash2 size={16} /></button>}
        </div></li>)}</ul>}
        {entries.length > 5 && <button className="btn btn-soft" onClick={() => setFullLog(f => ({ ...f, [pet.id]: !f[pet.id] }))}>{fullLog[pet.id] ? tr('pets.showLess') : tr('pets.showAll', { count: entries.length })}</button>}
        {writable && !(logForm?.petId === pet.id) && <button className="btn btn-soft" onClick={() => setLogForm({ petId: pet.id, ...blankLog(today) })}><Plus size={15} /> {tr('pets.addLog')}</button>}
        {logForm?.petId === pet.id && <form className="extra-form garden-inline" onSubmit={saveLog}>
          <h4>{tr('pets.addLog')}</h4>
          <div className="extra-row">
            <Field label={tr('pets.logDate')}><input type="date" required max={today} value={logForm.done_on} onChange={e => setLogForm(f => ({ ...f, done_on: e.target.value }))} /></Field>
            <Field label={tr('pets.taskKind')}><select value={logForm.kind} onChange={e => setLogForm(f => ({ ...f, kind: e.target.value }))}>{PET_LOG_KINDS.map(k => <option key={k} value={k}>{tr('pets.logKind.' + k)}</option>)}</select></Field>
          </div>
          {plan.length > 0 && <Field label={tr('pets.logTask')}><select value={logForm.task_id} onChange={e => { const task = plan.find(t => t.id === e.target.value); setLogForm(f => ({ ...f, task_id: e.target.value, ...(task ? { kind: task.kind, title: task.title, product: task.product || '', dose: task.dose || '' } : {}) })); }}>
            <option value="">{tr('pets.logTaskNone')}</option>{plan.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select></Field>}
          <Field label={tr('pets.logTitle')}><input required minLength={2} maxLength={PET_LIMITS.title} value={logForm.title} placeholder={tr('pets.logTitlePlaceholder')} onChange={e => setLogForm(f => ({ ...f, title: e.target.value }))} /></Field>
          <div className="extra-row">
            <Field label={tr('pets.logWeight')}><DecimalInput decimals={2} min="0.01" max={PET_LIMITS.maxWeight} value={logForm.weight_kg} onChange={e => setLogForm(f => ({ ...f, weight_kg: e.target.value }))} /></Field>
            <Field label={tr('pets.logCost')}><DecimalInput decimals={2} min="0" max={PET_LIMITS.maxCost / 100} value={logForm.cost} onChange={e => setLogForm(f => ({ ...f, cost: e.target.value }))} /></Field>
          </div>
          <Field label={tr('pets.notes')}><textarea rows={2} maxLength={PET_LIMITS.notes} value={logForm.notes} onChange={e => setLogForm(f => ({ ...f, notes: e.target.value }))} /></Field>
          <div className="extra-buttons"><button className="btn btn-primary" disabled={working}>{tr('pets.saveLog')}</button><button type="button" className="btn btn-soft" onClick={() => setLogForm(null)}>{tr('pets.cancel')}</button></div>
        </form>}
      </div>}
    </details>;
  };

  const lowFood = food.filter(f => f.low || stockStatus(f.item) !== 'ok');

  return <div className="extra-main garden pets">
    <div className="page-heading"><div><div className="eyebrow">{tr('pets.eyebrow')}</div><h1>{tr('nav.pets')}</h1><p>{tr('pets.help')}</p></div></div>
    {missing && <div className="informative"><Info size={17} /><p>{tr('pets.migration')}</p></div>}
    {demo && <div className="informative"><Info size={17} /><p>{tr('pets.demo')}</p></div>}
    {!demo && !missing && !canWrite && <div className="informative"><Info size={17} /><p>{tr('pets.readOnly')}</p></div>}
    {!missing && <div className="extra-layout">
      <section className="panel extra-panel">
        <h2><CalendarCheck size={19} /> {tr('pets.agenda')}</h2>
        <p className="muted">{tr('pets.agendaHelp')}</p>
        {loading ? <p className="muted">{tr('general.loading')}</p> : !agenda.length ? <p className="muted">{tr('pets.agendaEmpty')}</p> :
        <><div className="garden-agenda">{agenda.slice(0, agendaShown).map(({ task, state }) => {
          const pet = petsById.get(task.pet_id);
          return <div key={task.id} className={`garden-due ${state}`}>
            <div><b>{task.title}</b><small>{pet.name}{task.product ? ' · ' + task.product : ''}{task.dose ? ' · ' + task.dose : ''}</small>
              <small className="garden-when"><span className={`extra-pill garden-${state}`}>{tr('pets.state.' + state)}</span> {when(task)}</small></div>
            {writable && <div className="extra-buttons">
              <button className="btn btn-primary" aria-label={tr('pets.doneAria', { title: task.title, pet: pet.name })} onClick={() => done(task)}><Check size={15} /> {tr('pets.done')}</button>
              <button className="icon-button" aria-label={tr('pets.postponeAria', { title: task.title, pet: pet.name })} title={tr('pets.postpone')} onClick={() => later(task)}><Clock size={16} /></button>
            </div>}
          </div>;
        })}</div>
        <ShowMore shown={Math.min(agendaShown, agenda.length)} total={agenda.length} onMore={setAgendaShown} /></>}
        {lowFood.length > 0 && <div className="garden-tobuy">
          <h3><ShoppingBasket size={16} /> {tr('pets.toBuy')}</h3>
          <ul>{lowFood.map(f => <li key={f.item.id}><span><b>{f.item.name}</b> · {tr('pets.foodLine', { food: f.item.name, days: f.days, date: day(f.runs_out_on) })}</span>
            {homeId && canWrite && !demo && (shopping.some(title => titleKey(title) === titleKey(f.item.name)) ? <small className="muted">{tr('pets.inList')}</small>
              : <button className="btn btn-soft" aria-label={tr('pets.addToListAria', { name: f.item.name })} onClick={() => addToShopping(f.item)}><Plus size={15} /> {tr('pets.addToList')}</button>)}</li>)}</ul>
          {!homeId && <small className="muted">{tr('pets.toBuyPersonal')}</small>}
        </div>}

        <h2 className="garden-form-title"><PawPrint size={19} /> {tr(form.id ? 'pets.editPet' : 'pets.newPet')}</h2>
        {!writable ? <p className="muted">{tr('pets.readOnly')}</p> :
        <form className="extra-form" onSubmit={savePet}>
          {!form.id && <Field label={tr('pets.preset')}><select value={form.preset} onChange={e => choosePreset(e.target.value)}>
            <option value="">{tr('pets.presetNone')}</option>{presetChoices.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}</select></Field>}
          {!form.id && <small className="muted">{tr('pets.presetHelp')}</small>}
          <div className="extra-row">
            <Field label={tr('pets.name')}><input required maxLength={PET_LIMITS.name} value={form.name} placeholder={tr('pets.namePlaceholder')} onChange={e => setPetField({ name: e.target.value })} /></Field>
            <Field label={tr('pets.species')}><select value={form.species} onChange={e => setPetField({ species: e.target.value })}>{SPECIES.map(s => <option key={s} value={s}>{tr('pets.species.' + s)}</option>)}</select></Field>
          </div>
          <div className="extra-row">
            <Field label={tr('pets.breed')}><input maxLength={PET_LIMITS.breed} value={form.breed} onChange={e => setPetField({ breed: e.target.value })} /></Field>
            <Field label={tr('pets.sex')}><select value={form.sex} onChange={e => setPetField({ sex: e.target.value })}><option value="">{tr('pets.sex.unknown')}</option><option value="female">{tr('pets.sex.female')}</option><option value="male">{tr('pets.sex.male')}</option></select></Field>
          </div>
          <div className="extra-row">
            <Field label={tr('pets.birthOn')}><input type="date" max={today} value={form.birth_on} onChange={e => setPetField({ birth_on: e.target.value })} /></Field>
            <Field label={tr('pets.weight')}><DecimalInput decimals={2} min="0.01" max={PET_LIMITS.maxWeight} value={form.weight_kg} onChange={e => setPetField({ weight_kg: e.target.value })} /></Field>
          </div>
          <div className="extra-row">
            <Field label={tr('pets.microchip')}><input maxLength={PET_LIMITS.microchip} inputMode="numeric" value={form.microchip} onChange={e => setPetField({ microchip: e.target.value })} /></Field>
            <label className="extra-toggle"><input type="checkbox" checked={form.neutered} onChange={e => setPetField({ neutered: e.target.checked })} />{tr('pets.neutered')}</label>
          </div>
          <div className="extra-row">
            <Field label={tr('pets.vetName')}><input maxLength={PET_LIMITS.vet} value={form.vet_name} onChange={e => setPetField({ vet_name: e.target.value })} /></Field>
            <Field label={tr('pets.vetPhone')}><input type="tel" maxLength={PET_LIMITS.phone} value={form.vet_phone} onChange={e => setPetField({ vet_phone: e.target.value })} /></Field>
          </div>
          {!demo && stock.length > 0 && <div className="extra-row">
            <Field label={tr('pets.foodItem')}><select value={form.food_stock_item_id} onChange={e => setPetField({ food_stock_item_id: e.target.value })}><option value="">{tr('pets.foodNone')}</option>{stock.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
            {foodItem && <Field label={tr('pets.foodDaily', { unit: tr('pets.unit.' + foodItem.unit) })}><DecimalInput decimals={3} min="0.01" max={PET_LIMITS.maxFood} value={form.food_daily} onChange={e => setPetField({ food_daily: e.target.value })} /></Field>}
          </div>}
          {!demo && <small className="muted">{tr(stock.length ? 'pets.foodHelp' : 'pets.foodNoStock')}</small>}
          <Field label={tr('pets.notes')}><textarea rows={2} maxLength={PET_LIMITS.notes} value={form.notes} onChange={e => setPetField({ notes: e.target.value })} /></Field>
          {!form.id && proposal.length > 0 && <>
            <h3>{tr('pets.proposalTitle', { count: chosenCount })}</h3>
            <p className="muted">{tr('pets.vetDisclaimer')}</p>
            {proposalList(proposal, setProposal)}
          </>}
          <div className="extra-buttons">
            <button className="btn btn-primary" disabled={working}>{tr(form.id ? 'pets.saveChanges' : 'pets.save')}</button>
            {(form.id || form.name || form.preset) && <button type="button" className="btn btn-soft" onClick={() => { setForm(blankPet()); setProposal([]); }}>{tr('pets.cancel')}</button>}
          </div>
        </form>}
      </section>

      <section className="panel extra-panel">
        <h2><PawPrint size={19} /> {tr('pets.list')}</h2>
        {loading ? <p className="muted">{tr('general.loading')}</p> : !activePets.length ? <p className="muted">{tr('pets.listEmpty')}</p> : activePets.map(petCard)}
        {endedPets.length > 0 && <details className="garden-ended"><summary>{tr('pets.endedList', { count: endedPets.length })}</summary>
          {endedPets.map(pet => <div key={pet.id}>{petCard(pet)}<small className="muted">{tr('pets.endedOn', { date: day(pet.ended_on) })}</small></div>)}</details>}
      </section>
    </div>}
  </div>;
}

// I testi della sezione arrivano quando la si apre (lib/i18n-dicts/<lingua>.pets.json).
export default function Pets(props) {
  const { t } = useLanguage();
  const ready = useSection('pets');
  return ready ? <PetsSection {...props} /> : <p className="import-progress" role="status">{t('general.loading')}</p>;
}

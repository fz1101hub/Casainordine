// Giardino e orto (richiesta dell'utente del 25 novembre 2026): piante, piano degli interventi
// (concimazioni, trattamenti, potature, rinvasi…) con i mesi in cui farli, ogni quanti giorni
// ripeterli in quei mesi, prossima data, registro e proposte per tipo di pianta.
// Modulo senza testi: tipi, titoli, prodotti e scopi sono chiavi del dizionario («garden.*»);
// presetTasks li traduce con la funzione della lingua di chi usa l'app.
// Date in formato AAAA-MM-GG, calcolate in UTC (nessun fuso orario: sono giorni di calendario).

export const TASK_KINDS = Object.freeze(['fertilize', 'treatment', 'pruning', 'repotting', 'sowing', 'harvest', 'watering', 'other']);
export const PLANT_KINDS = Object.freeze(['ornamental', 'fruit', 'vegetable', 'herb', 'lawn', 'hedge', 'indoor', 'other']);
export const GARDEN_LIMITS = Object.freeze({ name: 120, location: 80, notes: 1000, title: 120, product: 120, dose: 120,
  plantsPerSpace: 300, tasksPerPlant: 40, logPerPlant: 2000, maxEvery: 365, soonDays: 14, agendaDays: 30, graceDays: 7 });
// Ogni quanti giorni, nelle scelte del modulo (0 = una volta per periodo).
export const EVERY_CHOICES = Object.freeze([0, 7, 10, 12, 14, 15, 21, 30, 45, 60, 90]);
export const ALL_MONTHS = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const pad = n => String(n).padStart(2, '0');
const parts = iso => iso.split('-').map(Number);
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export function addDays(iso, days) {
  const [y, m, d] = parts(iso);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
export function daysBetween(from, to) { return Math.round((Date.parse(to) - Date.parse(from)) / 86400000); }
const firstOf = (y, m) => `${y}-${pad(m)}-01`;
const nextMonth = (y, m) => (m === 12 ? [y + 1, 1] : [y, m + 1]);
const prevMonth = m => (m === 1 ? 12 : m - 1);

// Mesi validi, senza doppioni, in ordine.
export function normalizeMonths(list) {
  return [...new Set((Array.isArray(list) ? list : []).map(Number).filter(m => Number.isInteger(m) && m >= 1 && m <= 12))].sort((a, b) => a - b);
}

// Periodi: mesi consecutivi, anche a cavallo dell'anno (novembre → febbraio è un periodo solo).
// [3,4,10,11] → [[3,4],[10,11]]; [11,12,1,2] → [[11,12,1,2]]; tutti i mesi → [[1…12]].
export function monthWindows(list) {
  const months = normalizeMonths(list);
  if (!months.length) return [];
  if (months.length === 12) return [[...ALL_MONTHS]];
  const set = new Set(months), out = [];
  for (const start of months.filter(m => !set.has(prevMonth(m)))) {
    const run = [start];
    for (let m = start === 12 ? 1 : start + 1; set.has(m) && run.length < 12; m = m === 12 ? 1 : m + 1) run.push(m);
    out.push(run);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

// Il periodo che contiene quel giorno, con le date vere di inizio e fine (o null).
export function windowAt(list, iso) {
  if (!ISO.test(iso || '')) return null;
  const [y, m] = parts(iso);
  const run = monthWindows(list).find(w => w.includes(m));
  if (!run) return null;
  if (run.length === 12) return { start: `${y}-01-01`, end: `${y}-12-31` };
  const first = run[0], last = run[run.length - 1];
  const startYear = first <= m ? y : y - 1;
  const endYear = last < first ? startYear + 1 : startYear;
  return { start: firstOf(startYear, first), end: `${endYear}-${pad(last)}-${pad(lastDay(endYear, last))}` };
}

// Il primo giorno, da quel giorno in poi, che cade in uno dei mesi.
export function firstActiveFrom(list, iso) {
  const set = new Set(normalizeMonths(list));
  if (!set.size || !ISO.test(iso || '')) return null;
  let [y, m] = parts(iso);
  if (set.has(m)) return iso;
  for (let i = 0; i < 12; i++) { [y, m] = nextMonth(y, m); if (set.has(m)) return firstOf(y, m); }
  return null;
}

// L'inizio del primo periodo che comincia dopo quel giorno.
export function nextWindowStart(list, iso) {
  const months = normalizeMonths(list);
  if (!months.length || !ISO.test(iso || '')) return null;
  let [y, m] = parts(iso);
  if (months.length === 12) return `${y + 1}-01-01`;
  const starts = new Set(monthWindows(months).map(w => w[0]));
  for (let i = 0; i < 24; i++) { [y, m] = nextMonth(y, m); if (starts.has(m)) return firstOf(y, m); }
  return null;
}

// Prossima data di un intervento.
// - Ripetuto (every_days > 0): l'ultima volta più l'intervallo; se cade fuori dai mesi, il primo
//   giorno del mese giusto successivo. Mai fatto: da oggi (o dall'inizio dei mesi).
// - Una volta per periodo (every_days = 0): mai fatto → oggi se siamo nel periodo, altrimenti
//   l'inizio del prossimo; fatto → l'inizio del periodo dopo quello in cui è stato fatto.
export function nextDue(task, today) {
  const months = normalizeMonths(task?.months);
  if (!months.length) return null;
  const every = Math.max(0, Math.min(GARDEN_LIMITS.maxEvery, Number(task.every_days) || 0));
  const last = ISO.test(task.last_done_on || '') ? task.last_done_on : null;
  if (!last) return ISO.test(today || '') ? firstActiveFrom(months, today) : null;
  let next;
  if (every > 0) next = firstActiveFrom(months, addDays(last, every));
  else { const window = windowAt(months, last); next = nextWindowStart(months, window ? window.end : last); }
  // Fatto tempo fa (registrato dopo): se anche il periodo della prossima volta è finito, si riparte
  // da oggi, invece di segnare «in ritardo» un intervento di una stagione già chiusa.
  if (next && ISO.test(today || '') && next < today && (windowAt(months, next)?.end || next) < today) return firstActiveFrom(months, today);
  return next;
}

// Fino a quando si può fare: fine del periodo (una volta per periodo), o una settimana dopo la data.
export function deadlineOf(task) {
  if (!ISO.test(task?.next_on || '')) return null;
  if (!(Number(task.every_days) > 0)) return windowAt(task.months, task.next_on)?.end || task.next_on;
  return addDays(task.next_on, GARDEN_LIMITS.graceDays);
}

// Stato oggi: late (passato il tempo utile), due (da fare), soon (entro due settimane),
// later (più avanti), none (nessuna data).
export function taskState(task, today) {
  if (!ISO.test(task?.next_on || '')) return 'none';
  if (task.next_on > today) return daysBetween(today, task.next_on) <= GARDEN_LIMITS.soonDays ? 'soon' : 'later';
  return today > (deadlineOf(task) || task.next_on) ? 'late' : 'due';
}

// Segnato come fatto quel giorno (today: oggi, se si registra un giorno passato): ultima volta e prossima data.
export function markDone(task, doneOn, today = doneOn) {
  return { last_done_on: doneOn, next_on: nextDue({ ...task, last_done_on: doneOn }, today) };
}

// Rimandato di qualche giorno (di base una settimana).
export function postpone(today, days = 7) { return addDays(today, days); }

// Da fare e in arrivo nei prossimi giorni (agendaDays): prima in ritardo, poi da fare, poi in arrivo.
export function gardenAgenda(tasks = [], today, days = GARDEN_LIMITS.agendaDays) {
  const order = { late: 0, due: 1, soon: 2, later: 3 };
  const until = addDays(today, days);
  return tasks.filter(t => ISO.test(t.next_on || '') && t.next_on <= until)
    .map(task => ({ task, state: taskState(task, today) }))
    .sort((a, b) => order[a.state] - order[b.state] || a.task.next_on.localeCompare(b.task.next_on) || String(a.task.title).localeCompare(String(b.task.title)));
}

const clean = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const text = (value, max) => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);

// Pianta controllata e ripulita: {value} oppure {error:'garden.error.*'}.
export function normalizePlant(input = {}) {
  const name = clean(input.name, GARDEN_LIMITS.name);
  if (name.length < 2) return { error: 'garden.error.name' };
  const preset = PRESETS[input.preset] ? input.preset : null;
  const kind = PLANT_KINDS.includes(input.kind) ? input.kind : (preset ? PRESETS[preset].kind : 'other');
  return { value: { name, preset, kind, location: clean(input.location, GARDEN_LIMITS.location), notes: text(input.notes, GARDEN_LIMITS.notes) } };
}

// Intervento controllato e ripulito, con la prossima data se non c'è: {value} oppure {error}.
export function normalizeTask(input = {}, today) {
  const title = clean(input.title, GARDEN_LIMITS.title);
  if (title.length < 2) return { error: 'garden.error.title' };
  const months = normalizeMonths(input.months);
  if (!months.length) return { error: 'garden.error.months' };
  const every = Number(input.every_days ?? 0);
  if (!Number.isInteger(every) || every < 0 || every > GARDEN_LIMITS.maxEvery) return { error: 'garden.error.every' };
  const last = ISO.test(input.last_done_on || '') ? input.last_done_on : null;
  const value = {
    kind: TASK_KINDS.includes(input.kind) ? input.kind : 'other', title,
    product: clean(input.product, GARDEN_LIMITS.product), dose: clean(input.dose, GARDEN_LIMITS.dose), notes: text(input.notes, GARDEN_LIMITS.notes),
    months, every_days: every, last_done_on: last, remind: input.remind !== false,
  };
  value.next_on = ISO.test(input.next_on || '') ? input.next_on : nextDue(value, today);
  return { value };
}

// Voce del registro: {value} oppure {error}.
export function normalizeLog(input = {}, today) {
  const title = clean(input.title, GARDEN_LIMITS.title);
  if (title.length < 2) return { error: 'garden.error.title' };
  const done = ISO.test(input.done_on || '') ? input.done_on : null;
  if (!done || done > today) return { error: 'garden.error.date' };
  return { value: { done_on: done, kind: TASK_KINDS.includes(input.kind) ? input.kind : 'other', title,
    product: clean(input.product, GARDEN_LIMITS.product), dose: clean(input.dose, GARDEN_LIMITS.dose), notes: text(input.notes, GARDEN_LIMITS.notes),
    task_id: input.task_id || null } };
}

// Proposte per tipo di pianta: mesi indicativi per un clima temperato (Italia centrale).
// Ogni voce: tipo; titolo (chiave «garden.title.*») oppure scopo («garden.purpose.*», solo per
// i trattamenti); prodotto («garden.product.*»); mesi; ogni quanti giorni (0 = una volta per periodo).
const T = (kind, months, extra = {}) => ({ kind, months, every: 0, ...extra });
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
export const PRESETS = Object.freeze({
  citrus: { kind: 'fruit', tasks: [
    T('fertilize', range(3, 10), { product: 'citrus_fertilizer', every: 30 }),
    T('treatment', [2, 3], { purpose: 'scale_insects', product: 'white_oil' }),
    T('treatment', [10, 11], { purpose: 'fungi', product: 'copper' }),
    T('pruning', [3, 4], { title: 'shape_pruning' }),
    T('fertilize', [4, 5], { title: 'iron_feed', product: 'iron_chelate' }),
    T('other', [11], { title: 'frost_shelter' })] },
  olive: { kind: 'fruit', tasks: [
    T('pruning', [2, 3, 4]),
    T('fertilize', [2, 3], { product: 'organic_manure' }),
    T('treatment', [3, 4, 10, 11], { purpose: 'leaf_spot', product: 'copper' }),
    T('treatment', [7, 8, 9], { purpose: 'olive_fly', product: 'kaolin', every: 21 })] },
  grapevine: { kind: 'fruit', tasks: [
    T('pruning', [1, 2], { title: 'winter_pruning' }),
    T('fertilize', [2, 3], { product: 'organic_manure' }),
    T('treatment', [4, 5, 6, 7], { purpose: 'peronospora', product: 'copper', every: 12 }),
    T('treatment', [4, 5, 6, 7], { purpose: 'powdery_mildew', product: 'sulfur', every: 14 }),
    T('pruning', [6], { title: 'summer_pruning' })] },
  fruit_tree: { kind: 'fruit', tasks: [
    T('pruning', [1, 2], { title: 'winter_pruning' }),
    T('treatment', [11, 2], { title: 'winter_treatment', product: 'copper' }),
    T('treatment', [2], { purpose: 'scale_insects', product: 'white_oil' }),
    T('fertilize', [3, 9], { product: 'slow_release' }),
    T('pruning', [7], { title: 'summer_pruning' })] },
  rose: { kind: 'ornamental', tasks: [
    T('pruning', [2, 3]),
    T('fertilize', [3, 7], { product: 'slow_release' }),
    T('treatment', [4, 5, 6], { purpose: 'fungi', product: 'sulfur', every: 15 }),
    T('treatment', [4, 5], { purpose: 'aphids', product: 'soft_soap', every: 15 }),
    T('treatment', [11], { title: 'winter_treatment', product: 'copper' })] },
  hydrangea: { kind: 'ornamental', tasks: [
    T('pruning', [2, 3]),
    T('fertilize', [4, 5, 6, 7], { product: 'acid_fertilizer', every: 30 }),
    T('fertilize', [5], { title: 'iron_feed', product: 'iron_chelate' })] },
  acid_lovers: { kind: 'ornamental', tasks: [
    T('fertilize', [3, 4, 5, 6], { product: 'acid_fertilizer', every: 30 }),
    T('pruning', [4, 5], { title: 'after_flowering_pruning' }),
    T('fertilize', [4], { title: 'iron_feed', product: 'iron_chelate' })] },
  hedge: { kind: 'hedge', tasks: [
    T('pruning', [5, 6, 9], { title: 'hedge_trim' }),
    T('fertilize', [3], { product: 'slow_release' })] },
  lawn: { kind: 'lawn', tasks: [
    T('fertilize', [3, 5, 9], { product: 'lawn_fertilizer' }),
    T('other', [3, 4], { title: 'scarify' }),
    T('sowing', [9, 10], { title: 'overseed' })] },
  tomato: { kind: 'vegetable', tasks: [
    T('sowing', [4, 5], { title: 'transplant' }),
    T('fertilize', [6, 7, 8], { product: 'potassium', every: 15 }),
    T('treatment', [6, 7, 8], { purpose: 'peronospora', product: 'copper', every: 10 }),
    T('pruning', [6, 7, 8], { title: 'side_shoots', every: 7 })] },
  summer_vegetables: { kind: 'vegetable', tasks: [
    T('fertilize', [3, 4], { product: 'organic_manure' }),
    T('sowing', [4, 5], { title: 'transplant' }),
    T('fertilize', [5, 6, 7, 8], { product: 'nettle', every: 15 }),
    T('treatment', [6, 7, 8], { purpose: 'powdery_mildew', product: 'sulfur', every: 14 })] },
  herbs: { kind: 'herb', tasks: [
    T('fertilize', range(4, 9), { product: 'green_liquid', every: 30 }),
    T('pruning', [3], { title: 'shape_pruning' }),
    T('treatment', [5, 6, 7], { purpose: 'aphids', product: 'soft_soap', every: 21 })] },
  lavender: { kind: 'ornamental', tasks: [
    T('pruning', [8, 9], { title: 'after_flowering_pruning' }),
    T('fertilize', [3], { product: 'organic_manure' })] },
  geranium: { kind: 'ornamental', tasks: [
    T('fertilize', range(4, 9), { product: 'flowering_liquid', every: 15 }),
    T('treatment', [6, 7, 8, 9], { purpose: 'caterpillars', product: 'bt', every: 15 }),
    T('pruning', [2, 3]),
    T('other', [11], { title: 'frost_shelter' })] },
  strawberry: { kind: 'fruit', tasks: [
    T('fertilize', [4, 5, 6], { product: 'potassium', every: 21 }),
    T('other', [4], { title: 'mulch' }),
    T('other', [8, 9], { title: 'runners' })] },
  orchid: { kind: 'indoor', tasks: [
    T('fertilize', range(3, 10), { product: 'orchid_fertilizer', every: 15 }),
    T('repotting', [3, 4])] },
  houseplants: { kind: 'indoor', tasks: [
    T('fertilize', range(3, 9), { product: 'green_liquid', every: 15 }),
    T('repotting', [3, 4]),
    T('other', range(1, 12), { title: 'clean_leaves', every: 30 })] },
  succulents: { kind: 'ornamental', tasks: [
    T('fertilize', range(4, 9), { product: 'cactus_fertilizer', every: 30 }),
    T('repotting', [3, 4]),
    T('other', [10, 11], { title: 'frost_shelter' })] },
});
export const PRESET_KEYS = Object.freeze(Object.keys(PRESETS));

// Chiavi del dizionario che le proposte usano (per le prove delle traduzioni).
export function presetTextKeys() {
  const keys = new Set();
  for (const [key, preset] of Object.entries(PRESETS)) {
    keys.add('garden.preset.' + key);
    for (const task of preset.tasks) {
      keys.add('garden.kind.' + task.kind);
      if (task.title) keys.add('garden.title.' + task.title);
      if (task.purpose) keys.add('garden.purpose.' + task.purpose);
      if (task.product) keys.add('garden.product.' + task.product);
    }
  }
  return [...keys].sort();
}

// Titolo di una voce proposta, nella lingua di t: titolo proprio, oppure tipo più scopo.
export function presetTaskTitle(task, t) {
  if (task.title) return t('garden.title.' + task.title);
  return task.purpose ? `${t('garden.kind.' + task.kind)} ${t('garden.purpose.' + task.purpose)}` : t('garden.kind.' + task.kind);
}

// Interventi proposti per una pianta, pronti per il modulo (si possono togliere o cambiare).
export function presetTasks(presetKey, t, today) {
  const preset = PRESETS[presetKey];
  if (!preset) return [];
  return preset.tasks.map((task, index) => {
    const value = { kind: task.kind, title: presetTaskTitle(task, t), product: task.product ? t('garden.product.' + task.product) : '',
      dose: '', notes: '', months: [...task.months], every_days: task.every, remind: true, last_done_on: null };
    return { ...value, next_on: nextDue(value, today), preset_index: index };
  });
}

// Proposte che mancano a una pianta: quelle con un titolo che la pianta non ha ancora.
export function missingPresetTasks(plant, tasks, t, today) {
  const have = new Set((tasks || []).map(task => clean(task.title, 200).toLowerCase()));
  return presetTasks(plant?.preset, t, today).filter(task => !have.has(task.title.toLowerCase()));
}

// Promemoria di oggi: interventi con promemoria la cui data è arrivata negli ultimi giorni
// (graceDays, se il lavoro giornaliero ha saltato un giorno). Uno per intervento e data.
export function gardenEventsToday(tasks = [], today) {
  const from = addDays(today, -GARDEN_LIMITS.graceDays);
  return tasks.filter(t => t.remind !== false && ISO.test(t.next_on || '') && t.next_on <= today && t.next_on >= from)
    .map(t => ({ kind: 'garden', reference_id: t.id, event_date: t.next_on }));
}

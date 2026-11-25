// Giardino e orto (richiesta dell'utente del 25 novembre 2026): piante, piano degli interventi
// (concimazioni, trattamenti, potature, rinvasi…) con i mesi in cui farli, ogni quanti giorni
// ripeterli in quei mesi, prossima data, registro e proposte per tipo di pianta.
// Modulo senza testi: tipi, titoli, prodotti e scopi sono chiavi del dizionario («garden.*»);
// presetTasks li traduce con la funzione della lingua di chi usa l'app.
// Date in formato AAAA-MM-GG, calcolate in UTC (nessun fuso orario: sono giorni di calendario).

export const TASK_KINDS = Object.freeze(['fertilize', 'treatment', 'pruning', 'repotting', 'sowing', 'harvest', 'watering', 'other']);
export const PLANT_KINDS = Object.freeze(['ornamental', 'fruit', 'vegetable', 'herb', 'lawn', 'hedge', 'indoor', 'other']);
export const GARDEN_LIMITS = Object.freeze({ name: 120, location: 80, notes: 1000, title: 120, product: 120, dose: 120,
  plantsPerSpace: 300, tasksPerPlant: 40, logPerPlant: 2000, maxEvery: 365, soonDays: 14, agendaDays: 30, graceDays: 7,
  bed: 60, maxHarvestDays: 400, maxWaitDays: 365, maxStockUse: 100000, rotationYears: 2 });
// Clima della zona (lo stesso del Programma stagionale): inverni rigidi, moderati o miti.
export const CLIMATES = Object.freeze(['cold', 'mild', 'warm']);
// Famiglie botaniche per la rotazione dell'orto; le prime otto sono quelle che contano per le aiuole.
export const FAMILIES = Object.freeze(['solanaceae', 'cucurbitaceae', 'brassicaceae', 'fabaceae', 'asteraceae', 'apiaceae', 'amaryllidaceae', 'amaranthaceae', 'lamiaceae', 'rosaceae', 'other']);
export const ROTATION_FAMILIES = Object.freeze(FAMILIES.slice(0, 8));
// Si possono mangiare: per i trattamenti servono i giorni di attesa prima di raccogliere.
export const EDIBLE_KINDS = Object.freeze(['fruit', 'vegetable', 'herb']);
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

// Numeri facoltativi dei moduli: null se vuoti, undefined se non validi.
function optionalInt(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : undefined;
}
function optionalNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : undefined;
}
const clean = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const text = (value, max) => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);

// Pianta controllata e ripulita: {value} oppure {error:'garden.error.*'}.
export function normalizePlant(input = {}) {
  const name = clean(input.name, GARDEN_LIMITS.name);
  if (name.length < 2) return { error: 'garden.error.name' };
  const preset = PRESETS[input.preset] ? input.preset : null;
  const kind = PLANT_KINDS.includes(input.kind) ? input.kind : (preset ? PRESETS[preset].kind : 'other');
  const value = { name, preset, kind, location: clean(input.location, GARDEN_LIMITS.location), notes: text(input.notes, GARDEN_LIMITS.notes) };
  // Orto (v58): semina, giorni alla raccolta, aiuola, famiglia, fine coltura. Solo se il modulo li ha.
  if (['planted_on', 'harvest_days', 'bed', 'family', 'ended_on'].some(key => key in input)) {
    const planted = ISO.test(input.planted_on || '') ? input.planted_on : null;
    const days = input.harvest_days === '' || input.harvest_days === null || input.harvest_days === undefined ? null : Number(input.harvest_days);
    if (days !== null && !(Number.isInteger(days) && days >= 1 && days <= GARDEN_LIMITS.maxHarvestDays)) return { error: 'garden.error.harvest' };
    const ended = ISO.test(input.ended_on || '') ? input.ended_on : null;
    if (ended && planted && ended < planted) return { error: 'garden.error.ended' };
    Object.assign(value, { planted_on: planted, harvest_days: days, bed: clean(input.bed, GARDEN_LIMITS.bed),
      family: FAMILIES.includes(input.family) ? input.family : null, ended_on: ended });
  }
  return { value };
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
  const wait = optionalInt(input.wait_days);
  if (wait === undefined || (wait !== null && (wait < 0 || wait > GARDEN_LIMITS.maxWaitDays))) return { error: 'garden.error.wait' };
  const stockItem = typeof input.stock_item_id === 'string' && input.stock_item_id ? input.stock_item_id : null;
  const use = stockItem ? optionalNumber(input.stock_use) : null;
  if (use === undefined || (use !== null && !(use > 0 && use <= GARDEN_LIMITS.maxStockUse))) return { error: 'garden.error.stockUse' };
  const value = {
    kind: TASK_KINDS.includes(input.kind) ? input.kind : 'other', title,
    product: clean(input.product, GARDEN_LIMITS.product), dose: clean(input.dose, GARDEN_LIMITS.dose), notes: text(input.notes, GARDEN_LIMITS.notes),
    months, every_days: every, last_done_on: last, remind: input.remind !== false,
  };
  // Campi della v58 solo se il modulo li ha (prima della migrazione il database non li conosce).
  if (['wait_days', 'stock_item_id', 'stock_use'].some(key => key in input)) Object.assign(value, { wait_days: wait, stock_item_id: stockItem, stock_use: use });
  value.next_on = ISO.test(input.next_on || '') ? input.next_on : nextDue(value, today);
  return { value };
}

// Voce del registro: {value} oppure {error}.
export function normalizeLog(input = {}, today) {
  const title = clean(input.title, GARDEN_LIMITS.title);
  if (title.length < 2) return { error: 'garden.error.title' };
  const done = ISO.test(input.done_on || '') ? input.done_on : null;
  if (!done || done > today) return { error: 'garden.error.date' };
  const wait = optionalInt(input.wait_days);
  if (wait === undefined || (wait !== null && (wait < 0 || wait > GARDEN_LIMITS.maxWaitDays))) return { error: 'garden.error.wait' };
  const value = { done_on: done, kind: TASK_KINDS.includes(input.kind) ? input.kind : 'other', title,
    product: clean(input.product, GARDEN_LIMITS.product), dose: clean(input.dose, GARDEN_LIMITS.dose), notes: text(input.notes, GARDEN_LIMITS.notes),
    task_id: input.task_id || null };
  if ('wait_days' in input) value.wait_days = wait;
  return { value };
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
  tomato: { kind: 'vegetable', family: 'solanaceae', harvest: 75, tasks: [
    T('sowing', [4, 5], { title: 'transplant' }),
    T('fertilize', [6, 7, 8], { product: 'potassium', every: 15 }),
    T('treatment', [6, 7, 8], { purpose: 'peronospora', product: 'copper', every: 10 }),
    T('pruning', [6, 7, 8], { title: 'side_shoots', every: 7 })] },
  summer_vegetables: { kind: 'vegetable', harvest: 60, tasks: [
    T('fertilize', [3, 4], { product: 'organic_manure' }),
    T('sowing', [4, 5], { title: 'transplant' }),
    T('fertilize', [5, 6, 7, 8], { product: 'nettle', every: 15 }),
    T('treatment', [6, 7, 8], { purpose: 'powdery_mildew', product: 'sulfur', every: 14 })] },
  herbs: { kind: 'herb', family: 'lamiaceae', tasks: [
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
  strawberry: { kind: 'fruit', family: 'rosaceae', tasks: [
    T('fertilize', [4, 5, 6], { product: 'potassium', every: 21 }),
    T('other', [4], { title: 'mulch' }),
    T('other', [8, 9], { title: 'runners' })] },
  lettuce: { kind: 'vegetable', family: 'asteraceae', harvest: 50, tasks: [
    T('sowing', range(3, 9), { title: 'succession_sowing', every: 21 }),
    T('fertilize', range(4, 8), { product: 'nettle', every: 21 }),
    T('treatment', [3, 4, 5], { purpose: 'slugs', product: 'iron_phosphate', every: 21 })] },
  zucchini: { kind: 'vegetable', family: 'cucurbitaceae', harvest: 55, tasks: [
    T('sowing', [4, 5], { title: 'transplant' }),
    T('fertilize', [6, 7, 8], { product: 'potassium', every: 15 }),
    T('treatment', [6, 7, 8], { purpose: 'powdery_mildew', product: 'sulfur', every: 14 })] },
  peppers_eggplant: { kind: 'vegetable', family: 'solanaceae', harvest: 80, tasks: [
    T('sowing', [4, 5], { title: 'transplant' }),
    T('fertilize', [6, 7, 8, 9], { product: 'potassium', every: 15 }),
    T('treatment', [5, 6, 7], { purpose: 'aphids', product: 'soft_soap', every: 15 })] },
  beans: { kind: 'vegetable', family: 'fabaceae', harvest: 60, tasks: [
    T('sowing', [4, 5, 6, 7], { title: 'succession_sowing', every: 21 }),
    T('treatment', [5, 6, 7], { purpose: 'aphids', product: 'soft_soap', every: 15 })] },
  carrots: { kind: 'vegetable', family: 'apiaceae', harvest: 90, tasks: [
    T('sowing', range(3, 7), { title: 'succession_sowing', every: 30 }),
    T('other', range(4, 8), { title: 'thinning', every: 30 })] },
  cabbage: { kind: 'vegetable', family: 'brassicaceae', harvest: 90, tasks: [
    T('sowing', [7, 8, 9], { title: 'transplant' }),
    T('treatment', [7, 8, 9, 10], { purpose: 'caterpillars', product: 'bt', every: 15 })] },
  garlic_onion: { kind: 'vegetable', family: 'amaryllidaceae', harvest: 210, tasks: [
    T('sowing', [10, 11], { title: 'plant_bulbs' }),
    T('other', [3, 4, 5], { title: 'weeding', every: 30 })] },
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
    if (preset.family) keys.add('garden.family.' + preset.family);
  }
  return [...keys].sort();
}

// Titolo di una voce proposta, nella lingua di t: titolo proprio, oppure tipo più scopo.
export function presetTaskTitle(task, t) {
  if (task.title) return t('garden.title.' + task.title);
  return task.purpose ? `${t('garden.kind.' + task.kind)} ${t('garden.purpose.' + task.purpose)}` : t('garden.kind.' + task.kind);
}

// Clima della zona: con inverni rigidi la primavera arriva più tardi e l'autunno prima; con inverni
// miti il contrario. Si sposta di un mese l'inizio e la fine di ogni periodo (febbraio–luglio verso
// l'estate o verso l'inverno, settembre–novembre al contrario); dicembre, gennaio e agosto restano.
export function shiftMonth(month, climate) {
  const step = climate === 'cold' ? 1 : climate === 'warm' ? -1 : 0;
  if (month >= 2 && month <= 7) return month + step;
  if (month >= 9 && month <= 11) return month - step;
  return month;
}
export function adjustMonths(list, climate) {
  const months = normalizeMonths(list);
  if (!CLIMATES.includes(climate) || climate === 'mild' || months.length === 12) return months;
  const out = [];
  for (const window of monthWindows(months)) {
    const first = window[0], last = window[window.length - 1];
    if (window.length === 1) { out.push(shiftMonth(first, climate)); continue; }
    const span = (a, b) => { const list = []; for (let m = a, n = 0; n < 12; m = m === 12 ? 1 : m + 1, n++) { list.push(m); if (m === b) break; } return list; };
    let start = shiftMonth(first, climate), end = shiftMonth(last, climate);
    // Un periodo estivo breve (luglio–settembre) non si riduce a un mese: con inverni rigidi si
    // sposta solo l'inizio; un periodo che si chiuderebbe su sé stesso resta di un mese.
    if (first <= last && start > end) end = start;
    if (span(start, end).length < window.length - 1) end = last;
    out.push(...span(start, end));
  }
  return normalizeMonths(out);
}

// Valori della pianta che vengono dalla proposta: categoria, famiglia e giorni alla raccolta.
export function presetPlant(presetKey) {
  const preset = PRESETS[presetKey];
  return preset ? { kind: preset.kind, family: preset.family || null, harvest_days: preset.harvest || null } : null;
}

// Interventi proposti per una pianta, pronti per il modulo (si possono togliere o cambiare),
// con i mesi spostati secondo il clima della zona.
export function presetTasks(presetKey, t, today, climate = 'mild') {
  const preset = PRESETS[presetKey];
  if (!preset) return [];
  return preset.tasks.map((task, index) => {
    const value = { kind: task.kind, title: presetTaskTitle(task, t), product: task.product ? t('garden.product.' + task.product) : '',
      dose: '', notes: '', months: adjustMonths(task.months, climate), every_days: task.every, remind: true, last_done_on: null };
    return { ...value, next_on: nextDue(value, today), preset_index: index };
  });
}

// Proposte che mancano a una pianta: quelle con un titolo che la pianta non ha ancora.
export function missingPresetTasks(plant, tasks, t, today, climate = 'mild') {
  const have = new Set((tasks || []).map(task => clean(task.title, 200).toLowerCase()));
  return presetTasks(plant?.preset, t, today, climate).filter(task => !have.has(task.title.toLowerCase()));
}

// Date dei prossimi interventi tra from e to (comprese), a partire da next_on: per il calendario
// dell'anno e per il calendario del telefono. Al massimo max date per intervento.
export function projectDates(task, from, to, max = 60) {
  if (!ISO.test(task?.next_on || '')) return [];
  const out = [];
  for (let d = task.next_on, n = 0; d && d <= to && out.length < max && n < 400; n++) {
    if (d >= from) out.push(d);
    const next = nextDue({ ...task, last_done_on: d });
    if (!next || next <= d) break;
    d = next;
  }
  return out;
}

// Calendario dell'anno: dodici mesi da quello di oggi, con le date di ogni intervento in quel mese.
// active: interventi delle piante ancora in giardino (non finite).
export function yearCalendar(tasks = [], today) {
  const [y, m] = parts(today);
  const months = Array.from({ length: 12 }, (_, i) => { const mm = ((m - 1 + i) % 12) + 1, yy = y + Math.floor((m - 1 + i) / 12); return { year: yy, month: mm, key: `${yy}-${pad(mm)}`, entries: [] }; });
  const byKey = new Map(months.map(x => [x.key, x]));
  const end = `${months[11].key}-${pad(lastDay(months[11].year, months[11].month))}`;
  for (const task of tasks) {
    const dates = projectDates(task, `${months[0].key}-01`, end, 400);
    const grouped = new Map();
    for (const d of dates) { const k = d.slice(0, 7); if (!grouped.has(k)) grouped.set(k, []); grouped.get(k).push(d); }
    for (const [k, list] of grouped) byKey.get(k)?.entries.push({ task, dates: list });
  }
  for (const month of months) month.entries.sort((a, b) => a.dates[0].localeCompare(b.dates[0]) || String(a.task.title).localeCompare(String(b.task.title)));
  return months;
}

// Raccolta prevista: semina o trapianto più i giorni alla raccolta.
export function expectedHarvest(plant) {
  return ISO.test(plant?.planted_on || '') && Number.isInteger(Number(plant.harvest_days)) && Number(plant.harvest_days) > 0
    ? addDays(plant.planted_on, Number(plant.harvest_days)) : null;
}

// Primo giorno in cui si può raccogliere dopo i trattamenti registrati (giorni di attesa
// dall'etichetta): null se non c'è attesa in corso.
export function safeHarvestFrom(entries = [], today) {
  let safe = null;
  for (const e of entries) {
    const wait = Number(e.wait_days);
    if (!ISO.test(e.done_on || '') || !(wait > 0)) continue;
    const day = addDays(e.done_on, wait);
    if (!safe || day > safe) safe = day;
  }
  return safe && safe > today ? safe : null;
}

// Anno di una coltura: dalla semina o, se manca, dalla data in cui è stata inserita.
export const cropYear = plant => Number(String(plant?.planted_on || plant?.created_at || '').slice(0, 4)) || null;
const bedKey = bed => clean(bed, GARDEN_LIMITS.bed).toLowerCase();

// Rotazione: nella stessa aiuola, la stessa famiglia negli ultimi due anni è da evitare.
// Restituisce le colture che si ripetono e le famiglie che andrebbero bene.
export function rotationCheck(plants = [], { id = null, bed, family, year }) {
  const key = bedKey(bed);
  if (!key) return { conflicts: [], suggestions: [] };
  const recent = plants.filter(p => p.id !== id && bedKey(p.bed) === key && ROTATION_FAMILIES.includes(p.family))
    .filter(p => { const y = cropYear(p); return y && y < year && y >= year - GARDEN_LIMITS.rotationYears; });
  const used = new Set(recent.map(p => p.family));
  const conflicts = ROTATION_FAMILIES.includes(family) ? recent.filter(p => p.family === family).sort((a, b) => cropYear(b) - cropYear(a)) : [];
  return { conflicts, suggestions: ROTATION_FAMILIES.filter(f => !used.has(f)) };
}

// Aiuole dell'orto: cosa c'è adesso e cosa c'era negli ultimi anni.
export function bedsOverview(plants = [], year) {
  const beds = new Map();
  for (const plant of plants) {
    const key = bedKey(plant.bed);
    if (!key) continue;
    if (!beds.has(key)) beds.set(key, { bed: clean(plant.bed, GARDEN_LIMITS.bed), now: [], years: new Map() });
    const entry = beds.get(key);
    if (!plant.ended_on) entry.now.push(plant);
    const y = cropYear(plant);
    if (y && y >= year - GARDEN_LIMITS.rotationYears && y <= year) {
      if (!entry.years.has(y)) entry.years.set(y, []);
      entry.years.get(y).push(plant);
    }
  }
  return [...beds.values()].sort((a, b) => a.bed.localeCompare(b.bed)).map(entry => ({
    ...entry, years: [...entry.years.entries()].sort((a, b) => b[0] - a[0]),
    suggestions: rotationCheck(plants, { bed: entry.bed, family: null, year: year + 1 }).suggestions,
  }));
}

// Promemoria di oggi: interventi con promemoria la cui data è arrivata negli ultimi giorni
// (graceDays, se il lavoro giornaliero ha saltato un giorno). Uno per intervento e data.
export function gardenEventsToday(tasks = [], today) {
  const from = addDays(today, -GARDEN_LIMITS.graceDays);
  return tasks.filter(t => t.remind !== false && ISO.test(t.next_on || '') && t.next_on <= today && t.next_on >= from)
    .map(t => ({ kind: 'garden', reference_id: t.id, event_date: t.next_on }));
}

// Eventi del calendario del telefono: le prossime date degli interventi delle piante ancora in
// giardino, da una settimana fa a un anno da oggi (al massimo max eventi in tutto).
export function gardenCalendarEvents(plants = [], tasks = [], today, { days = 365, max = 2000 } = {}) {
  const byId = new Map(plants.filter(p => !p.ended_on).map(p => [p.id, p]));
  const from = addDays(today, -GARDEN_LIMITS.graceDays), to = addDays(today, days), out = [];
  for (const task of tasks) {
    const plant = byId.get(task.plant_id);
    if (!plant) continue;
    for (const date of projectDates(task, from, to, 60)) out.push({ uid: `garden-${task.id}-${date}`, date, task: task.title, plant: plant.name, product: task.product || '' });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.uid.localeCompare(b.uid)).slice(0, max);
}

// Campi della v58 (migrate_v58_giardino_orto.sql). Finché la migrazione non è eseguita il database
// non li conosce: la schermata li nasconde e li toglie da quello che scrive.
export const V58_FIELDS = Object.freeze({
  home_garden_plants: ['planted_on', 'harvest_days', 'bed', 'family', 'ended_on'],
  home_garden_tasks: ['stock_item_id', 'stock_use', 'wait_days'],
  home_garden_log: ['wait_days'],
});
export function withoutV58(table, row) {
  const out = { ...row };
  for (const key of V58_FIELDS[table] || []) delete out[key];
  return out;
}

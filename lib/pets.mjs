// Animali di casa (scelta dell'utente del 25 novembre 2026, sera): scheda di ogni animale, piano di
// vaccini, antiparassitari, vermifughi, visite e cure con la prossima data, registro (anche peso e
// spese del veterinario) e cibo delle Scorte con la stima di quando finisce.
// Usato dal browser (app/Pets.jsx), dal lavoro giornaliero (lib/pet-alerts.mjs) e dal calendario.
// Non importa i dizionari: i testi arrivano come chiavi («pets.…») o tramite t.
import { addDaysISO as addDays } from './dates.mjs';

export { addDays };
export const SPECIES = Object.freeze(['dog', 'cat', 'rabbit', 'ferret', 'bird', 'fish', 'reptile', 'rodent', 'horse', 'other']);
export const PET_TASK_KINDS = Object.freeze(['vaccine', 'antiparasitic', 'deworming', 'vet_visit', 'grooming', 'medicine', 'weight', 'other']);
export const PET_LOG_KINDS = Object.freeze([...PET_TASK_KINDS.slice(0, -1), 'note', 'other']);
export const PET_LIMITS = Object.freeze({
  name: 80, breed: 80, microchip: 30, vet: 120, phone: 40, title: 120, product: 120, dose: 120, notes: 1000,
  petsPerSpace: 50, tasksPerPet: 40, logPerPet: 3000, maxEvery: 1095, maxWeight: 1500, maxFood: 100000, maxCost: 10000000,
  graceDays: 7, soonDays: 7, horizonDays: 30, foodWarnDays: 5,
});
// Ogni quanto ripetere: una volta, settimane, mesi, uno, due o tre anni.
export const PET_EVERY_CHOICES = Object.freeze([0, 7, 14, 21, 28, 30, 42, 45, 60, 90, 120, 180, 365, 730, 1095]);

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const validDate = value => ISO.test(value || '') && !Number.isNaN(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
const text = (value, max) => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
const optionalNumber = value => (value === '' || value === null || value === undefined ? null : Number(value));
const daysBetween = (from, to) => Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000);

// ===== Proposte per specie =====
// Ogni voce: chiave del titolo (pets.task.<chiave>), tipo, ogni quanti giorni e se è accesa di partenza.
// Sono indicative: calendario e prodotti li decide il veterinario (lo dice la schermata).
const T = (key, kind, every, use = true) => Object.freeze({ key, kind, every, use });
export const PET_PRESETS = Object.freeze({
  dog: { species: 'dog', tasks: [T('core_vaccine', 'vaccine', 365), T('rabies', 'vaccine', 365, false), T('fleas_ticks', 'antiparasitic', 30), T('heartworm', 'antiparasitic', 30),
    T('leishmania', 'antiparasitic', 180, false), T('deworming', 'deworming', 90), T('checkup', 'vet_visit', 365), T('weigh', 'weight', 30), T('grooming', 'grooming', 60, false)] },
  puppy: { species: 'dog', tasks: [T('puppy_vaccines', 'vaccine', 28), T('deworming_young', 'deworming', 30), T('fleas_ticks', 'antiparasitic', 30), T('checkup_young', 'vet_visit', 90), T('weigh', 'weight', 14)] },
  cat: { species: 'cat', tasks: [T('core_vaccine', 'vaccine', 365), T('felv', 'vaccine', 365, false), T('fleas_ticks', 'antiparasitic', 30), T('deworming', 'deworming', 90),
    T('checkup', 'vet_visit', 365), T('weigh', 'weight', 60)] },
  kitten: { species: 'cat', tasks: [T('kitten_vaccines', 'vaccine', 28), T('deworming_young', 'deworming', 30), T('fleas_ticks', 'antiparasitic', 30), T('checkup_young', 'vet_visit', 90), T('weigh', 'weight', 14)] },
  rabbit: { species: 'rabbit', tasks: [T('rabbit_vaccine', 'vaccine', 365), T('nails', 'grooming', 45), T('teeth', 'vet_visit', 180), T('checkup', 'vet_visit', 365), T('weigh', 'weight', 30)] },
  ferret: { species: 'ferret', tasks: [T('distemper', 'vaccine', 365), T('fleas_ticks', 'antiparasitic', 30), T('heartworm', 'antiparasitic', 30, false), T('checkup', 'vet_visit', 365), T('weigh', 'weight', 30)] },
  bird: { species: 'bird', tasks: [T('cage_clean', 'other', 7), T('nails', 'grooming', 90), T('checkup', 'vet_visit', 365)] },
  fish: { species: 'fish', tasks: [T('water_change', 'other', 14), T('water_test', 'other', 14), T('filter_clean', 'other', 30)] },
  reptile: { species: 'reptile', tasks: [T('terrarium_clean', 'other', 30), T('uv_lamp', 'other', 180), T('checkup', 'vet_visit', 365)] },
  rodent: { species: 'rodent', tasks: [T('cage_clean', 'other', 7), T('weigh', 'weight', 30), T('checkup', 'vet_visit', 365)] },
  horse: { species: 'horse', tasks: [T('horse_vaccines', 'vaccine', 365), T('farrier', 'grooming', 42), T('deworming', 'deworming', 90), T('dentist', 'vet_visit', 365)] },
});
export const PET_PRESET_KEYS = Object.freeze(Object.keys(PET_PRESETS));
export const PET_TASK_KEYS = Object.freeze([...new Set(Object.values(PET_PRESETS).flatMap(p => p.tasks.map(t => t.key)))]);

// Voci proposte per un animale nuovo: prima volta oggi (si cambia prima di salvare).
export function petPresetTasks(key, t, today) {
  const preset = PET_PRESETS[key];
  if (!preset) return [];
  return preset.tasks.map(item => ({ preset_task: item.key, kind: item.kind, title: t('pets.task.' + item.key), product: '', dose: '', notes: '',
    every_days: item.every, next_on: today, remind: true, use: item.use }));
}

// Voci di una proposta che l'animale non ha ancora (stesso titolo, senza badare a maiuscole).
export function missingPetPresetTasks(key, existing = [], t, today) {
  const have = new Set(existing.map(e => String(e.title || '').trim().toLowerCase()));
  return petPresetTasks(key, t, today).filter(item => !have.has(item.title.trim().toLowerCase()));
}

// ===== Controlli dei dati =====
export function normalizePet(input = {}, today = null) {
  const name = text(input.name, PET_LIMITS.name);
  if (name.length < 1) return { error: 'pets.error.name' };
  const species = SPECIES.includes(input.species) ? input.species : 'other';
  const preset = input.preset && PET_PRESETS[input.preset] ? input.preset : null;
  const sex = ['female', 'male'].includes(input.sex) ? input.sex : null;
  const birth_on = input.birth_on ? String(input.birth_on) : null;
  if (birth_on && (!validDate(birth_on) || (today && birth_on > today))) return { error: 'pets.error.birth' };
  const ended_on = input.ended_on ? String(input.ended_on) : null;
  if (ended_on && (!validDate(ended_on) || (birth_on && ended_on < birth_on))) return { error: 'pets.error.ended' };
  const weight_kg = optionalNumber(input.weight_kg);
  if (weight_kg !== null && !(Number.isFinite(weight_kg) && weight_kg > 0 && weight_kg <= PET_LIMITS.maxWeight)) return { error: 'pets.error.weight' };
  const food_daily = optionalNumber(input.food_daily);
  if (food_daily !== null && !(Number.isFinite(food_daily) && food_daily > 0 && food_daily <= PET_LIMITS.maxFood)) return { error: 'pets.error.food' };
  const food_stock_item_id = input.food_stock_item_id || null;
  return { value: {
    name, species, preset, breed: text(input.breed, PET_LIMITS.breed), sex, birth_on, neutered: input.neutered === true,
    microchip: text(input.microchip, PET_LIMITS.microchip), weight_kg: weight_kg === null ? null : Math.round(weight_kg * 100) / 100,
    food_stock_item_id, food_daily: food_stock_item_id && food_daily !== null ? Math.round(food_daily * 100) / 100 : null,
    vet_name: text(input.vet_name, PET_LIMITS.vet), vet_phone: text(input.vet_phone, PET_LIMITS.phone), notes: text(input.notes, PET_LIMITS.notes), ended_on,
  } };
}

export function normalizePetTask(input = {}) {
  const title = text(input.title, PET_LIMITS.title);
  if (title.length < 2) return { error: 'pets.error.taskTitle' };
  const kind = PET_TASK_KINDS.includes(input.kind) ? input.kind : 'other';
  const every = Number(input.every_days ?? 0);
  if (!Number.isInteger(every) || every < 0 || every > PET_LIMITS.maxEvery) return { error: 'pets.error.every' };
  const next_on = input.next_on ? String(input.next_on) : null;
  if (next_on && !validDate(next_on)) return { error: 'pets.error.date' };
  const last_done_on = input.last_done_on ? String(input.last_done_on) : null;
  if (last_done_on && !validDate(last_done_on)) return { error: 'pets.error.date' };
  const stock_item_id = input.stock_item_id || null;
  const stock_use = optionalNumber(input.stock_use);
  if (stock_item_id && stock_use !== null && !(Number.isFinite(stock_use) && stock_use > 0 && stock_use <= PET_LIMITS.maxFood)) return { error: 'pets.error.stockUse' };
  return { value: { kind, title, product: text(input.product, PET_LIMITS.product), dose: text(input.dose, PET_LIMITS.dose), notes: text(input.notes, PET_LIMITS.notes),
    every_days: every, next_on, last_done_on, remind: input.remind !== false, stock_item_id, stock_use: stock_item_id && stock_use !== null ? Math.round(stock_use * 100) / 100 : null } };
}

export function normalizePetLog(input = {}, today = null) {
  const title = text(input.title, PET_LIMITS.title);
  if (title.length < 2) return { error: 'pets.error.taskTitle' };
  const done_on = String(input.done_on || '');
  if (!validDate(done_on) || (today && done_on > today)) return { error: 'pets.error.doneOn' };
  const kind = PET_LOG_KINDS.includes(input.kind) ? input.kind : 'other';
  const weight_kg = optionalNumber(input.weight_kg);
  if (weight_kg !== null && !(Number.isFinite(weight_kg) && weight_kg > 0 && weight_kg <= PET_LIMITS.maxWeight)) return { error: 'pets.error.weight' };
  // Spesa in euro (con i centesimi) → centesimi interi.
  const cost = optionalNumber(input.cost);
  if (cost !== null && !(Number.isFinite(cost) && cost >= 0 && cost * 100 <= PET_LIMITS.maxCost)) return { error: 'pets.error.cost' };
  return { value: { done_on, kind, title, product: text(input.product, PET_LIMITS.product), dose: text(input.dose, PET_LIMITS.dose), notes: text(input.notes, PET_LIMITS.notes),
    task_id: input.task_id || null, weight_kg: weight_kg === null ? null : Math.round(weight_kg * 100) / 100, cost_cents: cost === null ? null : Math.round(cost * 100),
    document_id: input.document_id || null } };
}

// ===== Date del piano =====
// none = senza data; late = scaduta; due = oggi; soon = entro una settimana; later = più avanti.
export function petTaskState(task, today) {
  if (!validDate(task?.next_on)) return 'none';
  if (task.next_on < today) return 'late';
  if (task.next_on === today) return 'due';
  return task.next_on <= addDays(today, PET_LIMITS.soonDays) ? 'soon' : 'later';
}

// «Fatto»: la prossima volta è dopo «ogni quanto» dal giorno in cui si è fatto; se era una volta sola
// la voce resta senza data (e senza promemoria) finché non se ne sceglie un'altra.
export function markPetDone(task, doneOn) {
  const every = Number(task?.every_days) || 0;
  return { last_done_on: doneOn, next_on: every > 0 ? addDays(doneOn, every) : null };
}

// «Rimanda»: una settimana più in là, contando da oggi se la data era già passata.
export function postponePet(task, today, days = 7) {
  const base = validDate(task?.next_on) && task.next_on > today ? task.next_on : today;
  return { next_on: addDays(base, days) };
}

// Da fare nei prossimi 30 giorni (e quelle scadute), prima le più vicine.
export function petAgenda(tasks = [], today, horizon = PET_LIMITS.horizonDays) {
  const until = addDays(today, horizon);
  return tasks.filter(t => validDate(t.next_on) && t.next_on <= until)
    .map(task => ({ task, state: petTaskState(task, today) }))
    .sort((a, b) => a.task.next_on.localeCompare(b.task.next_on) || String(a.task.title).localeCompare(String(b.task.title)));
}

// Età in anni e mesi compiuti.
export function petAge(birthOn, today) {
  if (!validDate(birthOn) || !validDate(today) || birthOn > today) return null;
  const [by, bm, bd] = birthOn.split('-').map(Number), [ty, tm, td] = today.split('-').map(Number);
  let months = (ty - by) * 12 + (tm - bm) - (td < bd ? 1 : 0);
  if (months < 0) months = 0;
  return { years: Math.floor(months / 12), months: months % 12 };
}

// Pesate del registro (e il peso della scheda se il registro non ne ha), dalla più vecchia.
export function weightSeries(pet, log = []) {
  const points = log.filter(l => l.pet_id === pet.id && Number(l.weight_kg) > 0 && validDate(l.done_on))
    .map(l => ({ date: l.done_on, kg: Number(l.weight_kg) })).sort((a, b) => a.date.localeCompare(b.date));
  if (!points.length && Number(pet.weight_kg) > 0) return [{ date: null, kg: Number(pet.weight_kg) }];
  return points;
}

// Differenza tra le ultime due pesate, in percentuale (per «è cambiato molto»: oltre il 10%).
export function weightChange(series = []) {
  if (series.length < 2) return null;
  const last = series[series.length - 1].kg, previous = series[series.length - 2].kg;
  if (!(previous > 0)) return null;
  return Math.round(((last - previous) / previous) * 1000) / 10;
}

// ===== Cibo dalle Scorte =====
// La scorta non scende da sola: si stima quanto ne resta da quanto c'era all'ultimo aggiornamento
// della scorta, meno quello che hanno mangiato da allora tutti gli animali che usano lo stesso cibo.
export function foodEstimates(pets = [], stock = [], today) {
  const byItem = new Map();
  for (const pet of pets) {
    if (pet.ended_on || !pet.food_stock_item_id || !(Number(pet.food_daily) > 0)) continue;
    byItem.set(pet.food_stock_item_id, (byItem.get(pet.food_stock_item_id) || 0) + Number(pet.food_daily));
  }
  const out = new Map();
  for (const item of stock) {
    const daily = byItem.get(item.id);
    if (!daily) continue;
    const since = String(item.updated_at || '').slice(0, 10);
    const elapsed = validDate(since) && validDate(today) ? Math.max(0, daysBetween(since, today)) : 0;
    const left = Math.max(0, Math.round((Number(item.quantity) - daily * elapsed) * 100) / 100);
    const days = Math.floor(left / daily + 1e-9);
    out.set(item.id, { item, daily: Math.round(daily * 100) / 100, left, days, runs_out_on: addDays(today, days), low: days <= PET_LIMITS.foodWarnDays });
  }
  return out;
}

// ===== Avvisi e calendario =====
// Promemoria: voci con il promemoria acceso arrivate alla loro data (anche nei giorni scorsi, se il
// lavoro giornaliero ne ha saltato qualcuno). Un avviso per voce e data.
export function petEventsToday(tasks = [], today) {
  const from = addDays(today, -PET_LIMITS.graceDays);
  return tasks.filter(t => t.remind !== false && validDate(t.next_on) && t.next_on <= today && t.next_on >= from)
    .map(t => ({ kind: 'pet', reference_id: t.id, event_date: t.next_on }));
}

// Eventi del calendario del telefono: la prossima data di ogni voce e le ripetizioni fino a un anno.
export function petCalendarEvents(pets = [], tasks = [], today, { days = 365, max = 2000 } = {}) {
  const byId = new Map(pets.filter(p => !p.ended_on).map(p => [p.id, p]));
  const from = addDays(today, -PET_LIMITS.graceDays), to = addDays(today, days), out = [];
  for (const task of tasks) {
    const pet = byId.get(task.pet_id);
    if (!pet || !validDate(task.next_on) || task.next_on < from) continue;
    const every = Number(task.every_days) || 0;
    for (let date = task.next_on, n = 0; date <= to && n < 60; n++) {
      out.push({ uid: `pet-${task.id}-${date}`, date, task: task.title, pet: pet.name, product: task.product || '' });
      if (!every) break;
      date = addDays(date, every);
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.uid.localeCompare(b.uid)).slice(0, max);
}

// Spese del veterinario dell'anno (per il riepilogo e per le spese detraibili).
export function vetCosts(log = [], year) {
  return log.filter(l => Number(l.cost_cents) > 0 && String(l.done_on || '').startsWith(String(year)))
    .sort((a, b) => a.done_on.localeCompare(b.done_on));
}

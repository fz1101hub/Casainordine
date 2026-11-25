// Promemoria degli animali di casa (lib/pets.mjs): ogni giorno le voci del piano con il promemoria
// acceso la cui data è arrivata diventano avvisi «pet» per chi ha l'animale, o per tutti i membri
// della casa; e il cibo delle Scorte che sta per finire (stima di lib/pets.mjs) diventa un avviso
// con la data in cui finisce (uno solo finché la scorta non cambia).
// La consegna è quella comune (deliverAlerts): push solo la prima volta.
import { addDays, petEventsToday, foodEstimates, PET_LIMITS } from './pets.mjs';
import { deliverAlerts } from './extra-alerts.mjs';
import { readAll, readIn, byKey } from './batch.mjs';
import { translate, normalizeLanguage, formatDate } from './i18n.mjs';

// Tabelle non ancora create (migrate_v59 non eseguita): niente da fare, nessun errore.
const MISSING_TABLE = new Set(['42P01', 'PGRST205']);
const clean = value => String(value ?? '').replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁩﻿]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120).trim();
const checkDate = value => { if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new TypeError('Invalid pet alert date'); };

// Testo dell'avviso nella lingua di chi lo riceve.
export function petAlertCopy(source, language = 'it') {
  const lang = normalizeLanguage(language), pet = clean(source?.pet), task = clean(source?.task), product = clean(source?.product);
  if (!pet || !task) throw new TypeError('Missing pet alert names');
  checkDate(source.date);
  const date = formatDate(source.date, lang);
  if (date === '—') throw new TypeError('Invalid pet alert date');
  return { title: translate(lang, 'server.pet.title', { pet }),
    body: translate(lang, 'server.pet.body', { task, product: product ? ` (${product})` : '', date }) };
}

export function petFoodAlertCopy(source, language = 'it') {
  const lang = normalizeLanguage(language), pets = clean(source?.pets), food = clean(source?.food);
  if (!pets || !food) throw new TypeError('Missing pet food names');
  checkDate(source.date);
  const date = formatDate(source.date, lang);
  if (date === '—') throw new TypeError('Invalid pet alert date');
  return { title: translate(lang, 'server.pet.foodTitle', { food }),
    body: translate(lang, 'server.pet.foodBody', { pets, date, count: Math.max(0, Number(source.days) || 0) }) };
}

export async function processPetAlerts(admin, today, counts, options = {}) {
  let tasks, pets;
  try {
    tasks = await readAll(admin, 'home_pet_tasks', 'id,pet_id,title,product,next_on,remind',
      q => q.eq('remind', true).gte('next_on', addDays(today, -PET_LIMITS.graceDays)).lte('next_on', today).order('id'));
    pets = await readAll(admin, 'home_pets', 'id,user_id,home_id,name,ended_on,food_stock_item_id,food_daily',
      q => q.is('ended_on', null).not('food_stock_item_id', 'is', null).order('id'));
  } catch (error) { if (!MISSING_TABLE.has(error?.code)) counts.errors.push(`Animali: ${error?.message || error}`); return; }
  const entries = [];
  // Promemoria del piano.
  const events = petEventsToday(tasks || [], today);
  if (events.length) {
    let owners;
    try { owners = byKey((await readIn(admin, 'home_pets', 'id,user_id,home_id,name,ended_on', 'id', [...new Set(tasks.map(t => t.pet_id))])).filter(p => !p.ended_on), 'id'); }
    catch (error) { counts.errors.push(`Animali (schede): ${error?.message || error}`); return; }
    const byId = byKey(tasks, 'id');
    for (const event of events) {
      const task = byId.get(event.reference_id), pet = owners.get(task?.pet_id);
      if (!pet) continue;
      entries.push({ item: { user_id: pet.user_id, home_id: pet.home_id }, event,
        copy: language => petAlertCopy({ pet: pet.name, task: task.title, product: task.product, date: task.next_on }, language) });
    }
  }
  // Cibo quasi finito.
  if (pets?.length) {
    let stock = [];
    try { stock = await readIn(admin, 'home_stock_items', 'id,user_id,home_id,name,quantity,updated_at', 'id', [...new Set(pets.map(p => p.food_stock_item_id))]); }
    catch (error) { counts.errors.push(`Animali (cibo): ${error?.message || error}`); }
    for (const estimate of foodEstimates(pets, stock, today).values()) {
      if (!estimate.low) continue;
      const eating = pets.filter(p => p.food_stock_item_id === estimate.item.id);
      const first = eating[0];
      entries.push({ item: { user_id: first.user_id, home_id: first.home_id },
        event: { kind: 'pet', reference_id: estimate.item.id, event_date: estimate.runs_out_on },
        copy: language => petFoodAlertCopy({ pets: eating.map(p => p.name).join(', '), food: estimate.item.name, date: estimate.runs_out_on, days: estimate.days }, language) });
    }
  }
  counts.pet_matches = entries.length;
  if (entries.length) await deliverAlerts(admin, entries, counts, { today, label: 'animali', ...options });
}

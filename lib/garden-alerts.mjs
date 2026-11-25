// Promemoria del giardino e dell'orto (lib/garden.mjs): ogni giorno gli interventi con il
// promemoria acceso la cui data è arrivata (anche negli ultimi giorni, se il lavoro ne ha saltato
// qualcuno) diventano avvisi «garden» per chi ha la pianta, o per tutti i membri della casa.
// La consegna è quella comune (deliverAlerts): un avviso per intervento e data, push solo la prima volta.
import { addDays, gardenEventsToday, GARDEN_LIMITS } from './garden.mjs';
import { deliverAlerts } from './extra-alerts.mjs';
import { readAll, readIn, byKey } from './batch.mjs';
import { translate, normalizeLanguage, formatDate } from './i18n.mjs';

// Tabelle non ancora create (migrate_v57_giardino.sql non eseguita): niente da fare, nessun errore.
const MISSING_TABLE = new Set(['42P01', 'PGRST205']);
const clean = value => String(value ?? '').replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁩﻿]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120).trim();

// Testo dell'avviso nella lingua di chi lo riceve.
export function gardenAlertCopy(source, language = 'it') {
  const lang = normalizeLanguage(language), plant = clean(source?.plant), task = clean(source?.task), product = clean(source?.product);
  if (!plant || !task) throw new TypeError('Missing garden alert names');
  if (typeof source.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(source.date)) throw new TypeError('Invalid garden alert date');
  const date = formatDate(source.date, lang);
  if (date === '—') throw new TypeError('Invalid garden alert date');
  return { title: translate(lang, 'server.garden.title', { plant }),
    body: translate(lang, 'server.garden.body', { task, product: product ? ` (${product})` : '', date }) };
}

export async function processGardenAlerts(admin, today, counts, options = {}) {
  let tasks;
  try {
    tasks = await readAll(admin, 'home_garden_tasks', 'id,plant_id,title,product,next_on,remind',
      q => q.eq('remind', true).gte('next_on', addDays(today, -GARDEN_LIMITS.graceDays)).lte('next_on', today).order('id'));
  } catch (error) { if (!MISSING_TABLE.has(error?.code)) counts.errors.push(`Giardino: ${error?.message || error}`); return; }
  const events = gardenEventsToday(tasks || [], today);
  if (!events.length) return;
  let plants;
  const ids = [...new Set(tasks.map(t => t.plant_id))];
  // Colture finite (ended_on, dalla v58): niente promemoria. Senza la colonna si legge come prima.
  try {
    const rows = await readIn(admin, 'home_garden_plants', 'id,user_id,home_id,name,ended_on', 'id', ids)
      .catch(error => { if (error?.code === '42703') return readIn(admin, 'home_garden_plants', 'id,user_id,home_id,name', 'id', ids); throw error; });
    plants = byKey(rows.filter(p => !p.ended_on), 'id');
  } catch (error) { counts.errors.push(`Giardino (piante): ${error?.message || error}`); return; }
  const byId = byKey(tasks, 'id');
  const entries = [];
  for (const event of events) {
    const task = byId.get(event.reference_id), plant = plants.get(task?.plant_id);
    if (!plant) continue;
    entries.push({ item: { user_id: plant.user_id, home_id: plant.home_id }, event,
      copy: language => gardenAlertCopy({ plant: plant.name, task: task.title, product: task.product, date: task.next_on }, language) });
  }
  counts.garden_matches = entries.length;
  await deliverAlerts(admin, entries, counts, { today, label: 'giardino', ...options });
}

// Avviso di gelata per il giardino (lib/weather.mjs): ogni giorno, per ogni spazio con il luogo del
// meteo, l'avviso acceso e almeno una pianta in giardino, se nei prossimi due giorni la minima scende
// a 1 °C o meno arriva un avviso «weather» (uno per luogo e giorno di gelata) a chi ha il giardino,
// o a tutti i membri della casa. Le previsioni si chiedono una volta per luogo.
import { WEATHER, fetchForecast, frostAhead } from './weather.mjs';
import { deliverAlerts } from './extra-alerts.mjs';
import { readAll, readIn } from './batch.mjs';
import { translate, normalizeLanguage, formatDate } from './i18n.mjs';

const SKIP = new Set(['42P01', 'PGRST205', '42703', 'PGRST204']); // tabelle o colonne della v59 non ancora create
const MAX_PLACES = 150;
const clean = value => String(value ?? '').replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁩﻿]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, WEATHER.placeMax).trim();

export function frostAlertCopy(source, language = 'it') {
  const lang = normalizeLanguage(language), place = clean(source?.place);
  if (typeof source?.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(source.date) || !Number.isFinite(Number(source.min))) throw new TypeError('Invalid frost alert');
  const date = formatDate(source.date, lang);
  if (date === '—') throw new TypeError('Invalid frost alert date');
  const min = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(Number(source.min));
  return { title: translate(lang, place ? 'server.weather.frostTitle' : 'server.weather.frostTitleNoPlace', { place }),
    body: translate(lang, 'server.weather.frostBody', { date, min }) };
}

export async function processWeatherAlerts(admin, today, counts, options = {}) {
  const { fetchImpl = fetch } = options;
  let settings;
  try {
    settings = await readAll(admin, 'home_seasonal_settings', 'id,user_id,home_id,weather_lat,weather_lon,weather_place,frost_alerts',
      q => q.eq('frost_alerts', true).not('weather_lat', 'is', null).order('id'));
  } catch (error) { if (!SKIP.has(error?.code)) counts.errors.push(`Meteo: ${error?.message || error}`); return; }
  if (!settings?.length) return;
  // Solo gli spazi con almeno una pianta in giardino (non le colture finite).
  let plants = [];
  try {
    const homes = settings.filter(s => s.home_id).map(s => s.home_id), people = settings.filter(s => !s.home_id).map(s => s.user_id);
    if (homes.length) plants.push(...await readIn(admin, 'home_garden_plants', 'id,user_id,home_id,ended_on', 'home_id', homes));
    if (people.length) plants.push(...(await readIn(admin, 'home_garden_plants', 'id,user_id,home_id,ended_on', 'user_id', people)).filter(p => !p.home_id));
  } catch (error) { if (!SKIP.has(error?.code)) counts.errors.push(`Meteo (piante): ${error?.message || error}`); return; }
  const growing = new Set(plants.filter(p => !p.ended_on).map(p => p.home_id || `u:${p.user_id}`));
  const rows = settings.filter(s => growing.has(s.home_id || `u:${s.user_id}`));
  // Una richiesta per luogo (coordinate già arrotondate dal database).
  const forecasts = new Map();
  for (const row of rows) {
    const key = `${Number(row.weather_lat).toFixed(2)},${Number(row.weather_lon).toFixed(2)}`;
    if (forecasts.has(key) || forecasts.size >= MAX_PLACES) continue;
    try { forecasts.set(key, await fetchForecast({ lat: Number(row.weather_lat), lon: Number(row.weather_lon) }, { fetchImpl })); }
    catch (error) { forecasts.set(key, null); counts.errors.push(`Meteo (previsioni): ${String(error?.message || error).slice(0, 80)}`); }
  }
  const entries = [];
  for (const row of rows) {
    const days = forecasts.get(`${Number(row.weather_lat).toFixed(2)},${Number(row.weather_lon).toFixed(2)}`);
    const frost = days ? frostAhead(days, today) : null;
    if (!frost) continue;
    entries.push({ item: { user_id: row.user_id, home_id: row.home_id }, event: { kind: 'weather', reference_id: row.id, event_date: frost.date },
      copy: language => frostAlertCopy({ place: row.weather_place, date: frost.date, min: frost.min }, language) });
  }
  counts.weather_matches = entries.length;
  if (entries.length) await deliverAlerts(admin, entries, counts, { today, label: 'meteo', ...options });
}

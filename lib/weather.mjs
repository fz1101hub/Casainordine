// Meteo per il giardino (scelta dell'utente del 25 novembre 2026, sera): previsioni di Open-Meteo
// (gratuite per uso non commerciale, dati CC BY 4.0: la schermata cita la fonte) per il luogo della
// casa, arrotondato a 2 decimali (circa 1 km). Le richieste partono dal server dell'app
// (app/api/weather): a Open-Meteo non arrivano né l'indirizzo IP di chi usa l'app né altri dati.
// Usato dal browser (app/Garden.jsx), dalle API e dal lavoro giornaliero (lib/weather-alerts.mjs).
export const WEATHER = Object.freeze({ frostC: 1, rainSkipMm: 5, days: 4, timeoutMs: 6000, placeMax: 80, queryMin: 2, queryMax: 80, results: 5 });
const ISO = /^\d{4}-\d{2}-\d{2}$/;
// Solo per le prove nel browser (.github/workflows/tests.yml): un Open-Meteo finto al posto di quello vero.
const fakeBase = () => String(globalThis.process?.env?.OPEN_METEO_URL || '').replace(/\/$/, '');
const number = value => (value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value));

// Coordinate arrotondate a 2 decimali (circa 1 km); null se non valide.
export function roundCoords(lat, lon) {
  const a = number(lat), b = number(lon);
  if (a === null || b === null || a < -90 || a > 90 || b < -180 || b > 180) return null;
  return { lat: Math.round(a * 100) / 100, lon: Math.round(b * 100) / 100 };
}

// Ieri, oggi e i prossimi giorni: minima, massima, pioggia, probabilità di pioggia.
export function forecastUrl({ lat, lon }) {
  const q = new URLSearchParams({ latitude: lat.toFixed(2), longitude: lon.toFixed(2),
    daily: 'temperature_2m_min,temperature_2m_max,precipitation_sum,precipitation_probability_max',
    past_days: '1', forecast_days: String(WEATHER.days), timezone: 'Europe/Rome' });
  return `${fakeBase() || 'https://api.open-meteo.com'}/v1/forecast?${q}`;
}

export function placesUrl(name, language = 'it') {
  const q = new URLSearchParams({ name, count: String(WEATHER.results), language: String(language).slice(0, 2), format: 'json' });
  return `${fakeBase() || 'https://geocoding-api.open-meteo.com'}/v1/search?${q}`;
}

export function parseForecast(body) {
  const d = body?.daily;
  if (!d || !Array.isArray(d.time)) return [];
  return d.time.map((date, i) => ({ date, min: number(d.temperature_2m_min?.[i]), max: number(d.temperature_2m_max?.[i]),
    rain: number(d.precipitation_sum?.[i]), chance: number(d.precipitation_probability_max?.[i]) }))
    .filter(day => ISO.test(day.date) && day.min !== null && day.max !== null).slice(0, WEATHER.days + 1);
}

export function parsePlaces(body) {
  return (Array.isArray(body?.results) ? body.results : []).map(r => {
    const coords = roundCoords(r?.latitude, r?.longitude);
    const name = String(r?.name || '').trim().slice(0, 60);
    if (!coords || !name) return null;
    const region = [r.admin1, r.country_code || r.country].filter(Boolean).map(x => String(x).trim()).join(', ');
    return { name, region: region.slice(0, 60), label: (region ? `${name} (${region})` : name).slice(0, WEATHER.placeMax), ...coords };
  }).filter(Boolean).slice(0, WEATHER.results);
}

// Gelata: il primo giorno da oggi ai prossimi due con la minima a 1 °C o meno.
export function frostAhead(days = [], today, horizon = 2) {
  const until = new Date(Date.parse(today + 'T00:00:00Z') + horizon * 86400000).toISOString().slice(0, 10);
  return days.find(d => d.date >= today && d.date <= until && d.min !== null && d.min <= WEATHER.frostC) || null;
}

// Pioggia di ieri e di oggi (prevista): con 5 mm o più l'annaffiatura di oggi si può saltare.
export function rainToday(days = [], today) {
  const yesterday = new Date(Date.parse(today + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
  const mm = days.filter(d => d.date === yesterday || d.date === today).reduce((sum, d) => sum + (d.rain || 0), 0);
  return { mm: Math.round(mm * 10) / 10, skip: mm >= WEATHER.rainSkipMm };
}

// Richiesta a Open-Meteo con un tempo massimo; errore se la risposta non va.
export async function fetchJson(url, { fetchImpl = fetch, timeoutMs = WEATHER.timeoutMs } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`weather ${response.status}`);
    return await response.json();
  } finally { clearTimeout(timer); }
}

// Risposte già chieste, per le route dell'app: le stesse coordinate (arrotondate a circa 1 km) o lo
// stesso nome non ripartono verso Open-Meteo prima della scadenza. Un errore non si ricorda. Il
// limite tiene piccola la memoria del server (si toglie la voce più vecchia).
const RESPONSES = new Map();
export const WEATHER_CACHE = Object.freeze({ max: 500, forecastMs: 30 * 60 * 1000, placesMs: 24 * 60 * 60 * 1000 });
export async function cachedJson(url, ttlMs, options = {}, now = Date.now()) {
  const hit = RESPONSES.get(url);
  if (hit && hit.until > now) return hit.data;
  const data = await fetchJson(url, options);
  RESPONSES.delete(url);
  while (RESPONSES.size >= WEATHER_CACHE.max) RESPONSES.delete(RESPONSES.keys().next().value);
  RESPONSES.set(url, { data, until: now + ttlMs });
  return data;
}

export async function fetchForecast(coords, options) { return parseForecast(await fetchJson(forecastUrl(coords), options)); }

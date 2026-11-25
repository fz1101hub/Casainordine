// Meteo per il giardino (scelta dell'utente del 25 novembre 2026, sera): lib/weather.mjs,
// lib/weather-alerts.mjs e le API che chiedono le previsioni a Open-Meteo dal server.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WEATHER, roundCoords, forecastUrl, placesUrl, parseForecast, parsePlaces, frostAhead, rainToday, fetchForecast } from '../lib/weather.mjs';
import { translate } from '../lib/i18n.mjs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const LANGS = ['it', 'en', 'es', 'fr', 'de', 'pt'];
const SAMPLE = { daily: { time: ['2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28'],
  temperature_2m_min: [3.1, 2.4, 0.6, -1.2, 4], temperature_2m_max: [11, 9.5, 7, 6, 12],
  precipitation_sum: [3.2, 2.1, 0, 0, 8], precipitation_probability_max: [80, 65, 10, 5, 90] } };

test('coordinate arrotondate a circa 1 km, indirizzi di Open-Meteo', () => {
  assert.deepEqual(roundCoords('45.69876', '9.67049'), { lat: 45.7, lon: 9.67 });
  assert.equal(roundCoords(95, 9), null); assert.equal(roundCoords('x', 9), null); assert.equal(roundCoords(null, 9), null);
  const url = new URL(forecastUrl({ lat: 45.7, lon: 9.67 }));
  assert.equal(url.origin + url.pathname, 'https://api.open-meteo.com/v1/forecast');
  assert.equal(url.searchParams.get('latitude'), '45.70');
  assert.equal(url.searchParams.get('timezone'), 'Europe/Rome');
  assert.equal(url.searchParams.get('past_days'), '1');
  assert.match(url.searchParams.get('daily'), /temperature_2m_min/);
  const places = new URL(placesUrl('Bergamo', 'de-DE'));
  assert.equal(places.hostname, 'geocoding-api.open-meteo.com');
  assert.equal(places.searchParams.get('language'), 'de');
});

test('previsioni e luoghi letti in modo sicuro', () => {
  const days = parseForecast(SAMPLE);
  assert.equal(days.length, 5);
  assert.deepEqual(days[2], { date: '2026-11-26', min: 0.6, max: 7, rain: 0, chance: 10 });
  assert.deepEqual(parseForecast({}), []);
  assert.deepEqual(parseForecast({ daily: { time: ['ieri'], temperature_2m_min: [1], temperature_2m_max: [2] } }), []);
  const places = parsePlaces({ results: [{ name: 'Bergamo', latitude: 45.69601, longitude: 9.66721, admin1: 'Lombardia', country_code: 'IT' },
    { name: '', latitude: 1, longitude: 1 }, { name: 'Strano', latitude: 200, longitude: 1 }] });
  assert.deepEqual(places, [{ name: 'Bergamo', region: 'Lombardia, IT', label: 'Bergamo (Lombardia, IT)', lat: 45.7, lon: 9.67 }]);
  assert.deepEqual(parsePlaces(null), []);
});

test('gelata nei prossimi due giorni e pioggia che basta per non annaffiare', () => {
  const days = parseForecast(SAMPLE);
  assert.deepEqual(frostAhead(days, '2026-11-25'), days[2], 'il 26 la minima è 0,6 °C');
  assert.equal(frostAhead(days, '2026-11-23'), null, 'oltre due giorni non conta');
  assert.deepEqual(rainToday(days, '2026-11-25'), { mm: 5.3, skip: true });
  assert.deepEqual(rainToday(days, '2026-11-27'), { mm: 0, skip: false });
  assert.equal(WEATHER.frostC, 1); assert.equal(WEATHER.rainSkipMm, 5);
});

test('richiesta con tempo massimo; risposta sbagliata = errore', async () => {
  const ok = async url => ({ ok: true, json: async () => (String(url).includes('forecast') ? SAMPLE : {}) });
  assert.equal((await fetchForecast({ lat: 45.7, lon: 9.67 }, { fetchImpl: ok })).length, 5);
  await assert.rejects(fetchForecast({ lat: 1, lon: 1 }, { fetchImpl: async () => ({ ok: false, status: 429 }) }), /weather 429/);
  const slow = (url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
  await assert.rejects(fetchForecast({ lat: 1, lon: 1 }, { fetchImpl: slow, timeoutMs: 20 }), /aborted/);
});

// Admin finto: tabelle in memoria, avvisi unici per persona, tipo, voce e data.
function fakeAdmin(tables) {
  const alerts = tables.user_alerts ||= [];
  return {
    from(name) {
      const filters = []; let upsertRow = null;
      const builder = {
        select() {
          if (!upsertRow) return builder;
          const added = [];
          for (const row of [].concat(upsertRow)) if (!alerts.some(a => a.user_id === row.user_id && a.kind === row.kind && a.reference_id === row.reference_id && a.event_date === row.event_date)) { alerts.push(row); added.push(row); }
          return Promise.resolve({ data: added, error: null });
        },
        order() { return builder; },
        range(from, to) { return builder.then(result => ({ data: result.data ? result.data.slice(from, to + 1) : null, error: result.error })); },
        eq(column, value) { filters.push(row => row[column] === value); return builder; },
        is(column, value) { filters.push(row => (row[column] ?? null) === value); return builder; },
        not(column, op, value) { filters.push(row => (row[column] ?? null) !== value); return builder; },
        in(column, values) { filters.push(row => values.includes(row[column])); return builder; },
        gte(column, value) { filters.push(row => row[column] >= value); return builder; },
        lte(column, value) { filters.push(row => row[column] <= value); return builder; },
        upsert(row) { upsertRow = row; return builder; },
        then(resolve, reject) {
          if (tables.error?.[name]) return Promise.resolve({ data: null, error: tables.error[name] }).then(resolve, reject);
          return Promise.resolve({ data: (tables[name] || []).filter(row => filters.every(f => f(row))), error: null }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

test('avviso di gelata: solo dove c\'è un giardino, una richiesta per luogo, nella lingua di chi lo riceve, una volta', async () => {
  const { processWeatherAlerts, frostAlertCopy } = await import('../lib/weather-alerts.mjs');
  const today = '2026-11-25';
  const tables = {
    home_seasonal_settings: [
      { id: 's-casa', user_id: 'anna', home_id: 'h1', weather_lat: 45.7, weather_lon: 9.67, weather_place: 'Bergamo (Lombardia, IT)', frost_alerts: true },
      { id: 's-mio', user_id: 'carla', home_id: null, weather_lat: 45.7, weather_lon: 9.67, weather_place: 'Bergamo', frost_alerts: true },
      { id: 's-spento', user_id: 'dario', home_id: null, weather_lat: 45.7, weather_lon: 9.67, weather_place: 'Bergamo', frost_alerts: false },
      { id: 's-senza-piante', user_id: 'elena', home_id: null, weather_lat: 41.9, weather_lon: 12.5, weather_place: 'Roma', frost_alerts: true },
      { id: 's-finite', user_id: 'franco', home_id: null, weather_lat: 44, weather_lon: 11, weather_place: 'X', frost_alerts: true },
    ],
    home_garden_plants: [{ id: 'p1', user_id: 'anna', home_id: 'h1' }, { id: 'p2', user_id: 'carla', home_id: null }, { id: 'p3', user_id: 'franco', home_id: null, ended_on: '2026-10-01' }],
    home_members: [{ home_id: 'h1', user_id: 'anna' }, { home_id: 'h1', user_id: 'bruno' }],
    user_language_preferences: [{ user_id: 'bruno', language: 'de' }],
  };
  const calls = [];
  const fetchImpl = async url => { calls.push(String(url)); return { ok: true, json: async () => SAMPLE }; };
  const counts = { errors: [] };
  await processWeatherAlerts(fakeAdmin(tables), today, counts, { fetchImpl });
  assert.deepEqual(counts.errors, []);
  assert.equal(calls.length, 1, 'una sola richiesta per lo stesso luogo; nessuna per chi non ha piante');
  assert.deepEqual(tables.user_alerts.map(a => [a.user_id, a.kind, a.reference_id, a.event_date]).sort(), [
    ['anna', 'weather', 's-casa', '2026-11-26'], ['bruno', 'weather', 's-casa', '2026-11-26'], ['carla', 'weather', 's-mio', '2026-11-26']]);
  const anna = tables.user_alerts.find(a => a.user_id === 'anna'), bruno = tables.user_alerts.find(a => a.user_id === 'bruno');
  assert.equal(anna.title, 'Gelata a Bergamo (Lombardia, IT)');
  assert.match(anna.body, /la minima prevista è 0,6 °C/);
  assert.match(bruno.body, /tiefstens 0,6 °C/);
  await processWeatherAlerts(fakeAdmin(tables), today, { errors: [] }, { fetchImpl });
  assert.equal(tables.user_alerts.length, 3, 'rilanciato non duplica');
  for (const lang of LANGS) {
    const copy = frostAlertCopy({ place: 'Bergamo', date: today, min: -2 }, lang);
    assert.ok(copy.title.includes('Bergamo') && !/\{|undefined/.test(copy.title + copy.body), lang);
    assert.ok(!/\{|undefined/.test(frostAlertCopy({ place: '', date: today, min: 0 }, lang).title), lang);
  }
  assert.throws(() => frostAlertCopy({ place: 'X', date: 'domani', min: 0 }));
});

test('senza la v59 o con Open-Meteo giù il lavoro giornaliero va avanti', async () => {
  const { processWeatherAlerts } = await import('../lib/weather-alerts.mjs');
  const counts = { errors: [] };
  await processWeatherAlerts(fakeAdmin({ error: { home_seasonal_settings: { code: '42703', message: 'column does not exist' } } }), '2026-11-25', counts);
  assert.deepEqual(counts.errors, []);
  const tables = { home_seasonal_settings: [{ id: 's', user_id: 'a', home_id: null, weather_lat: 1, weather_lon: 1, weather_place: 'X', frost_alerts: true }], home_garden_plants: [{ id: 'p', user_id: 'a', home_id: null }] };
  const down = { errors: [] };
  await processWeatherAlerts(fakeAdmin(tables), '2026-11-25', down, { fetchImpl: async () => ({ ok: false, status: 503 }) });
  assert.equal(down.errors.length, 1);
  assert.equal((tables.user_alerts || []).length, 0);
});

test('API: solo con l\'accesso, coordinate arrotondate, codici d\'errore tradotti; collegamenti', () => {
  for (const file of ['app/api/weather/route.js', 'app/api/weather/places/route.js']) {
    const source = read(file);
    assert.match(source, /authenticatedUser\(request\); if \(!user\) return apiError\('weatherLogin', 401\)/, file);
    assert.match(source, /apiError\('weatherUnavailable', 502\)/, file);
  }
  assert.match(read('app/api/weather/route.js'), /roundCoords\(url\.searchParams\.get\('lat'\)/);
  for (const lang of LANGS) for (const code of ['weatherLogin', 'weatherInvalid', 'weatherUnavailable']) assert.notEqual(translate(lang, 'api.' + code), 'api.' + code);
  assert.match(read('lib/push-preferences.mjs'), /weather:'push_weather'/);
  assert.match(read('lib/daily-jobs.mjs'), /await processWeatherAlerts\(admin,today,counts,/);
  assert.match(read('app/HomeExtra.jsx'), /\['push_weather','extra\.alerts\.weather'\]/);
  const garden = read('app/Garden.jsx');
  assert.match(garden, /fetch\(path, \{ headers: \{ Authorization: `Bearer \$\{session\.access_token\}` \} \}\)/);
  assert.match(garden, /href="https:\/\/open-meteo\.com\/"/, 'la fonte dei dati è citata');
  assert.doesNotMatch(garden, /api\.open-meteo\.com/, 'il browser non chiama Open-Meteo direttamente');
});

// Meteo per il giardino (scelta dell'utente del 25 novembre 2026, sera), nel browser con accesso, il
// Supabase finto e l'Open-Meteo finto (OPEN_METEO_URL=http://127.0.0.1:54321/open-meteo quando parte
// l'app). Il giorno è fisso, 25 novembre 2026:
// 1. luogo cercato per nome e scelto: si salva con le coordinate arrotondate;
// 2. previsioni di oggi e dei prossimi giorni; avviso di gelata; pioggia che basta per non annaffiare,
//    anche accanto all'annaffiatura da fare; la richiesta parte dal server, non dal browser;
// 3. avviso di gelata spento e riacceso; cambio di luogo;
// 4. Open-Meteo giù: messaggio, niente errori; sul telefono niente esce dallo schermo; accessibilità.
// Uso: node scripts/prove-meteo-giardino.mjs [http://localhost:3000]
import { checker, startScenario, openPage, launch } from './accesso-comune.mjs';
import { translate } from '../lib/i18n.mjs';

const { check, finish } = checker('Meteo per il giardino');
const tr = (key, params) => translate('it', key, params);
const ANNA = '11111111-1111-4111-8111-111111111111';

const { fake, person } = await startScenario({ tokenTtl: 3 * 86400 });
const anna = person('anna', ANNA, 'anna@example.org');
fake.seed('home_garden_plants', [{ id: 'plant-lawn', user_id: ANNA, home_id: null, name: 'Prato', kind: 'lawn', location: '', notes: '', preset: null }]);
fake.seed('home_garden_tasks', [{ id: 'task-water', plant_id: 'plant-lawn', kind: 'watering', title: 'Annaffiatura del prato', product: '', dose: '', notes: '', months: [11], every_days: 7, next_on: '2026-11-25', last_done_on: null, remind: true }]);
fake.state.weather.places = [
  { name: 'Bergamo', latitude: 45.69601, longitude: 9.66721, admin1: 'Lombardia', country_code: 'IT' },
  { name: 'Bergamo', latitude: 41.1, longitude: 16.6, admin1: 'Puglia', country_code: 'IT' },
  { name: 'Roma', latitude: 41.89193, longitude: 12.51133, admin1: 'Lazio', country_code: 'IT' },
];
fake.state.weather.forecast = { daily: { time: ['2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28'],
  temperature_2m_min: [3.1, 2.4, 0.6, -1.2, 4], temperature_2m_max: [11, 9.5, 7, 6, 12],
  precipitation_sum: [3.2, 2.1, 0, 0, 8], precipitation_probability_max: [80, 65, 10, 5, 90] } };
const browser = await launch();
const ui = await openPage(browser);
const { page } = ui;
await page.clock.setFixedTime(new Date('2026-11-25T09:00:00Z'));
const main = page.locator('main');
// Lo spazio personale di Anna ha una sola riga (il database mette user_id da solo).
const settings = () => fake.rows('home_seasonal_settings').find(r => !r.home_id);
const overflow = () => page.evaluate(() => document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth);
const browserCalls = [];
page.on('request', r => { if (/open-meteo/.test(r.url())) browserCalls.push(r.url()); });

try {
  check(await ui.login(anna), 'Anna entra');
  await ui.go(tr('nav.garden'));
  const box = main.locator('.garden-weather');
  check((await box.innerText()).includes(tr('garden.weather.help').slice(0, 30)), 'senza luogo il riquadro spiega a cosa serve');
  check((await box.innerText()).includes(tr('garden.weather.privacy').slice(0, 30)), 'dice quali dati vanno a Open-Meteo');

  // 1. Ricerca e scelta del luogo.
  await box.getByLabel(tr('garden.weather.place'), { exact: true }).fill('Berg');
  await box.getByRole('button', { name: tr('garden.weather.search') }).click();
  const choice = box.getByRole('button', { name: 'Bergamo (Lombardia, IT)' });
  await choice.waitFor({ timeout: 5000 }).catch(() => {});
  check(await box.locator('.garden-weather-places li').count() === 2, 'due luoghi con quel nome');
  await choice.click();
  await page.waitForTimeout(1500);
  const row = settings();
  check(Number(row?.weather_lat) === 45.7 && Number(row?.weather_lon) === 9.67 && row?.weather_place === 'Bergamo (Lombardia, IT)', `luogo salvato, arrotondato (${row?.weather_lat}, ${row?.weather_lon})`);

  // 2. Previsioni, gelata, pioggia.
  await box.locator('.garden-weather-days li').first().waitFor({ timeout: 5000 }).catch(() => {});
  check(await box.locator('.garden-weather-days li').count() === 3, 'oggi e i due giorni dopo');
  const text = await box.innerText();
  check(text.includes(tr('garden.weather.at', { place: 'Bergamo (Lombardia, IT)' })), 'per quale luogo sono le previsioni');
  check(/Oggi\s+2° \/ 10°/.test(text), `oggi: minima e massima (${text.split('\n').slice(2, 5).join(' | ')})`);
  check(text.includes(tr('garden.weather.frost', { date: '26 nov 2026', min: '0,6' })), 'avviso di gelata per domani');
  check(text.includes(tr('garden.weather.rainSkip', { mm: '5,3' })), 'pioggia di ieri e oggi: si può saltare l\'annaffiatura');
  check(await main.locator('.garden-due').filter({ hasText: 'Annaffiatura del prato' }).filter({ hasText: tr('garden.weather.wateringSkip', { mm: '5,3' }) }).count() === 1, 'accanto all\'annaffiatura da fare: piove, puoi rimandarla');
  check(fake.state.weatherCalls.some(u => /latitude=45\.70/.test(u) && /longitude=9\.67/.test(u)), 'il server chiede le previsioni con le coordinate arrotondate');
  check(!browserCalls.length, 'il browser non chiama Open-Meteo');
  check(/Dati meteo:\s*Open-Meteo\.com/.test(text), 'la fonte dei dati è citata');

  // 3. Avviso di gelata spento e riacceso; cambio di luogo.
  const toggle = box.getByRole('checkbox', { name: tr('garden.weather.frostToggle') });
  await toggle.uncheck();
  await page.waitForTimeout(800);
  check(settings()?.frost_alerts === false, 'avviso di gelata spento');
  await toggle.check();
  await page.waitForTimeout(800);
  check(settings()?.frost_alerts === true, 'avviso di gelata riacceso');
  // Cambio di luogo con Open-Meteo giù: il luogo si salva, le previsioni dicono che non ci sono.
  fake.state.weather.down = true;
  await box.getByRole('button', { name: tr('garden.weather.change') }).click();
  await box.getByLabel(tr('garden.weather.place'), { exact: true }).fill('Roma');
  await box.getByRole('button', { name: tr('garden.weather.search') }).click();
  await box.getByRole('button', { name: 'Roma (Lazio, IT)' }).click();
  await page.waitForTimeout(1200);
  check(Number(settings()?.weather_lat) === 41.89 && settings()?.weather_place === 'Roma (Lazio, IT)', 'luogo cambiato');
  check(fake.rows('home_seasonal_settings').filter(r => !r.home_id).length === 1, 'sempre una sola riga di impostazioni per lo spazio');
  check((await main.locator('.garden-weather').innerText()).includes(tr('api.weatherUnavailable')), 'Open-Meteo giù: il riquadro lo dice');

  // 4. Open-Meteo di nuovo su; telefono e accessibilità.
  fake.state.weather.down = false;
  await page.setViewportSize({ width: 360, height: 780 });
  await ui.go(tr('nav.dashboard'));
  await ui.go(tr('nav.garden'));
  await main.locator('.garden-weather-days li').first().waitFor({ timeout: 5000 }).catch(() => {});
  check(await overflow() <= 1, `sul telefono niente esce dallo schermo (${await overflow()} px)`);
  const violations = await ui.axe();
  check(!violations.length, `accessibilità (${violations.join(', ')})`);
  check(!ui.errors.filter(e => !/502|Failed to load resource/.test(e)).length, `nessun errore nella pagina ${ui.errors.slice(0, 3).join(' | ')}`);
} finally { await ui.context.close(); await browser.close(); await fake.close(); }
finish();

// Telefono lento (scelta dell'utente, 24 novembre 2026): rete «3G» come negli strumenti di Chrome
// (latenza 562,5 ms, 1,44 Mbit/s in discesa, 675 kbit/s in salita) e processore rallentato 4 volte.
// Prima visita senza cache, accesso, e seconda visita con la cache e la sessione già aperta.
// Controlla:
// - JavaScript della prima pagina entro il limite (compresso);
// - nessun dato chiesto due volte a Supabase all'accesso e all'apertura con la sessione (prima
//   dell'aggiornamento del 24 novembre 2026 all'apertura tutto si scaricava due volte);
// - alla seconda visita niente JavaScript scaricato di nuovo.
// Stampa i tempi; con MISURA_ELENCO=1 anche ogni richiesta, con MISURA_JSON=percorso salva i tempi.
// Uso: server dell'app costruito per il Supabase finto (vedi scripts/prove-con-accesso.mjs), poi
//   node scripts/prove-telefono-lento.mjs [http://localhost:3000]
import { writeFileSync } from 'node:fs';
import { BASE, checker, startScenario, launch } from './accesso-comune.mjs';

const JS_BUDGET_KB = 300;
const NETWORK = { offline: false, latency: 562.5, downloadThroughput: 1.44e6 / 8, uploadThroughput: 675e3 / 8 };
const PHONE = { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, locale: 'it-IT',
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36' };

const { check, finish } = checker('Telefono lento');
const { fake, person } = await startScenario();
const mario = person('mario', '11111111-1111-4111-8111-111111111111', 'mario@example.org');
const today = Date.now();
fake.seed('bills', Array.from({ length: 40 }, (_, i) => ({ id: `b0000000-0000-4000-8000-${String(i).padStart(12, '0')}`, user_id: mario.id,
  title: `Bolletta ${i + 1}`, supplier: ['Lumen Casa', 'GasNord', 'Acque del Fiume', 'FibraVeloce'][i % 4], category: ['Luce', 'Gas', 'Acqua', 'Internet'][i % 4],
  amount: 40 + i * 3.5, due_date: new Date(today + (i - 20) * 6 * 86400000).toISOString().slice(0, 10), paid_at: i < 20 ? new Date().toISOString() : null })));

const browser = await launch();
const context = await browser.newContext(PHONE);
await context.addInitScript(() => {
  try { localStorage.setItem('casainordine-language-v32', 'it'); } catch {}
  window.__misure = { long: 0, longCount: 0 };
  new PerformanceObserver(list => { for (const e of list.getEntries()) { window.__misure.long += e.duration - 50; window.__misure.longCount++; } }).observe({ type: 'longtask', buffered: true });
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const cdp = await context.newCDPSession(page);
await cdp.send('Network.enable');
await cdp.send('Network.emulateNetworkConditions', NETWORK);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

// Ogni richiesta appartiene alla fase in cui è partita, anche se finisce dopo.
let phase = '', origin = Date.now();
const requests = new Map();
const supabase = url => url.replace(/^http:\/\/127\.0\.0\.1:\d+/, '[supabase]');
cdp.on('Network.requestWillBeSent', e => requests.set(e.requestId, { phase, at: Date.now() - origin, method: e.request.method, url: e.request.url }));
cdp.on('Network.responseReceived', e => { const r = requests.get(e.requestId); if (r) Object.assign(r, { type: e.type, cached: Boolean(e.response.fromDiskCache || e.response.fromServiceWorker || e.response.fromPrefetchCache) }); });
cdp.on('Network.loadingFinished', e => {
  const r = requests.get(e.requestId); if (!r) return;
  r.bytes = e.encodedDataLength; r.end = Date.now() - origin;
  if (process.env.MISURA_ELENCO) console.log(`${phase.padEnd(8)} ${String(r.at).padStart(6)} → ${String(r.end).padStart(6)} ms  ${String(r.type).padEnd(10)} ${r.method.padEnd(7)} ${supabase(r.url.replace(BASE, '')).slice(0, 110)}`);
});
const inPhase = name => [...requests.values()].filter(r => r.phase === name && r.end !== undefined);
const kb = list => Math.round(list.reduce((n, r) => n + (r.bytes || 0), 0) / 1024);
// Richieste di dati a Supabase (non le preliminari OPTIONS) uguali, partite nella stessa fase.
const duplicates = name => {
  const seen = new Map();
  for (const r of inPhase(name)) if (r.method === 'GET' && /\/rest\/v1\//.test(r.url)) seen.set(r.url, (seen.get(r.url) || 0) + 1);
  return [...seen].filter(([, n]) => n > 1).map(([url, n]) => `${n}× ${supabase(url).slice(0, 90)}`);
};
const dataRequests = name => inPhase(name).filter(r => r.method === 'GET' && /\/rest\/v1\//.test(r.url)).length;
const start = name => { phase = name; origin = Date.now(); return origin; };
const longTasks = () => page.evaluate(() => ({ ms: Math.round(window.__misure.long), count: window.__misure.longCount }));
const results = {};

// 1. Prima visita: quando il modulo di accesso si può usare.
let t0 = start('prima');
await page.goto(`${BASE}/`, { waitUntil: 'commit' });
await page.waitForFunction(() => { const b = document.querySelector('.auth-card form button.btn-primary'); return b && !b.disabled && document.querySelector('input[type=email]'); }, null, { timeout: 120000 });
results.primaVisita = { accessoPronto: Date.now() - t0 };
await page.waitForLoadState('networkidle').catch(() => {});
const firstJs = inPhase('prima').filter(r => r.type === 'Script');
Object.assign(results.primaVisita, { jsKB: kb(firstJs), jsFile: firstJs.length, cssKB: kb(inPhase('prima').filter(r => r.type === 'Stylesheet')), fontKB: kb(inPhase('prima').filter(r => r.type === 'Font')), lavoriLunghi: await longTasks() });
check(results.primaVisita.jsKB <= JS_BUDGET_KB, `prima visita: JavaScript ${results.primaVisita.jsKB} KB compressi (limite ${JS_BUDGET_KB} KB)`);

// 2. Accesso: quando compare il cruscotto con le bollette.
t0 = start('accesso');
await page.locator('input[type=email]').fill(mario.email);
await page.locator('input[type=password]').fill(mario.password);
await page.locator('.auth-card form button.btn-primary').click();
await page.locator('nav .nav-group-head').first().waitFor({ timeout: 120000 });
const shown = await page.waitForFunction(() => /GasNord|Lumen Casa|FibraVeloce/.test(document.querySelector('main')?.innerText || ''), null, { timeout: 120000 }).then(() => true, () => false);
results.accesso = { cruscotto: Date.now() - t0 };
await page.waitForLoadState('networkidle').catch(() => {});
await page.waitForTimeout(1500);
Object.assign(results.accesso, { richiesteDati: dataRequests('accesso'), datiKB: kb(inPhase('accesso').filter(r => r.type === 'Fetch')) });
check(shown, 'accesso: il cruscotto mostra le bollette');
check(!duplicates('accesso').length, `accesso: nessun dato chiesto due volte ${duplicates('accesso').join(', ')}`);

// 3. Seconda visita (cache e service worker), con la sessione già aperta.
t0 = start('seconda');
await page.reload({ waitUntil: 'commit' });
await page.locator('nav .nav-group-head').first().waitFor({ timeout: 120000 });
const shownAgain = await page.waitForFunction(() => /GasNord|Lumen Casa|FibraVeloce/.test(document.querySelector('main')?.innerText || ''), null, { timeout: 120000 }).then(() => true, () => false);
results.secondaVisita = { cruscotto: Date.now() - t0 };
await page.waitForLoadState('networkidle').catch(() => {});
await page.waitForTimeout(1500);
const secondJs = inPhase('seconda').filter(r => r.type === 'Script' && !r.cached);
Object.assign(results.secondaVisita, { richiesteDati: dataRequests('seconda'), datiKB: kb(inPhase('seconda').filter(r => r.type === 'Fetch')), jsKB: kb(secondJs), lavoriLunghi: await longTasks() });
check(shownAgain, 'seconda visita: il cruscotto mostra le bollette');
check(!duplicates('seconda').length, `seconda visita: nessun dato chiesto due volte ${duplicates('seconda').join(', ')}`);
check(results.secondaVisita.jsKB === 0, `seconda visita: JavaScript dalla cache (${results.secondaVisita.jsKB} KB dalla rete)`);
check(!errors.length, `nessun errore nella pagina ${errors.join(' | ')}`);

console.log(JSON.stringify(results, null, 1));
if (process.env.MISURA_JSON) writeFileSync(process.env.MISURA_JSON, JSON.stringify(results, null, 1));
await browser.close();
fake.close();
finish();

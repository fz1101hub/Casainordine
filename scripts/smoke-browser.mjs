// Prova nel browser dell'app compilata, senza database (modalità anteprima): la usa la CI.
// Uso: node scripts/smoke-browser.mjs [indirizzo]   (predefinito http://localhost:3000)
// Controlla che le pagine principali si aprano senza errori JavaScript, che le sezioni caricate a
// richiesta arrivino, che la lingua cambi e che la pagina condivisa segua la lingua del browser.
import { chromium } from 'playwright';

const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); console.log(`${ok ? 'ok ' : 'NO '} ${message}`); };

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ locale: 'it-IT', viewport: { width: 1280, height: 860 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) errors.push(message.text()); });

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  check(await page.locator('h1').count() > 0, 'la Home si apre');
  for (const name of ['Bollette', 'Consumi e previsioni', 'SOS Casa', 'Importa e collega', 'Impostazioni']) {
    const button = page.getByRole('button', { name, exact: true }).first();
    if (!(await button.count())) { check(false, `voce di menu «${name}»`); continue; }
    await button.click();
    await page.waitForTimeout(700);
    check((await page.locator('main').innerText()).trim().length > 20, `la sezione «${name}» mostra contenuto`);
  }

  await page.goto(`${BASE}/prova`, { waitUntil: 'networkidle' });
  check(await page.locator('header .testdrive-top').count() === 1, 'la pagina di prova si apre');
  const picker = page.locator('#demo-language');
  if (await picker.count()) {
    await picker.selectOption('en');
    await page.waitForTimeout(500);
    check(/Bills|Home|Dashboard/.test(await page.locator('nav.testdrive-navigation').innerText()), 'la prova passa all’inglese');
  } else check(false, 'scelta della lingua nella prova');

  await page.goto(`${BASE}/offline.html`, { waitUntil: 'load' });
  check(await page.locator('body').innerText().then(text => text.trim().length > 20), 'la pagina offline si apre');

  const german = await browser.newContext({ locale: 'de-DE', extraHTTPHeaders: { 'Accept-Language': 'de-DE,de;q=0.9' } });
  const shared = await german.newPage();
  await shared.goto(`${BASE}/vacanza/${'a'.repeat(64)}`, { waitUntil: 'load' });
  check(/Freigabe/.test(await shared.locator('main').innerText()), 'la pagina condivisa segue la lingua del browser');

  check(errors.length === 0, `nessun errore JavaScript${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
} finally {
  await browser.close();
}
if (failures.length) { console.error(`\n${failures.length} controlli non superati`); process.exit(1); }
console.log('\nProva nel browser superata.');

// Prova nel browser dell'app compilata, senza database (modalità anteprima): la usa la CI.
// Uso: node scripts/smoke-browser.mjs [indirizzo]   (predefinito http://localhost:3000)
// Controlla che le pagine principali si aprano senza errori JavaScript, che le sezioni caricate a
// richiesta arrivino, che la lingua cambi e che la pagina condivisa segua la lingua del browser.
import { chromium } from 'playwright';
import { textPdf } from './text-pdf.mjs';

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
  // Menu in gruppi: si aprono tutti prima di provare le voci.
  check(await page.locator('nav .nav-group-head').count() === 4, 'il menu ha 4 gruppi');
  const closed = page.locator('nav .nav-group-head[aria-expanded="false"]');
  for (let n = 0; n < 8 && await closed.count(); n++) await closed.first().click();
  check(await closed.count() === 0, 'i gruppi del menu si aprono');
  for (const name of ['Bollette', 'Consumi e previsioni', 'SOS Casa', 'Importa e collega', 'Impostazioni']) {
    const button = page.getByRole('button', { name, exact: true }).first();
    if (!(await button.count())) { check(false, `voce di menu «${name}»`); continue; }
    await button.click();
    await page.waitForTimeout(700);
    check((await page.locator('main').innerText()).trim().length > 20, `la sezione «${name}» mostra contenuto`);
  }

  // Acquisizione unica: un PDF di bolletta letto nel browser propone la bolletta, poi apre il modulo compilato.
  await page.getByRole('button', { name: 'Importa e collega', exact: true }).first().click();
  await page.locator('input[type=file][accept*="pdf"]').first().setInputFiles({ name: 'bolletta.pdf', mimeType: 'application/pdf',
    buffer: Buffer.from(textPdf(['Enel Energia', 'Bolletta luce', 'Totale da pagare 84,50 EUR', 'Scadenza 25/11/2026'])) });
  const capture = page.locator('.capture-modal');
  await capture.waitFor({ timeout: 30000 }).catch(() => {});
  check(await capture.count() === 1, 'un PDF caricato apre la scelta di cosa salvare');
  if (await capture.count()) {
    check(/Bolletta/.test(await capture.locator('.capture-option.selected').innerText()), 'per una bolletta propone la bolletta');
    await capture.locator('.btn-primary').click();
    check(await page.locator('.modal input[type=number]').first().inputValue().then(value => Number(value) === 84.5, () => false), 'il modulo della bolletta arriva con l’importo letto');
    await page.keyboard.press('Escape');
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

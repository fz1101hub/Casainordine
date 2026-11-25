// Prova nel browser delle sezioni della Fase 2 nell'app compilata in demo: in ognuna si crea,
// si modifica e si elimina qualcosa, come farebbe una persona. Lo usa la CI.
// Uso: node scripts/prove-sezioni.mjs [http://localhost:3000]
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:3000';
let failures = 0;
const check = (ok, label) => { console.log(`${ok ? 'ok ' : 'NO '} ${label}`); if (!ok) failures++; };

const browser = await chromium.launch();
const context = await browser.newContext({ locale: 'it-IT', viewport: { width: 1360, height: 900 } });
await context.addInitScript(() => { try { localStorage.setItem('casainordine-language-v32', 'it'); } catch {} });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) errors.push(message.text()); });

const main = () => page.locator('main');
const toast = async () => (await page.locator('.toast').last().innerText({ timeout: 4000 }).catch(() => '')).trim();
const settle = (ms = 400) => page.waitForTimeout(ms);
const button = (name, scope = main()) => scope.getByRole('button', { name, exact: true });
// Finestra di conferma dell'app (ConfirmDialog): si conferma col pulsante principale.
async function confirm() {
  const dialog = page.locator('dialog.app-dialog');
  await dialog.waitFor({ timeout: 4000 });
  await dialog.locator('button').last().click();
  await settle();
}
async function open(section) {
  const closed = page.locator('nav .nav-group-head[aria-expanded="false"]');
  for (let n = 0; n < 8 && await closed.count(); n++) await closed.first().click();
  await page.getByRole('button', { name: section, exact: true }).first().click();
  await settle(800);
}
const field = label => main().getByLabel(label, { exact: true });
const has = async text => (await main().innerText()).includes(text);

async function section(name, steps) {
  try { await open(name); await steps(); }
  catch (error) { check(false, `${name}: ${String(error.message).split('\n')[0]}`); }
  finally {
    // Una prova fallita non deve lasciare aperta una finestra che blocca le successive.
    const dialog = page.locator('dialog.app-dialog[open]');
    if (await dialog.count()) await dialog.locator('button').first().click().catch(() => {});
    await page.keyboard.press('Escape').catch(() => {});
  }
}

try {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });

  await section('Automazioni', async () => {
    await field('Nome').fill('Luce oltre 50 euro');
    await field('Soglia: da questo importo in su').fill('50');
    await button('Prova').click(); await settle();
    check((await main().innerText()).length > 200, 'Automazioni: la prova mostra il risultato');
    await button('Salva regola').click(); await settle();
    check(await has('Luce oltre 50 euro'), 'Automazioni: la regola salvata è nell’elenco');
    await button('Sospendi').first().click(); await settle();
    check(await has('Sospesa'), 'Automazioni: la regola si sospende');
    await button('Riattiva').first().click(); await settle();
    await button('Elimina').first().click(); await confirm();
    check(!(await has('Luce oltre 50 euro')), 'Automazioni: la regola si elimina');
  });

  await section('Professionisti', async () => {
    await field('Nome o ditta').fill('Idraulica Rossi');
    await field('Telefono').fill('+39 333 1234567');
    await field('Indirizzo email').fill('rossi@example.org');
    await button('Salva professionista').click(); await settle();
    check(await has('Idraulica Rossi'), 'Professionisti: il professionista salvato è nell’elenco');
    await main().getByRole('button', { name: /Modifica/ }).first().click(); await settle();
    await field('Nome o ditta').fill('Idraulica Rossi & figli');
    await button('Salva modifiche').click(); await settle();
    check(await has('Idraulica Rossi & figli'), 'Professionisti: la modifica si salva');
    await button('Elimina').first().click(); await confirm();
    check(!(await has('Idraulica Rossi')), 'Professionisti: il professionista si elimina');
  });

  await section('Scorte', async () => {
    await field('Prodotto').fill('Detersivo lavatrice');
    await field('Quanto ce n’è').fill('1');
    await field('Ricompra quando ne restano').fill('2');
    await field('Di solito ne compri').fill('3');
    await button('Salva scorta').click(); await settle();
    check(await has('Detersivo lavatrice'), 'Scorte: la scorta salvata è nell’elenco');
    await main().getByRole('button', { name: 'Uno in più: Detersivo lavatrice' }).click(); await settle();
    await main().getByRole('button', { name: 'Uno in più: Detersivo lavatrice' }).click(); await settle();
    const line = main().locator('.stock-item').filter({ hasText: 'Detersivo lavatrice' }).locator('small');
    check(/\b3\b/.test(await line.innerText()) && !/\b1\b/.test(await line.innerText()), 'Scorte: «+» porta la quantità da 1 a 3');
    await main().getByRole('button', { name: 'Uno in meno: Detersivo lavatrice' }).click(); await settle();
    await button('Elimina').first().click(); await confirm();
    check(!(await has('Detersivo lavatrice')), 'Scorte: la scorta si elimina');
  });

  // Giardino e orto (25 novembre 2026): nella demo le piante restano nella pagina.
  await section('Giardino e orto', async () => {
    await main().getByLabel('Tipo di pianta').selectOption('houseplants');
    check(await field('Nome').inputValue() === 'Piante verdi da appartamento (pothos, ficus, monstera)', 'Giardino: il tipo di pianta dà il nome');
    await field('Nome').fill('Monstera del salotto');
    check(await main().locator('.garden-proposal li').count() === 3, 'Giardino: tre interventi proposti');
    await button('Salva la pianta con 3 interventi').click(); await settle();
    check(await has('Monstera del salotto') && /Pianta salvata con 3 interventi/.test(await toast()), 'Giardino: pianta salvata con il piano');
    // La pulizia delle foglie (tutto l'anno, ogni 30 giorni) è da fare subito.
    const done = main().getByRole('button', { name: 'Segna come fatto: Pulizia delle foglie (Monstera del salotto)' }).first();
    check(await done.count() === 1, 'Giardino: «Da fare» propone la pulizia delle foglie');
    await done.click(); await settle();
    check(/Prossima volta/.test(await toast()), 'Giardino: fatto, con la prossima data');
    await main().getByRole('button', { name: 'Elimina la pianta: Monstera del salotto' }).click(); await confirm();
    check(!(await has('Monstera del salotto')), 'Giardino: la pianta si elimina');
  });

  await section('Programma stagionale', async () => {
    const before = await button('Segna come fatta').count();
    await button('Segna come fatta').first().click(); await settle();
    check(await button('Segna come fatta').count() === before - 1, 'Programma stagionale: una voce si segna come fatta');
    await button('Aggiungi alle attività').first().click(); await settle();
    check((await toast()).length > 0, 'Programma stagionale: una voce diventa un’attività');
    await main().getByLabel('Camino o stufa').check(); await settle(200);
    check(await button('Salva il profilo').isEnabled(), 'Programma stagionale: cambiando la casa il profilo si può salvare');
    await button('Salva il profilo').click(); await settle();
  });

  await section('Progetti e lavori', async () => {
    await button('Nuovo progetto').click(); await settle();
    await field('Titolo').fill('Bagno nuovo');
    await field('Budget previsto').fill('8000');
    await button('Crea progetto').click(); await settle();
    check(await has('Bagno nuovo'), 'Progetti: il progetto creato è nell’elenco');
    await main().getByLabel('Nuova fase', { exact: true }).fill('Demolizione');
    await button('Aggiungi fase').click(); await settle();
    check(await has('Demolizione'), 'Progetti: si aggiunge una fase');
    await main().getByLabel('Fornitore', { exact: true }).fill('Edilizia Bianchi');
    await main().getByLabel('Importo', { exact: true }).first().fill('5200');
    await button('Aggiungi preventivo').click(); await settle();
    check(await has('Edilizia Bianchi'), 'Progetti: si aggiunge un preventivo');
    await main().getByLabel('Descrizione', { exact: true }).fill('Piastrelle');
    await main().getByLabel('Importo', { exact: true }).last().fill('900');
    await button('Aggiungi spesa').click(); await settle();
    check(await has('Piastrelle'), 'Progetti: si aggiunge una spesa');
    await button('Elimina').first().click(); await confirm();
    check(!(await has('Bagno nuovo')), 'Progetti: il progetto si elimina');
  });

  await section('Fondo sostituzioni', async () => {
    await field('Costo stimato per sostituirlo').first().fill('1200');
    await field('Già da parte per questo').first().fill('300');
    const save = button('Salva').first();
    if (await save.count()) await save.click(); else await field('Già da parte per questo').first().blur();
    await settle();
    check(/Fondo aggiornato/.test(await toast()) || await has('al mese'), 'Fondo sostituzioni: costo e somma da parte si salvano');
  });

  await section('Affitti', async () => {
    await button('Nuovo contratto').click(); await settle();
    await field('Nome dell’immobile (lo vede l’inquilino)').fill('Monolocale di prova');
    await field('Email dell’inquilino').fill('inquilina@example.org');
    await field('Inizio').fill('2026-12-01');
    await field('Canone mensile').fill('650');
    await button('Crea e invita').click(); await settle();
    check(await has('Monolocale di prova'), 'Affitti: il contratto creato è nell’elenco');
    await main().getByRole('button', { name: /Monolocale di prova/ }).first().click(); await settle();
    await button('Elimina il contratto').click(); await confirm();
    check(!(await has('Monolocale di prova')), 'Affitti: il contratto si elimina');
    // Verbale d'ingresso sul contratto attivo della demo: una stanza e la firma del locatore.
    await main().getByRole('button', { name: /Bilocale di via dei Tigli/ }).first().click(); await settle();
    await button('Compila il verbale d’ingresso').click(); await settle();
    await button('Aggiungi stanza').click(); await settle(200);
    await main().getByLabel('Stanza', { exact: true }).last().fill('Cucina');
    await button('Salva verbale').click(); await settle();
    check(/Verbale salvato/.test(await toast()), 'Affitti: il verbale d’ingresso si salva');
    await button('Firma').click(); await confirm();
    check(/Firmato/.test(await main().innerText()), 'Affitti: il verbale d’ingresso si firma');
  });

  await section('Casa Control', async () => {
    await button('Attiva il pannello').click(); await settle();
    check(await button('Spegni il pannello').count() === 1, 'Casa Control: il pannello si attiva');
    check(await main().getByRole('button', { name: /^Apri / }).count() >= 3, 'Casa Control: gli indicatori portano alle sezioni');
    await button('Spegni il pannello').click(); await settle();
    check(await button('Attiva il pannello').count() === 1, 'Casa Control: il pannello si spegne');
  });

  // Estratto conto della banca nel caricamento CSV (24 novembre 2026), anche in Windows-1252.
  await section('Importa e collega', async () => {
    const { FILE } = await import('../tests/fixtures/estratti-conto.mjs');
    const before = await page.evaluate(() => (JSON.parse(localStorage.getItem('casainordine-demo-v1') || '{}').bills || []).length);
    await page.locator('input[type=file][accept*="csv"]').first().setInputFiles({ name: 'movimenti.csv', mimeType: 'text/csv', buffer: Buffer.from(FILE.bancoposta, 'latin1') });
    const dialog = page.locator('dialog.app-dialog');
    await dialog.waitFor({ timeout: 5000 });
    const message = await dialog.innerText();
    // Nella demo non ci sono bollette aperte uguali: i cinque pagamenti di bollette si aggiungono.
    check(/Estratto conto/.test(message) && /da aggiungere come già pagate: 5/.test(message) && /SMAT/.test(message) && /Enel/.test(message) && !/CONAD|PRELIEVO|STATION/i.test(message), 'Estratto conto: la conferma elenca i pagamenti delle bollette, non la spesa');
    await dialog.locator('button').last().click(); await settle(800);
    check(/Estratto conto importato/.test(await toast()), 'Estratto conto: importato');
    const bank = await page.evaluate(() => (JSON.parse(localStorage.getItem('casainordine-demo-v1') || '{}').bills || []).filter(b => String(b.external_id || '').startsWith('bank:')));
    check(bank.length === 5 && bank.every(b => b.paid_at), `Estratto conto: cinque bollette già pagate aggiunte (${bank.length})`);
    await page.locator('input[type=file][accept*="csv"]').first().setInputFiles({ name: 'movimenti.csv', mimeType: 'text/csv', buffer: Buffer.from(FILE.bancoposta, 'latin1') });
    await settle(1200);
    check(/già registrati/.test(await toast()) && !(await dialog.isVisible().catch(() => false)), 'Estratto conto: caricato di nuovo, avvisa che è già registrato');
    const again = await page.evaluate(() => (JSON.parse(localStorage.getItem('casainordine-demo-v1') || '{}').bills || []).length);
    check(again === before + 5, `Estratto conto: nessun doppione (${again - before})`);
  });

  check(errors.length === 0, `nessun errore JavaScript${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
} finally {
  await browser.close();
}
if (failures) { console.log(`\n${failures} prove non superate.`); process.exit(1); }
console.log('\nSezioni della Fase 2: tutte le prove superate.');

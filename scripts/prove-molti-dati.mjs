// Tanti dati sul telefono (scelta dell'utente, 24 novembre 2026): una persona con cinque anni di
// storico (3000 bollette, 1200 attività) su un telefono con il processore 4 volte più lento. Il
// Supabase finto risponde al massimo con 1000 righe, come il progetto vero.
// Controlla: le prossime scadenze ci sono (prima arrivavano solo le 1000 bollette più vecchie), il
// backup contiene tutte le bollette, l'elenco delle bollette si apre e si filtra in tempi brevi.
// Uso: app compilata per il Supabase finto (vedi scripts/prove-con-accesso.mjs), poi
//   node scripts/prove-molti-dati.mjs [http://localhost:3000]
import { readFileSync } from 'node:fs';
import { checker, startScenario, openPage, launch } from './accesso-comune.mjs';

const { check, finish } = checker('Tanti dati sul telefono');
const { fake, person } = await startScenario({ maxRows: 1000 });
const anna = person('anna', '11111111-1111-4111-8111-111111111111', 'anna@example.org');
const day = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const SUPPLIERS = [['Lumen Casa', 'Luce'], ['GasNord', 'Gas'], ['Acque del Fiume', 'Acqua'], ['FibraVeloce', 'Internet'], ['Condominio Aurora', 'Condominio']];
const bills = Array.from({ length: 3000 }, (_, i) => {
  const [supplier, category] = SUPPLIERS[i % SUPPLIERS.length];
  const due = day(-1800 + Math.floor(i * 1830 / 3000));          // da cinque anni fa a un mese da oggi
  return { id: `b0000000-0000-4000-8000-${String(i).padStart(12, '0')}`, user_id: anna.id, home_id: null, title: `${category} ${i + 1}`, supplier, category,
    amount: 30 + (i % 50), due_date: due, paid_at: due < day(0) ? `${due}T10:00:00Z` : null, source: 'manual', created_at: `${due}T08:00:00Z` };
});
// La prossima bolletta, riconoscibile: fra 20 giorni.
bills.push({ id: 'b0000000-0000-4000-8000-999999999999', user_id: anna.id, home_id: null, title: 'Prossima luce', supplier: 'Lumen Casa', category: 'Luce',
  amount: 91.4, due_date: day(20), paid_at: null, source: 'manual', created_at: new Date().toISOString() });
fake.seed('bills', bills);
fake.seed('house_tasks', Array.from({ length: 1200 }, (_, i) => ({ id: `t0000000-0000-4000-8000-${String(i).padStart(12, '0')}`, user_id: anna.id, home_id: null,
  title: `Attività ${i + 1}`, due_date: day(-1200 + i), done_at: i < 1190 ? new Date().toISOString() : null })));

const browser = await launch();
try {
  const ui = await openPage(browser, { viewport: { width: 412, height: 915 }, device: { isMobile: true, hasTouch: true, deviceScaleFactor: 2.625 } });
  const { page } = ui;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.addInitScript(() => { window.__long = 0; new PerformanceObserver(l => { for (const e of l.getEntries()) window.__long = Math.max(window.__long, e.duration); }).observe({ type: 'longtask', buffered: true }); });
  const longest = async () => { const v = await page.evaluate(() => { const v = window.__long || 0; window.__long = 0; return Math.round(v); }); return v; };

  let t0 = Date.now();
  check(await ui.login(anna), 'Anna entra');
  // Le prossime scadenze nel cruscotto: con una sola richiesta arrivavano solo le 1000 bollette più
  // vecchie, tutte pagate, e il cruscotto restava senza bollette da pagare.
  await page.waitForFunction(() => /[1-9]\d* aperte/.test(document.querySelector('main')?.innerText || ''), null, { timeout: 60000 }).catch(() => {});
  const home = Date.now() - t0, open = (await ui.main()).match(/(\d+) aperte/)?.[1];
  check(open === '50', `le bollette da pagare ci sono tutte nel cruscotto: ${open ?? 0} di 50 (${home} ms dall'accesso)`);
  console.log(`   lavoro più lungo all'accesso: ${await longest()} ms`);

  t0 = Date.now();
  await ui.go('Bollette');
  await page.locator('.bills-table tbody tr').first().waitFor({ timeout: 60000 });
  const listMs = Date.now() - t0, listLong = await longest();
  const rows = await page.locator('.bills-table tbody tr').count();
  const firstRow = await page.locator('.bills-table tbody tr').first().innerText().catch(() => '');
  console.log(`   elenco bollette: ${listMs} ms, ${rows} righe mostrate, lavoro più lungo ${listLong} ms`);
  check(rows <= 200, `l'elenco non disegna migliaia di righe insieme (${rows})`);
  check(!/ 1\b|Luce 1\b/.test(firstRow.split('\n')[0]) && /Prossima luce|GasNord|Lumen|Acque|Fibra|Condominio/.test(firstRow), `in cima le bollette di adesso, non quelle di cinque anni fa (${firstRow.split('\n')[0]})`);
  check(listLong < 1500, `aprire l'elenco non blocca il telefono (${listLong} ms)`);
  check(/Mostrate 100 di 3001/.test(await ui.main()), 'sotto l\'elenco: quante bollette sono mostrate');
  await page.getByRole('button', { name: 'Mostra altre 100' }).click();
  await page.waitForTimeout(800);
  check(await page.locator('.bills-table tbody tr').count() === 200, '«Mostra altre 100» aggiunge le successive');

  // Ricerca: ogni lettera deve rispondere subito.
  const box = page.locator('.searchbox input').first();
  await box.click();
  await longest();
  t0 = Date.now();
  await box.pressSequentially('fibra', { delay: 60 });
  await page.waitForTimeout(500);
  const typeLong = await longest();
  console.log(`   ricerca «fibra»: ${Date.now() - t0} ms, lavoro più lungo ${typeLong} ms`);
  check(typeLong < 400, `scrivere nella ricerca non blocca (${typeLong} ms per lettera al massimo)`);
  check(await page.locator('.bills-table tbody tr').count() > 0 && /FibraVeloce/.test(await page.locator('.bills-table tbody').innerText()), 'la ricerca trova le bollette di FibraVeloce');

  // Ricerca universale (24 novembre 2026): un errore di battitura propone comunque le bollette giuste.
  await page.locator('.search-button').first().click();
  const searchBox = page.locator('.search-dialog input[type=search]');
  await searchBox.fill('fibravelcoe');
  await page.waitForTimeout(2500);
  const found = await page.locator('.search-dialog').innerText().catch(() => '');
  check(/forse cercavi/.test(found) && /Internet|FibraVeloce/.test(found), 'ricerca con un errore di battitura: «forse cercavi» e le bollette di FibraVeloce');
  await page.keyboard.press('Escape');

  // Backup JSON: tutte le bollette.
  await ui.go('Notifiche e backup');
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }).catch(() => null), page.getByRole('button', { name: /^Backup JSON/ }).first().click()]);
  const backup = download ? JSON.parse(readFileSync(await download.path(), 'utf8')) : null;
  check(backup?.bills?.length === 3001, `il backup contiene tutte le 3001 bollette (${backup?.bills?.length ?? 'nessun file'})`);
  check(!ui.errors.length, `nessun errore nella pagina ${ui.errors.join(' | ')}`);
} finally { await browser.close(); fake.close(); }
finish();

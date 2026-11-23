// Tastiera e lettori di schermo con accesso (scelta dell'utente, 23 novembre 2026), contro il
// Supabase finto (vedi scripts/prove-con-accesso.mjs). Solo tastiera, niente mouse:
// - accesso con Tab, scrittura e Invio;
// - un collegamento «Vai al contenuto» come primo tasto Tab, che porta oltre il menu;
// - per ogni schermata percorsa con Tab: ogni elemento selezionato mostra un contorno (o un'ombra)
//   ben visibile, nessuna trappola (con Tab si torna all'inizio), niente selezione su elementi nascosti;
// - le finestre (nuova bolletta, conferma, ricerca) ricevono la selezione, la tengono dentro,
//   si chiudono con Esc e la restituiscono al pulsante che le ha aperte;
// - per i lettori di schermo: un solo titolo principale (h1) per schermata, menu con un nome,
//   avvisi annunciati (role="status").
// Uso: node scripts/prove-tastiera-accesso.mjs [indirizzo dell'app]
import { BASE, checker, startScenario, openPage, launch } from './accesso-comune.mjs';

const { check, finish } = checker('Prove con la tastiera');
const { fake, person } = await startScenario();
const anna = person('anna', '11111111-1111-4111-8111-111111111111', 'anna@example.org');
const HOME = '10000000-0000-4000-8000-0000000000ff';
fake.seed('homes', [{ id: HOME, name: 'Casa al mare', owner_id: anna.id, created_at: '2026-11-01T10:00:00Z' }]);
fake.seed('home_members', [{ home_id: HOME, user_id: anna.id, email: anna.email, role: 'owner', joined_at: '2026-11-01T10:00:00Z' }]);
fake.seed('bills', [{ id: '20000000-0000-4000-8000-0000000000f1', user_id: anna.id, home_id: null, title: 'Luce di casa', supplier: 'Enel', category: 'Luce', amount: 55, due_date: '2026-12-18', paid_at: null, created_at: '2026-11-04T10:00:00Z' },
  { id: '20000000-0000-4000-8000-0000000000f2', user_id: anna.id, home_id: HOME, title: 'Gas della casa al mare', supplier: 'Eni', category: 'Gas', amount: 80, due_date: '2026-12-20', paid_at: null, created_at: '2026-11-04T10:00:00Z' }]);

// Descrizione dell'elemento selezionato e se il suo contorno si vede: confronta lo stile con la
// selezione e senza (outline, ombra, bordo). Un cambio del solo sfondo non basta.
const focusInfo = page => page.evaluate(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return { none: true };
  const text = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.type || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).join('.') : '';
  const desc = `${el.tagName.toLowerCase()}${cls}${text ? ` «${text}»` : ''}`;
  // L'elemento e i due contenitori sopra (un campo senza bordo mostra il contorno sul suo riquadro, :focus-within).
  const boxes = [el, el.parentElement, el.parentElement?.parentElement].filter(Boolean);
  const look = () => boxes.map(b => { const s = getComputedStyle(b); return { outline: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 1 ? `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}` : '', shadow: s.boxShadow, border: `${s.borderTopColor} ${s.borderTopWidth}` }; });
  const on = look();
  const r = el.getBoundingClientRect();
  el.blur(); const off = look(); el.focus({ preventScroll: true });
  const changed = (a, b) => (a.outline && a.outline !== b.outline) || (a.shadow !== 'none' && a.shadow !== b.shadow) || (a.border !== b.border && parseFloat(a.border.split(' ').pop()) >= 2);
  const visibleRing = Boolean(on[0].outline) || on.some((look, i) => changed(look, off[i]));
  const inMenu = Boolean(el.closest('nav, .sidebar')), inDialog = Boolean(el.closest('dialog[open], .modal'));
  const hidden = r.width === 0 && r.height === 0;
  return { desc, visibleRing, inMenu, inDialog, hidden, id: el.dataset.k || (el.dataset.k = Math.random().toString(36).slice(2)) };
});

const browser = await launch();
try {
  const ui = await openPage(browser);
  const { page } = ui;
  const tab = async (shift = false) => { await page.keyboard.press(shift ? 'Shift+Tab' : 'Tab'); return focusInfo(page); };
  const noRing = [], hiddenFocus = [], traps = [];

  // Percorre una schermata con Tab fino a tornare al primo elemento (al massimo `max` passi).
  async function walk(where, max = 160) {
    await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
    const first = await tab();
    if (first.none) { traps.push(`${where}: nessun elemento selezionabile`); return 0; }
    let steps = 1, info = first;
    const seen = new Set([first.id]);
    do {
      if (!info.none && !info.visibleRing) noRing.push(`${where}: ${info.desc}`);
      if (!info.none && info.hidden) hiddenFocus.push(`${where}: ${info.desc}`);
      info = await tab(); steps++;
      if (info.id === first.id) return steps;
      seen.add(info.id);
    } while (steps < max);
    // Molte schermate hanno più di `max` elementi: basta non restare fermi sullo stesso.
    if (seen.size < 5) traps.push(`${where}: la selezione resta ferma (${[...seen].length} elementi)`);
    return steps;
  }

  // Accesso con la sola tastiera.
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await walk('accesso', 40);
  await page.evaluate(() => document.activeElement?.blur());
  for (let i = 0; i < 15; i++) { const info = await tab(); if (/input/.test(info.desc) && /email|nome@/i.test(info.desc)) break; }
  await page.keyboard.type(anna.email);
  await page.keyboard.press('Tab');
  await page.keyboard.type(anna.password);
  await page.keyboard.press('Enter');
  check(await page.locator('nav .nav-group-head').first().waitFor({ timeout: 20000 }).then(() => true, () => false), 'Anna entra con Tab, scrittura e Invio');

  // «Vai al contenuto»: primo tasto Tab, porta la selezione oltre il menu.
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
  const skip = await tab();
  check(/Vai al contenuto/.test(skip.desc), `il primo tasto Tab porta a «Vai al contenuto» (${skip.desc})`);
  await page.keyboard.press('Enter');
  const afterSkip = await tab();
  check(!afterSkip.inMenu && !/burger|Apri menu/.test(afterSkip.desc), `dopo «Vai al contenuto» il Tab seguente è nel contenuto, non nel menu (${afterSkip.desc})`);

  // Lettori di schermo: menu con un nome, avvisi annunciati.
  check(await page.locator('nav[aria-label]').count() >= 1, 'il menu principale ha un nome per i lettori di schermo');

  // Schermate percorse con Tab, scelte dal menu con la tastiera.
  const h1Problems = [];
  async function openSection(name) {
    await ui.openMenu();
    const button = page.locator('nav').getByRole('button', { name, exact: true }).first();
    await button.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1200);
    const h1 = await page.locator('main h1:visible').count();
    if (h1 !== 1) h1Problems.push(`${name}: ${h1} titoli principali`);
  }
  for (const name of ['La mia Home', 'Bollette', 'Le mie utenze', 'Attività casa', 'Notifiche e backup', 'Importa e collega', 'Impostazioni']) {
    await openSection(name);
    await walk(name);
  }
  // Nella casa condivisa: famiglia e inviti (ruoli, inviti, eliminazione).
  await openSection('Famiglia e inviti');
  await page.getByRole('button', { name: /Casa al mare/ }).first().focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1200);
  await walk('Famiglia e inviti (casa)');
  check(h1Problems.length === 0, `un solo titolo principale (h1) in ogni schermata${h1Problems.length ? ': ' + h1Problems.join(' | ') : ''}`);

  // Finestra della nuova bolletta: si apre con Invio, tiene la selezione, Esc la chiude e la restituisce.
  await openSection('Bollette');
  const opener = page.getByRole('button', { name: /^(Aggiungi bolletta|Nuova bolletta)$/ }).first();
  await opener.focus();
  await page.keyboard.press('Enter');
  await page.locator('.modal').first().waitFor({ timeout: 5000 });
  await page.waitForTimeout(300);
  let inside = (await focusInfo(page)).inDialog;
  check(inside, 'aperta la nuova bolletta, la selezione è dentro la finestra');
  let escaped = [];
  for (let i = 0; i < 40; i++) { const info = await tab(i % 3 === 2); if (!info.none && !info.inDialog) escaped.push(info.desc); if (!info.none && !info.visibleRing) noRing.push(`nuova bolletta: ${info.desc}`); }
  check(escaped.length === 0, `con Tab e Maiusc+Tab la selezione resta nella finestra${escaped.length ? ': ' + [...new Set(escaped)].slice(0, 3).join(' | ') : ''}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check(!(await page.locator('.modal').count()), 'Esc chiude la finestra');
  check(await opener.evaluate(el => el === document.activeElement), 'e la selezione torna al pulsante che l\'ha aperta');

  // Finestra di conferma (eliminazione di una bolletta): Esc annulla e restituisce la selezione.
  const del = page.locator('main').getByRole('button', { name: /Elimina/ }).first();
  await del.focus();
  await page.keyboard.press('Enter');
  const dialog = page.locator('dialog.app-dialog[open]');
  check(await dialog.waitFor({ timeout: 5000 }).then(() => true, () => false), 'Invio sul cestino apre la conferma');
  inside = (await focusInfo(page)).inDialog;
  check(inside, 'la selezione è dentro la conferma');
  escaped = [];
  // Dopo l'ultimo pulsante una finestra nativa passa la selezione al browser (none): va bene, la pagina dietro no.
  for (let i = 0; i < 8; i++) { const info = await tab(); if (!info.none && !info.inDialog) escaped.push(info.desc); }
  check(escaped.length === 0, `la selezione resta nella conferma${escaped.length ? ': ' + escaped.slice(0, 3).join(' | ') : ''}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check(!(await dialog.count()) && fake.rows('bills').length === 2, 'Esc annulla: la bolletta resta');
  check(await del.evaluate(el => el === document.activeElement), 'e la selezione torna al cestino');

  // Ricerca: si apre dalla barra in alto, scrive subito nel campo, Esc la chiude.
  const searchButton = page.locator('header').getByRole('button', { name: /Cerca/ }).first();
  if (await searchButton.count()) {
    await searchButton.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    const field = await focusInfo(page);
    check(/input/.test(field.desc) && field.visibleRing, `aperta la ricerca, si scrive subito nel campo, con il contorno visibile (${field.desc})`);
    await page.keyboard.type('Gas');
    await page.waitForTimeout(800);
    let result = await tab();
    for (let i = 0; i < 4 && !/search-result/.test(result.desc); i++) result = await tab();
    check(/search-result/.test(result.desc) && result.visibleRing, `i risultati della ricerca si raggiungono con Tab e mostrano la selezione (${result.desc})`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    check(await searchButton.evaluate(el => el === document.activeElement), 'Esc chiude la ricerca e la selezione torna al pulsante');
  }

  // Un avviso dopo un'azione si annuncia: segna la bolletta come pagata dalla tastiera.
  const pay = page.locator('main').getByRole('button', { name: 'Segna pagata' }).first();
  await pay.focus();
  await page.keyboard.press('Enter');
  if (await page.locator('dialog.app-dialog[open]').count()) await page.keyboard.press('Enter');
  const toast = page.locator('.toast').last();
  check(await toast.waitFor({ timeout: 5000 }).then(() => true, () => false) && await toast.getAttribute('role') === 'status', 'l\'avviso dopo un\'azione fatta con la tastiera si annuncia (role="status")');
  check(Boolean(fake.rows('bills').find(b => b.home_id === HOME)?.paid_at), 'e la bolletta risulta pagata');

  check(noRing.length === 0, `ogni elemento selezionato mostra un contorno visibile${noRing.length ? ` — ${noRing.length}: ${[...new Set(noRing)].slice(0, 8).join(' | ')}` : ''}`);
  check(hiddenFocus.length === 0, `nessuna selezione su elementi nascosti${hiddenFocus.length ? ': ' + [...new Set(hiddenFocus)].slice(0, 6).join(' | ') : ''}`);
  check(traps.length === 0, `nessuna trappola per la tastiera${traps.length ? ': ' + traps.join(' | ') : ''}`);
  check(ui.errors.length === 0, `nessun errore JavaScript${ui.errors.length ? ': ' + ui.errors.slice(0, 3).join(' | ') : ''}`);
} finally {
  await browser.close();
  await fake.close();
}
finish();

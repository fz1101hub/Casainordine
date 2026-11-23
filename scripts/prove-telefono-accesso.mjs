// Telefono con accesso (scelta dell'utente, 23 novembre 2026), contro il Supabase finto (vedi
// scripts/prove-con-accesso.mjs): schermo da 360 px, tocco. Per l'accesso e per ogni voce del menu,
// nello spazio personale e nella casa condivisa, controlla che la pagina non scorra di lato, che
// pulsanti, campi e caselle misurino almeno 24 × 24 px (WCAG 2.5.8), che il testo sia di almeno
// 12 px e quello dei campi di almeno 16 px (sotto i 16 px l'iPhone ingrandisce la pagina), che il
// menu si apra e si chiuda e che le finestre stiano nello schermo.
// Uso: node scripts/prove-telefono-accesso.mjs [indirizzo dell'app]
import { BASE, checker, startScenario, openPage, launch } from './accesso-comune.mjs';

const { check, finish } = checker('Prove sul telefono con accesso');
const { fake, person } = await startScenario();
const anna = person('anna', '11111111-1111-4111-8111-111111111111', 'anna@example.org');
const luca = person('luca', '22222222-2222-4222-8222-222222222222', 'luca@example.org');
const HOME = '10000000-0000-4000-8000-0000000000dd';
fake.seed('homes', [{ id: HOME, name: 'Casa al mare', owner_id: anna.id, created_at: '2026-11-01T10:00:00Z' }]);
fake.seed('home_members', [{ home_id: HOME, user_id: anna.id, email: anna.email, role: 'owner', joined_at: '2026-11-01T10:00:00Z' },
  { home_id: HOME, user_id: luca.id, email: luca.email, role: 'editor', joined_at: '2026-11-02T10:00:00Z' }]);
fake.seed('bills', [
  // Nomi lunghi apposta: non devono allargare la pagina.
  { id: '20000000-0000-4000-8000-0000000000d1', user_id: anna.id, home_id: null, title: 'Bolletta della luce con un nome molto lungo per provare lo schermo stretto', supplier: 'Fornitore di energia elettrica con un nome lunghissimo', category: 'Luce', amount: 1234.56, due_date: '2026-12-18', paid_at: null, created_at: '2026-11-04T10:00:00Z' },
  { id: '20000000-0000-4000-8000-0000000000d2', user_id: anna.id, home_id: HOME, title: 'Gas della casa al mare', supplier: 'Eni', category: 'Gas', amount: 80, due_date: '2026-12-02', paid_at: null, created_at: '2026-11-04T10:00:00Z' },
]);
fake.seed('house_tasks', [{ id: 'task-tel', user_id: anna.id, home_id: HOME, title: 'Controllare la caldaia prima dell\'inverno', due_date: '2026-12-01', done: false, created_at: '2026-11-04T10:00:00Z' }]);

const W = 360;
// Problemi della schermata: elementi oltre il bordo destro (fuori da un contenitore che scorre),
// comandi sotto i 24 px, testo sotto i 12 px, campi sotto i 16 px.
const measure = page => page.evaluate(() => {
  const W = innerWidth;
  const out = { scroll: document.documentElement.scrollWidth, wide: [], small: [], tiny: [], fields: [], narrow: [] };
  const desc = el => {
    const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).join('.') : '';
    const text = (el.textContent || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.type || '').replace(/\s+/g, ' ').trim().slice(0, 30);
    return `${el.tagName.toLowerCase()}${cls}${text ? ` «${text}»` : ''}`;
  };
  const hiddenMenu = el => el.closest('.sidebar:not(.sidebar-show)');
  const visible = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0 && !hiddenMenu(el); };
  const scrolls = el => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) if (['auto', 'scroll', 'hidden', 'clip'].includes(getComputedStyle(p).overflowX)) return true; return false; };
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el)) continue;
    if (el.getBoundingClientRect().right > W + 1 && !scrolls(el)) out.wide.push(desc(el));
  }
  for (const el of document.querySelectorAll('button, select, textarea, input:not([type=hidden]), [role=button], a.btn, summary')) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 24 || r.height < 24) out.small.push(`${desc(el)} ${Math.round(r.width)}×${Math.round(r.height)}`);
    if (el.matches('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]), select, textarea') && parseFloat(getComputedStyle(el).fontSize) < 16) out.fields.push(desc(el));
  }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!el || !n.textContent.trim() || ['SCRIPT', 'STYLE', 'OPTION'].includes(el.tagName) || !visible(el)) continue;
    // 0 px: testo lasciato solo ai lettori di schermo (pulsanti con la sola icona sul telefono).
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (size > 0 && size < 12) out.tiny.push(`${desc(el)} ${size}px`);
    // Testo lungo che va a capo in una colonna sottile (un elemento accanto gli ha tolto lo spazio);
    // i titoli su una riga sola, tagliati con i puntini, vanno bene.
    const width = el.getBoundingClientRect().width;
    if (n.textContent.trim().length > 60 && width < 110 && getComputedStyle(el).whiteSpace !== 'nowrap') out.narrow.push(`${desc(el)} ${Math.round(width)}px`);
  }
  for (const key of ['wide', 'small', 'tiny', 'fields', 'narrow']) out[key] = [...new Set(out[key])];
  return out;
});

const problems = { wide: [], small: [], tiny: [], fields: [], narrow: [] };
async function inspect(page, where) {
  const m = await measure(page);
  if (m.scroll > W + 1) problems.wide.push(`${where}: la pagina è larga ${m.scroll} px`);
  for (const key of ['wide', 'small', 'tiny', 'fields', 'narrow']) for (const item of m[key]) problems[key].push(`${where}: ${item}`);
}
const report = (key, message) => check(problems[key].length === 0, `${message}${problems[key].length ? ` — ${problems[key].length}: ${problems[key].slice(0, 6).join(' | ')}` : ''}`);

const browser = await launch();
try {
  const ui = await openPage(browser, { viewport: { width: W, height: 740 }, device: { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } });
  const { page } = ui;
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await inspect(page, 'accesso');
  let violations = await ui.axe();
  check(violations.length === 0, `nessuna violazione WCAG nella schermata di accesso ${violations.join(' ')}`);
  check(await ui.login(anna), 'Anna entra dal telefono');

  // Menu: nascosto, si apre con il pulsante, si chiude dopo la scelta.
  const burger = page.locator('.burger');
  check(await burger.isVisible() && !(await page.locator('.sidebar.sidebar-show').count()), 'sul telefono il menu è chiuso e c\'è il pulsante per aprirlo');
  await burger.click();
  check(await page.locator('.sidebar.sidebar-show').count() === 1, 'il pulsante apre il menu');
  await inspect(page, 'menu aperto');
  await ui.go('Bollette');
  check(!(await page.locator('.sidebar.sidebar-show').count()), 'scelta una voce, il menu si chiude');

  // Ogni voce del menu, nello spazio personale e nella casa.
  let visited = 0;
  for (const space of ['spazio personale', 'casa']) {
    if (space === 'casa') {
      await ui.go('Famiglia e inviti');
      await page.getByRole('button', { name: /Casa al mare/ }).first().click();
      await page.waitForTimeout(1200);
    }
    await ui.openMenu();
    const nav = page.locator('nav button:not(.nav-group-head)');
    const count = await nav.count();
    for (let i = 0; i < count; i++) {
      await ui.openMenu();
      const name = (await nav.nth(i).innerText().catch(() => `voce ${i}`)).replace(/\s+/g, ' ').trim();
      try { await nav.nth(i).click({ timeout: 2000 }); } catch { continue; }
      await page.waitForTimeout(450);
      await inspect(page, `${space} · ${name}`);
      visited++;
    }
  }
  check(visited >= 60, `visitate ${visited} schermate (tutte le voci del menu, in due spazi)`);

  // Una finestra dell'app: il modulo della nuova bolletta deve stare nello schermo.
  await ui.go('Bollette');
  await page.getByRole('button', { name: /^(Aggiungi bolletta|Nuova bolletta)$/ }).first().click();
  const modal = page.locator('.modal').first();
  await modal.waitFor({ timeout: 5000 });
  const box = await modal.boundingBox();
  check(box && box.x >= 0 && box.x + box.width <= W + 1, `il modulo della nuova bolletta sta nello schermo (${box ? Math.round(box.x) + '–' + Math.round(box.x + box.width) : '?'} px)`);
  await inspect(page, 'nuova bolletta');
  violations = await ui.axe();
  check(violations.length === 0, `nessuna violazione WCAG nel modulo della nuova bolletta ${violations.join(' ')}`);
  await page.keyboard.press('Escape');

  report('wide', 'nessuna pagina scorre di lato e niente esce dallo schermo');
  report('small', 'pulsanti, campi e caselle di almeno 24 × 24 px');
  report('tiny', 'testo di almeno 12 px');
  report('narrow', 'nessun testo lungo schiacciato in una colonna sotto i 110 px');
  report('fields', 'testo dei campi di almeno 16 px (niente ingrandimento automatico sull\'iPhone)');
  check(await ui.logout(), 'Anna esce dal menu del telefono');
  check(ui.errors.length === 0, `nessun errore JavaScript${ui.errors.length ? ': ' + ui.errors.slice(0, 3).join(' | ') : ''}`);
} finally {
  await browser.close();
  await fake.close();
}
finish();

// Parti comuni delle prove nel browser con accesso (scripts/prove-*.mjs): Supabase finto con le
// regole semplificate, utenti, accesso, menu, avvisi e controlli. Vedi scripts/prove-con-accesso.mjs.
import { chromium } from 'playwright';
import { startFakeSupabase } from '../tests/helpers/fake-supabase.mjs';

export const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
export const PORT = Number(process.env.FAKE_SUPABASE_PORT || 54321);

export function checker(title) {
  const failures = [];
  const check = (ok, message) => { if (!ok) failures.push(message); console.log(`${ok ? 'ok ' : 'NO '} ${message}`); return ok; };
  const finish = () => {
    if (failures.length) { console.error(`\n${title}: ${failures.length} non superate.`); process.exit(1); }
    console.log(`\n${title}: tutte superate.`);
  };
  return { check, finish, failures };
}

export async function startScenario() {
  const fake = await startFakeSupabase({ port: PORT, lenientRpc: true, rls: true });
  fake.state.rpc.v36_my_storage_used = () => 0;
  const people = {};
  const person = (key, id, email) => {
    const password = `password-di-${key}-lunga`;
    fake.addUser(id, email, { password });
    fake.seed('profiles', [{ id, email, reminders_enabled: true, reminder_emails: true }]);
    return (people[key] = { id, email, password });
  };
  return { fake, person, people };
}

// Una pagina del browser con le funzioni che servono a ogni prova.
// device: altre opzioni del browser (per esempio isMobile e hasTouch per il telefono).
export async function openPage(browser, { locale = 'it-IT', language = 'it', viewport = { width: 1360, height: 900 }, device = {} } = {}) {
  const context = await browser.newContext({ locale, viewport, acceptDownloads: true, ...device });
  // null: contesto pulito, senza sovrascrivere la preferenza a ogni navigazione.
  if (language !== null) await context.addInitScript(lang => { try { localStorage.setItem('casainordine-language-v32', lang); } catch {} }, language);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|status of 40[0-9]/.test(m.text())) errors.push(m.text()); });
  const api = {
    page, context, errors,
    async login({ email, password }) {
      if (!(await page.locator('input[type=email]').count())) await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
      await page.locator('input[type=email]').fill(email);
      await page.locator('input[type=password]').fill(password);
      await page.locator('.auth-card form button.btn-primary').click();
      return page.locator('nav .nav-group-head').first().waitFor({ timeout: 20000 }).then(() => true, () => false);
    },
    async logout(label = 'Esci') {
      await api.openMenu();
      await page.getByRole('button', { name: label, exact: true }).first().click();
      return page.locator('input[type=password]').waitFor({ timeout: 10000 }).then(() => true, () => false);
    },
    async openMenu() {
      const burger = page.locator('.burger');
      if (await burger.isVisible().catch(() => false) && !(await page.locator('.sidebar.sidebar-show').count())) await burger.click();
      const closed = page.locator('nav .nav-group-head[aria-expanded="false"]');
      for (let n = 0; n < 8 && await closed.count(); n++) await closed.first().click();
    },
    async go(name) {
      await api.openMenu();
      await page.getByRole('button', { name, exact: true }).first().click();
      await page.waitForTimeout(1200);
    },
    toast: async () => (await page.locator('.toast').last().innerText().catch(() => '')).replace(/\s+/g, ' '),
    main: async () => (await page.locator('main').innerText().catch(() => '')).replace(/\s+/g, ' '),
    // Conferma la finestra dell'app (l'ultimo pulsante è quello che conferma); text: testo da scrivere.
    async confirm(text) {
      const dialog = page.locator('dialog.app-dialog');
      await dialog.waitFor({ timeout: 5000 });
      if (text !== undefined) await dialog.locator('input').fill(text);
      await dialog.locator('button').last().click();
      await page.waitForTimeout(800);
    },
    async axe() {
      if (!(await page.evaluate(() => Boolean(window.axe)))) await page.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' });
      return page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })).violations.map(v => `${v.id}:${v.nodes.length}`));
    },
  };
  return api;
}

export const launch = () => chromium.launch();

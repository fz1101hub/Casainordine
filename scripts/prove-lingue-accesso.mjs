// Lingue con accesso (scelta dell'utente, 23 novembre 2026): scripts/check-languages.mjs prova solo
// la demo; qui la stessa ricerca di testi non tradotti gira sulle schermate con accesso, contro il
// Supabase finto (vedi scripts/prove-con-accesso.mjs): spazio personale e casa condivisa, tutte le
// voci del menu con il loro modulo, famiglia e inviti, anteprima del ripristino, stato della
// configurazione. Segnala i testi uguali all'italiano nelle altre cinque lingue e le chiavi mostrate al posto del testo.
// Uso: node scripts/prove-lingue-accesso.mjs [indirizzo dell'app]
import { BASE, startScenario, openPage, launch } from './accesso-comune.mjs';
import { TRANSLATIONS } from '../lib/i18n.mjs';

const HOME = '10000000-0000-4000-8000-0000000000bb';
// Dati inventati (uguali in tutte le lingue) e testi uguali per natura.
const DATA = new Set(['Casa al mare', 'Luce della casa al mare', 'Telefono personale', 'Gas di prova', 'Revisione caldaia', 'Pane']);
const SAME = [/Casa ?in ?Ordine/i, /^(Italiano|English|Español|Français|Deutsch|Português)$/, /^[A-Z0-9 .,:;/·•@+()€%_-]+$/,
  /\b(pagoPA|IBAN|Gmail|Outlook|Microsoft 365|Resend|Vercel|VAPID|OAuth|Supabase|JSON|ZIP)\b/, /^[^\s]+@[^\s]+$/, /^https?:\/\//, /^\d/, /^[A-Z_]{4,}$/];
const KEY = /^[a-z][a-z0-9]*(?:\.[a-zA-Z0-9_-]+)+$/;

async function crawl(browser, lang) {
  const { fake, person } = await startScenario();
  const anna = person('anna', '11111111-1111-4111-8111-111111111111', 'anna@example.org');
  const luca = person('luca', '22222222-2222-4222-8222-222222222222', 'luca@example.org');
  fake.seed('homes', [{ id: HOME, name: 'Casa al mare', owner_id: anna.id, created_at: '2026-11-01T10:00:00Z' }]);
  fake.seed('home_members', [{ home_id: HOME, user_id: anna.id, email: anna.email, role: 'owner', joined_at: '2026-11-01T10:00:00Z' },
    { home_id: HOME, user_id: luca.id, email: luca.email, role: 'editor', joined_at: '2026-11-02T10:00:00Z' }]);
  fake.seed('home_invites', [{ id: 'inv-1', home_id: HOME, email: 'carla@example.org', role: 'viewer', token_hash: 'x', created_by: anna.id, claimed_at: null, created_at: '2026-11-20T10:00:00Z', expires_at: '2099-01-01T00:00:00Z' }]);
  fake.seed('bills', [
    { id: '20000000-0000-4000-8000-0000000000b1', user_id: anna.id, home_id: HOME, title: 'Luce della casa al mare', supplier: 'Enel', category: 'Luce', amount: 55, due_date: '2026-12-18', paid_at: null, created_at: '2026-11-04T10:00:00Z' },
    { id: '20000000-0000-4000-8000-0000000000b2', user_id: anna.id, home_id: null, title: 'Telefono personale', supplier: 'Tim', category: 'Internet', amount: 29, due_date: '2026-12-19', paid_at: '2026-11-19T10:00:00Z', created_at: '2026-11-04T10:00:00Z' },
  ]);
  const ui = await openPage(browser, { locale: lang, language: lang });
  const { page } = ui;
  const seen = new Map();
  const note = async step => {
    const texts = await page.evaluate(() => {
      const out = new Set();
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const el = node.parentElement;
        if (!el || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'OPTION'].includes(el.tagName) || el.closest('[hidden],pre,code')) continue;
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        const text = node.textContent.replace(/\s+/g, ' ').trim();
        if (text) out.add(text);
      }
      for (const el of document.querySelectorAll('[title],[aria-label],[placeholder]'))
        for (const attr of ['title', 'aria-label', 'placeholder']) { const v = el.getAttribute(attr)?.trim(); if (v) out.add(v); }
      return [...out];
    });
    for (const text of texts) if (!seen.has(text)) seen.set(text, step);
  };
  const settle = () => page.waitForTimeout(450);
  try {
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await note('accesso');
    if (!(await ui.login(anna))) throw new Error(`accesso non riuscito (${lang})`);
    for (const space of ['personale', 'casa']) {
      if (space === 'casa') {
        await ui.openMenu();
        // Famiglia e inviti: il pulsante della casa è il secondo tra gli spazi.
        const navButtons = page.locator('nav button:not(.nav-group-head)');
        for (let i = 0; i < await navButtons.count(); i++) {
          await navButtons.nth(i).click({ timeout: 2000 }).catch(() => {});
          await settle();
          if (await page.locator('.hub-home-choices').count()) break;
        }
        await page.locator('.hub-home-choices button').nth(1).click();
        await page.waitForTimeout(1200);
      }
      await ui.openMenu();
      const nav = page.locator('nav button:not(.nav-group-head)');
      const count = await nav.count();
      for (let i = 0; i < count; i++) {
        await ui.openMenu();
        try { await nav.nth(i).click({ timeout: 2000 }); await settle(); } catch { continue; }
        await note(`${space} menu ${i}`);
        // Famiglia e inviti: anche la parte che si apre per eliminare la casa.
        if (await page.locator('.hub-danger summary').count()) { await page.locator('.hub-danger summary').click().catch(() => {}); await note(`${space} menu ${i} eliminazione`); }
        // Notifiche e backup: anteprima del ripristino da un backup.
        if (await page.locator('.restore-box input[type=file]').count() && space === 'personale') {
          const backup = { format: 'casa-in-ordine-backup', version: 2, exported_at: '2026-11-20T10:00:00Z', scope: { home_id: null },
            bills: [{ id: 'b9', title: 'Gas di prova', amount: 10, due_date: '2026-12-01' }], documents: [{ id: 'd9', name: 'x.pdf' }],
            household: { house_tasks: [{ id: 't9', title: 'Revisione caldaia' }], home_shopping: [{ id: 's9', title: 'Pane' }], home_decision_votes: [{ decision_id: 'x', user_id: 'y' }] } };
          await page.locator('.restore-box input[type=file]').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
          await page.locator('.restore-preview').waitFor({ timeout: 8000 }).catch(() => {});
          await note(`${space} menu ${i} ripristino`);
          await page.locator('.restore-preview button').last().click().catch(() => {});
        }
        // Impostazioni: stato della configurazione.
        if (await page.locator('.config-status button').count()) {
          await page.locator('.config-status button').first().click();
          await page.locator('.config-list').waitFor({ timeout: 8000 }).catch(() => {});
          await note(`${space} menu ${i} configurazione`);
        }
        const primary = page.locator('main .page-heading .btn-primary').first();
        if (await primary.count()) {
          try { await primary.click({ timeout: 1500 }); await settle(); await note(`${space} menu ${i} modulo`); } catch {}
          await page.keyboard.press('Escape').catch(() => {});
          await settle();
        }
      }
    }
    return { seen, errors: ui.errors };
  } finally {
    await ui.context.close();
    await fake.close();
  }
}

const LANGUAGES = ['it', 'en', 'es', 'fr', 'de', 'pt'];
const browser = await launch();
const runs = new Map();
let failed = false;
try {
  for (const lang of LANGUAGES) {
    try { runs.set(lang, await crawl(browser, lang)); }
    catch (error) { failed = true; console.error(`Scenario fallito (${lang}): ${error.message}`); }
  }
} finally { await browser.close(); }

const REACHED = ['config.title', 'config.item.database', 'extra.restore.title', 'extra.restore.reason.otherPeople', 'family.generateInvite', 'family.deleteAction', 'family.owner', 'family.revoke', 'settings.signout'];
const italian = runs.get('it');
const legitimate = { pt: new Set(['SOS Casa', 'Data prevista']) };
for (const [lang, run] of runs) {
  const missing = REACHED.filter(key => {
    const expected = TRANSLATIONS[lang][key]?.replace(/\{[^}]+\}.*$/, '').trim();
    return !expected || ![...run.seen.keys()].some(text => text.includes(expected));
  });
  if (missing.length) { failed = true; console.error(`Schermate non raggiunte (${lang}): ${missing.join(', ')}`); }
  const rawKeys = [...run.seen].filter(([text]) => KEY.test(text) && !/\.(?:com|org|it|pdf|csv|json|html|zip)$/.test(text));
  const untranslated = lang === 'it' || !italian ? [] : [...run.seen].filter(([text]) => italian.seen.has(text) && !DATA.has(text)
    && !legitimate[lang]?.has(text)
    && text.split(' ').filter(word => /[a-zà-ÿ]{3}/i.test(word)).length >= 2
    && !SAME.some(pattern => pattern.test(text)) && ![...DATA].some(d => text.includes(d)));
  console.log(`Testi con accesso (${lang}): ${run.seen.size}; chiavi: ${rawKeys.length}; possibili residui: ${untranslated.length}.`);
  for (const [t, s] of [...rawKeys, ...untranslated]) console.error(`  [${lang}: ${s}] ${t.slice(0, 160)}`);
  if (rawKeys.length || untranslated.length || run.errors.length) failed = true;
  if (run.errors.length) console.error(`Errori JavaScript (${lang}): ${run.errors.slice(0, 3).join(' | ')}`);
}
if (failed || runs.size !== LANGUAGES.length) process.exit(1);
console.log('Lingue con accesso: controllo euristico superato in tutte le sei lingue (Supabase simulato).');

// Come si vedono le email (scelta dell'utente «Email dei promemoria più complete», 23 novembre
// 2026): promemoria e riepilogo in italiano e in inglese, con un titolo lungo e caratteri speciali,
// aperti in Chromium a 360 px (telefono) e 600 px (computer), più la pagina per smettere di
// riceverle. Controlla: nessuna violazione WCAG 2.1 A/AA (contrasto compreso), niente scorrimento
// di lato, testo di almeno 13 px, pulsante e collegamento per disiscriversi presenti e cliccabili.
// Non serve l'app avviata. Con una cartella come argomento salva anche le immagini.
// Uso: node scripts/prove-email.mjs [cartella per le immagini]
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { reminderEmail, summaryEmail } from '../lib/reminder-email.mjs';

process.env.SUPABASE_SECRET_KEY ||= 'chiave-di-prova';
const out = process.argv[2];
if (out) mkdirSync(out, { recursive: true });
const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); console.log(`${ok ? 'ok ' : 'NO '} ${message}`); };

const USER = '11111111-1111-4111-8111-111111111111', APP = 'https://casainordine.vercel.app';
const bills = [
  { title: 'Luce di casa con un nome molto lungo per vedere come va a capo nello schermo stretto', supplier: 'Fornitore di energia elettrica', amount: 1234.56, due_date: '2026-12-03' },
  { title: 'Gas <b>& acqua</b>', supplier: 'Eni', amount: 80, due_date: '2026-12-18' },
];
const emails = [];
for (const language of ['it', 'en']) {
  emails.push({ name: `promemoria-${language}`, ...reminderEmail({ language, bill: { title: bills[0].title, due_date: bills[0].due_date }, appUrl: APP, userId: USER }) });
  emails.push({ name: `riepilogo-${language}`, ...summaryEmail({ language, bills, today: '2026-12-01', appUrl: APP, userId: USER }) });
}

const axeSource = readFileSync(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const browser = await chromium.launch();
try {
  for (const width of [360, 600]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    for (const email of emails) {
      const where = `${email.name} a ${width} px`;
      await page.setContent(email.html, { waitUntil: 'load' });
      await page.addScriptTag({ content: axeSource });
      const violations = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })).violations.map(v => `${v.id}:${v.nodes.length}`));
      check(violations.length === 0, `${where}: nessuna violazione WCAG ${violations.join(' ')}`);
      const m = await page.evaluate(() => {
        const sizes = [...document.querySelectorAll('body *')].filter(el => el.childNodes.length && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())).map(el => parseFloat(getComputedStyle(el).fontSize));
        const links = [...document.querySelectorAll('a')].map(a => ({ href: a.href, text: a.textContent.trim(), h: a.getBoundingClientRect().height }));
        return { scroll: document.documentElement.scrollWidth, min: Math.min(...sizes), links };
      });
      check(m.scroll <= width, `${where}: niente scorrimento di lato (${m.scroll} px)`);
      check(m.min >= 13, `${where}: testo di almeno 13 px (${m.min})`);
      check(m.links.some(l => l.href.startsWith(APP) && !l.href.includes('unsubscribe') && l.h >= 40), `${where}: pulsante verso l'app alto almeno 40 px`);
      check(m.links.some(l => l.href.includes('/api/email/unsubscribe?') && l.text.length > 5), `${where}: collegamento per smettere di riceverla`);
      if (out) await page.screenshot({ path: `${out}/${email.name}-${width}.png`, fullPage: true });
    }
    await page.close();
  }
  // Versione solo testo: stesse informazioni, collegamenti scritti per intero.
  for (const email of emails) {
    check(email.text.includes(APP) && email.text.includes('/api/email/unsubscribe?') && !/<[a-z]/i.test(email.text.replace('<b>& acqua</b>', '')), `${email.name}: versione solo testo con i collegamenti e senza HTML`);
    check(/^<https:\/\/.+>$/.test(email.headers['List-Unsubscribe']) && email.headers['List-Unsubscribe-Post'] === 'List-Unsubscribe=One-Click', `${email.name}: intestazioni per annullare l'iscrizione con un clic`);
  }
} finally {
  await browser.close();
}
if (failures.length) { console.error(`\nEmail: ${failures.length} non superate.`); process.exit(1); }
console.log('\nEmail: tutte le prove superate.');

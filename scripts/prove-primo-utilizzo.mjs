// Primo utilizzo (scelta dell'utente, 24 novembre 2026): una persona nuova, senza dati, sul telefono
// (360 px) in ognuna delle sei lingue: accesso, cruscotto vuoto, bollette vuote, prima bolletta,
// prima casa. Per ogni schermata controlla che nulla esca dallo schermo, che non compaiano chiavi
// del dizionario, «undefined» o «NaN», e che nelle altre lingue non resti testo italiano (testi
// uguali a quelli della stessa schermata in italiano).
// Uso: app compilata per il Supabase finto (vedi scripts/prove-con-accesso.mjs), poi
//   node scripts/prove-primo-utilizzo.mjs [http://localhost:3000]
import { BASE, checker, startScenario, openPage, launch } from './accesso-comune.mjs';
import { translate } from '../lib/i18n.mjs';
import { localeFor } from '../lib/i18n-core.mjs';
import { formatNumberInput } from '../lib/number-input.mjs';

const { check, finish } = checker('Primo utilizzo');
const LANGS = ['it', 'en', 'es', 'fr', 'de', 'pt'];
// Testi uguali per natura in tutte le lingue: nomi, numeri, sigle, dati inseriti nella prova.
const SAME = [/Casa ?in ?Ordine/i, /^(Italiano|English|Español|Français|Deutsch|Português)$/, /^[A-Z0-9 .,:;/·•@+()€%_\-–—]+$/, /^[^\p{L}]*$/u,
  /\b(pagoPA|IBAN|Gmail|Outlook|Microsoft 365|Resend|Vercel|Supabase|JSON|ZIP|CSV|PDF|OCR|SOS|QR)\b/, /^[^\s]+@[^\s]+$/, /^https?:\/\//, /^\d/,
  /^(Enel Energia|Casa al mare|Luce di prova|nuova)$/, /^(Casa|inOrdine|in Ordine|Password|Categoria)$/, /^nuova@example\.org$/, /^(Total|Status|Normal|Info|Email|E-mail|Ok|OK|Menu|Home|Backup|Account|Budget|Online|Offline|Link|Login|Chat|Tag)$/i];
const KEY = /(?:^|\s)[a-z][a-z0-9]*(?:\.[a-zA-Z0-9_-]+){1,4}(?=$|\s)/;

async function walk(browser, lang) {
  const { fake, person } = await startScenario();
  const nuova = person('nuova', '33333333-3333-4333-8333-333333333333', 'nuova@example.org');
  const ui = await openPage(browser, { locale: lang, language: lang, viewport: { width: 360, height: 780 }, device: { isMobile: true, hasTouch: true } });
  const { page } = ui;
  const tr = (key, params) => translate(lang, key, params);
  const steps = {};
  const look = async step => {
    await page.waitForTimeout(500);
    const info = await page.evaluate(() => {
      const out = new Set();
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const el = node.parentElement;
        if (!el || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'OPTION'].includes(el.tagName) || el.closest('[hidden],pre,code,.extra-print-only,select')) continue;
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || !el.getClientRects().length) continue;
        const text = node.textContent.replace(/\s+/g, ' ').trim();
        if (text) out.add(text);
      }
      for (const el of document.querySelectorAll('[aria-label],[placeholder],[title]'))
        for (const attr of ['aria-label', 'placeholder', 'title']) { const v = el.getAttribute(attr)?.trim(); if (v) out.add(v); }
      const root = document.scrollingElement;
      // Chi esce dallo schermo (per capire cosa correggere).
      const wide = [...document.querySelectorAll('body *')].filter(el => { const r = el.getBoundingClientRect(); return r.width && r.right > root.clientWidth + 1 && !el.closest('.table-scroll,.filter-tabs,[hidden]'); })
        .slice(-3).map(el => `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}:${Math.round(el.getBoundingClientRect().right)} «${(el.innerText || '').slice(0, 30)}»`);
      return { texts: [...out], overflow: root.scrollWidth - root.clientWidth, wide };
    });
    steps[step] = info.texts;
    check(info.overflow <= 1, `${lang} · ${step}: niente esce dallo schermo a 360 px (${info.overflow} px${info.overflow > 1 ? ': ' + info.wide.join(', ') : ''})`);
    const broken = info.texts.filter(t => KEY.test(t) && !/@|https?:|\.(?:pdf|csv|zip|json)$/i.test(t) || /\b(undefined|NaN|null)\b/.test(t));
    check(!broken.length, `${lang} · ${step}: nessuna chiave o valore vuoto ${broken.slice(0, 3).join(' | ')}`);
  };
  try {
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await look('accesso');
    check(await ui.login(nuova), `${lang}: la persona nuova entra`);
    await look('cruscotto vuoto');
    // Per cominciare: tre modi, il saluto con un nome vero, niente numeri di versione.
    check(await page.locator('.home3-start .btn').count() === 3, `${lang}: «${tr('home.start.title')}» propone tre modi per cominciare`);
    const heading = await page.locator('.home3-heading').innerText().catch(() => '');
    check(heading.includes(tr('home.greeting', { who: ', Nuova' })) && !/\d\.\d/.test(heading), `${lang}: saluto «${heading.split('\n').slice(0, 2).join(' ')}»`);
    await ui.go(tr('nav.bills'));
    await look('bollette vuote');
    await page.getByRole('button', { name: tr('form.addBill') }).first().click();
    await page.locator('.modal').waitFor({ timeout: 5000 });
    await look('nuova bolletta');
    await page.getByLabel(tr('form.description')).fill('Luce di prova');
    // Importo scritto come lo scrive chi usa la lingua (Chrome leggeva «12,50» come 1250).
    const amount = page.getByLabel(tr('form.amount'));
    await amount.pressSequentially('12,3,4');
    await page.locator('.modal .modal-actions .btn-primary').click();
    await page.waitForTimeout(400);
    const why = await amount.evaluate(el => el.validationMessage).catch(() => '');
    check(why === tr('number.invalid', { example: formatNumberInput(12.5, lang) }) && !fake.rows('bills').length,
      `${lang}: un importo non valido ferma il modulo con «${why}»`);
    const typed = new Intl.NumberFormat(localeFor(lang)).format(1234.56);
    await amount.fill('');
    await amount.pressSequentially(typed);
    await page.getByLabel(tr('form.description')).focus();
    const shown = await amount.inputValue();
    check(shown === formatNumberInput(1234.56, lang), `${lang}: «${typed}» si legge ${shown}`);
    await page.locator('.modal .modal-actions .btn-primary').click();
    await page.waitForTimeout(1500);
    const first = fake.rows('bills').find(b => b.title === 'Luce di prova');
    check(first && Number(first.amount) === 1234.56, `${lang}: la prima bolletta si salva con l'importo giusto (${first?.amount})`);
    await look('prima bolletta');
    await ui.go(tr('nav.dashboard'));
    check(await page.locator('.home3-start').count() === 0, `${lang}: dopo la prima bolletta «${tr('home.start.title')}» non c'è più`);
    await ui.go(tr('nav.household'));
    await look('famiglia vuota');
    await page.getByLabel(tr('family.name')).fill('Casa al mare');
    await page.getByRole('button', { name: tr('family.create') }).click();
    await page.waitForTimeout(2000);
    check(fake.rows('homes').some(h => h.name === 'Casa al mare'), `${lang}: la prima casa si crea`);
    await look('prima casa');
    check(!ui.errors.length, `${lang}: nessun errore nella pagina ${ui.errors.slice(0, 2).join(' | ')}`);
  } finally { await ui.context.close(); fake.close(); }
  return steps;
}

const browser = await launch();
try {
  const all = {};
  for (const lang of LANGS) all[lang] = await walk(browser, lang);
  // Testo rimasto in italiano: uguale a un testo della stessa schermata in italiano.
  for (const lang of LANGS.filter(l => l !== 'it')) {
    const leftovers = new Set();
    for (const [step, texts] of Object.entries(all[lang])) {
      const italian = new Set(all.it[step] || []);
      for (const text of texts) if (italian.has(text) && !SAME.some(re => re.test(text)) && /\p{L}{3}/u.test(text)) leftovers.add(`${step}: «${text}»`);
    }
    check(!leftovers.size, `${lang}: nessun testo rimasto in italiano ${[...leftovers].slice(0, 6).join(' | ')}`);
  }
} finally { await browser.close(); }
finish();

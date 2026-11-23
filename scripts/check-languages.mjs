// Cerca nell'app compilata i testi rimasti non tradotti: apre le stesse pagine in italiano e in
// inglese (modalità senza account) e segnala ogni testo visibile identico nelle due lingue.
// Uso: node scripts/check-languages.mjs [indirizzo]   (predefinito http://localhost:3000). La usa la CI.
import { chromium } from 'playwright';

const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
// Testi uguali in tutte le lingue per natura: marchi, nomi di fantasia dei dati di esempio, sigle.
const SAME = [/Casa ?in ?Ordine/i, /^(Energia Esempio|Rete Demo|Acquedotto Esempio|Gas di Prova|Amministrazione Demo|Mobile Esempio)$/,
  /^(Italiano|English|Español|Français|Deutsch|Português)$/, /^[A-Z0-9 .,:;/·•@+()€%-]+$/, /\b(pagoPA|IBAN|Gmail|Outlook|Microsoft 365|iCloud|Yahoo|Zoho|Aruba|GMX|Fastmail|Libero|Virgilio|Tiscali|AOL|mail\.com)\b/,
  /^[^\s]+@[^\s]+$/, /^https?:\/\//, /^\d/];

async function texts(page) {
  return page.evaluate(() => {
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
}

async function crawl(browser, lang) {
  const context = await browser.newContext({ locale: lang, extraHTTPHeaders: { 'Accept-Language': lang }, viewport: { width: 1360, height: 900 } });
  await context.addInitScript(code => { try { localStorage.setItem('casainordine-language-v32', code); } catch {} }, lang);
  const page = await context.newPage();
  const seen = new Map();
  const note = async step => { for (const text of await texts(page)) if (!seen.has(text)) seen.set(text, step); };
  const settle = () => page.waitForTimeout(450);
  for (const start of ['/', '/prova']) {
    await page.goto(BASE + start, { waitUntil: 'networkidle' });
    await note(start);
    // Menu in gruppi: si aprono tutti, poi si provano le voci (non le intestazioni dei gruppi).
    const closed = page.locator('nav .nav-group-head[aria-expanded="false"]');
    for (let n = 0; n < 8 && await closed.count(); n++) await closed.first().click().catch(() => {});
    await note(`${start} gruppi`);
    const nav = page.locator('nav button:not(.nav-group-head), aside button:not(.nav-group-head)');
    const count = await nav.count();
    for (let i = 0; i < count; i++) {
      try { await nav.nth(i).click({ timeout: 2000 }); await settle(); } catch { continue; }
      await note(`${start} menu ${i}`);
      const primary = page.locator('main .page-heading .btn-primary').first();
      if (await primary.count()) {
        try { await primary.click({ timeout: 1500 }); await settle(); await note(`${start} menu ${i} modulo`); } catch {}
        await page.keyboard.press('Escape').catch(() => {});
        await settle();
      }
    }
  }
  for (const path of ['/offline.html', `/vacanza/${'a'.repeat(64)}`]) {
    await page.goto(BASE + path, { waitUntil: 'networkidle' });
    await note(path);
  }
  await context.close();
  return seen;
}

const browser = await chromium.launch();
let italian, english;
try {
  italian = await crawl(browser, 'it');
  english = await crawl(browser, 'en');
} finally { await browser.close(); }

// Una chiave mostrata al posto del testo (per esempio «v20.ui.monitorTitle») vuol dire testo mancante.
const KEY = /^[a-z][a-z0-9]*(?:\.[a-zA-Z0-9_-]+)+$/;
const rawKeys = [...italian, ...english].filter(([text]) => KEY.test(text) && !/\.(?:com|it|pdf|csv|json|html)$/.test(text));
if (rawKeys.length) {
  console.error(`${rawKeys.length} chiavi del dizionario mostrate al posto del testo:`);
  for (const [text, step] of rawKeys) console.error(`  [${step}] ${text}`);
  process.exitCode = 1;
}
const untranslated = [...english].filter(([text]) => italian.has(text)
  && text.split(' ').filter(word => /[a-zà-ÿ]{3}/i.test(word)).length >= 2
  && !SAME.some(pattern => pattern.test(text)));
console.log(`Testi visti: ${italian.size} in italiano, ${english.size} in inglese.`);
if (untranslated.length) {
  console.error(`\n${untranslated.length} testi uguali in italiano e in inglese (non tradotti?):`);
  for (const [text, step] of untranslated) console.error(`  [${step}] ${text.slice(0, 160)}`);
  process.exit(1);
}
if (!process.exitCode) console.log('Nessun testo rimasto in italiano nella versione inglese e nessuna chiave al posto del testo.');

// Controllo automatico di accessibilità sull'app compilata in demo: Home, menu in gruppi, le
// sezioni della Fase 2 con i loro moduli aperti, Impostazioni, pagina di prova e pagina offline,
// su computer e su un telefono largo 320 px. Lo usa la CI.
// - axe-core con le regole WCAG 2.1 A e AA;
// - riflusso (1.4.10): a 320 px la pagina non scorre in orizzontale;
// - contrasto dei componenti (1.4.11): bordo dei campi e interruttori almeno 3:1 sullo sfondo,
//   che axe non controlla.
// Uso: node scripts/check-accessibility.mjs [http://localhost:3000]
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');
const BASE = process.argv[2] || 'http://localhost:3000';
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const SECTIONS = ['Automazioni', 'Professionisti', 'Programma stagionale', 'Scorte', 'Giardino e orto', 'Progetti e lavori', 'Fondo sostituzioni', 'Affitti', 'Casa Control', 'Impostazioni', 'Bollette'];

const problems = [];
async function scan(page, label) {
  await page.addScriptTag({ path: AXE });
  const result = await page.evaluate(async tags => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] });
    return r.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 4).map(n => n.target.join(' ')) , count: v.nodes.length }));
  }, TAGS);
  result.push(...await page.evaluate(() => {
    const out = [];
    if (innerWidth <= 320 && document.documentElement.scrollWidth > innerWidth + 1)
      out.push({ id: 'riflusso-320', impact: 'serious', help: `la pagina è larga ${document.documentElement.scrollWidth} px su uno schermo di ${innerWidth}`, nodes: [], count: 1 });
    const lum = c => { const m = String(c).match(/\d+(\.\d+)?/g); if (!m) return 1; const [r, g, b] = m.slice(0, 3).map(Number).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
    const behind = e => { for (let n = e.parentElement; n; n = n.parentElement) { const c = getComputedStyle(n).backgroundColor; if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c; } return 'rgb(255, 255, 255)'; };
    const weak = [];
    for (const e of document.querySelectorAll('main .toggle, main input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]):not([type=hidden]), main select, main textarea')) {
      if (!e.offsetParent) continue;
      const s = getComputedStyle(e), around = behind(e);
      const shadow = (s.boxShadow.match(/rgba?\([^)]*\)/) || [])[0];
      const edges = [parseFloat(s.borderTopWidth) ? s.borderTopColor : null, shadow, s.backgroundColor].filter(Boolean);
      // Campo senza bordo dentro un contenitore che fa da bordo (ricerca): conta il contenitore.
      const box = e.parentElement, bs = box && getComputedStyle(box);
      if (bs && parseFloat(bs.borderTopWidth) && ratio(bs.borderTopColor, behind(box)) >= 3) continue;
      if (Math.max(...edges.map(c => ratio(c, around))) < 3) weak.push(e.className ? '.' + String(e.className).split(' ')[0] : `${e.tagName.toLowerCase()}[${e.type || ''}]`);
    }
    if (weak.length) out.push({ id: 'contrasto-componenti', impact: 'serious', help: 'bordo del campo sotto 3:1 rispetto allo sfondo', nodes: [...new Set(weak)].slice(0, 4), count: weak.length });
    return out;
  }));
  for (const v of result) problems.push({ where: label, ...v });
  console.log(`${result.length ? 'NO ' : 'ok '} ${label}${result.length ? ': ' + result.map(v => `${v.id} (${v.count})`).join(', ') : ''}`);
}

async function openAllGroups(page) {
  const closed = page.locator('nav .nav-group-head[aria-expanded="false"]');
  for (let n = 0; n < 8 && await closed.count(); n++) await closed.first().click();
}

async function run(browser, device) {
  const mobile = device === 'telefono';
  const context = await browser.newContext({ locale: 'it-IT', viewport: mobile ? { width: 320, height: 720 } : { width: 1360, height: 900 } });
  await context.addInitScript(() => { try { localStorage.setItem('casainordine-language-v32', 'it'); } catch {} });
  const page = await context.newPage();
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await scan(page, `${device} · Home`);
  const openMenu = async () => { if (mobile) { await page.locator('.burger').first().click(); await page.waitForTimeout(250); } };
  await openMenu(); await openAllGroups(page);
  await scan(page, `${device} · menu con i gruppi aperti`);
  for (const name of SECTIONS) {
    if (mobile && !(await page.locator('.sidebar-show').count())) { await openMenu(); }
    const button = page.getByRole('button', { name, exact: true }).first();
    if (!(await button.count())) { problems.push({ where: `${device} · ${name}`, id: 'voce-mancante', help: 'voce di menu non trovata', nodes: [] }); continue; }
    await button.click(); await page.waitForTimeout(700);
    await scan(page, `${device} · ${name}`);
    // Il modulo principale della sezione, se c'è un pulsante per aprirlo.
    const add = page.locator('main .btn-primary').first();
    if (!mobile && await add.count() && await add.isEnabled()) {
      await add.click().catch(() => {}); await page.waitForTimeout(500);
      await scan(page, `${device} · ${name} · modulo`);
      await page.keyboard.press('Escape').catch(() => {});
    }
  }
  if (!mobile) {
    await page.goto(BASE + '/prova', { waitUntil: 'networkidle' });
    await scan(page, `${device} · pagina di prova`);
    await page.goto(BASE + '/offline.html', { waitUntil: 'load' });
    await scan(page, `${device} · pagina offline`);
  }
  await context.close();
}

const browser = await chromium.launch();
try { for (const device of ['computer', 'telefono']) await run(browser, device); }
finally { await browser.close(); }
if (problems.length) {
  console.log('\nProblemi di accessibilità:');
  for (const p of problems) console.log(`- ${p.where}: ${p.id} [${p.impact || '-'}] ${p.help}\n    ${p.nodes.join('\n    ')}`);
  process.exit(1);
}
console.log('\nAccessibilità: nessuna violazione WCAG 2.1 A/AA, niente scorrimento orizzontale a 320 px, campi con bordo ben visibile.');

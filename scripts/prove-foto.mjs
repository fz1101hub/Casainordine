// Bollette fotografate (scelta dell'utente, 24 novembre 2026): nel browser vero, con la lettura vera
// dell'app (OCR locale, secondo passaggio con sfondo uniforme), si caricano foto di bollette disegnate
// sul momento in un canvas: nitida, storta, scura e sfocata, piccola e compressa, con un'ombra.
// Si controlla che il modulo della bolletta arrivi con importo e scadenza giusti.
// Uso: app compilata in modalità prova (senza Supabase), poi
//   node scripts/prove-foto.mjs [http://localhost:3000]
import { chromium } from 'playwright';

const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const BILLS = {
  luce: { lines: ['Lumen Casa S.p.A.', 'Bolletta luce - Fattura n. 2026/889912', 'Data emissione 20/11/2026', 'Periodo di fatturazione dal 01/09/2026 al 31/10/2026',
    'POD IT001E12345678', 'Consumo fatturato 305 kWh', 'Totale da pagare 156,20 €', 'Scadenza 18/12/2026'], amount: 156.2, due: '2026-12-18' },
  gas: { lines: ['GasNord Energia S.r.l.', 'Fornitura gas naturale - PDR 00881234567890', 'Periodo di riferimento dal 1 settembre 2026 al 31 ottobre 2026',
    'Consumi fatturati: 120 Smc', 'TOTALE DA PAGARE € 112,50', 'Da pagare entro il 15/12/2026'], amount: 112.5, due: '2026-12-15' },
  acqua: { lines: ['Acque del Fiume S.p.A.', 'Servizio idrico integrato', 'Consumo 38 mc', 'Importo totale 58,40 euro', 'Scadenza pagamento 10/01/2027'], amount: 58.4, due: '2027-01-10' },
};
const KINDS = ['nitida', 'ombra', 'storta', 'scura-sfocata', 'piccola-compressa'];

const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); console.log(`${ok ? 'ok ' : 'NO '} ${message}`); };
const browser = await chromium.launch();
const page = await (await browser.newContext({ locale: 'it-IT', viewport: { width: 1360, height: 900 } })).newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));

// Una foto della bolletta come JPEG (base64), disegnata nel browser.
const photo = (lines, kind) => page.evaluate(async ({ lines, kind }) => {
  const W = 1240, H = 1754, sheet = document.createElement('canvas');
  sheet.width = W; sheet.height = H;
  const s = sheet.getContext('2d');
  s.fillStyle = '#fafaf7'; s.fillRect(0, 0, W, H); s.fillStyle = '#19191e';
  lines.forEach((line, i) => { s.font = `${i ? '' : 'bold '}${i ? 34 : 46}px sans-serif`; s.fillText(line, 100, 160 + i * 80); });
  const out = document.createElement('canvas'), o = out.getContext('2d');
  let scale = 1, quality = 0.85;
  if (kind === 'piccola-compressa') { scale = 0.33; quality = 0.2; }
  out.width = Math.round(W * scale) + (kind === 'storta' ? 200 : 0); out.height = Math.round(H * scale) + (kind === 'storta' ? 200 : 0);
  o.fillStyle = '#786e64'; o.fillRect(0, 0, out.width, out.height);
  o.save();
  if (kind === 'storta') { o.translate(out.width / 2, out.height / 2); o.rotate(-5 * Math.PI / 180); o.translate(-W / 2, -H / 2); }
  if (kind === 'scura-sfocata') o.filter = 'brightness(55%) contrast(70%) blur(1.6px)';
  o.drawImage(sheet, 0, 0, Math.round(W * scale), Math.round(H * scale));
  o.restore();
  if (kind === 'ombra') {
    const g = o.createLinearGradient(0, 0, out.width, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.65)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    o.fillStyle = g; o.fillRect(0, 0, out.width, out.height);
  }
  return out.toDataURL('image/jpeg', quality).split(',')[1];
}, { lines, kind });

try {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  for (const [name, bill] of Object.entries(BILLS)) for (const kind of KINDS) {
    const label = `${name}, foto ${kind}`;
    const closed = page.locator('nav .nav-group-head[aria-expanded="false"]');
    for (let n = 0; n < 8 && await closed.count(); n++) await closed.first().click();
    await page.getByRole('button', { name: 'Importa e collega', exact: true }).first().click();
    const buffer = Buffer.from(await photo(bill.lines, kind), 'base64');
    const t0 = Date.now();
    await page.locator('input[type=file][accept*="image/jpeg"]').first().setInputFiles({ name: `${name}-${kind}.jpg`, mimeType: 'image/jpeg', buffer });
    const capture = page.locator('.capture-modal');
    if (!(await capture.waitFor({ timeout: 90000 }).then(() => true, () => false))) { check(false, `${label}: la foto non è stata letta`); continue; }
    await capture.locator('.btn-primary').click();
    const amount = await page.locator('.modal input[type=number]').first().inputValue().catch(() => '');
    const due = await page.locator('.modal input[type=date]').first().inputValue().catch(() => '');
    const warned = /Lettura OCR poco chiara/.test(await page.locator('.modal').innerText().catch(() => ''));
    const right = Number(amount) === bill.amount && due === bill.due;
    // Foto piccola e compressa: le cifre possono confondersi (dipende dai caratteri e dal browser),
    // ma allora deve comparire l'avviso di ricontrollare. Le altre foto devono essere lette giuste.
    if (kind === 'piccola-compressa') check(warned, `${label}: avviso di ricontrollare (importo ${amount || '—'}, scadenza ${due || '—'}, ${right ? 'giusti' : 'da correggere'})`);
    else check(right, `${label}: importo ${amount || '—'} e scadenza ${due || '—'} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    await page.locator('.modal .modal-head button[aria-label]').first().click();
    await page.locator('.modal').waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
  }
  check(!errors.length, `nessun errore nella pagina ${errors.join(' | ')}`);
} finally { await browser.close(); }
if (failures.length) { console.error(`\nFoto delle bollette: ${failures.length} non superate.`); process.exit(1); }
console.log('\nFoto delle bollette: tutte superate.');

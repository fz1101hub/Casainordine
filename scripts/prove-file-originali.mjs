// File originali (scelta dell'utente, 25 novembre 2026): «riesportare le bollette e gli altri
// documenti caricati nel caso servisse il file singolo», più le foto dell'iPhone e i file grandi.
// Con l'app compilata per il Supabase finto (vedi scripts/prove-con-accesso.mjs):
// 1. una bolletta letta da un PDF conserva il file nell'archivio, collegato alla bolletta, e dalla
//    riga della bolletta si riscarica con il suo nome e gli stessi byte;
// 2. togliendo «Conserva il file originale» il file non si carica, e la scelta resta per la volta dopo;
// 3. nell'archivio ogni documento si scarica con il suo nome;
// 4. una foto HEIC dell'iPhone entra nell'archivio come JPEG; una foto da 17 MB entra ridotta (sotto i 10 MB).
// Uso: node scripts/prove-file-originali.mjs [http://localhost:3000]
import { readFileSync } from 'node:fs';
import { checker, startScenario, openPage, launch } from './accesso-comune.mjs';
import { textPdf } from './text-pdf.mjs';
import { translate } from '../lib/i18n.mjs';

const { check, finish } = checker('File originali');
const tr = (key, params) => translate('it', key, params);
const ANNA = '11111111-1111-4111-8111-111111111111';

const { fake, person } = await startScenario();
const anna = person('anna', ANNA, 'anna@example.org');
const browser = await launch();
const ui = await openPage(browser);
const { page } = ui;

async function importPdf(name, lines) {
  await ui.go('Importa e collega');
  const buffer = Buffer.from(textPdf(lines));
  await page.locator('input[type=file][accept*="pdf"]').first().setInputFiles({ name, mimeType: 'application/pdf', buffer });
  const capture = page.locator('.capture-modal');
  if (!(await capture.waitFor({ timeout: 60000 }).then(() => true, () => false))) return null;
  await capture.locator('.btn-primary').click();
  await page.locator('.modal').waitFor({ timeout: 5000 });
  return buffer;
}
const keep = () => page.getByLabel(tr('bill.keepFile'));
const save = async () => { await page.locator('.modal .modal-actions .btn-primary').click(); await page.locator('.modal').waitFor({ state: 'detached', timeout: 15000 }).catch(() => {}); await page.waitForTimeout(800); };
const download = async locator => {
  const [file] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), locator.click()]);
  return { name: file.suggestedFilename(), bytes: readFileSync(await file.path()) };
};

try {
  check(await ui.login(anna), 'Anna entra');

  // 1. Bolletta da PDF, file conservato e riscaricabile dalla riga della bolletta.
  const NAME = 'Bolletta Enel novembre 2026.pdf';
  const pdf = await importPdf(NAME, ['Enel Energia', 'Bolletta luce', 'Totale da pagare 84,50 EUR', 'Scadenza 15/12/2026']);
  check(Boolean(pdf), 'il PDF si legge e apre il modulo della bolletta');
  check(await keep().isChecked().catch(() => false), '«Conserva il file originale» è attiva all\'inizio');
  await save();
  const bill = fake.rows('bills').find(b => b.source === 'document' && Number(b.amount) === 84.5);
  const doc = fake.rows('home_documents').find(d => d.bill_id === bill?.id);
  check(Boolean(bill) && doc?.doc_type === 'bolletta' && doc?.name === NAME && doc?.mime_type === 'application/pdf',
    `il file è nell'archivio, collegato alla bolletta (${doc?.name || 'nessuno'})`);
  check(pdf && Buffer.compare(Buffer.from(fake.file('house-documents', doc?.storage_path || '')?.bytes || ''), pdf) === 0, 'il file caricato è uguale al PDF scelto');
  await ui.go('Bollette');
  const button = page.getByRole('button', { name: tr('bill.downloadFile', { name: NAME }), exact: true });
  await button.waitFor({ timeout: 10000 }).catch(() => {});
  check(await button.count() === 1, 'nella riga della bolletta c\'è «Scarica il file originale»');
  if (await button.count()) {
    const got = await download(button);
    check(got.name === NAME && pdf && Buffer.compare(got.bytes, pdf) === 0, `si riscarica con il suo nome e uguale (${got.name}, ${got.bytes.length} byte)`);
  }

  // 2. Senza conservare il file: niente caricamento, e la scelta resta.
  const before = fake.rows('home_documents').length;
  await importPdf('Bolletta gas.pdf', ['GasNord Energia', 'Fornitura gas naturale', 'Totale da pagare 61,20 EUR', 'Scadenza 20/12/2026']);
  await keep().uncheck();
  await save();
  check(fake.rows('bills').some(b => Number(b.amount) === 61.2) && fake.rows('home_documents').length === before, 'senza «Conserva il file» la bolletta si salva e il file no');
  await importPdf('Bolletta acqua.pdf', ['Acque del Fiume', 'Servizio idrico', 'Importo totale 58,40 euro', 'Scadenza 10/01/2027']);
  check(!(await keep().isChecked().catch(() => true)), 'la volta dopo la casella resta tolta, come l\'ultima scelta');
  await keep().check();
  await save();
  check(fake.rows('home_documents').some(d => d.name === 'Bolletta acqua.pdf'), 'rimettendo la casella il file si conserva');
  await ui.go('Bollette');
  await page.waitForTimeout(800);
  const buttons = await page.getByRole('button', { name: /Scarica il file originale/ }).count();
  check(fake.rows('bills').length === 3 && buttons === 2, `il pulsante c'è solo per le bollette con il file (${buttons} su ${fake.rows('bills').length})`);

  // 3. Archivio: ogni documento si scarica con il suo nome.
  await ui.go('Archivio documenti');
  const archived = page.getByRole('button', { name: tr('extra.archive.downloadName', { name: NAME }), exact: true });
  await archived.waitFor({ timeout: 10000 }).catch(() => {});
  if (await archived.count()) {
    const got = await download(archived);
    check(got.name === NAME && pdf && Buffer.compare(got.bytes, pdf) === 0, `dall'archivio si scarica «${got.name}»`);
  } else check(false, 'nell\'archivio c\'è il pulsante per scaricare il documento');

  // 4. Foto dell'iPhone (HEIC) e foto da 17 MB nell'archivio.
  const input = page.locator('main input[type=file][accept*=".txt"]').first();
  const heic = readFileSync(new URL('../tests/fixtures/bolletta-iphone.heic', import.meta.url));
  await input.setInputFiles({ name: 'IMG_4821.HEIC', mimeType: 'image/heic', buffer: heic });
  const photoDoc = () => fake.rows('home_documents').find(d => d.name === 'IMG_4821.jpg');
  for (let i = 0; i < 40 && !photoDoc(); i++) await page.waitForTimeout(500);
  const stored = fake.file('house-documents', photoDoc()?.storage_path || '');
  const bytes = Buffer.from(stored?.bytes || '');
  check(photoDoc()?.mime_type === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8, `la foto HEIC entra nell'archivio come JPEG (${photoDoc()?.name || 'nessuna'}, ${bytes.length} byte)`);
  const big = await page.evaluate(async () => {
    const W = 5200, H = 6900, c = document.createElement('canvas'); c.width = W; c.height = H;
    const s = c.getContext('2d'), img = s.createImageData(W, H), d = img.data;
    let x = 777;
    for (let i = 0; i < d.length; i += 4) { x = (x * 1103515245 + 12345) & 0x7fffffff; const v = 235 - (x % 30); d[i] = v; d[i + 1] = v - 3; d[i + 2] = v - 8; d[i + 3] = 255; }
    s.putImageData(img, 0, 0);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.96));
    const u = new Uint8Array(await blob.arrayBuffer());
    let bin = ''; for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode(...u.subarray(i, i + 0x8000));
    return btoa(bin);
  });
  const bigBuffer = Buffer.from(big, 'base64');
  await input.setInputFiles({ name: 'IMG_20261124_101500.jpg', mimeType: 'image/jpeg', buffer: bigBuffer });
  const bigDoc = () => fake.rows('home_documents').find(d => d.name === 'IMG_20261124_101500.jpg');
  for (let i = 0; i < 60 && !bigDoc(); i++) await page.waitForTimeout(500);
  check(bigBuffer.length > 15 * 1048576 && bigDoc() && bigDoc().file_size < 10 * 1048576,
    `una foto da ${(bigBuffer.length / 1048576).toFixed(1)} MB entra ridotta (${bigDoc() ? (bigDoc().file_size / 1048576).toFixed(1) + ' MB' : 'non entrata'})`);

  check(!ui.errors.length, `nessun errore nella pagina ${ui.errors.slice(0, 3).join(' | ')}`);
} finally { await ui.context.close(); await browser.close(); fake.close(); }
finish();

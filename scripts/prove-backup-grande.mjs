// Ripristino di backup grandi (scelta dell'utente, 24 novembre 2026): una persona con cinque anni di
// dati (3000 bollette, 1200 attività, 40 utenze, 300 letture dei contatori, 60 documenti con il file)
// sul telefono con il processore 4 volte più lento; Supabase finto con il limite di 1000 righe.
// Backup con i file (.zip), poi si perde quasi tutto (anche i file), ripristino, poi un secondo
// ripristino dello stesso file: tutto torna una volta sola, con i file uguali.
// Uso: app compilata per il Supabase finto (vedi scripts/prove-con-accesso.mjs), poi
//   node scripts/prove-backup-grande.mjs [http://localhost:3000]
import { readFileSync } from 'node:fs';
import { unzipSync, strFromU8 } from 'fflate';
import { checker, startScenario, openPage, launch } from './accesso-comune.mjs';

const { check, finish } = checker('Backup grande');
const { fake, person } = await startScenario({ maxRows: 1000 });
const anna = person('anna', '11111111-1111-4111-8111-111111111111', 'anna@example.org');
const id = (p, i) => `${p}-0000-4000-8000-${String(i).padStart(12, '0')}`;
const day = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const N = { bills: 3000, tasks: 1200, utilities: 40, readings: 300, documents: 60 };
fake.seed('utilities', Array.from({ length: N.utilities }, (_, i) => ({ id: id('a0000000', i), user_id: anna.id, home_id: null, supplier: `Fornitore ${i}`, category: 'Luce',
  estimated_amount: 40, frequency: 'monthly', billing_day: 10, next_due_date: day(10), active: true, created_at: '2022-01-01T10:00:00Z' })));
fake.seed('bills', Array.from({ length: N.bills }, (_, i) => ({ id: id('b0000000', i), user_id: anna.id, home_id: null, utility_id: i % 3 ? null : id('a0000000', i % N.utilities),
  title: `Bolletta ${i + 1}`, supplier: `Fornitore ${i % N.utilities}`, category: 'Luce', amount: 30 + (i % 70), due_date: day(-1800 + Math.floor(i * 0.6)),
  paid_at: i < 2950 ? '2026-01-01T10:00:00Z' : null, source: 'manual', is_estimate: false, created_at: '2022-01-01T10:00:00Z' })));
fake.seed('house_tasks', Array.from({ length: N.tasks }, (_, i) => ({ id: id('c0000000', i), user_id: anna.id, home_id: null, title: `Attività ${i + 1}`,
  due_date: day(-1200 + i), done_at: i < 1150 ? '2026-01-01T10:00:00Z' : null, created_at: '2023-01-01T10:00:00Z' })));
fake.seed('meter_readings', Array.from({ length: N.readings }, (_, i) => ({ id: id('d0000000', i), user_id: anna.id, home_id: null, meter_type: 'Luce', reading_value: 1000 + i * 30,
  reading_date: day(-1500 + i * 5), unit: 'kWh', created_at: '2023-01-01T10:00:00Z' })));
const files = {};
fake.seed('home_documents', Array.from({ length: N.documents }, (_, i) => {
  const path = `${anna.id}/doc-${i}.pdf`, bytes = `%PDF-1.4 documento ${i} ` + 'x'.repeat(200 + i);
  files[path] = bytes;
  return { id: id('f0000000', i), user_id: anna.id, home_id: null, name: `Documento ${i}`, doc_type: 'bolletta', mime_type: 'application/pdf', storage_path: path,
    file_size: bytes.length, created_at: `2024-01-${String(1 + (i % 28)).padStart(2, '0')}T10:00:00Z` };
}));
fake.state.files['house-documents'] = Object.entries(files).map(([name, bytes]) => ({ name, bytes: Buffer.from(bytes), contentType: 'application/pdf' }));
const count = () => ({ bills: fake.rows('bills').length, tasks: fake.rows('house_tasks').length, utilities: fake.rows('utilities').length,
  readings: fake.rows('meter_readings').length, documents: fake.rows('home_documents').length, files: (fake.state.files['house-documents'] || []).length });

const browser = await launch();
try {
  const ui = await openPage(browser, { viewport: { width: 412, height: 915 }, device: { isMobile: true, hasTouch: true, deviceScaleFactor: 2.625 } });
  const { page } = ui;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  check(await ui.login(anna), 'Anna entra');
  await ui.go('Notifiche e backup');

  // Backup con i file.
  let t0 = Date.now();
  const mark = fake.state.requests.length;
  const [zipDownload] = await Promise.all([page.waitForEvent('download', { timeout: 180000 }).catch(() => null), page.getByRole('button', { name: 'Backup con i file (.zip)' }).click()]);
  const zipBytes = zipDownload ? readFileSync(await zipDownload.path()) : Buffer.alloc(0);
  console.log(`   backup con i file: ${((Date.now() - t0) / 1000).toFixed(1)} s, ${(zipBytes.length / 1024).toFixed(0)} KB, ${fake.state.requests.length - mark} richieste`);
  // Prima 61 s: a ogni file scaricato si ridisegnavano i calcoli e la tabella per la stampa.
  check((Date.now() - t0) / 1000 < 30, `backup con i file in tempi accettabili sul telefono (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  if (process.env.BACKUP_ELENCO) { const by = {}; for (const r of fake.state.requests.slice(mark)) { const k = r.path.split('?')[0]; by[k] = (by[k] || 0) + 1; } console.log(by); }
  const entries = zipBytes.length ? unzipSync(new Uint8Array(zipBytes)) : {};
  const json = JSON.parse(strFromU8(entries['casa-in-ordine-backup.json'] || new Uint8Array()) || '{}');
  check(json.bills?.length === N.bills && json.utilities?.length === N.utilities, `il backup contiene tutte le bollette e le utenze (${json.bills?.length}, ${json.utilities?.length})`);
  check((json.household?.house_tasks || json.tasks || []).length === N.tasks || json.household?.house_tasks === undefined, `e le attività (${(json.household?.house_tasks || json.tasks || []).length})`);
  check(json.meters?.length === N.readings, `e le letture dei contatori (${json.meters?.length})`);
  check(Object.keys(entries).filter(k => k.startsWith('files/')).length === N.documents, `e i file dei ${N.documents} documenti`);

  // Si perde quasi tutto: restano 10 bollette, 5 utenze e nessun documento né file.
  fake.state.tables.bills = fake.rows('bills').slice(0, 10);
  fake.state.tables.utilities = fake.rows('utilities').slice(0, 5);
  fake.state.tables.house_tasks = [];
  fake.state.tables.meter_readings = [];
  fake.state.tables.home_documents = [];
  fake.state.files['house-documents'] = [];
  const before = count();

  t0 = Date.now();
  await page.locator('.restore-box input[type=file]').setInputFiles({ name: 'backup.zip', mimeType: 'application/zip', buffer: zipBytes });
  await page.locator('.restore-preview').waitFor({ timeout: 60000 }).catch(() => {});
  const preview = (await page.locator('.restore-preview').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(/Bollette: nel file 3000 · già qui 10/.test(preview), `l'anteprima conta le bollette già presenti (${preview.slice(0, 120)}…)`);
  await page.getByRole('button', { name: 'Ripristina', exact: true }).click();
  await page.locator('.restore-preview [role=status]').filter({ hasText: 'Aggiunte' }).waitFor({ timeout: 300000 }).catch(() => {});
  const restoreSeconds = (Date.now() - t0) / 1000;
  const after = count();
  console.log(`   ripristino: ${restoreSeconds.toFixed(1)} s; prima ${JSON.stringify(before)}, dopo ${JSON.stringify(after)}`);
  check(after.bills === N.bills && after.utilities === N.utilities && after.readings === N.readings && after.documents === N.documents && after.files === N.documents,
    `tutto torna (${JSON.stringify(after)})`);
  check(after.tasks === N.tasks || after.tasks === 0, `attività: ${after.tasks} (${after.tasks === N.tasks ? 'tornano' : 'non sono nel backup con i file'})`);
  const restoredFile = fake.rows('home_documents').find(d => d.id === id('f0000000', 7));
  check(restoredFile && String(fake.file('house-documents', restoredFile.storage_path)?.bytes || '') === files[`${anna.id}/doc-7.pdf`], 'i file tornano uguali');
  check(restoreSeconds < 120, `ripristino in tempi accettabili sul telefono (${restoreSeconds.toFixed(0)} s)`);
  await page.getByRole('button', { name: 'Chiudi', exact: true }).click().catch(() => {});

  // Secondo ripristino dello stesso file: niente doppioni.
  await page.locator('.restore-box input[type=file]').setInputFiles({ name: 'backup.zip', mimeType: 'application/zip', buffer: zipBytes });
  await page.locator('.restore-preview').waitFor({ timeout: 60000 }).catch(() => {});
  await page.getByRole('button', { name: 'Ripristina', exact: true }).click().catch(() => {});
  await page.locator('.restore-preview [role=status]').filter({ hasText: /Aggiunte|già/ }).waitFor({ timeout: 300000 }).catch(() => {});
  await page.waitForTimeout(1000);
  const again = count();
  check(JSON.stringify(again) === JSON.stringify(after), `secondo ripristino: nessun doppione (${JSON.stringify(again)})`);
  check(!ui.errors.length, `nessun errore nella pagina ${ui.errors.join(' | ')}`);
} finally { await browser.close(); fake.close(); }
finish();

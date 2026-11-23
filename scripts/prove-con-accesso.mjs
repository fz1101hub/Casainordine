// Prova nel browser dell'app con accesso, contro un Supabase finto (tests/helpers/fake-supabase.mjs).
// La prova nel browser di sempre (smoke-browser.mjs) gira in modalità demo, senza database: qui
// invece l'app usa il client Supabase vero, con accesso, dati, backup e ripristino.
//
// L'app va compilata e avviata con:
//   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321  NEXT_PUBLIC_SUPABASE_ANON_KEY=chiave-pubblica-finta
// (e, per le API del server, SUPABASE_SECRET_KEY=chiave-di-servizio-finta). Questo script avvia il
// Supabase finto su quella porta.
// Uso: node scripts/prove-con-accesso.mjs [indirizzo dell'app]   (predefinito http://localhost:3000)
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { unzipSync, strFromU8, zipSync, strToU8 } from 'fflate';
import { startFakeSupabase } from '../tests/helpers/fake-supabase.mjs';

const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const PORT = Number(process.env.FAKE_SUPABASE_PORT || 54321);
const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); console.log(`${ok ? 'ok ' : 'NO '} ${message}`); };

const ANNA = '11111111-1111-4111-8111-111111111111';
const BILL_LUCE = '20000000-0000-4000-8000-000000000001', BILL_GAS = '20000000-0000-4000-8000-000000000002';
const DOC = '40000000-0000-4000-8000-000000000001';
const PDF = '%PDF-1.4 bolletta della luce di prova';

const fake = await startFakeSupabase({ port: PORT, lenientRpc: true });
fake.addUser(ANNA, 'anna@example.org', { password: 'password-lunga-di-prova' });
fake.state.rpc.v36_my_storage_used = () => 0;
fake.seed('profiles', [{ id: ANNA, email: 'anna@example.org', reminders_enabled: true, reminder_emails: true }]);
fake.seed('bills', [
  { id: BILL_LUCE, user_id: ANNA, home_id: null, title: 'Luce di casa', supplier: 'Enel', category: 'Luce', amount: 84.5, due_date: '2026-12-15', paid_at: null, is_estimate: false, created_at: '2026-11-01T10:00:00Z' },
  { id: BILL_GAS, user_id: ANNA, home_id: null, title: 'Gas di casa', supplier: 'Eni', category: 'Gas', amount: 61.2, due_date: '2026-12-20', paid_at: null, is_estimate: false, created_at: '2026-11-02T10:00:00Z' },
]);
fake.seed('home_documents', [{ id: DOC, user_id: ANNA, home_id: null, bill_id: BILL_LUCE, name: 'bolletta-luce.pdf', doc_type: 'bolletta', mime_type: 'application/pdf',
  file_size: PDF.length, storage_path: `${ANNA}/a.pdf`, sha256: null, created_at: '2026-11-01T10:00:00Z' }]);
fake.addFile('house-documents', `${ANNA}/a.pdf`, PDF, 'application/pdf');

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ locale: 'it-IT', viewport: { width: 1360, height: 900 }, acceptDownloads: true });
  await context.addInitScript(() => { try { localStorage.setItem('casainordine-language-v32', 'it'); } catch {} });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|status of 40[0-9]/.test(m.text())) errors.push(m.text()); });
  const toast = async () => (await page.locator('.toast').last().innerText().catch(() => '')).replace(/\s+/g, ' ');
  const openMenu = async () => { const closed = page.locator('nav .nav-group-head[aria-expanded="false"]'); for (let n = 0; n < 8 && await closed.count(); n++) await closed.first().click(); };
  const go = async name => { await openMenu(); await page.getByRole('button', { name, exact: true }).first().click(); await page.waitForTimeout(1200); };

  // 1. Accesso: password sbagliata, poi giusta.
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.locator('input[type=email]').fill('anna@example.org');
  await page.locator('input[type=password]').fill('password-sbagliata');
  await page.locator('.auth-card form button.btn-primary').click();
  await page.waitForTimeout(1200);
  check(await page.locator('nav .nav-group-head').count() === 0, 'con la password sbagliata non si entra');
  await page.locator('input[type=password]').fill('password-lunga-di-prova');
  await page.locator('.auth-card form button.btn-primary').click();
  check(await page.locator('nav .nav-group-head').first().waitFor({ timeout: 20000 }).then(() => true, () => false), 'con la password giusta si entra');
  check(fake.state.requests.some(r => r.path === '/rest/v1/bills'), 'l\'app legge le bollette dal database');

  // 2. Dati veri nelle sezioni.
  await go('Bollette');
  const bills = await page.locator('main').innerText();
  check(/Luce di casa/.test(bills) && /Gas di casa/.test(bills), 'le bollette del database compaiono in «Bollette»');
  await go('Archivio documenti').catch(() => {});

  // 3. Backup JSON.
  await go('Notifiche e backup');
  const [jsonDownload] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.getByRole('button', { name: 'Backup JSON' }).click()]);
  const backup = JSON.parse(readFileSync(await jsonDownload.path(), 'utf8'));
  check(backup.format === 'casa-in-ordine-backup' && backup.bills?.length === 2, 'il backup JSON contiene le 2 bollette');
  check(backup.documents?.length === 1 && !('storage_path' in backup.documents[0]), 'il backup JSON non contiene i percorsi dei file');

  // 4. Backup con i file.
  const [zipDownload] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.getByRole('button', { name: 'Backup con i file (.zip)' }).click()]);
  const entries = unzipSync(new Uint8Array(readFileSync(await zipDownload.path())));
  const zipJson = JSON.parse(strFromU8(entries['casa-in-ordine-backup.json'] || strToU8('{}')));
  check(strFromU8(entries[`files/${DOC}.pdf`] || new Uint8Array()) === PDF, 'lo .zip contiene il file del documento, uguale');
  check(zipJson.files?.length === 1 && zipJson.files[0].document_id === DOC, 'lo .zip elenca il file nel JSON');

  // 5. Si perdono una bolletta e il documento (con il file); il ripristino dallo .zip li riporta.
  fake.state.tables.bills = fake.rows('bills').filter(b => b.id !== BILL_GAS);
  fake.state.tables.home_documents = [];
  fake.state.files['house-documents'] = [];
  const zip = readFileSync(await zipDownload.path());
  await page.locator('.restore-box input[type=file]').setInputFiles({ name: 'backup.zip', mimeType: 'application/zip', buffer: zip });
  await page.locator('.restore-preview').waitFor({ timeout: 15000 }).catch(() => {});
  const preview = (await page.locator('.restore-preview').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(/Bollette: nel file 2 · già qui 1/.test(preview), `l'anteprima conta le bollette già presenti (${preview.slice(0, 80)}…)`);
  await page.getByRole('button', { name: 'Ripristina', exact: true }).click();
  await page.locator('.restore-preview [role=status]').filter({ hasText: 'Aggiunte' }).waitFor({ timeout: 20000 }).catch(() => {});
  const done = (await page.locator('.restore-preview').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(/Aggiunte: 2/.test(done), `il ripristino aggiunge la bolletta e il documento (${done.slice(-70)})`);
  check(fake.rows('bills').some(b => b.id === BILL_GAS), 'la bolletta torna con lo stesso identificativo');
  const restored = fake.rows('home_documents')[0];
  check(restored?.id === DOC && restored.storage_path?.startsWith(`${ANNA}/`), 'il documento torna, con il file nella cartella di chi ripristina');
  check(String(fake.file('house-documents', restored?.storage_path || '')?.bytes || '') === PDF, 'il file caricato è uguale all\'originale');
  check(fake.rows('bills').length === 2, 'nessuna bolletta doppia');
  await page.getByRole('button', { name: 'Chiudi', exact: true }).click().catch(() => {});

  // 6. File sbagliati.
  await page.locator('.restore-box input[type=file]').setInputFiles({ name: 'rotto.zip', mimeType: 'application/zip', buffer: Buffer.from([0x50, 0x4b, 3, 4, 1, 2, 3]) });
  await page.waitForTimeout(800);
  check(/danneggiato/.test(await toast()), 'uno .zip rovinato viene segnalato');
  await page.locator('.restore-box input[type=file]').setInputFiles({ name: 'altro.zip', mimeType: 'application/zip', buffer: Buffer.from(zipSync({ 'a.txt': strToU8('x'), 'b.txt': strToU8('y') })) });
  await page.waitForTimeout(800);
  check(/backup di Casa in Ordine/i.test(await toast()), 'uno .zip che non è un backup viene segnalato');

  // 7. Accessibilità con accesso.
  await page.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' });
  const violations = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })).violations.map(v => `${v.id}:${v.nodes.length}`));
  check(violations.length === 0, `nessuna violazione WCAG in «Notifiche e backup» con accesso ${violations.join(' ')}`);

  // 8. Uscita.
  await page.getByRole('button', { name: 'Esci', exact: true }).first().click();
  check(await page.locator('input[type=password]').waitFor({ timeout: 10000 }).then(() => true, () => false), 'dopo l\'uscita torna la schermata di accesso');
  check(errors.length === 0, `nessun errore JavaScript${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
} finally {
  await browser.close();
  await fake.close();
}
if (failures.length) { console.error(`\nProve con accesso: ${failures.length} non superate.`); process.exit(1); }
console.log('\nProve con accesso: tutte superate (accesso, dati, backup JSON e .zip, ripristino, file sbagliati, accessibilità, uscita).');

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

const fake = await startFakeSupabase({ port: PORT, lenientRpc: true, rls: true });
const LUCA = '22222222-2222-4222-8222-222222222222';
fake.addUser(ANNA, 'anna@example.org', { password: 'password-lunga-di-prova' });
fake.addUser(LUCA, 'luca@example.org', { password: 'password-di-luca-lunga' });
fake.state.rpc.v36_my_storage_used = () => 0;
fake.seed('profiles', [{ id: ANNA, email: 'anna@example.org', reminders_enabled: true, reminder_emails: true }, { id: LUCA, email: 'luca@example.org', reminders_enabled: true }]);
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
  // axe si carica di nuovo se la pagina è stata ricaricata (uscita e nuovo accesso).
  const axe = async () => {
    if (!(await page.evaluate(() => Boolean(window.axe)))) await page.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' });
    return page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })).violations.map(v => `${v.id}:${v.nodes.length}`));
  };
  const violations = await axe();
  check(violations.length === 0, `nessuna violazione WCAG in «Notifiche e backup» con accesso ${violations.join(' ')}`);

  // 7b. Stato della configurazione in Impostazioni (nella CI c'è la chiave del database, non il resto).
  await go('Impostazioni');
  await page.getByRole('button', { name: 'Controlla', exact: true }).click();
  await page.locator('.config-list').waitFor({ timeout: 10000 }).catch(() => {});
  const config = (await page.locator('.config-status').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(/Chiave del database Pronto/.test(config), 'lo stato della configurazione vede la chiave del database');
  check(/Da aggiungere su Vercel: APP_URL/.test(config) && /Manca qualcosa tra le impostazioni necessarie/.test(config), 'e dice quale variabile necessaria manca');
  check(!config.includes(process.env.SUPABASE_SECRET_KEY || 'chiave-di-servizio-finta'), 'senza mostrare il valore della chiave');
  const settingsViolations = await axe();
  check(settingsViolations.length === 0, `nessuna violazione WCAG in «Impostazioni» con accesso ${settingsViolations.join(' ')}`);
  // 7c. «Esporta calendario (.ics)»: dal 22 al 23 novembre il pulsante non faceva niente (funzione tolta per errore).
  const [icsDownload] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }).catch(() => null), page.getByRole('button', { name: 'Esporta calendario (.ics)' }).click()]);
  const ics = icsDownload ? readFileSync(await icsDownload.path(), 'utf8') : '';
  check(/^BEGIN:VCALENDAR\r\n/.test(ics) && /SUMMARY:Pagamento: (Luce|Gas) di casa/.test(ics) && /scadenze-personali\.ics$/.test(icsDownload?.suggestedFilename() || ''), '«Esporta calendario» scarica il file .ics con le bollette da pagare');

  // 7d. Avviso pagoPA della TARI con rata unica o due rate (24 novembre 2026): ente, rate proposte,
  // la scelta compila codice, importo e scadenza.
  await go('Avvisi pagoPA');
  const { AVVISI } = await import('../tests/fixtures/avvisi-pagopa.mjs');
  const pagopa = page.locator('main');
  await pagopa.getByLabel('Testo copiato', { exact: true }).fill(AVVISI[0].text);
  await pagopa.getByRole('button', { name: 'Cerca codice nel testo', exact: true }).click();
  const installments = pagopa.locator('.notice-options button');
  await installments.first().waitFor({ timeout: 5000 }).catch(() => {});
  check(await installments.count() === 3, `pagoPA: rata unica e due rate proposte (${await installments.count()})`);
  await installments.filter({ hasText: '2a RATA' }).click();
  const noticeValue = label => pagopa.getByLabel(label, { exact: true }).inputValue().catch(() => '');
  const chosen = [await noticeValue('Codice avviso (15 o 18 cifre)'), await noticeValue('Importo'), await noticeValue('Scadenza'), await noticeValue('Ente / Comune')];
  check(chosen[0] === '301234567890123472' && Number(chosen[1]) === 56 && chosen[2] === '2026-12-02' && chosen[3] === 'Comune di Torino',
    `pagoPA: la seconda rata compila codice, importo, scadenza ed ente (${chosen.join(', ')})`);

  // 8. Uscita.
  const login = async (email, password) => {
    await page.locator('input[type=email]').fill(email);
    await page.locator('input[type=password]').fill(password);
    await page.locator('.auth-card form button.btn-primary').click();
    return page.locator('nav .nav-group-head').first().waitFor({ timeout: 20000 }).then(() => true, () => false);
  };
  const logout = async () => { await page.getByRole('button', { name: 'Esci', exact: true }).first().click(); return page.locator('input[type=password]').waitFor({ timeout: 10000 }).then(() => true, () => false); };
  check(await logout(), 'dopo l\'uscita torna la schermata di accesso');

  // 9. Case condivise: Anna crea una casa e invita Luca in sola lettura; Luca accetta dal collegamento.
  check(await login('anna@example.org', 'password-lunga-di-prova'), 'Anna rientra');
  await go('Famiglia e inviti');
  await page.getByLabel('Nome nuova casa').fill('Casa al lago');
  await page.getByRole('button', { name: 'Crea casa' }).click();
  await page.waitForTimeout(1500);
  const lake = fake.rows('homes').find(h => h.name === 'Casa al lago');
  check(lake?.owner_id === ANNA && fake.rows('home_members').some(m => m.home_id === lake?.id && m.user_id === ANNA && m.role === 'owner'), 'la casa è creata e Anna ne è proprietaria');
  fake.seed('bills', [{ id: '20000000-0000-4000-8000-000000000009', user_id: ANNA, home_id: lake?.id, title: 'Acqua della casa al lago', supplier: 'Acquedotto', category: 'Acqua', amount: 40, due_date: '2026-12-28', paid_at: null, created_at: '2026-11-05T10:00:00Z' }]);
  await go('Famiglia e inviti');
  await page.getByLabel('Email della persona invitata').fill('luca@example.org');
  await page.getByLabel('Permesso').selectOption('viewer');
  await page.getByRole('button', { name: 'Genera invito' }).click();
  const inviteUrl = await page.locator('.hub-invite-url code').innerText({ timeout: 10000 }).catch(() => '');
  check(/\/\?invite=[a-f0-9]{64}$/.test(inviteUrl), 'l\'invito produce un collegamento con il codice');
  check(fake.rows('home_invites').some(i => i.email === 'luca@example.org' && i.role === 'viewer' && !('token' in i)), 'nel database c\'è l\'invito, solo con l\'impronta del codice');
  check(await logout(), 'Anna esce');

  await page.goto(`${BASE}/?invite=${inviteUrl.split('invite=')[1] || ''}`, { waitUntil: 'networkidle' });
  check(await login('luca@example.org', 'password-di-luca-lunga'), 'Luca entra dal collegamento dell\'invito');
  await go('Famiglia e inviti');
  check((await page.getByLabel('Codice invito (dal collegamento ricevuto)').inputValue()) === (inviteUrl.split('invite=')[1] || 'x'), 'il codice dell\'invito è già compilato');
  await page.getByRole('button', { name: 'Accetta invito' }).click();
  await page.waitForTimeout(1500);
  check(fake.rows('home_members').some(m => m.home_id === lake?.id && m.user_id === LUCA && m.role === 'viewer'), 'Luca è membro della casa, in sola lettura');
  check(/sola lettura a questa casa/.test(await page.locator('main').innerText()), 'l\'app dice a Luca che la casa è in sola lettura');
  await go('Bollette');
  const lucaBills = await page.locator('main').innerText();
  check(/Acqua della casa al lago/.test(lucaBills), 'Luca vede le bollette della casa');
  check(!/Luce di casa|Gas di casa/.test(lucaBills), 'e non quelle personali di Anna');
  await page.getByRole('button', { name: 'Aggiungi bolletta' }).first().click();
  await page.waitForTimeout(500);
  check(/sola lettura/.test(await toast()) && await page.locator('.modal').count() === 0, 'chi legge non può aggiungere bollette');
  await go('Famiglia e inviti');
  await page.getByRole('button', { name: 'Spazio personale', exact: true }).click();
  await page.waitForTimeout(800);
  await go('Bollette');
  const personal = await page.locator('main').innerText();
  check(!/Acqua della casa al lago|Luce di casa/.test(personal), 'nello spazio personale di Luca non c\'è niente della casa né di Anna');
  await go('Famiglia e inviti');
  const hubViolations = await axe();
  check(hubViolations.length === 0, `nessuna violazione WCAG in «Famiglia e inviti» ${hubViolations.join(' ')}`);
  check(await logout(), 'Luca esce');
  check(errors.length === 0, `nessun errore JavaScript${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
} finally {
  await browser.close();
  await fake.close();
}
if (failures.length) { console.error(`\nProve con accesso: ${failures.length} non superate.`); process.exit(1); }
console.log('\nProve con accesso: tutte superate (accesso, dati, backup JSON e .zip, ripristino, file sbagliati, stato della configurazione, case condivise e inviti, accessibilità, uscita).');

// Eliminazione dell'account nel browser (scelta dell'utente, 23 novembre 2026), contro il Supabase
// finto (vedi scripts/prove-con-accesso.mjs). Su un telefono condiviso da Anna e Luca:
// - Anna, proprietaria di una casa con altri membri, non può cancellarsi: l'app dice quale casa;
// - il pulsante si attiva solo con la propria email (maiuscole e spazi non contano);
// - Luca si cancella: esce, non può più entrare, i suoi file spariscono tranne quelli dei documenti
//   della casa di Anna (restano alla casa); dal dispositivo spariscono le sue bozze offline e le
//   copie delle schede SOS, mentre quelle di Anna e le bozze salvate senza accesso restano.
// Quello che succede nel database è provato in supabase/tests/eliminazione_account_test.sql.
// Uso: node scripts/prove-eliminazione-account.mjs [indirizzo dell'app]
import { BASE, checker, startScenario, openPage, launch } from './accesso-comune.mjs';

const { check, finish } = checker('Prove dell\'eliminazione dell\'account');
const { fake, person } = await startScenario();
const anna = person('anna', '11111111-1111-4111-8111-111111111111', 'anna@example.org');
const luca = person('luca', '22222222-2222-4222-8222-222222222222', 'luca@example.org');
const HOME = '10000000-0000-4000-8000-0000000000a5';
fake.seed('homes', [{ id: HOME, name: 'Casa al mare', owner_id: anna.id, created_at: '2026-11-01T10:00:00Z' }]);
fake.seed('home_members', [{ home_id: HOME, user_id: anna.id, email: anna.email, role: 'owner', joined_at: '2026-11-01T10:00:00Z' },
  { home_id: HOME, user_id: luca.id, email: luca.email, role: 'editor', joined_at: '2026-11-02T10:00:00Z' }]);
fake.seed('home_documents', [
  { id: 'doc-personale', user_id: luca.id, home_id: null, name: 'ricevuta.pdf', storage_path: `${luca.id}/ricevuta.pdf`, created_at: '2026-11-03T10:00:00Z' },
  { id: 'doc-casa', user_id: luca.id, home_id: HOME, name: 'caldaia.pdf', storage_path: `${luca.id}/caldaia.pdf`, created_at: '2026-11-03T10:00:00Z' }]);
fake.addFile('house-documents', `${luca.id}/ricevuta.pdf`, '%PDF-1.4 personale', 'application/pdf');
fake.addFile('house-documents', `${luca.id}/caldaia.pdf`, '%PDF-1.4 della casa', 'application/pdf');
fake.addFile('mail-bills', `${luca.id}/bolletta.pdf`, '%PDF-1.4 dalla casella', 'application/pdf');
fake.addFile('house-documents', `${anna.id}/contratto.pdf`, '%PDF-1.4 di Anna', 'application/pdf');
fake.state.rpc.get_my_storage_used = () => 0;

const SOS = 'casa-in-ordine-sos-v40:';
const browser = await launch();
try {
  const ui = await openPage(browser, { viewport: { width: 390, height: 844 }, device: { isMobile: true, hasTouch: true } });
  const { page } = ui;
  // Il dispositivo: bozze offline di Anna, di Luca e una salvata senza accesso; copie SOS di entrambi.
  await page.goto(`${BASE}/offline.html`, { waitUntil: 'networkidle' });
  await page.evaluate(async ({ anna, luca, SOS }) => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('casa-in-ordine-offline-v2', 1); r.onupgradeneeded = () => r.result.createObjectStore('drafts', { keyPath: 'id' }); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('drafts', 'readwrite'), store = tx.objectStore('drafts');
      const now = new Date().toISOString();
      store.add({ id: 'bozza-anna', type: 'task', title: 'Bozza di Anna', owner: anna, created_at: now });
      store.add({ id: 'bozza-luca', type: 'document', title: 'Foto della bolletta di Luca', file: new Blob(['jpg'], { type: 'image/jpeg' }), owner: luca, created_at: now });
      store.add({ id: 'bozza-luca-2', type: 'shopping', title: 'Pane', owner: luca, created_at: now });
      store.add({ id: 'bozza-senza-accesso', type: 'task', title: 'Scritta senza accesso', owner: null, created_at: now });
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
    db.close();
    localStorage.setItem(`${SOS}${anna}:casa`, '{"v":2}');
    localStorage.setItem(`${SOS}${luca}:casa`, '{"v":2}');
    localStorage.setItem(`${SOS}${luca}:personale`, '{"v":2}');
  }, { anna: anna.id, luca: luca.id, SOS });
  const device = () => page.evaluate(async SOS => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('casa-in-ordine-offline-v2', 1); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const drafts = await new Promise(resolve => { const r = db.transaction('drafts').objectStore('drafts').getAll(); r.onsuccess = () => resolve(r.result.map(d => d.id).sort()); });
    db.close();
    return { drafts, sos: Object.keys(localStorage).filter(k => k.startsWith(SOS)).sort(), session: Object.keys(localStorage).some(k => /^sb-.+-auth-token/.test(k)) };
  }, SOS);
  const settings = async () => { await ui.go('Impostazioni'); return page.locator('.delete-account-form'); };

  // Anna: proprietaria di una casa con Luca.
  check(await ui.login(anna), 'Anna entra');
  let form = await settings();
  const field = form.locator('input[type=email]'), button = form.locator('button');
  await field.fill('luca@example.org');
  check(await button.isDisabled(), 'con l\'email di un altro il pulsante resta spento');
  await field.fill('anna@example.org');
  check(!(await button.isDisabled()), 'con la propria email il pulsante si accende');
  await button.click();
  await page.waitForTimeout(1200);
  check(/Casa al mare/.test(await ui.toast()) && fake.state.users.has(anna.id), 'Anna non può cancellarsi finché è proprietaria di «Casa al mare» con altri membri');
  check(await ui.logout(), 'Anna esce');

  // Luca, sullo stesso telefono, si cancella.
  check(await ui.login(luca), 'Luca entra sullo stesso telefono');
  form = await settings();
  await form.locator('input[type=email]').fill('  Luca@Example.ORG ');
  await form.locator('button').click();
  check(await page.locator('input[type=password]').waitFor({ timeout: 15000 }).then(() => true, () => false), 'dopo la cancellazione torna la schermata di accesso');
  check(fake.state.deletedUsers.includes(luca.id) && !fake.state.deletedUsers.includes(anna.id), 'l\'account di Luca è cancellato, quello di Anna no');
  const files = bucket => (fake.state.files[bucket] || []).map(f => f.name).sort();
  check(!files('house-documents').includes(`${luca.id}/ricevuta.pdf`) && !files('mail-bills').length, 'i file personali di Luca e quelli delle sue caselle sono cancellati');
  check(files('house-documents').includes(`${luca.id}/caldaia.pdf`) && files('house-documents').includes(`${anna.id}/contratto.pdf`), 'restano il documento della casa di Anna e i file di Anna');
  const after = await device();
  check(JSON.stringify(after.drafts) === JSON.stringify(['bozza-anna', 'bozza-senza-accesso']), `sul telefono spariscono le bozze di Luca, restano quelle di Anna e senza accesso (${after.drafts.join(', ')})`);
  check(JSON.stringify(after.sos) === JSON.stringify([`${SOS}${anna.id}:casa`]), 'spariscono le copie SOS di Luca, resta quella di Anna');
  check(!after.session, 'nessuna sessione rimasta sul telefono');
  check(!(await ui.login(luca)), 'Luca non può più entrare');

  // Anna ritrova tutto.
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  check(await ui.login(anna), 'Anna entra di nuovo');
  await ui.go('Bozze offline');
  check(/Bozza di Anna/.test(await ui.main()), 'e ritrova la sua bozza offline');
  const violations = await ui.axe();
  check(violations.length === 0, `nessuna violazione WCAG ${violations.join(' ')}`);
  check(ui.errors.length === 0, `nessun errore JavaScript${ui.errors.length ? ': ' + ui.errors.slice(0, 3).join(' | ') : ''}`);
} finally {
  await browser.close();
  await fake.close();
}
finish();

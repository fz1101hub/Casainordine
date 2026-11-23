// Offline con accesso (scelta dell'utente, 23 novembre 2026), contro il Supabase finto (vedi
// scripts/prove-con-accesso.mjs). Le bozze si scrivono nella pagina offline (/offline.html, salvate
// solo in questo browser) e si importano dall'app in «Bozze offline»: devono arrivare una volta
// sola, nello spazio giusto, e ognuno deve vedere solo le proprie.
// Il funzionamento senza rete del service worker non si prova qui: si registra solo in https.
// Uso: node scripts/prove-offline-accesso.mjs [indirizzo dell'app]
import { BASE, checker, startScenario, openPage, launch } from './accesso-comune.mjs';

const { check, finish } = checker('Prove offline con accesso');
const { fake, person } = await startScenario();
const anna = person('anna', '11111111-1111-4111-8111-111111111111', 'anna@example.org');
const luca = person('luca', '22222222-2222-4222-8222-222222222222', 'luca@example.org');
const HOME = '10000000-0000-4000-8000-0000000000cc';
fake.seed('homes', [{ id: HOME, name: 'Casa al mare', owner_id: anna.id, created_at: '2026-11-01T10:00:00Z' }]);
fake.seed('home_members', [{ home_id: HOME, user_id: anna.id, email: anna.email, role: 'owner', joined_at: '2026-11-01T10:00:00Z' }]);

const browser = await launch();
try {
  const ui = await openPage(browser);
  const { page } = ui;
  const draftsText = async () => (await page.locator('.extra-panel').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
  const draftRow = title => page.locator('.extra-panel .extra-item, .extra-panel li, .extra-panel > div').filter({ hasText: title }).last();

  check(await ui.login(anna), 'Anna entra');
  // Bozze scritte nella pagina offline, come senza rete.
  await page.goto(`${BASE}/offline.html`, { waitUntil: 'networkidle' });
  await page.locator('#title').fill('Chiamare l\'idraulico');
  await page.locator('#add').click();
  await page.locator('#shopping').fill('Latte');
  await page.locator('#buy').click();
  await page.waitForTimeout(600);
  // Una bozza di un altro account sullo stesso dispositivo (telefono condiviso).
  await page.evaluate(async owner => {
    await new Promise((resolve, reject) => {
      const req = indexedDB.open('casa-in-ordine-offline-v2', 1);
      req.onsuccess = () => { const tx = req.result.transaction('drafts', 'readwrite'); tx.objectStore('drafts').add({ id: crypto.randomUUID(), type: 'task', title: 'Bozza di Luca', date: null, file: null, owner, created_at: new Date().toISOString() }); tx.oncomplete = () => { req.result.close(); resolve(); }; tx.onerror = () => reject(tx.error); };
      req.onerror = () => reject(req.error);
    });
  }, luca.id);

  // Di nuovo nell'app: importazione.
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.locator('nav .nav-group-head').first().waitFor({ timeout: 20000 });
  await ui.go('Bozze offline');
  let drafts = await draftsText();
  check(/Chiamare l'idraulico/.test(drafts) && /Latte/.test(drafts), 'le bozze di Anna compaiono in «Bozze offline»');
  check(!/Bozza di Luca/.test(drafts), 'la bozza di un altro account sullo stesso dispositivo non compare');
  const shoppingButton = page.getByRole('button', { name: 'Importa nella casa attiva' });
  check(await shoppingButton.isDisabled(), 'nello spazio personale l\'articolo della spesa non si importa (serve una casa)');
  // Lettura e scrittura diretta delle bozze (la CSP dell'app vieta new Function: niente codice passato come testo).
  const idb = (op, arg) => page.evaluate(([o, a]) => new Promise((resolve, reject) => {
    const req = indexedDB.open('casa-in-ordine-offline-v2', 1);
    req.onsuccess = () => {
      const tx = req.result.transaction('drafts', 'readwrite'); const store = tx.objectStore('drafts'); let out;
      const r = o === 'all' ? store.getAll() : store.add(a);
      r.onsuccess = () => { out = r.result; };
      tx.oncomplete = () => { req.result.close(); resolve(out); }; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  }), [op, arg]);
  const taskDraft = (await idb('all')).find(d => d.title === 'Chiamare l\'idraulico');
  await page.getByRole('button', { name: 'Importa attività personale' }).click();
  await page.waitForTimeout(1200);
  let tasks = fake.rows('house_tasks').filter(t => t.title === 'Chiamare l\'idraulico');
  check(tasks.length === 1 && tasks[0].user_id === anna.id && tasks[0].home_id === null, 'l\'attività arriva una volta, nello spazio personale di Anna');
  drafts = await draftsText();
  check(!/Chiamare l'idraulico/.test(drafts), 'e la bozza importata sparisce dal dispositivo');
  // La stessa bozza di nuovo (per esempio rimasta in un'altra scheda): importarla non la duplica.
  await idb('add', taskDraft);
  await page.getByRole('button', { name: 'Aggiorna elenco' }).click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Importa attività personale' }).click();
  await page.waitForTimeout(1200);
  tasks = fake.rows('house_tasks').filter(t => t.title === 'Chiamare l\'idraulico');
  check(tasks.length === 1 && /senza duplicati/.test(await ui.toast()), 'importare di nuovo la stessa bozza non crea un doppione');

  // L'articolo della spesa va nella casa attiva.
  await ui.go('Famiglia e inviti');
  await page.getByRole('button', { name: /Casa al mare/ }).first().click();
  await page.waitForTimeout(1200);
  await ui.go('Bozze offline');
  await page.getByRole('button', { name: 'Importa nella casa attiva' }).click();
  await ui.confirm();
  await page.waitForTimeout(800);
  const shopping = fake.rows('home_shopping').filter(s => s.title === 'Latte');
  check(shopping.length === 1 && shopping[0].home_id === HOME, 'l\'articolo arriva una volta, nella lista della casa');
  drafts = await draftsText();
  check(!/Latte/.test(drafts) && /Nessuna bozza offline/.test(drafts), 'e non restano bozze di Anna');
  const log = fake.rows('offline_import_log');
  check(log.length === 2 && new Set(log.map(l => l.client_id)).size === 2, 'ogni bozza ha il suo codice, registrato una volta');
  const violations = await ui.axe();
  check(violations.length === 0, `nessuna violazione WCAG in «Bozze offline» ${violations.join(' ')}`);
  check(await ui.logout(), 'Anna esce');

  // Luca, sullo stesso dispositivo, vede solo la sua bozza.
  check(await ui.login(luca), 'Luca entra sullo stesso dispositivo');
  await ui.go('Bozze offline');
  drafts = await draftsText();
  check(/Bozza di Luca/.test(drafts) && !/Latte|idraulico/.test(drafts), 'Luca vede solo la sua bozza');
  await page.getByRole('button', { name: 'Importa attività personale' }).click();
  await page.waitForTimeout(1200);
  check(fake.rows('house_tasks').some(t => t.title === 'Bozza di Luca' && t.user_id === luca.id), 'e la importa nel suo spazio');
  check(ui.errors.length === 0, `nessun errore JavaScript${ui.errors.length ? ': ' + ui.errors.slice(0, 3).join(' | ') : ''}`);
} finally {
  await browser.close();
  await fake.close();
}
finish();

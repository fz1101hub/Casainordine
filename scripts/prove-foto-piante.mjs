// Foto e diario delle piante (scelta dell'utente del 25 novembre 2026, sera), nel browser con accesso
// e il Supabase finto. Il giorno è fisso, 25 novembre 2026:
// 1. foto di una pianta con data e didascalia: nell'archivio dello spazio e nella galleria, si vede;
// 2. nota di diario con una foto: la foto è legata alla riga del registro e compare accanto;
// 3. foto eliminata: via anche il file e il documento dell'archivio;
// 4. sul telefono (360 px) niente esce dallo schermo; accessibilità (axe); nessun errore.
// Uso: node scripts/prove-foto-piante.mjs [http://localhost:3000]
import { checker, startScenario, openPage, launch } from './accesso-comune.mjs';
import { translate } from '../lib/i18n.mjs';

const { check, finish } = checker('Foto e diario delle piante');
const tr = (key, params) => translate('it', key, params);
const ANNA = '11111111-1111-4111-8111-111111111111';

const { fake, person } = await startScenario({ tokenTtl: 3 * 86400 });
const anna = person('anna', ANNA, 'anna@example.org');
fake.seed('home_garden_plants', [{ id: 'plant-lemon', user_id: ANNA, home_id: null, name: 'Limone', kind: 'fruit', location: 'Terrazzo', notes: '', preset: null }]);
const browser = await launch();
const ui = await openPage(browser);
const { page } = ui;
await page.clock.setFixedTime(new Date('2026-11-25T09:00:00Z'));
const main = page.locator('main');
const overflow = () => page.evaluate(() => document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth);
// Una foto JPEG vera, disegnata nel browser.
const jpeg = async color => Buffer.from((await page.evaluate(c => { const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480; const g = canvas.getContext('2d'); g.fillStyle = c; g.fillRect(0, 0, 640, 480); return canvas.toDataURL('image/jpeg', 0.8); }, color)).split(',')[1], 'base64');

try {
  check(await ui.login(anna), 'Anna entra');
  await ui.go(tr('nav.garden'));
  const box = page.locator('.garden-plant').filter({ hasText: 'Limone' }).first();
  if (!(await box.getAttribute('open').then(v => v !== null).catch(() => false))) await box.locator('summary').click();
  // Il contenuto della scheda si disegna quando la si apre.
  await box.locator('.garden-plant-body').waitFor({ timeout: 5000 }).catch(() => {});
  check((await box.innerText()).includes(tr('garden.photosEmpty').slice(0, 20)), 'senza foto la scheda spiega a cosa servono');

  // 1. Foto con data e didascalia.
  await box.getByRole('button', { name: tr('garden.addPhoto') }).click();
  await box.getByLabel(tr('garden.photoDate'), { exact: true }).fill('2026-11-20');
  await box.getByLabel(tr('garden.photoCaption'), { exact: true }).fill('Foglie gialle');
  await box.locator('.garden-inline input[type=file]').setInputFiles({ name: 'limone.jpg', mimeType: 'image/jpeg', buffer: await jpeg('#3a7d2c') });
  await page.waitForTimeout(1500);
  const photo = fake.rows('home_garden_photos').find(f => f.plant_id === 'plant-lemon');
  const document = photo && fake.rows('home_documents').find(d => d.id === photo.document_id);
  check(photo?.taken_on === '2026-11-20' && photo?.caption === 'Foglie gialle' && !photo?.log_id, 'foto salvata con data e didascalia');
  check(Boolean(document) && document.home_id === null && document.mime_type === 'image/jpeg' && (fake.state.files['house-documents'] || []).some(f => f.name === document.storage_path), 'la foto è nell\'archivio dello spazio, con il file');
  const img = box.locator('.garden-photos img').first();
  await img.waitFor({ timeout: 5000 }).catch(() => {});
  check(await img.evaluate(el => el.complete && el.naturalWidth > 0).catch(() => false), 'la miniatura si vede (collegamento temporaneo)');
  check(await img.getAttribute('alt') === tr('garden.photoAlt', { plant: 'Limone', date: '20 nov 2026' }), 'la miniatura ha un testo alternativo con pianta e data');
  check(/20 nov 2026 · Foglie gialle/.test(await box.locator('.garden-photos').innerText()), 'data e didascalia sotto la foto');

  // 2. Nota di diario con foto.
  await box.getByRole('button', { name: tr('garden.addNote') }).click();
  check(await box.getByLabel(tr('garden.taskKind')).inputValue() === 'note', 'il diario apre il registro con il tipo «Nota di diario»');
  await box.getByLabel(tr('garden.taskTitle'), { exact: true }).fill('Ripresa dopo il rame');
  await box.getByLabel(tr('garden.notes'), { exact: true }).fill('Foglie nuove verdi.');
  await box.getByLabel(tr('garden.logPhoto'), { exact: true }).setInputFiles({ name: 'dopo.jpg', mimeType: 'image/jpeg', buffer: await jpeg('#6fbf4a') });
  await box.getByRole('button', { name: tr('garden.logSave') }).click();
  await page.waitForTimeout(1800);
  const note = fake.rows('home_garden_log').find(l => l.title === 'Ripresa dopo il rame');
  const notePhoto = note && fake.rows('home_garden_photos').find(f => f.log_id === note.id);
  check(note?.kind === 'note' && note?.notes === 'Foglie nuove verdi.', 'nota di diario nel registro');
  check(notePhoto?.plant_id === 'plant-lemon' && notePhoto?.taken_on === '2026-11-25' && notePhoto?.caption === 'Ripresa dopo il rame', 'la foto è legata alla nota, con la sua data');
  check(await box.locator('.garden-log .project-photo-row img').count() === 1, 'la foto compare accanto alla nota nel registro');
  check(await box.locator('.garden-photos figure').count() === 2, 'la galleria della pianta ha le due foto');

  // 3. Foto eliminata con il suo file.
  await box.getByRole('button', { name: tr('garden.deletePhotoAria', { date: '20 nov 2026' }) }).click();
  await ui.confirm();
  await page.waitForTimeout(1000);
  check(!fake.rows('home_documents').some(d => d.id === photo.document_id), 'eliminata: via il documento dell\'archivio');
  check(fake.state.removed.includes(`house-documents/${document.storage_path}`), 'eliminata: via il file');
  check(await box.locator('.garden-photos figure').count() === 1, 'nella galleria resta una foto');

  // 4. Telefono e accessibilità.
  await page.setViewportSize({ width: 360, height: 780 });
  await page.waitForTimeout(300);
  check(await overflow() <= 1, `sul telefono niente esce dallo schermo (${await overflow()} px)`);
  const violations = await ui.axe();
  check(!violations.length, `accessibilità (${violations.join(', ')})`);
  check(!ui.errors.length, `nessun errore nella pagina ${ui.errors.slice(0, 3).join(' | ')}`);
} finally { await ui.context.close(); await browser.close(); await fake.close(); }
finish();

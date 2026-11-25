// Spese detraibili per il 730 (scelta dell'utente del 25 novembre 2026, sera), nel browser con
// accesso e il Supabase finto. Il giorno è fisso, 25 novembre 2026:
// 1. spesa scritta a mano (caldaia) con bonifico «parlante», partita IVA e fattura allegata;
// 2. spese prese dalle bollette, dai lavori e dal veterinario, con il tipo scelto; una volta sola;
// 3. cosa controllare (contanti per il veterinario), riepilogo per tipo, regola dell'anno;
// 4. CSV per il commercialista; voce cambiata ed eliminata; altro anno;
// 5. sul telefono (360 px) niente esce dallo schermo; accessibilità (axe); nessun errore.
// Uso: node scripts/prove-spese-detraibili.mjs [http://localhost:3000]
import { checker, startScenario, openPage, launch } from './accesso-comune.mjs';
import { translate } from '../lib/i18n.mjs';

const { check, finish } = checker('Spese detraibili');
const tr = (key, params) => translate('it', key, params);
const ANNA = '11111111-1111-4111-8111-111111111111';

const { fake, person } = await startScenario({ tokenTtl: 3 * 86400 });
const anna = person('anna', ANNA, 'anna@example.org');
fake.seed('bills', [
  { id: 'bill-1', user_id: ANNA, home_id: null, title: 'Visita oculistica', supplier: 'Studio Rossi', amount: 120, due_date: '2026-03-10', paid_at: '2026-03-12T09:00:00Z', category: 'Altro' },
  { id: 'bill-2', user_id: ANNA, home_id: null, title: 'Luce', supplier: 'Enel', amount: 80, due_date: '2026-12-10', paid_at: null, category: 'Luce' },
]);
fake.seed('home_projects', [{ id: 'proj-1', user_id: ANNA, home_id: null, title: 'Bagno nuovo', status: 'doing' }]);
fake.seed('home_project_expenses', [{ id: 'pexp-1', project_id: 'proj-1', description: 'Idraulico', amount: 1500, paid_on: '2026-05-10', document_id: null }]);
fake.seed('home_pets', [{ id: 'pet-1', user_id: ANNA, home_id: null, name: 'Fido', species: 'dog' }]);
fake.seed('home_pet_log', [{ id: 'plog-1', pet_id: 'pet-1', title: 'Vaccino', kind: 'vaccine', cost_cents: 6500, done_on: '2026-03-01', document_id: null }]);
const browser = await launch();
const ui = await openPage(browser);
const { page } = ui;
await page.clock.setFixedTime(new Date('2026-11-25T09:00:00Z'));
const main = page.locator('main');
const rows = () => fake.rows('home_tax_items');
const overflow = () => page.evaluate(() => document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth);
const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

try {
  check(await ui.login(anna), 'Anna entra');
  await ui.go(tr('nav.taxes'));
  check((await ui.main()).includes(tr('taxes.disclaimer').slice(0, 40)), 'avviso: non è una consulenza fiscale');
  check(await main.getByLabel(tr('taxes.year')).inputValue() === '2026', 'parte dall\'anno in corso');

  // 1. Spesa scritta a mano.
  await main.getByRole('button', { name: tr('taxes.add') }).click();
  await main.getByLabel(tr('taxes.categoryLabel')).selectOption('energy');
  check((await ui.main()).includes(tr('taxes.rule.energy.2026').slice(0, 40)), 'la regola del tipo scelto per il 2026');
  await main.getByLabel(tr('taxes.amount'), { exact: true }).fill('3.500,50');
  await main.getByLabel(tr('taxes.description'), { exact: true }).fill('Caldaia a condensazione');
  await main.getByLabel(tr('taxes.paidOn'), { exact: true }).fill('2026-04-10');
  await main.getByLabel(tr('taxes.supplier'), { exact: true }).fill('Termo Srl');
  await main.getByLabel(tr('taxes.taxCode'), { exact: true }).fill('0636339100');
  check((await ui.main()).includes(tr('taxes.taxCodeCheck').slice(0, 30)), 'partita IVA incompleta: avviso');
  await main.getByLabel(tr('taxes.taxCode'), { exact: true }).fill('06363391001');
  await main.getByLabel(tr('taxes.document'), { exact: true }).setInputFiles({ name: 'fattura-caldaia.pdf', mimeType: 'application/pdf', buffer: pdf });
  await main.getByRole('button', { name: tr('taxes.save') }).click();
  await page.waitForTimeout(1500);
  const boiler = rows().find(r => r.description === 'Caldaia a condensazione');
  check(boiler?.amount_cents === 350050 && boiler?.category === 'energy' && boiler?.payment_method === 'tax_transfer' && boiler?.tax_year === 2026 && boiler?.supplier_tax_code === '06363391001' && boiler?.source === 'manual',
    `spesa salvata in centesimi, con bonifico parlante e partita IVA (${JSON.stringify({ c: boiler?.amount_cents, m: boiler?.payment_method })})`);
  check(Boolean(boiler?.document_id) && fake.rows('home_documents').some(d => d.id === boiler.document_id && d.name === 'fattura-caldaia.pdf'), 'fattura nell\'archivio, collegata');

  // 2. Dalle tue spese.
  await main.getByRole('button', { name: tr('taxes.fromExpenses') }).click();
  const list = main.locator('.taxes-candidates li');
  await list.first().waitFor({ timeout: 5000 }).catch(() => {});
  check(await list.count() === 3, `tre spese del 2026 da cui partire (${await list.count()})`);
  await main.getByLabel(tr('taxes.categoryFor', { description: 'Studio Rossi · Visita oculistica' })).selectOption('medical');
  await main.getByRole('button', { name: tr('taxes.addCandidateAria', { description: 'Studio Rossi · Visita oculistica' }) }).click();
  await page.waitForTimeout(800);
  await main.getByRole('button', { name: tr('taxes.addCandidateAria', { description: 'Bagno nuovo · Idraulico' }) }).click();
  await page.waitForTimeout(800);
  await main.getByRole('button', { name: tr('taxes.addCandidateAria', { description: 'Fido · Vaccino' }) }).click();
  await page.waitForTimeout(800);
  const eye = rows().find(r => r.source === 'bill'), plumber = rows().find(r => r.source === 'project_expense'), vet = rows().find(r => r.source === 'pet_log');
  check(eye?.source_id === 'bill-1' && eye?.category === 'medical' && eye?.amount_cents === 12000 && eye?.paid_on === '2026-03-12', 'visita dalle bollette, come spesa sanitaria');
  check(plumber?.source_id === 'pexp-1' && plumber?.category === 'renovation' && plumber?.payment_method === 'tax_transfer', 'idraulico dai lavori, come ristrutturazione');
  check(vet?.source_id === 'plog-1' && vet?.category === 'veterinary' && vet?.amount_cents === 6500, 'vaccino dal veterinario');
  check(await list.count() === 0, 'segnate: non sono più nell\'elenco');

  // 3. Da controllare e riepilogo.
  const vetRow = main.locator('.taxes-items li').filter({ hasText: 'Fido · Vaccino' });
  await vetRow.getByRole('button', { name: tr('taxes.editAria', { description: 'Fido · Vaccino' }) }).click();
  await main.getByLabel(tr('taxes.paymentLabel')).selectOption('cash');
  await main.getByRole('button', { name: tr('taxes.save') }).click();
  await page.waitForTimeout(1000);
  check(rows().find(r => r.id === vet.id)?.payment_method === 'cash', 'pagamento cambiato in contanti');
  check((await vetRow.innerText()).includes(tr('taxes.warning.traceable').slice(0, 30)), 'contanti dal veterinario: da controllare');
  const summary = main.locator('.taxes-summary');
  check(/Risparmio energetico \(ecobonus\)[\s\S]*3500,50/.test(await summary.innerText()), 'riepilogo per tipo con il totale');
  // 3500,50 + 120 + 1500 + 65 = 5185,50 €
  check(/5\.?185,50/.test(await main.locator('.taxes-total').innerText()), `totale dell'anno (${(await main.locator('.taxes-total').innerText()).replace(/\s+/g, ' ')})`);

  // 4. CSV, elimina, altro anno.
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }), main.getByRole('button', { name: tr('taxes.exportCsv') }).click()]);
  const csv = (await (await download.createReadStream()).toArray()).map(b => b.toString('utf8')).join('');
  check(download.suggestedFilename() === 'spese-detraibili-2026.csv' && csv.includes('Caldaia a condensazione;3500,50') && csv.includes('fattura-caldaia.pdf'), 'CSV per il commercialista con le voci dell\'anno');
  await main.getByRole('button', { name: tr('taxes.deleteAria', { description: 'Fido · Vaccino' }) }).click();
  await ui.confirm();
  await page.waitForTimeout(800);
  check(!rows().some(r => r.id === vet.id) && fake.rows('home_pet_log').some(l => l.id === 'plog-1'), 'tolta dalle detraibili, la spesa del veterinario resta');
  await main.getByLabel(tr('taxes.year')).selectOption('2025');
  check((await ui.main()).includes(tr('taxes.summaryEmpty')), '2025: niente spese segnate');
  await main.getByLabel(tr('taxes.year')).selectOption('2026');

  // 5. Telefono e accessibilità.
  await page.setViewportSize({ width: 360, height: 780 });
  await main.getByRole('button', { name: tr('taxes.fromExpenses') }).click();
  await page.waitForTimeout(800);
  check(await overflow() <= 1, `sul telefono niente esce dallo schermo (${await overflow()} px)`);
  const violations = await ui.axe();
  check(!violations.length, `accessibilità (${violations.join(', ')})`);
  check(!ui.errors.length, `nessun errore nella pagina ${ui.errors.slice(0, 3).join(' | ')}`);
} finally { await ui.context.close(); await browser.close(); await fake.close(); }
finish();

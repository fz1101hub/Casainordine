// Giardino e orto (richiesta dell'utente del 25 novembre 2026), nel browser con accesso e il
// Supabase finto (vedi scripts/prove-con-accesso.mjs). Il giorno è fisso, 25 novembre 2026:
// 1. nuova pianta dalla proposta «Limone e altri agrumi»: un intervento tolto, uno cambiato prima di salvare;
// 2. «Da fare»: fatto (registro e prossima data) e rimanda di una settimana;
// 3. intervento nuovo con i mesi scelti; voce del registro con l'intervento del piano;
// 4. la proposta tolta si riaggiunge dopo; modifica e cancellazioni;
// 5. sul telefono (360 px) niente esce dallo schermo, anche con i moduli aperti; accessibilità (axe).
// I menu a tendina si cercano senza «exact»: il loro nome accessibile comprende la voce scelta.
// Uso: node scripts/prove-giardino.mjs [http://localhost:3000]
import { checker, startScenario, openPage, launch } from './accesso-comune.mjs';
import { translate } from '../lib/i18n.mjs';

const { check, finish } = checker('Giardino e orto');
const tr = (key, params) => translate('it', key, params);
const ANNA = '11111111-1111-4111-8111-111111111111';

// Token di tre giorni: l'orologio del browser è fermo al 25 novembre 2026 alle 10, anche se la prova
// gira prima (in un altro fuso) o dopo.
const { fake, person } = await startScenario({ tokenTtl: 3 * 86400 });
const anna = person('anna', ANNA, 'anna@example.org');
const browser = await launch();
const ui = await openPage(browser);
const { page } = ui;
await page.clock.setFixedTime(new Date('2026-11-25T09:00:00Z'));
const main = page.locator('main');
const plantRow = name => fake.rows('home_garden_plants').find(p => p.name === name);
const tasksOf = id => fake.rows('home_garden_tasks').filter(t => t.plant_id === id);
const overflow = () => page.evaluate(() => document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth);

try {
  check(await ui.login(anna), 'Anna entra');
  await ui.go(tr('nav.garden'));
  check(/Ancora nessuna pianta/.test(await ui.main()), 'senza piante la sezione spiega come cominciare');

  // 1. Proposta per il limone: si toglie il riparo dal freddo, si cambia la concimazione.
  await main.getByLabel(tr('garden.preset')).selectOption('citrus');
  const name = main.getByLabel(tr('garden.name'), { exact: true });
  check(await name.inputValue() === 'Limone e altri agrumi', 'il nome si riempie con il tipo di pianta');
  const proposal = main.locator('.garden-proposal li');
  check(await proposal.count() === 6, `sei interventi proposti (${await proposal.count()})`);
  await name.fill('Limone sul terrazzo');
  await main.getByLabel(tr('garden.location'), { exact: true }).fill('Terrazzo');
  await main.getByRole('checkbox', { name: tr('garden.useTask', { title: 'Riparo dal freddo' }) }).uncheck();
  const feed = proposal.filter({ hasText: 'Concime per agrumi con microelementi' });
  await feed.getByRole('button', { name: tr('garden.change') }).click();
  await feed.getByLabel(tr('garden.every')).selectOption('15');
  await feed.getByLabel(tr('garden.dose'), { exact: true }).fill('30 g per pianta');
  // Mesi: si toglie ottobre.
  await feed.getByRole('button', { name: 'ott', exact: true }).click();
  const save = main.getByRole('button', { name: tr('garden.savePlantWith', { count: 5 }) });
  check(await save.count() === 1, 'il pulsante dice quanti interventi si salvano (5)');
  await save.click();
  await page.waitForTimeout(1200);
  const lemon = plantRow('Limone sul terrazzo');
  const plan = lemon ? tasksOf(lemon.id) : [];
  const feeding = plan.find(t => t.product === 'Concime per agrumi con microelementi');
  check(lemon?.preset === 'citrus' && lemon?.kind === 'fruit' && lemon?.location === 'Terrazzo' && plan.length === 5,
    `pianta salvata con il suo piano (${plan.length} interventi)`);
  check(feeding?.every_days === 15 && feeding?.dose === '30 g per pianta' && String(feeding?.months) === '3,4,5,6,7,8,9' && feeding?.next_on === '2027-03-01',
    `la concimazione cambiata: ogni 15 giorni, dose, marzo–settembre, prossima ${feeding?.next_on}`);
  check(!plan.some(t => t.title === 'Riparo dal freddo'), 'l\'intervento tolto non c\'è');
  const copper = plan.find(t => t.product?.startsWith('Rame'));
  check(copper?.next_on === '2026-11-25', `il trattamento con il rame di ottobre–novembre è da fare oggi (${copper?.next_on})`);

  // 2. Da fare: fatto e rimanda.
  const agenda = main.locator('.garden-due');
  check(await agenda.filter({ hasText: copper?.title || '—' }).count() === 1, '«Da fare» mostra il trattamento di oggi');
  await main.getByRole('button', { name: tr('garden.doneAria', { title: copper.title, plant: 'Limone sul terrazzo' }) }).first().click();
  await page.waitForTimeout(1000);
  const copperAfter = tasksOf(lemon.id).find(t => t.id === copper.id);
  const logged = fake.rows('home_garden_log').find(l => l.task_id === copper.id);
  check(copperAfter?.last_done_on === '2026-11-25' && copperAfter?.next_on === '2027-10-01', `fatto: prossima volta il ${copperAfter?.next_on}`);
  check(logged?.done_on === '2026-11-25' && logged?.product === copper.product && logged?.plant_id === lemon.id, 'fatto: scritto nel registro con il prodotto');
  check(/Prossima volta: 1 ott 2027/.test(await ui.toast()), `l'avviso dice la prossima volta (${await ui.toast()})`);

  // 3. Intervento nuovo (novembre e dicembre, ogni 7 giorni) e rimanda.
  await page.locator('.garden-plant summary').filter({ hasText: 'Limone sul terrazzo' }).click().catch(() => {});
  const box = page.locator('.garden-plant').filter({ hasText: 'Limone sul terrazzo' });
  if (!(await box.getAttribute('open').then(v => v !== null).catch(() => false))) await box.locator('summary').click();
  await box.getByRole('button', { name: tr('garden.addTask') }).first().click();
  const add = box.locator('form.garden-inline');
  await add.getByLabel(tr('garden.taskKind')).selectOption('treatment');
  await add.getByLabel(tr('garden.taskTitle'), { exact: true }).fill('Controllo della cocciniglia');
  await add.getByRole('button', { name: 'nov', exact: true }).click();
  await add.getByRole('button', { name: 'dic', exact: true }).click();
  await add.getByLabel(tr('garden.every')).selectOption('7');
  await add.getByRole('button', { name: tr('garden.saveTask') }).click();
  await page.waitForTimeout(1000);
  const check7 = tasksOf(lemon.id).find(t => t.title === 'Controllo della cocciniglia');
  check(check7?.kind === 'treatment' && String(check7?.months) === '11,12' && check7?.every_days === 7 && check7?.next_on === '2026-11-25', 'intervento nuovo salvato, da fare oggi');
  await main.getByRole('button', { name: tr('garden.postponeAria', { title: 'Controllo della cocciniglia', plant: 'Limone sul terrazzo' }) }).click();
  await page.waitForTimeout(800);
  check(tasksOf(lemon.id).find(t => t.id === check7?.id)?.next_on === '2026-12-02', 'rimandato di una settimana');

  // Registro: concimazione fatta il 15 settembre, con l'intervento del piano.
  await box.getByRole('button', { name: tr('garden.logAdd') }).first().click();
  const entry = box.locator('form.garden-inline');
  await entry.getByLabel(tr('garden.logDate'), { exact: true }).fill('2026-09-15');
  await entry.getByLabel(tr('garden.task')).selectOption(feeding.id);
  check(await entry.getByLabel(tr('garden.product'), { exact: true }).inputValue() === feeding.product, 'scegliendo l\'intervento del piano il prodotto si riempie');
  await entry.getByRole('button', { name: tr('garden.logSave') }).click();
  await page.waitForTimeout(1000);
  const feedingAfter = tasksOf(lemon.id).find(t => t.id === feeding.id);
  check(fake.rows('home_garden_log').some(l => l.task_id === feeding.id && l.done_on === '2026-09-15'), 'voce del registro scritta');
  check(feedingAfter?.last_done_on === '2026-09-15' && feedingAfter?.next_on === '2027-03-01', `l'intervento del piano ricorda l'ultima volta (${feedingAfter?.last_done_on}, prossima ${feedingAfter?.next_on})`);

  // 4. La proposta tolta si riaggiunge; modifica della pianta; cancellazioni.
  const missing = box.getByRole('button', { name: tr('garden.addMissing', { count: 1 }) });
  check(await missing.count() === 1, '«Aggiungi la proposta che manca» c\'è');
  await missing.click();
  await box.getByRole('button', { name: tr('garden.addSelected', { count: 1 }) }).click();
  await page.waitForTimeout(1000);
  check(tasksOf(lemon.id).some(t => t.title === 'Riparo dal freddo'), 'la proposta tolta prima ora è nel piano');

  // 5. Telefono: niente esce dallo schermo con moduli e proposte aperti.
  await page.setViewportSize({ width: 360, height: 780 });
  await box.getByRole('button', { name: tr('garden.logAdd') }).first().click();
  await main.getByLabel(tr('garden.preset')).selectOption('tomato');
  await main.locator('.garden-proposal li').first().getByRole('button', { name: tr('garden.change') }).click();
  await page.waitForTimeout(500);
  check(await overflow() <= 1, `sul telefono niente esce dallo schermo (${await overflow()} px)`);
  const violations = await ui.axe();
  check(!violations.length, `accessibilità: nessuna violazione WCAG (${violations.join(', ')})`);
  await page.setViewportSize({ width: 1360, height: 900 });
  await main.getByRole('button', { name: tr('garden.cancel') }).first().click();

  await box.getByRole('button', { name: tr('garden.deleteTaskAria', { title: 'Controllo della cocciniglia' }) }).click();
  await ui.confirm();
  check(!tasksOf(lemon.id).some(t => t.title === 'Controllo della cocciniglia'), 'intervento tolto dal piano');
  await box.getByRole('button', { name: tr('garden.editPlantAria', { name: 'Limone sul terrazzo' }) }).click();
  await main.getByLabel(tr('garden.name'), { exact: true }).fill('Limone in vaso');
  await main.getByRole('button', { name: tr('garden.update') }).click();
  await page.waitForTimeout(800);
  check(Boolean(plantRow('Limone in vaso')), 'nome della pianta cambiato');
  await page.locator('.garden-plant').filter({ hasText: 'Limone in vaso' }).getByRole('button', { name: tr('garden.deletePlantAria', { name: 'Limone in vaso' }) }).click();
  await ui.confirm();
  check(!fake.rows('home_garden_plants').length, 'pianta eliminata');
  check(!ui.errors.length, `nessun errore nella pagina ${ui.errors.slice(0, 3).join(' | ')}`);
} finally { await ui.context.close(); await browser.close(); fake.close(); }
finish();

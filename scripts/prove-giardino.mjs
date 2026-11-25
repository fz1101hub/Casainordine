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

  // 6. Seconda parte (25 novembre 2026): clima, orto, prodotti e sicurezza, calendario.
  // Nell'aiuola 1 l'anno scorso c'erano i pomodori; nelle Scorte c'è il rame.
  fake.seed('home_garden_plants', [{ id: 'old-tomatoes', user_id: ANNA, home_id: null, name: 'Pomodori 2025', preset: 'tomato', kind: 'vegetable',
    location: '', notes: '', planted_on: '2025-04-20', harvest_days: 75, bed: 'Aiuola 1', family: 'solanaceae', ended_on: '2025-09-30', created_at: '2025-04-20T10:00:00Z' }]);
  fake.seed('home_stock_items', [{ id: 'stock-copper', user_id: ANNA, home_id: null, name: 'Rame in polvere', unit: 'kg', quantity: 0.2, threshold: 0.1, usual_buy: 1, location: '' }]);
  // «−» delle Scorte come nel database (v46_adjust_stock): tra 0 e 100.000.
  fake.state.rpc.v46_adjust_stock = ({ p_item, p_delta }, state) => {
    const item = (state.tables.home_stock_items || []).find(s => s.id === p_item);
    item.quantity = Math.min(100000, Math.max(0, Math.round((Number(item.quantity) + Number(p_delta)) * 100) / 100));
    return item.quantity;
  };
  await ui.go(tr('nav.dashboard'));
  await ui.go(tr('nav.garden'));
  // Clima rigido: le proposte si spostano (rame dell'olivo aprile–maggio e settembre–ottobre).
  await main.getByLabel(tr('garden.climate')).selectOption('cold');
  await page.waitForTimeout(800);
  check(fake.rows('home_seasonal_settings').some(r => r.climate === 'cold'), 'il clima della zona si salva (lo stesso del Programma stagionale)');
  await main.getByLabel(tr('garden.preset')).selectOption('olive');
  const oliveCopper = main.locator('.garden-proposal li').filter({ hasText: 'Rame' });
  check(/apr–mag, set–ott/.test(await oliveCopper.innerText()), `con inverni rigidi il rame dell'olivo è ad aprile–maggio e settembre–ottobre (${(await oliveCopper.innerText()).split('\n')[1] || ''})`);
  // Pomodori nella stessa aiuola: avviso di rotazione; raccolta prevista.
  await main.getByLabel(tr('garden.preset')).selectOption('tomato');
  await main.getByLabel(tr('garden.name'), { exact: true }).fill('Pomodori 2026');
  check(await main.getByLabel(tr('garden.harvestDays'), { exact: true }).inputValue() === '75', 'giorni alla raccolta dalla proposta (75)');
  await main.getByLabel(tr('garden.plantedOn'), { exact: true }).fill('2026-04-25');
  await main.getByLabel(tr('garden.bed'), { exact: true }).fill('Aiuola 1');
  const warning = main.locator('.garden-crop [role=status]');
  check(/nel 2025 c’era la stessa famiglia \(Pomodori 2025\)/.test(await warning.innerText().catch(() => '')), `avviso di rotazione: ${await warning.innerText().catch(() => '—')}`);
  check(/Raccolta prevista: 9 lug 2026/.test(await ui.main()), 'raccolta prevista dalla semina');
  // Il trattamento con il rame: prodotto delle Scorte, quantità e giorni di attesa.
  const tomatoCopper = main.locator('.garden-proposal li').filter({ hasText: 'peronospora' });
  await tomatoCopper.getByRole('button', { name: tr('garden.change') }).click();
  await tomatoCopper.getByLabel(tr('garden.stockItem')).selectOption('stock-copper');
  await tomatoCopper.getByLabel(tr('garden.stockUse', { unit: 'kg' }), { exact: true }).fill('0,15');
  await tomatoCopper.getByLabel(tr('garden.waitDays'), { exact: true }).fill('20');
  // Da fare subito, per provare «Fatto»: novembre tra i mesi.
  await tomatoCopper.getByRole('button', { name: 'nov', exact: true }).click();
  await main.getByRole('button', { name: tr('garden.savePlantWith', { count: 4 }) }).click();
  await page.waitForTimeout(1200);
  const tomatoes = plantRow('Pomodori 2026');
  const copperTask = tomatoes ? tasksOf(tomatoes.id).find(t => t.product?.startsWith('Rame')) : null;
  check(tomatoes?.bed === 'Aiuola 1' && tomatoes?.family === 'solanaceae' && tomatoes?.planted_on === '2026-04-25' && tomatoes?.harvest_days === 75, 'pomodori salvati con aiuola, famiglia, semina e raccolta');
  check(copperTask?.stock_item_id === 'stock-copper' && Number(copperTask?.stock_use) === 0.15 && copperTask?.wait_days === 20 && copperTask?.next_on === '2026-11-25',
    `trattamento collegato al rame delle Scorte, 0,15 kg ogni volta, 20 giorni di attesa (${copperTask?.next_on}, mesi ${copperTask?.months}, scorta ${copperTask?.stock_item_id}, ${copperTask?.stock_use}, attesa ${copperTask?.wait_days})`);
  await main.getByRole('button', { name: tr('garden.doneAria', { title: copperTask?.title || '—', plant: 'Pomodori 2026' }) }).first().click();
  await page.waitForTimeout(1200);
  const stockAfter = fake.rows('home_stock_items').find(s => s.id === 'stock-copper');
  const message = await ui.toast();
  check(fake.state.requests.some(r => r.path === '/rest/v1/rpc/v46_adjust_stock'), 'con «Fatto» il rame si scala dalle Scorte (v46_adjust_stock)');
  check(/Non raccogliere prima del 15 dic 2026/.test(message) && /Rame in polvere: ne restano 0,05 kg, è da ricomprare/.test(message), `avviso dopo «Fatto»: ${message}`);
  check(fake.rows('home_garden_log').some(l => l.task_id === copperTask?.id && l.wait_days === 20), 'il registro ricorda i giorni di attesa');
  check(Number(stockAfter?.quantity) === 0.05, `nelle Scorte restano 0,05 kg (${stockAfter?.quantity})`);
  check(await main.locator('.garden-safe').filter({ hasText: 'Non raccogliere prima del 15 dic 2026' }).count() >= 1, 'sulla pianta: non raccogliere prima del 15 dicembre');
  check(await main.locator('.garden-tobuy').filter({ hasText: 'Rame in polvere' }).count() === 1, 'il rame compare tra i prodotti da ricomprare');
  // Calendario dell'anno e aiuole.
  const calendar = page.locator('.garden-calendar');
  check(await calendar.locator('details').count() === 12, 'calendario dell\'anno: dodici mesi');
  check(await calendar.locator('details').filter({ hasText: 'luglio 2027' }).locator('li').count() >= 3, 'a luglio 2027 ci sono gli interventi dei pomodori (con inverni rigidi da luglio)');
  const bedsBox = page.locator('.garden-beds');
  check(/Aiuola 1/.test(await bedsBox.innerText()) && /2025: Pomodori 2025 \(Solanacee\)/.test(await bedsBox.innerText()) && /Adesso: Pomodori 2026/.test(await bedsBox.innerText()), 'aiuole: adesso e l\'anno scorso');
  // Coltura finita: esce dalle piante e dai promemoria, resta nella storia; si rimette.
  const tomatoBox = page.locator('.garden-plant').filter({ hasText: 'Pomodori 2026' });
  if (!(await tomatoBox.getAttribute('open').then(v => v !== null).catch(() => false))) await tomatoBox.locator('summary').click();
  await tomatoBox.getByRole('button', { name: tr('garden.endCropAria', { name: 'Pomodori 2026' }) }).click();
  await page.waitForTimeout(800);
  check(plantRow('Pomodori 2026')?.ended_on === '2026-11-25' && await page.locator('.garden-ended').filter({ hasText: 'Pomodori 2026' }).count() === 1, 'coltura finita: nell\'elenco delle colture finite');
  check(await main.locator('.garden-due').filter({ hasText: 'Pomodori 2026' }).count() === 0, 'le colture finite non sono in «Da fare»');
  await page.locator('.garden-ended summary').click();
  await page.getByRole('button', { name: tr('garden.restoreAria', { name: 'Pomodori 2026' }) }).click();
  await page.waitForTimeout(800);
  check(plantRow('Pomodori 2026')?.ended_on === null, 'rimessa tra le piante');
  // Telefono con calendario, aiuole e moduli dell'orto.
  await page.setViewportSize({ width: 360, height: 780 });
  await main.getByLabel(tr('garden.preset')).selectOption('zucchini');
  await page.waitForTimeout(400);
  check(await overflow() <= 1, `sul telefono, con calendario e aiuole, niente esce dallo schermo (${await overflow()} px)`);
  const violations2 = await ui.axe();
  check(!violations2.length, `accessibilità con le parti nuove (${violations2.join(', ')})`);
  check(!ui.errors.length, `nessun errore nella pagina ${ui.errors.slice(0, 3).join(' | ')}`);
} finally { await ui.context.close(); await browser.close(); fake.close(); }
finish();

// Animali di casa (scelta dell'utente del 25 novembre 2026, sera), nel browser con accesso e il
// Supabase finto (vedi scripts/prove-con-accesso.mjs). Il giorno è fisso, 25 novembre 2026:
// 1. nuovo cane dalla proposta «Cane adulto»: una voce accesa in più, una cambiata prima di salvare,
//    cibo dalle Scorte con la dose di ogni giorno;
// 2. «Da fare»: fatto (registro, prossima data, pipetta scalata dalle Scorte) e rimanda;
// 3. registro: visita con peso e spesa; il peso della scheda si aggiorna; avviso del calo di peso;
// 4. cibo che sta per finire: tra le cose da ricomprare, nella lista della spesa della casa;
// 5. «Non c'è più» e rimetti; voce del piano cambiata ed eliminata;
// 6. sul telefono (360 px) niente esce dallo schermo; accessibilità (axe); nessun errore.
// Uso: node scripts/prove-animali.mjs [http://localhost:3000]
import { checker, startScenario, openPage, launch } from './accesso-comune.mjs';
import { translate } from '../lib/i18n.mjs';

const { check, finish } = checker('Animali di casa');
const tr = (key, params) => translate('it', key, params);
const ANNA = '11111111-1111-4111-8111-111111111111';

const { fake, person } = await startScenario({ tokenTtl: 3 * 86400 });
const anna = person('anna', ANNA, 'anna@example.org');
const browser = await launch();
const ui = await openPage(browser);
const { page } = ui;
await page.clock.setFixedTime(new Date('2026-11-25T09:00:00Z'));
const main = page.locator('main');
const petRow = name => fake.rows('home_pets').find(p => p.name === name);
const tasksOf = id => fake.rows('home_pet_tasks').filter(t => t.pet_id === id);
const overflow = () => page.evaluate(() => document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth);
const openBox = async name => {
  const box = page.locator('.garden-plant').filter({ has: page.locator('summary', { hasText: name }) }).first();
  if (!(await box.getAttribute('open').then(v => v !== null).catch(() => false))) await box.locator('summary').click();
  return box;
};
// Scorte dello spazio personale: crocchette aggiornate quattro giorni fa, pipette.
fake.seed('home_stock_items', [
  { id: 'stock-food', user_id: ANNA, home_id: null, name: 'Crocchette', unit: 'kg', quantity: 6, threshold: 1, usual_buy: 12, location: '', updated_at: '2026-11-21T08:00:00Z' },
  { id: 'stock-pipette', user_id: ANNA, home_id: null, name: 'Pipette antiparassitarie', unit: 'pcs', quantity: 2, threshold: 1, usual_buy: 3, location: '', updated_at: '2026-11-01T08:00:00Z' },
]);

// Scalare una scorta: come la funzione del database v46_adjust_stock.
fake.state.rpc.v46_adjust_stock = ({ p_item, p_delta }, state) => {
  const item = (state.tables.home_stock_items || []).find(s => s.id === p_item);
  item.quantity = Math.min(100000, Math.max(0, Math.round((Number(item.quantity) + Number(p_delta)) * 100) / 100));
  item.updated_at = new Date().toISOString();
  return item.quantity;
};

try {
  check(await ui.login(anna), 'Anna entra');
  await ui.go(tr('nav.pets'));
  check((await ui.main()).includes(tr('pets.listEmpty')), 'senza animali la sezione spiega come cominciare');

  // 1. Proposta per il cane adulto.
  await main.getByLabel(tr('pets.preset')).selectOption('dog');
  check(await main.getByLabel(tr('pets.species')).inputValue() === 'dog', 'la specie si sceglie dalla proposta');
  const proposal = main.locator('.garden-proposal li');
  check(await proposal.count() === 9, `nove voci proposte (${await proposal.count()})`);
  check((await ui.main()).includes(tr('pets.vetDisclaimer')), 'le proposte dicono che decide il veterinario');
  await main.getByLabel(tr('pets.name'), { exact: true }).fill('Fido');
  await main.getByLabel(tr('pets.breed'), { exact: true }).fill('Meticcio');
  await main.getByLabel(tr('pets.birthOn'), { exact: true }).fill('2020-03-15');
  await main.getByLabel(tr('pets.weight'), { exact: true }).fill('20');
  await main.getByLabel(tr('pets.foodItem')).selectOption('stock-food');
  await main.getByLabel(tr('pets.foodDaily', { unit: 'kg' }), { exact: true }).fill('0,25');
  await main.getByLabel(tr('pets.vetPhone'), { exact: true }).fill('02 1234567');
  // La toelettatura è spenta di partenza: si accende. L'antiparassitario usa le pipette delle Scorte.
  await main.getByRole('checkbox', { name: tr('pets.useTask', { title: tr('pets.task.grooming') }) }).check();
  const fleas = proposal.filter({ hasText: tr('pets.task.fleas_ticks') });
  await fleas.getByRole('button', { name: tr('pets.change') }).click();
  await fleas.getByLabel(tr('pets.stockItem')).selectOption('stock-pipette');
  await fleas.getByLabel(tr('pets.stockUse', { unit: 'pz' }), { exact: true }).fill('1');
  // Il richiamo dei vaccini: la data del libretto.
  const vaccine = proposal.filter({ hasText: tr('pets.task.core_vaccine') });
  await vaccine.getByRole('button', { name: tr('pets.change') }).click();
  await vaccine.getByLabel(tr('pets.nextOn'), { exact: true }).fill('2027-03-10');
  check((await ui.main()).includes(tr('pets.proposalTitle', { count: 7 })), 'sette voci scelte (antirabbica e leishmaniosi spente, toelettatura accesa)');
  await main.getByRole('button', { name: tr('pets.save') }).click();
  await page.waitForTimeout(1200);
  const fido = petRow('Fido');
  const plan = fido ? tasksOf(fido.id) : [];
  check(fido?.species === 'dog' && fido?.preset === 'dog' && Number(fido?.weight_kg) === 20 && fido?.food_stock_item_id === 'stock-food' && Number(fido?.food_daily) === 0.25 && fido?.birth_on === '2020-03-15',
    `cane salvato con scheda e cibo (${JSON.stringify({ w: fido?.weight_kg, f: fido?.food_daily })})`);
  check(plan.length === 7, `piano con sette voci (${plan.length})`);
  const fleasTask = plan.find(t => t.title === tr('pets.task.fleas_ticks'));
  const vaccineTask = plan.find(t => t.title === tr('pets.task.core_vaccine'));
  check(fleasTask?.stock_item_id === 'stock-pipette' && Number(fleasTask?.stock_use) === 1 && fleasTask?.every_days === 30 && fleasTask?.next_on === '2026-11-25', 'antiparassitario collegato alle pipette, ogni mese, da oggi');
  check(vaccineTask?.next_on === '2027-03-10' && vaccineTask?.every_days === 365, 'richiamo dei vaccini alla data del libretto, ogni anno');
  check(/6 anni 8 mesi/.test(await ui.main()), 'l\'età si calcola dalla nascita');

  // 2. Da fare: fatto (pipetta scalata) e rimanda.
  await main.getByRole('button', { name: tr('pets.doneAria', { title: fleasTask.title, pet: 'Fido' }) }).click();
  await page.waitForTimeout(1200);
  const fleasAfter = tasksOf(fido.id).find(t => t.id === fleasTask.id);
  check(fleasAfter?.last_done_on === '2026-11-25' && fleasAfter?.next_on === '2026-12-25', `fatto: prossima volta ${fleasAfter?.next_on}`);
  check(fake.rows('home_pet_log').some(l => l.task_id === fleasTask.id && l.done_on === '2026-11-25'), 'fatto: scritto nel registro');
  check(fake.state.requests.some(r => r.path === '/rest/v1/rpc/v46_adjust_stock'), 'la pipetta si scala dalle Scorte');
  const toast = await ui.toast();
  check(/Prossima volta: 25 dic 2026/.test(toast) && /Pipette antiparassitarie sta finendo: ne restano 1 pz/.test(toast), `avviso dopo «Fatto»: ${toast}`);
  const weigh = tasksOf(fido.id).find(t => t.title === tr('pets.task.weigh'));
  await main.getByRole('button', { name: tr('pets.postponeAria', { title: weigh.title, pet: 'Fido' }) }).click();
  await page.waitForTimeout(800);
  check(tasksOf(fido.id).find(t => t.id === weigh.id)?.next_on === '2026-12-02', 'rimandato di una settimana');

  // 3. Registro: visita con peso e spesa; il peso della scheda segue la pesata più recente.
  let box = await openBox('Fido');
  await box.getByRole('button', { name: tr('pets.addLog') }).click();
  await box.getByLabel(tr('pets.logTitle'), { exact: true }).fill('Visita per la zampa');
  await box.getByLabel(tr('pets.logWeight'), { exact: true }).fill('17,5');
  await box.getByLabel(tr('pets.logCost'), { exact: true }).fill('65,50');
  await box.getByRole('button', { name: tr('pets.saveLog') }).click();
  await page.waitForTimeout(1000);
  const visit = fake.rows('home_pet_log').find(l => l.title === 'Visita per la zampa');
  check(visit?.cost_cents === 6550 && Number(visit?.weight_kg) === 17.5 && visit?.kind === 'vet_visit', 'visita nel registro con spesa e peso');
  check(Number(petRow('Fido')?.weight_kg) === 17.5, 'il peso della scheda diventa 17,5 kg');
  check(/Spese del veterinario nel 2026: 65,50/.test(await ui.main()), 'spese del veterinario dell\'anno');

  // 4. Cibo: 6 kg quattro giorni fa, 0,25 al giorno → 5 kg, 20 giorni; con 1 kg restano 4 giorni.
  check(/Crocchette: restano circa 20 giorni/.test(await ui.main()), 'stima del cibo che resta');
  fake.rows('home_stock_items').find(s => s.id === 'stock-food').quantity = 2;
  await ui.go(tr('nav.dashboard'));
  await ui.go(tr('nav.pets'));
  const tobuy = main.locator('.garden-tobuy');
  check(/Crocchette: restano circa 4 giorni/.test(await tobuy.innerText().catch(() => '')), 'cibo quasi finito tra le cose da ricomprare');

  // 5. Voce cambiata ed eliminata; «Non c'è più» e rimetti.
  box = await openBox('Fido');
  const grooming = tasksOf(fido.id).find(t => t.title === tr('pets.task.grooming'));
  await box.getByRole('button', { name: tr('pets.editTaskAria', { title: grooming.title }) }).click();
  await box.locator('form').getByLabel(tr('pets.every')).selectOption('90');
  await box.getByRole('button', { name: tr('pets.saveTask') }).click();
  await page.waitForTimeout(800);
  check(tasksOf(fido.id).find(t => t.id === grooming.id)?.every_days === 90, 'voce cambiata: ogni 3 mesi');
  check(/Ogni 3 mesi/.test(await box.innerText()), 'la frequenza si legge in mesi');
  await box.getByRole('button', { name: tr('pets.deleteTaskAria', { title: grooming.title }) }).click();
  await ui.confirm();
  await page.waitForTimeout(800);
  check(!tasksOf(fido.id).some(t => t.id === grooming.id), 'voce eliminata');
  check(await box.getByRole('button', { name: tr('pets.missingTasks', { count: 3 }) }).count() === 1, 'le voci della proposta che mancano si possono riaggiungere');
  await box.getByRole('button', { name: tr('pets.endedAction') }).click();
  await page.waitForTimeout(800);
  check(petRow('Fido')?.ended_on === '2026-11-25', '«Non c\'è più» salvato');
  check(await main.locator('.garden-due').filter({ hasText: 'Fido' }).count() === 0, 'niente più da fare per chi non c\'è più');
  await page.locator('.garden-ended > summary').click();
  await page.locator('.garden-ended').getByRole('button', { name: tr('pets.restore') }).click();
  await page.waitForTimeout(800);
  check(petRow('Fido')?.ended_on === null, 'rimesso tra gli animali');

  // 6. Telefono e accessibilità.
  await page.setViewportSize({ width: 360, height: 780 });
  await openBox('Fido');
  await main.getByLabel(tr('pets.preset')).selectOption('cat');
  await page.waitForTimeout(400);
  check(await overflow() <= 1, `sul telefono niente esce dallo schermo (${await overflow()} px)`);
  const violations = await ui.axe();
  check(!violations.length, `accessibilità (${violations.join(', ')})`);
  check(!ui.errors.length, `nessun errore nella pagina ${ui.errors.slice(0, 3).join(' | ')}`);
} finally { await ui.context.close(); await browser.close(); await fake.close(); }
finish();

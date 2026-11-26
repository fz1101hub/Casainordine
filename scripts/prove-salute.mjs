// Salute: medicine, terapie e visite (richiesta dell'utente del 25 novembre 2026, sera), nel browser
// con accesso e il Supabase finto. Il giorno è fisso: 25 novembre 2026 alle 10 di Roma.
// 1. io: terapia alle 8 e alle 20 con la confezione delle Scorte; «Oggi»: presa, annulla, saltata;
// 2. terapia in alcuni giorni della settimana; la confezione che finisce tra le medicine da ricomprare;
// 3. la mamma: vaccinazione con l'ora e i promemoria, che si ripete ogni anno; «Fatto» → la prossima;
// 3b-3e. neonato: vaccini, bilanci di salute, scheda d'emergenza, spese sanitarie nel 730;
// 4. nomi nelle notifiche (di partenza no); sul telefono niente esce dallo schermo; accessibilità.
// Uso: node scripts/prove-salute.mjs [http://localhost:3000]
import { checker, startScenario, openPage, launch } from './accesso-comune.mjs';
import { translate } from '../lib/i18n.mjs';

const { check, finish } = checker('Salute e terapie');
const tr = (key, params) => translate('it', key, params);
const ANNA = '11111111-1111-4111-8111-111111111111';

const { fake, person } = await startScenario({ tokenTtl: 3 * 86400 });
const anna = person('anna', ANNA, 'anna@example.org');
fake.seed('home_stock_items', [{ id: 'stock-asp', user_id: ANNA, home_id: null, name: 'Cardioaspirina', unit: 'pcs', quantity: 6, threshold: 2, usual_buy: 1, location: '' }]);
fake.state.rpc.v46_adjust_stock = ({ p_item, p_delta }, state) => {
  const item = (state.tables.home_stock_items || []).find(s => s.id === p_item);
  item.quantity = Math.max(0, Math.round((Number(item.quantity) + Number(p_delta)) * 100) / 100);
  return item.quantity;
};
const browser = await launch();
const ui = await openPage(browser);
const { page } = ui;
await page.clock.setFixedTime(new Date('2026-11-25T09:00:00Z'));
const main = page.locator('main');
const rows = table => fake.rows(table);
const overflow = () => page.evaluate(() => document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth);

try {
  check(await ui.login(anna), 'Anna entra');
  await ui.go(tr('nav.health'));
  check((await ui.main()).includes(tr('health.privacyPersonal')), 'nello spazio personale: lo vede solo lei');
  check((await ui.main()).includes(tr('health.start').slice(0, 30)), 'senza persone la sezione spiega come cominciare');

  // 1. Io, con la terapia alle 8 e alle 20.
  await main.getByRole('button', { name: tr('health.addPerson') }).click();
  check(await main.getByLabel(tr('health.relation')).inputValue() === 'self', 'la prima persona è «Io»');
  await main.getByLabel(tr('health.personName'), { exact: true }).fill('Anna');
  await main.getByRole('button', { name: tr('health.save') }).click();
  await page.waitForTimeout(800);
  const me = rows('health_people').find(p => p.name === 'Anna');
  check(me?.relation === 'self' && me?.home_id === null, 'persona salvata nello spazio personale');
  await main.getByRole('button', { name: tr('health.addTherapy') }).click();
  await main.getByLabel(tr('health.therapyName'), { exact: true }).fill('Cardioaspirina');
  await main.getByLabel(tr('health.dose'), { exact: true }).fill('1 compressa');
  await main.getByLabel(tr('health.instructions'), { exact: true }).fill('a stomaco pieno');
  await main.getByRole('button', { name: tr('health.addTime') }).click();
  check(await main.getByLabel(tr('health.timeN', { number: 2 }), { exact: true }).inputValue() === '20:00', 'il secondo orario parte dalle 20');
  await main.getByLabel(tr('health.stockItem')).selectOption('stock-asp');
  await main.getByLabel(tr('health.stockUse'), { exact: true }).fill('1');
  await main.getByRole('button', { name: tr('health.save') }).click();
  await page.waitForTimeout(1000);
  const asp = rows('health_therapies').find(t => t.name === 'Cardioaspirina');
  check(JSON.stringify(asp?.times) === '["08:00","20:00"]' && asp?.every_days === 1 && asp?.start_on === '2026-11-25' && asp?.remind === true && asp?.stock_item_id === 'stock-asp', `terapia salvata (${JSON.stringify(asp?.times)})`);
  check(/il promemoria arriverà alle 08:00, 20:00/.test(await ui.toast()), 'dice quando arriveranno i promemoria');
  const doses = main.locator('.health-doses li');
  check(await doses.count() === 2, 'oggi due dosi');
  check(/08:00[\s\S]*Da prendere/.test(await doses.nth(0).innerText()) && /20:00[\s\S]*Più tardi/.test(await doses.nth(1).innerText()), 'alle 10: quella delle 8 è da prendere, quella delle 20 più tardi');
  await main.getByRole('button', { name: tr('health.takenAria', { name: 'Cardioaspirina', time: '08:00', person: 'Anna' }) }).click();
  await page.waitForTimeout(800);
  const morning = rows('health_doses').find(d => d.therapy_id === asp.id);
  check(morning?.status === 'taken' && Date.parse(morning?.due_at) === Date.parse('2026-11-25T07:00:00Z'), 'presa: segnata per le 8 di Roma');
  check(Number(rows('home_stock_items')[0].quantity) === 5, 'una compressa in meno nelle Scorte');
  await main.getByRole('button', { name: tr('health.undoAria', { name: 'Cardioaspirina', time: '08:00' }) }).click();
  await page.waitForTimeout(800);
  check(rows('health_doses').find(d => d.id === morning.id)?.status === 'pending' && Number(rows('home_stock_items')[0].quantity) === 6, 'annullata: di nuovo da prendere, la compressa torna');
  await main.getByRole('button', { name: tr('health.skippedAria', { name: 'Cardioaspirina', time: '20:00', person: 'Anna' }) }).click();
  await page.waitForTimeout(800);
  check(rows('health_doses').some(d => d.therapy_id === asp.id && d.status === 'skipped' && Date.parse(d.due_at) === Date.parse('2026-11-25T19:00:00Z')), 'saltata quella delle 20');

  // 2. Giorni della settimana; scorta che finisce (6 compresse, 2 al giorno → 3 giorni).
  check(/Cardioaspirina[\s\S]*restano circa 3 giorni/.test(await main.locator('.garden-tobuy').innerText().catch(() => '')), 'la confezione che finisce tra le medicine da ricomprare');
  await main.getByRole('button', { name: tr('health.addTherapy') }).click();
  await main.getByLabel(tr('health.therapyName'), { exact: true }).fill('Vitamina D');
  await main.getByLabel(tr('health.therapyKind')).selectOption('supplement');
  await main.getByLabel(tr('health.frequency')).selectOption('weekdays');
  await main.locator('.garden-months').getByRole('button', { name: 'gio', exact: true }).click();
  await main.getByRole('button', { name: tr('health.save') }).click();
  await page.waitForTimeout(800);
  const vit = rows('health_therapies').find(t => t.name === 'Vitamina D');
  check(JSON.stringify(vit?.weekdays) === '[1,4]' && vit?.kind === 'supplement', `vitamina il lunedì e il giovedì (${JSON.stringify(vit?.weekdays)})`);
  check(await doses.filter({ hasText: 'Vitamina D' }).count() === 0, 'oggi (mercoledì) niente vitamina');

  // 3. La mamma: vaccinazione con l'ora, ripetuta ogni anno.
  await main.getByRole('button', { name: tr('health.addPerson') }).click();
  await main.getByLabel(tr('health.personName'), { exact: true }).fill('Mamma');
  await main.getByLabel(tr('health.relation')).selectOption('parent');
  await main.getByRole('button', { name: tr('health.save') }).click();
  await page.waitForTimeout(800);
  check(await main.getByRole('button', { name: 'Mamma', exact: true }).getAttribute('aria-pressed') === 'true', 'la nuova persona è quella scelta');
  await main.getByRole('button', { name: tr('health.addAppointment') }).click();
  await main.getByLabel(tr('health.appointmentKind')).selectOption('vaccine');
  await main.getByLabel(tr('health.appointmentTitle'), { exact: true }).fill('Antinfluenzale');
  await main.getByLabel(tr('health.onDate'), { exact: true }).fill('2026-11-28');
  check(await main.getByRole('checkbox', { name: tr('health.reminder.hour_before') }).isDisabled(), '«un\'ora prima» solo con l\'ora');
  await main.getByLabel(tr('health.atTime'), { exact: true }).fill('10:30');
  await main.getByRole('checkbox', { name: tr('health.reminder.hour_before') }).check();
  await main.getByLabel(tr('health.place'), { exact: true }).fill('Farmacia');
  await main.getByLabel(tr('health.repeat')).selectOption('12');
  await main.getByRole('button', { name: tr('health.save') }).click();
  await page.waitForTimeout(800);
  const flu = rows('health_appointments').find(a => a.title === 'Antinfluenzale');
  check(flu?.kind === 'vaccine' && flu?.on_date === '2026-11-28' && flu?.at_time === '10:30' && JSON.stringify(flu?.reminders) === '["day_before","hour_before"]' && flu?.repeat_months === 12,
    `vaccinazione salvata con i promemoria (${JSON.stringify(flu?.reminders)})`);
  check(/sab 28 nov · 10:30 · Antinfluenzale/.test(await main.locator('.health-appointments').innerText()), 'tra i prossimi appuntamenti');
  await main.getByRole('button', { name: tr('health.appointmentDoneAria', { title: 'Antinfluenzale' }) }).click();
  await page.waitForTimeout(1000);
  const next = rows('health_appointments').find(a => a.title === 'Antinfluenzale' && !a.done_on);
  check(rows('health_appointments').find(a => a.id === flu.id)?.done_on === '2026-11-25' && next?.on_date === '2027-11-28' && next?.at_time === '10:30', `fatto: la prossima è il ${next?.on_date}`);

  // 3b. Un neonato: calendario delle vaccinazioni obbligatorie, prenota e «già fatta».
  await main.getByRole('button', { name: tr('health.addPerson') }).click();
  await main.getByLabel(tr('health.personName'), { exact: true }).fill('Luca');
  await main.getByLabel(tr('health.relation')).selectOption('child');
  await main.getByLabel(tr('health.birthOn'), { exact: true }).fill('2026-09-20');
  await main.getByRole('button', { name: tr('health.save') }).click();
  await page.waitForTimeout(800);
  const luca = rows('health_people').find(p => p.name === 'Luca');
  check(luca?.vaccine_plan === undefined || luca?.vaccine_plan === 'off' || !luca?.vaccine_plan, 'di partenza il calendario è spento');
  await main.getByLabel(tr('health.vaccinePlan')).selectOption('mandatory');
  await page.waitForTimeout(800);
  check(rows('health_people').find(p => p.id === luca.id)?.vaccine_plan === 'mandatory', 'calendario delle obbligatorie acceso');
  const steps = main.locator('.health-vaccine-list li');
  check(await steps.count() === 7, `sette tappe obbligatorie (${await steps.count()})`);
  check(/Esavalente – 1ª dose[\s\S]*3° mese di vita \(dal 61° giorno\) · dal gio 19 nov[\s\S]*Obbligatoria[\s\S]*Da fare ora/.test(await steps.nth(0).innerText()), 'prima tappa: esavalente dal 61° giorno, da fare ora');
  await main.getByRole('button', { name: tr('health.bookAria', { name: tr('health.vaccine.hexa_1') }) }).click();
  check(await main.getByLabel(tr('health.appointmentTitle'), { exact: true }).inputValue() === tr('health.vaccine.hexa_1'), 'prenota: il modulo è già compilato');
  await main.getByLabel(tr('health.onDate'), { exact: true }).fill('2026-11-27');
  await main.getByLabel(tr('health.atTime'), { exact: true }).fill('09:15');
  await main.getByRole('button', { name: tr('health.save') }).click();
  await page.waitForTimeout(800);
  const hexa = rows('health_appointments').find(a => a.schedule_key === 'hexa_1');
  check(hexa?.person_id === luca.id && hexa?.kind === 'vaccine' && hexa?.on_date === '2026-11-27' && JSON.stringify(hexa?.reminders) === '["day_before","same_morning"]', 'esavalente prenotata con i promemoria');
  check(/Prenotata: ven 27 nov/.test(await steps.nth(0).innerText()), 'la tappa risulta prenotata');
  await main.getByRole('button', { name: tr('health.alreadyDoneAria', { name: tr('health.vaccine.hexa_2') }) }).click();
  await main.getByLabel(tr('health.doneDate'), { exact: true }).fill('2026-11-24');
  await main.locator('.health-done-form').getByRole('button', { name: tr('health.save') }).click();
  await page.waitForTimeout(800);
  check(rows('health_appointments').some(a => a.schedule_key === 'hexa_2' && a.done_on === '2026-11-24'), '«già fatta» segnata con la sua data');
  check(/Fatta il mar 24 nov/.test(await steps.nth(1).innerText()), 'la tappa risulta fatta');

  // 3c. Bilanci di salute dal pediatra: accesi, «già fatto» e «prenota».
  await main.getByRole('checkbox', { name: tr('health.checkupsFollow') }).check();
  await page.waitForTimeout(800);
  check(rows('health_people').find(p => p.id === luca.id)?.checkup_plan === true, 'bilanci di salute accesi');
  const checkups = main.locator('.health-checkup-list li');
  check(await checkups.count() === 10, `dieci bilanci di salute (${await checkups.count()})`);
  check(/Bilancio di salute 1[\s\S]*Tra il 1° e il 45° giorno di vita[\s\S]*Oltre il periodo previsto: chiedi al pediatra/.test(await checkups.nth(0).innerText()), 'primo bilancio: periodo passato, chiedi al pediatra');
  check(/Bilancio di salute 2[\s\S]*dal gio 19 nov[\s\S]*Da fare ora/.test(await checkups.nth(1).innerText()), 'secondo bilancio: da fare ora');
  await main.getByRole('button', { name: tr('health.alreadyDoneCheckupAria', { name: tr('health.checkup', { number: 1 }) }), exact: true }).click();
  await main.getByLabel(tr('health.doneDate'), { exact: true }).fill('2026-10-02');
  await main.locator('.health-done-form').getByRole('button', { name: tr('health.save') }).click();
  await page.waitForTimeout(800);
  check(rows('health_appointments').some(a => a.schedule_key === 'bds_1' && a.done_on === '2026-10-02' && a.kind === 'visit'), 'primo bilancio segnato come fatto');
  check(/Fatto il ven 2 ott/.test(await checkups.nth(0).innerText()), 'il primo bilancio risulta fatto');
  await main.getByRole('button', { name: tr('health.bookAria', { name: tr('health.checkup', { number: 2 }) }), exact: true }).click();
  check(await main.getByLabel(tr('health.appointmentTitle'), { exact: true }).inputValue() === 'Bilancio di salute 2' && await main.getByLabel(tr('health.appointmentKind')).inputValue() === 'visit', 'prenota: visita già compilata');
  await main.getByLabel(tr('health.onDate'), { exact: true }).fill('2026-11-30');
  await main.getByRole('button', { name: tr('health.save') }).click();
  await page.waitForTimeout(800);
  check(rows('health_appointments').some(a => a.schedule_key === 'bds_2' && a.on_date === '2026-11-30' && a.person_id === luca.id), 'secondo bilancio prenotato');
  check(/Prenotato: lun 30 nov/.test(await checkups.nth(1).innerText()), 'il secondo bilancio risulta prenotato');

  // 3d. Scheda d'emergenza: dati di Luca, telefono sbagliato rifiutato, anteprima e stampa.
  await main.getByRole('button', { name: tr('health.editPersonAria', { name: 'Luca' }) }).click();
  await main.getByLabel(tr('health.card.bloodType')).selectOption('0+');
  await main.getByLabel(tr('health.card.allergies'), { exact: true }).fill('Penicillina');
  await main.getByLabel(tr('health.card.conditions'), { exact: true }).fill('Asma lieve: inalatore nello zaino');
  await main.getByLabel(tr('health.card.doctorName'), { exact: true }).fill('Dott.ssa Bianchi');
  await main.getByLabel(tr('health.card.doctorPhone'), { exact: true }).fill('chiamami');
  await main.getByLabel(tr('health.card.contactName'), { exact: true }).fill('Nonna Pia');
  await main.getByLabel(tr('health.card.contactPhone'), { exact: true }).fill('333 1234567');
  await main.getByRole('button', { name: tr('health.save') }).click();
  check((await ui.toast()).includes(tr('health.error.phone').slice(0, 30)), 'telefono con lettere rifiutato');
  await main.getByLabel(tr('health.card.doctorPhone'), { exact: true }).fill('+39 02 1234567');
  await main.getByRole('button', { name: tr('health.save') }).click();
  await page.waitForTimeout(800);
  const lucaCard = rows('health_people').find(p => p.id === luca.id);
  check(lucaCard?.blood_type === '0+' && lucaCard?.allergies === 'Penicillina' && lucaCard?.doctor_phone === '+39 02 1234567' && lucaCard?.emergency_name === 'Nonna Pia' && lucaCard?.vaccine_plan === 'mandatory', 'dati della scheda salvati (il piano vaccini resta)');
  check(/Allergie: Penicillina/.test(await main.locator('.health-card-summary').innerText()), 'le allergie si vedono subito nella pagina della persona');
  await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed += 1; }; });
  await main.getByRole('button', { name: tr('health.card.printFor', { name: 'Luca' }) }).click();
  const panel = main.locator('.health-card-panel');
  check(await panel.locator('.health-card').count() === 1, 'scheda di Luca soltanto');
  const cardText = await panel.locator('.health-card').first().innerText();
  check(/Luca[\s\S]*2 mesi[\s\S]*0\+[\s\S]*Penicillina[\s\S]*Asma lieve[\s\S]*Dott\.ssa Bianchi[\s\S]*\+39 02 1234567[\s\S]*Nonna Pia[\s\S]*333 1234567[\s\S]*Esavalente – 2ª dose · 24 nov 2026[\s\S]*112/.test(cardText), 'scheda con età, gruppo, allergie, medico, chi chiamare, vaccini fatti e 112');
  check(!/Bilancio di salute 1/.test(cardText), 'tra le vaccinazioni non finiscono i bilanci');
  check(await panel.locator('a[href="tel:+39021234567"]').count() === 1, 'il numero del medico si chiama con un tocco');
  await panel.getByRole('button', { name: tr('health.card.print') }).click();
  check(await page.evaluate(() => window.__printed) === 1, '«Stampa la scheda» apre la stampa');
  await page.emulateMedia({ media: 'print' });
  check(await main.locator('.health-card-print .health-card').first().isVisible() && !(await panel.isVisible()) && !(await main.locator('.extra-layout').isVisible()), 'in stampa solo le schede');
  await page.emulateMedia({ media: 'screen' });
  await panel.getByRole('checkbox', { name: 'Anna', exact: true }).check();
  check(await panel.locator('.health-card').count() === 2 && /Anna/.test(await panel.locator('.garden-warning').innerText()), 'con Anna: due schede e l’avviso che la sua è vuota');
  await panel.getByRole('button', { name: tr('health.card.close') }).click();
  check(!(await panel.count()), 'scheda chiusa');

  // 3e. Spese sanitarie: farmaci in contanti nel 730, visita privata fuori dal 730 e poi dentro.
  await main.getByRole('button', { name: tr('health.addExpense') }).click();
  await main.getByLabel(tr('health.expenseDescription'), { exact: true }).fill('Sciroppo per la tosse');
  await main.getByLabel(tr('health.expenseAmount'), { exact: true }).fill('8,50');
  await main.getByLabel(tr('health.paymentLabel')).selectOption('cash');
  check(await main.getByText(tr('health.expenseCashOk')).isVisible(), 'farmaci in contanti: detraibili lo stesso');
  await main.getByRole('button', { name: tr('health.save') }).click();
  await page.waitForTimeout(900);
  const syrup = rows('health_expenses').find(e => e.description === 'Sciroppo per la tosse');
  check(syrup?.amount_cents === 850 && syrup?.kind === 'pharmacy' && syrup?.payment_method === 'cash' && syrup?.spent_on === '2026-11-25' && syrup?.person_id === luca.id, 'spesa in farmacia salvata');
  const syrupTax = rows('home_tax_items').find(t => t.source === 'health_expense' && t.source_id === syrup?.id);
  check(syrupTax?.description === 'Luca · Sciroppo per la tosse' && syrupTax?.cash_ok === true && syrupTax?.category === 'medical' && syrupTax?.tax_year === 2026 && syrupTax?.amount_cents === 850 && syrupTax?.user_id === ANNA, 'ed è già tra le spese detraibili');
  check((await ui.toast()).includes(tr('health.expenseIn730')), 'il messaggio lo dice');
  check((await main.locator('.health-expense-total').innerText()).replace(/\s+/g, ' ').includes('2026: 8,50 € in 1 spesa'), 'totale dell’anno');
  await main.getByRole('button', { name: tr('health.addExpense') }).click();
  await main.getByLabel(tr('health.expenseKind')).selectOption('visit');
  await main.getByLabel(tr('health.expenseDescription'), { exact: true }).fill('Visita dermatologica privata');
  await main.getByLabel(tr('health.expenseAmount'), { exact: true }).fill('90');
  await main.getByLabel(tr('health.paymentLabel')).selectOption('cash');
  check(await main.locator('form .garden-warning', { hasText: tr('health.expenseTraceable') }).isVisible(), 'visita privata in contanti: avvisa del pagamento tracciabile');
  await main.getByRole('checkbox', { name: tr('health.expenseTo730') }).uncheck();
  await main.getByRole('button', { name: tr('health.save') }).click();
  await page.waitForTimeout(900);
  const derma = rows('health_expenses').find(e => e.description === 'Visita dermatologica privata');
  check(derma?.kind === 'visit' && !rows('home_tax_items').some(t => t.source_id === derma?.id), 'senza la casella non va nel 730');
  await main.getByRole('button', { name: tr('health.add730Aria', { description: 'Visita dermatologica privata' }) }).click();
  await page.waitForTimeout(800);
  check(rows('home_tax_items').some(t => t.source_id === derma?.id && t.cash_ok === false && t.payment_method === 'cash'), '«Metti nel 730»: aggiunta, senza «anche in contanti»');
  check((await main.locator('.health-expense-total').innerText()).replace(/\s+/g, ' ').includes('98,50 € in 2 spese'), 'totale aggiornato');
  await main.locator('details.garden-ended summary').click();
  await main.getByRole('button', { name: tr('health.expenseForAria', { title: 'Bilancio di salute 1' }), exact: true }).click();
  check(await main.getByLabel(tr('health.expenseDescription'), { exact: true }).inputValue() === 'Bilancio di salute 1' && await main.getByLabel(tr('health.spentOn'), { exact: true }).inputValue() === '2026-10-02'
    && await main.getByLabel(tr('health.expenseKind')).inputValue() === 'visit', '«Spesa» su una visita fatta: modulo già compilato');
  await main.locator('.health-expenses form').getByRole('button', { name: tr('health.cancel') }).click();
  await main.getByRole('button', { name: tr('health.deleteExpenseAria', { description: 'Visita dermatologica privata' }) }).click();
  await ui.confirm();
  await page.waitForTimeout(800);
  check(!rows('health_expenses').some(e => e.description === 'Visita dermatologica privata') && (await ui.toast()).includes(tr('health.expenseDeleted')), 'spesa eliminata');
  await ui.go(tr('nav.taxes'));
  await page.waitForTimeout(800);
  const taxRow = main.locator('li', { hasText: 'Luca · Sciroppo per la tosse' });
  check(await taxRow.count() === 1 && (await taxRow.innerText()).includes(tr('taxes.source.health_expense')) && !(await taxRow.innerText()).includes(tr('taxes.warning.traceable')), 'nelle Spese detraibili, «Da Salute», senza avviso sui contanti');
  await ui.go(tr('nav.health'));
  await page.waitForTimeout(800);

  // 3f. Prevenzione: Anna (adulta), sesso e screening; mammografia già fatta, HPV prenotato.
  await main.getByRole('button', { name: 'Anna', exact: true }).click();
  await main.getByRole('button', { name: tr('health.editPersonAria', { name: 'Anna' }) }).click();
  await main.getByLabel(tr('health.birthOn'), { exact: true }).fill('1972-03-04');
  await main.getByRole('combobox', { name: new RegExp('^' + tr('health.sex').replace(/[()]/g, '\\$&')) }).selectOption('female');
  await main.getByRole('button', { name: tr('health.save') }).click();
  await page.waitForTimeout(700);
  check(rows('health_people').find(p => p.name === 'Anna')?.sex === 'female', 'sesso salvato');
  await main.getByRole('checkbox', { name: tr('health.screeningsFollow') }).check();
  await page.waitForTimeout(700);
  check(rows('health_people').find(p => p.name === 'Anna')?.screening_plan === true, 'prevenzione accesa');
  const screenings = main.locator('.health-screening-list li');
  check(/Test HPV[\s\S]*Mammografia[\s\S]*Sangue occulto[\s\S]*Controllo dal dentista/.test(await main.locator('.health-screening-list').innerText()) && await screenings.count() === 4, 'a 54 anni: HPV, mammografia, colon-retto, dentista');
  await main.getByRole('button', { name: tr('health.alreadyDoneCheckupAria', { name: 'Mammografia' }), exact: true }).click();
  await main.locator('.health-screenings .health-done-form').getByLabel(tr('health.doneDate'), { exact: true }).fill('2025-03-10');
  await main.locator('.health-screenings .health-done-form').getByRole('button', { name: tr('health.save') }).click();
  await page.waitForTimeout(700);
  check(rows('health_appointments').some(a => a.schedule_key === 'scr_breast_2025' && a.done_on === '2025-03-10' && a.kind === 'exam'), 'mammografia fatta nel 2025');
  check(/Mammografia[\s\S]*ultimo il 10 mar 2025[\s\S]*Prossimo: 10 mar 2027/.test(await screenings.filter({ hasText: 'Mammografia' }).innerText()), 'la prossima tra due anni');
  await main.getByRole('button', { name: tr('health.bookAria', { name: 'Test HPV' }), exact: true }).click();
  check(await main.getByLabel(tr('health.appointmentTitle'), { exact: true }).inputValue() === 'Test HPV', 'prenota: modulo compilato');
  await main.getByLabel(tr('health.onDate'), { exact: true }).fill('2027-01-20');
  await main.getByRole('button', { name: tr('health.save') }).click();
  await page.waitForTimeout(700);
  check(rows('health_appointments').some(a => a.schedule_key === 'scr_cervix_hpv_2027' && a.on_date === '2027-01-20'), 'HPV prenotato, chiave con l’anno della data scelta');

  // 4. Nomi nelle notifiche: di partenza spento.
  const detailsBox = main.getByRole('checkbox', { name: tr('health.details') });
  check(!(await detailsBox.isChecked()), 'di partenza le notifiche non mostrano i nomi');
  await detailsBox.check();
  await page.waitForTimeout(800);
  check(rows('user_alert_preferences').some(p => p.user_id === ANNA && p.health_push_details === true), 'nomi nelle notifiche accesi');
  await page.setViewportSize({ width: 360, height: 780 });
  await main.getByRole('button', { name: tr('health.addTherapy') }).click();
  await page.waitForTimeout(300);
  check(await overflow() <= 1, `sul telefono, con il modulo aperto, niente esce dallo schermo (${await overflow()} px)`);
  await main.getByRole('button', { name: tr('health.card.open'), exact: true }).click();
  await page.waitForTimeout(300);
  check(await overflow() <= 1, `sul telefono, con le schede d'emergenza, niente esce dallo schermo (${await overflow()} px)`);
  const violations = await ui.axe();
  check(!violations.length, `accessibilità (${violations.join(', ')})`);
  check(!ui.errors.length, `nessun errore nella pagina ${ui.errors.slice(0, 3).join(' | ')}`);
} finally { await ui.context.close(); await browser.close(); await fake.close(); }
finish();

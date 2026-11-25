// Salute: medicine, terapie e visite (richiesta dell'utente del 25 novembre 2026, sera), nel browser
// con accesso e il Supabase finto. Il giorno è fisso: 25 novembre 2026 alle 10 di Roma.
// 1. io: terapia alle 8 e alle 20 con la confezione delle Scorte; «Oggi»: presa, annulla, saltata;
// 2. terapia in alcuni giorni della settimana; la confezione che finisce tra le medicine da ricomprare;
// 3. la mamma: vaccinazione con l'ora e i promemoria, che si ripete ogni anno; «Fatto» → la prossima;
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
  const violations = await ui.axe();
  check(!violations.length, `accessibilità (${violations.join(', ')})`);
  check(!ui.errors.length, `nessun errore nella pagina ${ui.errors.slice(0, 3).join(' | ')}`);
} finally { await ui.context.close(); await browser.close(); await fake.close(); }
finish();

// Rate e scadenze (richiesta dell'utente del 26 novembre 2026, notte), nel browser con accesso e il
// Supabase finto. Il giorno è fisso: 26 novembre 2026 alle 10 di Roma.
// 1. retta della scuola: anno scolastico con le rette da dicembre (e settembre già pagato);
// 2. contributi INPS della colf: le prossime quattro scadenze trimestrali, importo da definire;
// 3. libero professionista: secondo acconto del 30 novembre, importo scritto dopo;
// 4. prossime scadenze e totali; la retta pagata tra le proposte delle Spese detraibili; ricerca;
// 5. telefono e accessibilità.
// Uso: node scripts/prove-rate.mjs [http://localhost:3000]
import { checker, startScenario, openPage, launch } from './accesso-comune.mjs';
import { translate } from '../lib/i18n.mjs';

const { check, finish } = checker('Rate e scadenze');
const tr = (key, params) => translate('it', key, params);
const ANNA = '11111111-1111-4111-8111-111111111111';
const { fake, person } = await startScenario({ tokenTtl: 3 * 86400 });
const anna = person('anna', ANNA, 'anna@example.org');
const browser = await launch();
const ui = await openPage(browser);
const { page } = ui;
await page.clock.setFixedTime(new Date('2026-11-26T09:00:00Z'));
const main = page.locator('main');
const rows = table => fake.rows(table);
const overflow = () => page.evaluate(() => document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth);
const field = label => main.getByLabel(label, { exact: true });
const combo = label => main.getByRole('combobox', { name: new RegExp('^' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });

async function addPlan(kind, title, extra = {}) {
  await main.getByRole('button', { name: tr('inst.addPlan') }).click();
  await combo(tr('inst.kind')).selectOption(kind);
  await field(tr('inst.title')).fill(title);
  if (extra.person) await field(tr('inst.person')).fill(extra.person);
  if (extra.payee) await field(tr('inst.payee')).fill(extra.payee);
  await main.getByRole('button', { name: tr('inst.save') }).click();
  await page.waitForTimeout(700);
}

try {
  check(await ui.login(anna), 'Anna entra');
  await ui.go(tr('nav.installments'));
  check((await ui.main()).includes(tr('inst.plansEmpty').slice(0, 30)), 'all’inizio nessun impegno');

  // 1. Retta della scuola.
  await addPlan('school', 'Retta scuola Luca', { person: 'Luca', payee: 'Istituto San Carlo' });
  const school = rows('payment_plans').find(p => p.title === 'Retta scuola Luca');
  check(school?.kind === 'school' && school?.tax_category === 'education' && school?.person === 'Luca' && school?.user_id === ANNA, 'impegno salvato, nel 730 come istruzione');
  check(await combo(tr('inst.template')).inputValue() === 'school_year', 'per la scuola si parte dall’anno scolastico');
  await field(tr('inst.dayOfMonth')).fill('10');
  await field(tr('inst.amountEach')).fill('350');
  const preview = main.locator('.inst-preview');
  check(await preview.locator('input[type=checkbox]').count() === 10 && /Rate da aggiungere \(7\)/.test(await preview.innerText()), 'dieci rette, sette da oggi in poi già scelte');
  await preview.getByRole('checkbox', { name: /Retta di settembre 2026/ }).check();
  await main.getByRole('button', { name: tr('inst.addSelected') }).click();
  await page.waitForTimeout(800);
  const fees = rows('payment_installments').filter(i => i.plan_id === school.id);
  check(fees.length === 8 && fees.every(i => i.amount_cents === 35000) && fees.some(i => i.label === 'Retta di dicembre 2026' && i.due_on === '2026-12-10'), `otto rette da 350 € (${fees.length})`);
  check((await ui.toast()).includes('8 rate aggiunte.'), 'messaggio con quante rate');
  await main.getByRole('button', { name: tr('inst.payAria', { label: 'Retta di settembre 2026' }) }).first().click();
  check(await field(tr('inst.paidOn')).inputValue() === '2026-09-10' && await field(tr('inst.paidAmount')).inputValue() === '350,00', 'pagata: data e importo già scritti');
  await main.locator('form.health-done-form').getByRole('button', { name: tr('inst.save') }).click();
  await page.waitForTimeout(700);
  const sept = rows('payment_installments').find(i => i.label === 'Retta di settembre 2026');
  check(sept?.paid_on === '2026-09-10' && sept?.paid_cents === 35000, 'retta di settembre pagata');
  check((await ui.toast()).includes(tr('inst.paid730').slice(0, 30)), 'dice che va tra le proposte del 730');

  // 2. Contributi INPS della colf.
  await addPlan('domestic_worker', 'Contributi INPS Maria');
  await combo(tr('inst.template')).selectOption('domestic_inps');
  const inps = main.locator('.inst-preview');
  check(/Contributi INPS 4° trimestre 2026 · lun 11 gen 2027[\s\S]*Contributi INPS 1° trimestre 2027 · lun 12 apr 2027/.test(await inps.innerText()), 'trimestri: 11 gennaio e 12 aprile (il 10 cade di domenica e di sabato)');
  check(!(await main.getByLabel(tr('inst.amountEach')).count()), 'niente importo: lo calcola l’INPS');
  await main.getByRole('button', { name: tr('inst.addSelected') }).click();
  await page.waitForTimeout(800);
  const maria = rows('payment_plans').find(p => p.title === 'Contributi INPS Maria');
  check(rows('payment_installments').filter(i => i.plan_id === maria?.id && i.amount_cents === null).length === 4, 'quattro scadenze con l’importo da definire');

  // 3. Libero professionista: secondo acconto.
  await addPlan('freelance', 'Imposte e contributi');
  check(await combo(tr('inst.template')).inputValue() === 'income_taxes', 'per il professionista si parte da saldo e acconti');
  await main.getByRole('button', { name: tr('inst.addSelected') }).click();
  await page.waitForTimeout(800);
  const advance = rows('payment_installments').find(i => i.label === '2° acconto 2026');
  check(advance?.due_on === '2026-11-30', 'secondo acconto il 30 novembre');
  await main.getByRole('button', { name: tr('inst.editItemAria', { label: '2° acconto 2026' }) }).first().click();
  await field(tr('inst.amount')).fill('1200');
  await main.getByRole('button', { name: tr('inst.save') }).click();
  await page.waitForTimeout(700);
  check(rows('payment_installments').find(i => i.id === advance.id)?.amount_cents === 120000, 'importo scritto dopo');

  // 4. Prossime scadenze, totali, 730, ricerca.
  const agenda = main.locator('.inst-agenda li');
  check(/2° acconto 2026 · 1200,00\s€[\s\S]*Imposte e contributi · lun 30 nov 2026[\s\S]*Tra poco/.test(await agenda.nth(0).innerText()) && /Retta di dicembre 2026/.test(await agenda.nth(1).innerText()), 'in cima il 30 novembre, poi la retta di dicembre');
  const totals = (await main.locator('.inst-totals').innerText()).replace(/\s+/g, ' ');
  check(/Questo mese: 1200,00 € in 1 scadenza/.test(totals) && /Il mese prossimo: 350,00 € in 1 scadenza/.test(totals), `totali del mese (${totals})`);
  await ui.go(tr('nav.taxes'));
  await main.getByRole('button', { name: tr('taxes.fromExpenses') }).click();
  await page.waitForTimeout(1200);
  const proposal = main.locator('.taxes-candidates li', { hasText: 'Retta scuola Luca · Retta di settembre 2026' });
  check(await proposal.count() === 1 && (await proposal.innerText()).includes(tr('taxes.source.installment')), 'la retta pagata è tra le proposte del 730');
  await page.locator('.search-button').first().click();
  await page.locator('.search-dialog input[type=search]').fill('retta');
  await page.waitForTimeout(1500);
  check((await page.locator('.search-dialog').innerText()).toLowerCase().includes(tr('nav.installments').toLowerCase()), 'la ricerca trova l’impegno');
  await page.keyboard.press('Escape');

  // 5. Telefono e accessibilità.
  await ui.go(tr('nav.installments'));
  await page.setViewportSize({ width: 360, height: 780 });
  await main.locator('details.garden-plant', { hasText: 'Retta scuola Luca' }).locator('summary').click();
  await page.waitForTimeout(300);
  await main.locator('details.garden-plant', { hasText: 'Retta scuola Luca' }).getByRole('button', { name: tr('inst.addRates') }).click();
  await page.waitForTimeout(300);
  check(await overflow() <= 1, `sul telefono, con il modulo aperto, niente esce dallo schermo (${await overflow()} px)`);
  const violations = await ui.axe();
  check(!violations.length, `accessibilità (${violations.join(', ')})`);
  check(!ui.errors.length, `nessun errore nella pagina ${ui.errors.slice(0, 3).join(' | ')}`);
} finally { await ui.context.close(); await browser.close(); await fake.close(); }
finish();

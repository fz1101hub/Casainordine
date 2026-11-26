// Previsione delle uscite (scelta dell'utente del 26 novembre 2026, notte), nel browser con accesso
// e il Supabase finto. Il giorno è fisso: 26 novembre 2026 alle 10 di Roma.
// Dati: un'utenza della luce mensile (bolletta stimata di dicembre già creata), il condominio ogni
// tre mesi senza utenza, internet pagato a novembre, la retta della scuola da dicembre e una gita
// senza importo a gennaio. Controlla totali, mese più caro, voci del mese scelto, che nulla sia
// contato due volte, la tabella, l'orizzonte di 6 mesi, il telefono e l'accessibilità.
// Uso: node scripts/prove-previsione.mjs [http://localhost:3000]
import { checker, startScenario, openPage, launch } from './accesso-comune.mjs';
import { translate } from '../lib/i18n.mjs';

const { check, finish } = checker('Previsione delle uscite');
const tr = (key, params) => translate('it', key, params);
const ANNA = '11111111-1111-4111-8111-111111111111';
const { fake, person } = await startScenario({ tokenTtl: 3 * 86400 });
const anna = person('anna', ANNA, 'anna@example.org');
const id = (prefix, i) => `${prefix}-0000-4000-8000-${String(i).padStart(12, '0')}`;
const bill = (i, extra) => ({ id: id('30000000', i), user_id: ANNA, home_id: null, utility_id: null, paid_at: null, is_estimate: false, source: 'manual', created_at: '2026-01-01T10:00:00Z', ...extra });
fake.seed('utilities', [{ id: id('31000000', 1), user_id: ANNA, home_id: null, supplier: 'Luce Chiara', category: 'Luce', account_reference: '', estimated_amount: 80,
  frequency: 'monthly', billing_day: 12, next_due_date: '2027-01-12', active: true, created_at: '2026-01-01T10:00:00Z' }]);
fake.seed('bills', [
  bill(1, { utility_id: id('31000000', 1), title: 'Luce · Luce Chiara', supplier: 'Luce Chiara', category: 'Luce', amount: 80, due_date: '2026-12-12', is_estimate: true, source: 'recurring' }),
  bill(2, { title: 'Spese condominiali', supplier: 'Condominio Aurora', category: 'Casa', amount: 300, due_date: '2026-02-10', paid_at: '2026-02-09T10:00:00Z' }),
  bill(3, { title: 'Spese condominiali', supplier: 'Condominio Aurora', category: 'Casa', amount: 300, due_date: '2026-05-10', paid_at: '2026-05-09T10:00:00Z' }),
  bill(4, { title: 'Spese condominiali', supplier: 'Condominio Aurora', category: 'Casa', amount: 360, due_date: '2026-08-10', paid_at: '2026-08-09T10:00:00Z' }),
  bill(5, { title: 'Internet casa', supplier: 'Rete Veloce', category: 'Internet', amount: 29.9, due_date: '2026-11-03', paid_at: '2026-11-03T10:00:00Z' }),
]);
const PLAN = id('32000000', 1);
fake.seed('payment_plans', [{ id: PLAN, user_id: ANNA, home_id: null, title: 'Retta scuola Luca', kind: 'school', payee: 'Istituto San Carlo', person: 'Luca',
  tax_category: 'education', remind_days: 3, notes: '', ended_on: null, created_at: '2026-09-01T10:00:00Z', updated_at: '2026-09-01T10:00:00Z' }]);
fake.seed('payment_installments', [
  { id: id('33000000', 1), plan_id: PLAN, created_by: ANNA, label: 'Retta di dicembre 2026', due_on: '2026-12-10', amount_cents: 45000, paid_on: null, paid_cents: null, notes: '' },
  { id: id('33000000', 2), plan_id: PLAN, created_by: ANNA, label: 'Retta di gennaio 2027', due_on: '2027-01-10', amount_cents: 45000, paid_on: null, paid_cents: null, notes: '' },
  { id: id('33000000', 3), plan_id: PLAN, created_by: ANNA, label: 'Gita sulla neve', due_on: '2027-01-25', amount_cents: null, paid_on: null, paid_cents: null, notes: '' },
]);

const browser = await launch();
const ui = await openPage(browser);
const { page } = ui;
await page.clock.setFixedTime(new Date('2026-11-26T09:00:00Z'));
const main = page.locator('main');
const panel = main.locator('.forecast-panel');
const text = async locator => (await locator.innerText()).replace(/\s+/g, ' ');
const overflow = () => page.evaluate(() => document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth);

try {
  check(await ui.login(anna), 'Anna entra');
  await ui.go(tr('nav.insights'));
  await panel.locator('.forecast-chart').waitFor({ timeout: 15000 });
  check(await panel.getByRole('heading', { name: tr('extra.forecast.title') }).count() === 1, 'pannello «Previsione delle uscite»');

  // 1. Totali sui 12 mesi: novembre 29,90 + 320 (condominio stimato), dicembre 80 + 450,
  //    gennaio 80 + 450, poi 80 al mese e il condominio a febbraio, maggio, agosto.
  const stats = await text(panel.locator('.forecast-stats'));
  check(stats.includes('Totale in 12 mesi 3089,90 €'), `totale 12 mesi (${stats})`);
  check(stats.includes('Media al mese 257,49 €'), 'media al mese');
  check(/Mese più caro dicembre 2026 530,00 €/.test(stats), 'mese più caro: dicembre');
  const bars = panel.locator('.forecast-col');
  check(await bars.count() === 12, 'dodici barre');
  check(await panel.locator('.forecast-legend li').count() === 4, 'legenda con le quattro parti');

  if (process.env.SHOT) await panel.screenshot({ path: `${process.env.SHOT}-computer.png` });
  // 2. Il mese scelto all'inizio è il più caro; la bolletta stimata della luce non si conta due volte.
  const detail = panel.locator('.forecast-detail');
  let d = await text(detail);
  check(d.startsWith('dicembre 2026 · 530,00 €') && /Retta scuola Luca · Retta di dicembre 2026 · 10 dic Rate 450,00 €/.test(d) && /Luce · Luce Chiara · 12 dic Bollette registrate · stimata 80,00 €/.test(d), `voci di dicembre (${d.slice(0, 220)})`);
  check(await detail.locator('li').count() === 2, 'dicembre: due voci, la luce una volta sola');

  // 3. Gennaio: luce dall'utenza e la gita senza importo segnalata.
  await bars.nth(2).click();
  check(await bars.nth(2).getAttribute('aria-pressed') === 'true', 'gennaio scelto');
  d = await text(detail);
  check(d.startsWith('gennaio 2027 · 530,00 €') && d.includes('Utenze ricorrenti') && d.includes(tr('extra.forecast.unknown.one', { count: 1 })), `gennaio: utenza e rata senza importo (${d.slice(0, 220)})`);

  // 4. Novembre: internet pagato e la stima del condominio.
  await bars.nth(0).click();
  d = await text(detail);
  check(d.startsWith('novembre 2026 · 349,90 €') && /Spese condominiali Stima dallo storico 320,00 €/.test(d) && /Internet casa · 3 nov/.test(d), `novembre (${d.slice(0, 220)})`);

  // 5. Tabella con gli stessi numeri.
  await panel.locator('.forecast-table summary').click();
  const tableRows = panel.locator('.forecast-table tbody tr');
  check(await tableRows.count() === 12, 'tabella: dodici mesi');
  const feb = await text(tableRows.nth(3));
  check(feb === 'febbraio 2027 0,00 € 80,00 € 320,00 € 0,00 € 400,00 €', `tabella: febbraio (${feb})`);

  // 6. Orizzonte di 6 mesi.
  await panel.getByRole('combobox', { name: new RegExp('^' + tr('extra.insights.horizon')) }).selectOption('6');
  check(await bars.count() === 6, 'sei barre');
  const six = await text(panel.locator('.forecast-stats'));
  check(six.includes('Totale in 6 mesi 1969,90 €'), `totale 6 mesi (${six})`);

  // 7. Accessibilità e telefono.
  const violations = await ui.axe();
  check(!violations.length, `accessibilità (${violations.join(', ')})`);
  await page.setViewportSize({ width: 360, height: 780 });
  await page.waitForTimeout(300);
  check(await overflow() <= 1, 'telefono: niente scorrimento orizzontale');
  if (process.env.SHOT) await panel.screenshot({ path: `${process.env.SHOT}-telefono.png` });
  const box = await bars.nth(0).boundingBox();
  check(box && box.width >= 20, `telefono: barre larghe almeno 20 px (${box && Math.round(box.width)})`);
  check(!ui.errors.length, `nessun errore nella pagina ${ui.errors.slice(0, 3).join(' | ')}`);
} finally { await ui.context.close(); await browser.close(); await fake.close(); }
finish();

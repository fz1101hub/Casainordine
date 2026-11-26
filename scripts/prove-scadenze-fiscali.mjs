// Scadenze fiscali di famiglia (scelta dell'utente del 26 novembre 2026, mattina), nel browser con
// accesso e il Supabase finto. Il giorno è fisso: 26 novembre 2026 alle 10 di Roma.
// Controlla: scelta di 730 e IMU salvata; prossime scadenze con le date giuste; «Fatto» e «Riapri»;
// preavviso; documenti per il 730/2027 con le voci registrate e «pronto»; tutto resta dopo aver
// ricaricato; interruttore delle notifiche; telefono e accessibilità.
// Uso: node scripts/prove-scadenze-fiscali.mjs [http://localhost:3000]
import { checker, startScenario, openPage, launch } from './accesso-comune.mjs';
import { translate } from '../lib/i18n.mjs';

const { check, finish } = checker('Scadenze fiscali di famiglia');
const tr = (key, params) => translate('it', key, params);
const ANNA = '11111111-1111-4111-8111-111111111111';
const { fake, person } = await startScenario({ tokenTtl: 3 * 86400 });
const anna = person('anna', ANNA, 'anna@example.org');
const item = (i, category, amount) => ({ id: `40000000-0000-4000-8000-${String(i).padStart(12, '0')}`, user_id: ANNA, home_id: null, tax_year: 2026, category,
  description: `Voce ${i}`, amount_cents: amount, paid_on: '2026-05-10', payment_method: 'traceable', supplier: '', supplier_tax_code: '', document_id: null,
  source: 'manual', source_id: null, notes: '', cash_ok: false, created_at: '2026-05-10T10:00:00Z' });
fake.seed('home_tax_items', [item(1, 'medical', 4500), item(2, 'medical', 12000), item(3, 'sport', 21000)]);

const browser = await launch();
const ui = await openPage(browser);
const { page } = ui;
await page.clock.setFixedTime(new Date('2026-11-26T09:00:00Z'));
const main = page.locator('main');
const panel = main.locator('.taxcal');
const text = async locator => (await locator.innerText()).replace(/\s+/g, ' ');
const settings = () => fake.rows('tax_calendar_settings').find(r => r.user_id === ANNA && !r.home_id);
const overflow = () => page.evaluate(() => document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth);

try {
  check(await ui.login(anna), 'Anna entra');
  await ui.go(tr('nav.taxes'));
  await panel.waitFor({ timeout: 15000 });
  check((await text(panel)).includes(tr('taxes.cal.none')), 'all’inizio: scegli almeno una voce');

  // 1. Si seguono 730 e IMU.
  await panel.getByRole('checkbox', { name: tr('taxes.cal.group.730') }).check();
  await page.waitForTimeout(600);
  await panel.getByRole('checkbox', { name: tr('taxes.cal.group.imu') }).check();
  await page.waitForTimeout(600);
  check(JSON.stringify(settings()?.groups) === JSON.stringify(['730', 'imu']), `scelta salvata (${JSON.stringify(settings()?.groups)})`);
  const rows = panel.locator('.taxcal-list li');
  const list = await text(panel.locator('.taxcal-list'));
  check(await rows.count() === 5, `cinque scadenze nei prossimi 12 mesi (${await rows.count()})`);
  check(/^Saldo IMU 2026 Tra 20 giorni · mer 16 dic 2026/.test(list), `prima: saldo IMU (${list.slice(0, 120)})`);
  check(/Certificazione Unica 2027 Tra \d+ giorni · mar 16 mar 2027/.test(list) && /730 precompilato 2027 disponibile/.test(list) && /Acconto IMU 2027 Tra \d+ giorni · mer 16 giu 2027/.test(list)
    && /Invio del 730\/2027 Tra \d+ giorni · gio 30 set 2027/.test(list), 'CU, precompilata, acconto IMU e invio del 730');

  // 2. «Fatto» e «Riapri».
  await panel.getByRole('button', { name: tr('taxes.cal.markDoneAria', { what: 'Saldo IMU 2026' }) }).click();
  await page.waitForTimeout(600);
  check(settings()?.done?.includes('imu_balance_2026'), 'saldo IMU segnato come fatto');
  check((await text(rows.first())).startsWith('Saldo IMU 2026 Fatta · mer 16 dic 2026'), 'resta in elenco come «Fatta»');
  await panel.getByRole('button', { name: tr('taxes.cal.undoAria', { what: 'Saldo IMU 2026' }) }).click();
  await page.waitForTimeout(600);
  check(!settings()?.done?.includes('imu_balance_2026'), '«Riapri» la toglie dalle fatte');
  await panel.getByRole('button', { name: tr('taxes.cal.markDoneAria', { what: 'Saldo IMU 2026' }) }).click();
  await page.waitForTimeout(600);

  // 3. Preavviso.
  await panel.getByRole('combobox', { name: new RegExp('^' + tr('taxes.cal.remind')) }).selectOption('30');
  await page.waitForTimeout(600);
  check(settings()?.remind_days === 30, 'preavviso di 30 giorni salvato');

  // 4. Documenti per il 730/2027 (redditi 2026).
  const docs = await text(panel);
  check(docs.includes(tr('taxes.cal.docs', { year: 2027, taxYear: 2026 })), 'documenti per il 730/2027 (redditi 2026)');
  check(/Spese mediche, farmacia e dispositivi 2 voci registrate/.test(docs) && /Sport dei ragazzi \(5-18 anni\) 1 voce registrata/.test(docs) && /Asilo nido nessuna voce registrata/.test(docs), 'voci già registrate per categoria');
  await panel.getByRole('checkbox', { name: /^Certificazione Unica \(CU\)/ }).check();
  await page.waitForTimeout(600);
  check(settings()?.done?.includes('doc_cu_2026'), 'CU pronta');
  check((await text(panel)).includes('1 su 11 pronto'), 'conto dei documenti pronti');

  // 5. Dopo aver ricaricato resta tutto.
  await page.reload();
  await main.waitFor({ timeout: 15000 });
  await ui.go(tr('nav.taxes'));
  await panel.waitFor({ timeout: 15000 });
  await panel.locator('.taxcal-list').waitFor({ timeout: 10000 });
  check(await panel.getByRole('checkbox', { name: tr('taxes.cal.group.imu') }).isChecked() && await panel.getByRole('checkbox', { name: /^Certificazione Unica \(CU\)/ }).isChecked()
    && (await text(rows.first())).includes('Fatta'), 'dopo aver ricaricato: scelte, fatto e documenti');

  if (process.env.SHOT) await panel.screenshot({ path: `${process.env.SHOT}-computer.png` });
  // 6. Telefono e accessibilità.
  const violations = await ui.axe();
  check(!violations.length, `accessibilità (${violations.join(', ')})`);
  await page.setViewportSize({ width: 360, height: 780 });
  await page.waitForTimeout(300);
  check(await overflow() <= 1, `sul telefono niente esce dallo schermo (${await overflow()} px)`);
  if (process.env.SHOT) await panel.screenshot({ path: `${process.env.SHOT}-telefono.png` });

  // 7. Interruttore delle notifiche.
  await page.setViewportSize({ width: 1280, height: 900 });
  await ui.go(tr('nav.alerts'));
  await page.waitForTimeout(800);
  check(await main.getByText(tr('extra.alerts.taxes'), { exact: true }).count() >= 1, 'interruttore «Scadenze fiscali» tra le notifiche');
  check(!ui.errors.length, `nessun errore nella pagina ${ui.errors.slice(0, 3).join(' | ')}`);
} finally { await ui.context.close(); await browser.close(); await fake.close(); }
finish();

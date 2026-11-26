// Documenti di famiglia, riquadri nuovi della Home e ricerca nelle sezioni nuove (scelte
// dell'utente del 26 novembre 2026, notte), nel browser con accesso e il Supabase finto.
// Il giorno è fisso: 26 novembre 2026 alle 10 di Roma.
// 1. documenti: passaporto da rinnovare, carta senza scadenza, patente scaduta → «Rinnovato»;
// 2. Home: «Personalizza» con medicine di oggi e documenti; «Presa» dal riquadro;
// 3. ricerca: una terapia, un documento per nome e per tipo («passaporto»);
// 4. telefono: niente esce dallo schermo; accessibilità.
// Uso: node scripts/prove-documenti-home.mjs [http://localhost:3000]
import { checker, startScenario, openPage, launch } from './accesso-comune.mjs';
import { translate } from '../lib/i18n.mjs';

const { check, finish } = checker('Documenti di famiglia, Home e ricerca');
const tr = (key, params) => translate('it', key, params);
const ANNA = '11111111-1111-4111-8111-111111111111';

const { fake, person } = await startScenario({ tokenTtl: 3 * 86400 });
const anna = person('anna', ANNA, 'anna@example.org');
fake.seed('health_people', [{ id: 'p-anna', user_id: ANNA, home_id: null, name: 'Anna', relation: 'self', birth_on: null, vaccine_plan: 'off', checkup_plan: false }]);
fake.seed('health_therapies', [{ id: 't-asp', person_id: 'p-anna', created_by: ANNA, kind: 'medicine', name: 'Cardioaspirina', dose: '1 compressa', instructions: '', times: ['08:00:00', '20:00:00'], every_days: 1, weekdays: null, start_on: '2026-11-01', end_on: null, remind: true, stock_item_id: null, stock_use: null, notes: '' }]);
const browser = await launch();
const ui = await openPage(browser);
const { page } = ui;
await page.clock.setFixedTime(new Date('2026-11-26T09:00:00Z'));
const main = page.locator('main');
const rows = table => fake.rows(table);
const overflow = () => page.evaluate(() => document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth);
const field = (label, scope = main) => scope.getByLabel(label, { exact: true });

async function addDoc({ holder, kind, expires, noExpiry = false }) {
  await main.getByRole('button', { name: tr('iddocs.add') }).click();
  await field(tr('iddocs.holder')).fill(holder);
  await main.getByRole('combobox', { name: new RegExp('^' + tr('iddocs.kind')) }).selectOption(kind);
  if (noExpiry) await main.getByRole('checkbox', { name: tr('iddocs.noExpiry') }).check();
  else await field(tr('iddocs.expiresOn')).fill(expires);
  await main.getByRole('button', { name: tr('iddocs.save') }).click();
  await page.waitForTimeout(700);
}

try {
  check(await ui.login(anna), 'Anna entra');
  // 1. Documenti di famiglia.
  await ui.go(tr('nav.iddocs'));
  check((await ui.main()).includes(tr('iddocs.empty').slice(0, 30)), 'all’inizio nessun documento');
  await main.getByRole('button', { name: tr('iddocs.add') }).click();
  check(await main.getByLabel(tr('iddocs.notice')).inputValue() === '120', 'carta d’identità: avviso 120 giorni prima di partenza');
  await main.getByRole('combobox', { name: new RegExp('^' + tr('iddocs.kind')) }).selectOption('passport');
  check(await main.getByLabel(tr('iddocs.notice')).inputValue() === '180', 'passaporto: 180 giorni prima');
  check(await main.locator('datalist#iddocs-holders option[value="Anna"]').count() === 1, 'i nomi delle persone di Salute sono suggeriti');
  await main.getByRole('button', { name: tr('iddocs.cancel') }).click();
  await addDoc({ holder: 'Luca', kind: 'passport', expires: '2027-05-12' });
  const passport = rows('family_documents').find(d => d.holder === 'Luca');
  check(passport?.kind === 'passport' && passport?.expires_on === '2027-05-12' && passport?.notice_days === 180 && passport?.user_id === ANNA && passport?.home_id === null, 'passaporto salvato con il preavviso');
  check((await ui.toast()).includes('Passaporto di Luca salvato'), 'messaggio con tipo e persona');
  await addDoc({ holder: 'Nonno Gino', kind: 'identity_card', noExpiry: true });
  check(rows('family_documents').find(d => d.holder === 'Nonno Gino')?.expires_on === null, 'carta d’identità senza scadenza');
  await addDoc({ holder: 'Anna', kind: 'driving_license', expires: '2026-11-20' });
  const items = main.locator('.iddocs-list li');
  check(await items.count() === 3, 'tre documenti');
  check(/Patente · Anna[\s\S]*Scaduto il 20 nov 2026/.test(await items.nth(0).innerText()) && /Passaporto · Luca[\s\S]*Da rinnovare: scade tra 167 giorni/.test(await items.nth(1).innerText())
    && /Carta d'identità · Nonno Gino[\s\S]*Senza scadenza/.test(await items.nth(2).innerText()), 'prima lo scaduto, poi da rinnovare, poi senza scadenza');
  check((await ui.main()).includes('2 documenti da rinnovare o scaduti.'), 'riassunto in alto');
  await main.getByRole('button', { name: tr('iddocs.renewAria', { what: 'Patente', holder: 'Anna' }) }).click();
  await field(tr('iddocs.newExpiry')).fill('2036-11-20');
  await main.locator('.health-done-form').getByRole('button', { name: tr('iddocs.save') }).click();
  await page.waitForTimeout(700);
  check(rows('family_documents').find(d => d.holder === 'Anna')?.expires_on === '2036-11-20', '«Rinnovato»: nuova scadenza salvata');
  check(/Valido fino al 20 nov 2036/.test(await main.locator('.iddocs-list li', { hasText: 'Patente' }).innerText()), 'la patente ora è valida');
  await main.getByRole('button', { name: tr('iddocs.deleteAria', { what: "Carta d'identità", holder: 'Nonno Gino' }) }).click();
  await ui.confirm();
  await page.waitForTimeout(600);
  check(!rows('family_documents').some(d => d.holder === 'Nonno Gino'), 'documento eliminato');

  // 2. Home: riquadri nuovi.
  await ui.go(tr('nav.dashboard'));
  await page.waitForTimeout(800);
  await main.getByRole('button', { name: tr('home.personalize') }).click();
  for (const id of ['medicines', 'documents']) await main.locator('.home3-editor-row', { hasText: tr('home.widget.' + id) }).getByRole('checkbox').check();
  await main.getByRole('button', { name: tr('home.editor.save') }).click();
  await page.waitForTimeout(900);
  const prefs = rows('user_home_preferences').find(p => p.user_id === ANNA);
  check(JSON.stringify(prefs?.widget_order) === JSON.stringify(['bills', 'shopping', 'tasks', 'five_minutes', 'medicines', 'documents']), `riquadri salvati (${JSON.stringify(prefs?.widget_order)})`);
  const meds = main.locator('.home3-card', { hasText: tr('home.widget.medicines') });
  await meds.locator('.home3-item').first().waitFor({ timeout: 8000 }).catch(() => {});
  check(/2 ancora da prendere oggi/.test(await meds.innerText()) && /08:00 · Cardioaspirina[\s\S]*Anna[\s\S]*Da prendere/.test(await meds.innerText()) && /20:00 · Cardioaspirina[\s\S]*Più tardi/.test(await meds.innerText()), 'medicine di oggi: quella delle 8 da prendere, quella delle 20 più tardi');
  await meds.getByRole('button', { name: tr('home.medicines.takeAria', { name: 'Cardioaspirina', time: '08:00', person: 'Anna' }) }).click();
  await page.waitForTimeout(800);
  const dose = rows('health_doses').find(d => d.therapy_id === 't-asp');
  check(dose?.status === 'taken' && Date.parse(dose?.due_at) === Date.parse('2026-11-26T07:00:00Z'), 'presa dal riquadro: dose delle 8 di Roma segnata');
  check(/08:00 · Cardioaspirina[\s\S]*Presa/.test(await meds.innerText()) && (await ui.toast()).includes('Cardioaspirina delle 08:00: presa.'), 'il riquadro e il messaggio lo dicono');
  const docsCard = main.locator('.home3-card', { hasText: tr('home.widget.documents') });
  check(/1 da rinnovare/.test(await docsCard.innerText()) && /Passaporto · Luca[\s\S]*scade il mer 12 mag \(tra 167 giorni\)/.test(await docsCard.innerText()), 'documenti in scadenza nella Home');
  await docsCard.getByRole('button', { name: tr('home.openAll') }).click();
  await page.waitForTimeout(600);
  check((await ui.main()).includes(tr('iddocs.help').slice(0, 30)), '«Vedi tutto» apre i Documenti di famiglia');

  // 3. Ricerca nelle sezioni nuove.
  for (const [text, group, expected] of [['cardioasp', tr('nav.health'), 'Cardioaspirina'], ['luca', tr('nav.iddocs'), 'Luca'], ['passapo', tr('nav.iddocs'), 'Luca']]) {
    await page.locator('.search-button').first().click();
    await page.locator('.search-dialog input[type=search]').fill(text);
    await page.waitForTimeout(1500);
    const found = await page.locator('.search-dialog').innerText().catch(() => '');
    check(found.toLowerCase().includes(group.toLowerCase()) && found.includes(expected), `ricerca «${text}»: ${expected} in ${group}`);
    await page.keyboard.press('Escape');
  }

  // 4. Telefono e accessibilità.
  await ui.go(tr('nav.iddocs'));
  await page.setViewportSize({ width: 360, height: 780 });
  await main.getByRole('button', { name: tr('iddocs.add') }).click();
  await page.waitForTimeout(300);
  check(await overflow() <= 1, `sul telefono, con il modulo aperto, niente esce dallo schermo (${await overflow()} px)`);
  const violations = await ui.axe();
  check(!violations.length, `accessibilità (${violations.join(', ')})`);
  check(!ui.errors.length, `nessun errore nella pagina ${ui.errors.slice(0, 3).join(' | ')}`);
} finally { await ui.context.close(); await browser.close(); await fake.close(); }
finish();

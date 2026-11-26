// Tanti dati nelle sezioni nuove (scelta dell'utente del 26 novembre 2026, notte: «Prova con tanti
// dati»): Salute, Animali, Giardino, Spese detraibili e Documenti di famiglia con anni di storico, su
// un telefono con il processore 4 volte più lento e il Supabase finto che risponde con al massimo
// 1000 righe, come il progetto vero.
// Controlla per ogni sezione: si apre in tempi brevi, nessun lavoro lungo blocca il telefono, la
// pagina non disegna migliaia di righe insieme e i dati più recenti ci sono tutti.
// Uso: app compilata per il Supabase finto (vedi scripts/prove-con-accesso.mjs), poi
//   node scripts/prove-molti-dati-sezioni.mjs [http://localhost:3000]
import { checker, startScenario, openPage, launch } from './accesso-comune.mjs';
import { translate } from '../lib/i18n.mjs';

const { check, finish } = checker('Tanti dati nelle sezioni nuove');
const tr = (key, params) => translate('it', key, params);
const { fake, person } = await startScenario({ maxRows: 1000, tokenTtl: 3 * 86400 });
const anna = person('anna', '11111111-1111-4111-8111-111111111111', 'anna@example.org');
const A = anna.id;
const TODAY = '2026-11-26';
const day = n => new Date(Date.parse(TODAY + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const uuid = (prefix, i) => `${prefix}000000-0000-4000-8000-${String(i).padStart(12, '0')}`;

// Salute: 30 persone, 10 terapie ciascuna (due orari), una settimana di dosi, 150 visite e 200 spese a testa.
const people = Array.from({ length: 30 }, (_, i) => ({ id: uuid('a1', i), user_id: A, home_id: null, name: i === 0 ? 'Anna' : `Persona ${String(i).padStart(2, '0')}`,
  relation: i === 0 ? 'self' : i < 4 ? 'child' : 'other', birth_on: i < 4 && i > 0 ? day(-200 * i) : '1980-03-0' + ((i % 9) + 1), notes: '',
  vaccine_plan: i > 0 && i < 4 ? 'mandatory' : 'off', checkup_plan: i > 0 && i < 4, blood_type: null, allergies: '', conditions: '', doctor_name: '', doctor_phone: '', emergency_name: '', emergency_phone: '' }));
const therapies = people.flatMap((p, i) => Array.from({ length: 10 }, (_, j) => ({ id: uuid('a2', i * 10 + j), person_id: p.id, created_by: A, kind: 'medicine', name: `Farmaco ${i}-${j}`,
  dose: '1 compressa', instructions: '', times: ['08:00:00', '20:00:00'], every_days: 1, weekdays: null, start_on: '2026-01-01', end_on: j % 2 ? null : '2027-12-31', remind: true, stock_item_id: null, stock_use: null, notes: '' })));
const doses = therapies.flatMap((t, i) => Array.from({ length: 7 }, (_, d) => ({ id: uuid('a3', i * 7 + d), therapy_id: t.id, due_at: `${day(-d - 1)}T07:00:00.000Z`, status: d % 3 ? 'taken' : 'skipped', done_at: `${day(-d - 1)}T07:10:00.000Z`, created_by: A })));
const appointments = people.flatMap((p, i) => Array.from({ length: 150 }, (_, j) => { const on = day(-1800 + j * 12 + i); return { id: uuid('a4', i * 150 + j), person_id: p.id, created_by: A, kind: j % 5 ? 'visit' : 'exam',
  title: `Visita ${i}-${j}`, on_date: on, at_time: null, place: '', notes: '', reminders: ['day_before'], repeat_months: 0, done_on: on < TODAY ? on : null, schedule_key: null }; }));
const expenses = people.flatMap((p, i) => Array.from({ length: 200 }, (_, j) => ({ id: uuid('a5', i * 200 + j), person_id: p.id, created_by: A, spent_on: day(-1000 + j * 5 - (i % 5)),
  kind: ['pharmacy', 'visit', 'exam', 'ssn'][j % 4], description: `Spesa ${i}-${j}`, amount_cents: 500 + j, payment_method: j % 3 ? 'traceable' : 'cash', appointment_id: null, notes: '' })));
// Animali: 30, con 8 voci del piano e 150 righe del registro ciascuno.
const pets = Array.from({ length: 30 }, (_, i) => ({ id: uuid('b1', i), user_id: A, home_id: null, name: `Animale ${String(i).padStart(2, '0')}`, species: 'dog', preset: null, breed: '', sex: null,
  birth_on: '2020-05-01', neutered: false, microchip: '', weight_kg: null, food_stock_item_id: null, food_daily: null, vet_name: '', vet_phone: '', notes: '', ended_on: null }));
const petTasks = pets.flatMap((p, i) => Array.from({ length: 8 }, (_, j) => ({ id: uuid('b2', i * 8 + j), pet_id: p.id, created_by: A, kind: 'antiparasitic', title: `Antiparassitario ${i}-${j}`,
  product: '', dose: '', every_days: 30, next_on: day(j * 9 - 3), last_done_on: day(j * 9 - 33), remind: true, stock_item_id: null, stock_use: null, notes: '' })));
const petLog = pets.flatMap((p, i) => Array.from({ length: 150 }, (_, j) => ({ id: uuid('b3', i * 150 + j), pet_id: p.id, task_id: null, created_by: A, done_on: day(-1500 + j * 10),
  kind: j % 10 ? 'antiparasitic' : 'weight', title: `Registro ${i}-${j}`, product: '', dose: '', notes: '', weight_kg: j % 10 ? null : 20 + (j % 7), cost_cents: j % 4 ? null : 1500, document_id: null })));
// Giardino: 200 piante, 4 interventi e 20 righe del registro ciascuna.
const plants = Array.from({ length: 200 }, (_, i) => ({ id: uuid('c1', i), user_id: A, home_id: null, name: `Pianta ${String(i).padStart(3, '0')}`, kind: i % 3 ? 'ornamental' : 'vegetable',
  location: `Aiuola ${i % 12}`, preset: null, notes: '', planted_on: '2026-03-01', harvest_days: null, bed: '', family: null, ended_on: null }));
const gardenTasks = plants.flatMap((p, i) => Array.from({ length: 4 }, (_, j) => ({ id: uuid('c2', i * 4 + j), plant_id: p.id, created_by: A, kind: 'fertilize', title: `Concime ${i}-${j}`,
  product: '', dose: '', notes: '', months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], every_days: 30, next_on: day(j * 8 - 2 + (i % 5)), last_done_on: day(j * 8 - 32), remind: true, stock_item_id: null, stock_use: null, wait_days: null })));
const gardenLog = plants.flatMap((p, i) => Array.from({ length: 20 }, (_, j) => ({ id: uuid('c3', i * 20 + j), plant_id: p.id, task_id: null, created_by: A, done_on: day(-600 + j * 30),
  kind: 'fertilize', title: `Fatto ${i}-${j}`, product: '', dose: '', notes: '', wait_days: null })));
// Spese detraibili: 1500 voci quest'anno e 1500 l'anno scorso. Documenti: 150.
const taxItems = Array.from({ length: 3000 }, (_, i) => ({ id: uuid('d1', i), user_id: A, home_id: null, tax_year: i < 1500 ? 2026 : 2025, category: ['medical', 'veterinary', 'other'][i % 3],
  description: `Voce ${i}`, amount_cents: 1000 + i, paid_on: i < 1500 ? day(-(i % 320)) : `2025-${String((i % 12) + 1).padStart(2, '0')}-10`, payment_method: 'traceable', supplier: '', supplier_tax_code: '',
  document_id: null, source: 'manual', source_id: null, notes: '', cash_ok: false, created_at: `${day(-(i % 320))}T10:00:00Z` }));
const documents = Array.from({ length: 150 }, (_, i) => ({ id: uuid('e1', i), user_id: A, home_id: null, holder: `Persona ${String(i % 30).padStart(2, '0')}`,
  kind: ['identity_card', 'passport', 'driving_license', 'health_card', 'residence_permit'][i % 5], label: '', expires_on: day(-60 + i * 20), notice_days: 90, notes: '' }));
for (const [table, list] of Object.entries({ health_people: people, health_therapies: therapies, health_doses: doses, health_appointments: appointments, health_expenses: expenses,
  home_pets: pets, home_pet_tasks: petTasks, home_pet_log: petLog, home_garden_plants: plants, home_garden_tasks: gardenTasks, home_garden_log: gardenLog,
  home_tax_items: taxItems, family_documents: documents })) fake.seed(table, list);

const browser = await launch();
try {
  const ui = await openPage(browser, { viewport: { width: 412, height: 915 }, device: { isMobile: true, hasTouch: true, deviceScaleFactor: 2.625 } });
  const { page } = ui;
  await page.clock.setFixedTime(new Date(TODAY + 'T09:00:00Z'));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.addInitScript(() => { window.__long = 0; new PerformanceObserver(l => { for (const e of l.getEntries()) window.__long = Math.max(window.__long, e.duration); }).observe({ type: 'longtask', buffered: true }); });
  const longest = async () => page.evaluate(() => { const v = window.__long || 0; window.__long = 0; return Math.round(v); });
  const nodes = () => page.evaluate(() => document.querySelectorAll('main *').length);
  check(await ui.login(anna), 'Anna entra');
  await page.locator('main h1').first().waitFor({ timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1500); await longest();
  if (process.env.DEBUG_SHOT) { await page.screenshot({ path: '/tmp/molti-login.png' }); console.log('burger', await page.locator('.burger').isVisible().catch(() => 'x'), 'sidebar', await page.locator('.sidebar').count()); }

  // Apre una sezione e aspetta il segno che i dati sono arrivati.
  async function open(section, ready, label) {
    const t0 = Date.now();
    await ui.go(section);
    const ok = await page.waitForFunction(ready, null, { timeout: 60000, polling: 200 }).then(() => true, () => false);
    const ms = Date.now() - t0, long = await longest(), count = await nodes();
    console.log(`   ${label}: ${ms} ms, lavoro più lungo ${long} ms, ${count} elementi nella pagina`);
    check(ok, `${label}: i dati arrivano`);
    check(ms < 20000, `${label}: si apre in meno di 20 secondi sul telefono lento (${ms} ms)`);
    check(long < 1500, `${label}: nessun lavoro lungo blocca il telefono (${long} ms)`);
    return { ms, long, count };
  }

  const health = await open(tr('nav.health'), () => /Farmaco 0-/.test(document.querySelector('main')?.innerText || ''), 'Salute');
  check(health.count < 6000, `Salute: la pagina non disegna migliaia di righe (${health.count} elementi)`);
  // 600 dosi oggi (30 persone × 10 terapie × 2 orari): se ne disegnano 40 alla volta, e lo dice.
  check(await page.locator('.health-doses li').count() === 40 && /Mostrate 40 di 600/.test(await ui.main()), 'Salute: le dosi di oggi a pagine, «Mostrate 40 di 600»');
  await page.getByRole('button', { name: 'Mostra ancora 50' }).first().click();
  await page.waitForTimeout(500);
  check(await page.locator('.health-doses li').count() === 90, '«Mostra ancora 50» aggiunge le successive');
  check(/2026: [\d.,]+\s€ in \d+ spese/.test((await page.locator('.health-expense-total').innerText().catch(() => '')).replace(/\s+/g, ' ')), 'Salute: il totale delle spese dell’anno c’è');
  // Cambiare persona deve essere rapido anche con 150 visite e 200 spese a testa.
  await longest();
  let t0 = Date.now();
  await page.getByRole('button', { name: 'Persona 01', exact: true }).click();
  await page.waitForFunction(() => /Farmaco 1-/.test(document.querySelector('.health-person')?.innerText || ''), null, { timeout: 20000 }).catch(() => {});
  const switchMs = Date.now() - t0, switchLong = await longest();
  console.log(`   cambio persona: ${switchMs} ms, lavoro più lungo ${switchLong} ms`);
  check(switchLong < 1000, `Salute: cambiare persona non blocca (${switchLong} ms)`);

  const petsInfo = await open(tr('nav.pets'), () => /Animale 00/.test(document.querySelector('main')?.innerText || ''), 'Animali');
  check(petsInfo.count < 6000, `Animali: la pagina non disegna migliaia di righe (${petsInfo.count} elementi)`);
  const gardenInfo = await open(tr('nav.garden'), () => /Pianta 000/.test(document.querySelector('main')?.innerText || ''), 'Giardino');
  check(gardenInfo.count < 8000, `Giardino: la pagina non disegna migliaia di righe (${gardenInfo.count} elementi)`);
  const taxInfo = await open(tr('nav.taxes'), () => /Voce \d/.test(document.querySelector('main')?.innerText || ''), 'Spese detraibili');
  check(taxInfo.count < 6000, `Spese detraibili: la pagina non disegna migliaia di righe (${taxInfo.count} elementi)`);
  check(await page.locator('.taxes-items li').count() === 100 && /Mostrate 100 di 1500/.test(await ui.main()), 'Spese detraibili: 100 voci alla volta, «Mostrate 100 di 1500»');
  const docsInfo = await open(tr('nav.iddocs'), () => /Persona \d\d/.test(document.querySelector('main')?.innerText || ''), 'Documenti di famiglia');
  check(await page.locator('.iddocs-list li').count() === 150, 'Documenti: tutti e 150');

  // Home con tutti i riquadri nuovi.
  fake.seed('user_home_preferences', [{ user_id: A, widget_order: ['medicines', 'health', 'pets', 'garden', 'documents'], layout: 'compact' }]);
  await open(tr('nav.dashboard'), () => /Medicine di oggi[\s\S]*\d+ ancora da prendere oggi/.test(document.querySelector('main')?.innerText || ''), 'Home con i riquadri nuovi');
  check(!ui.errors.length, `nessun errore nella pagina ${ui.errors.slice(0, 3).join(' | ')}`);
} finally { await browser.close(); await fake.close(); }
finish();

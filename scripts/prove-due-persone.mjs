// Due persone insieme nella stessa casa (scelta dell'utente, 24 novembre 2026): Anna e Luca hanno
// l'app aperta sulle stesse bollette; Anna paga, elimina, aggiunge; Luca agisce sui dati che ha sullo
// schermo, ormai vecchi. Niente pagamenti sovrascritti o confermati per sbaglio, niente errori, e
// tornando all'app dopo un minuto i dati si aggiornano da soli.
// Uso: app compilata per il Supabase finto (vedi scripts/prove-con-accesso.mjs), poi
//   node scripts/prove-due-persone.mjs [http://localhost:3000]
import { checker, startScenario, openPage, launch } from './accesso-comune.mjs';

const { check, finish } = checker('Due persone insieme');
const { fake, person } = await startScenario();
const anna = person('anna', '11111111-1111-4111-8111-111111111111', 'anna@example.org');
const luca = person('luca', '22222222-2222-4222-8222-222222222222', 'luca@example.org');
const HOME = '10000000-0000-4000-8000-0000000000aa';
const LUCE = '20000000-0000-4000-8000-0000000000a1', GAS = '20000000-0000-4000-8000-0000000000a2', TASK = '30000000-0000-4000-8000-0000000000a1';
const due = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
fake.seed('homes', [{ id: HOME, name: 'Casa al mare', owner_id: anna.id, created_at: '2026-11-01T10:00:00Z' }]);
fake.seed('home_members', [
  { home_id: HOME, user_id: anna.id, email: anna.email, role: 'owner', joined_at: '2026-11-01T10:00:00Z' },
  { home_id: HOME, user_id: luca.id, email: luca.email, role: 'editor', joined_at: '2026-11-02T10:00:00Z' }]);
fake.seed('bills', [
  { id: LUCE, user_id: anna.id, home_id: HOME, title: 'Luce al mare', supplier: 'Enel', category: 'Luce', amount: 55, due_date: due(5), paid_at: null, source: 'manual', created_at: '2026-11-01T10:00:00Z' },
  { id: GAS, user_id: anna.id, home_id: HOME, title: 'Gas al mare', supplier: 'Eni', category: 'Gas', amount: 42, due_date: due(8), paid_at: null, source: 'manual', created_at: '2026-11-01T10:00:00Z' }]);
fake.seed('home_shopping', [{ id: '40000000-0000-4000-8000-0000000000a1', home_id: HOME, title: 'Pane', quantity: '1', checked: false, created_by: anna.id, created_at: '2026-11-20T10:00:00Z' }]);
fake.seed('house_tasks', [{ id: TASK, user_id: anna.id, home_id: HOME, title: 'Chiudere l\'acqua', due_date: due(3), done_at: null, created_at: '2026-11-01T10:00:00Z' }]);
const bill = id => fake.rows('bills').find(b => b.id === id);

const browser = await launch();
try {
  const a = await openPage(browser), l = await openPage(browser);
  await l.page.clock.install();
  const enterHome = async ui => {
    await ui.page.locator('select.house-switch').selectOption(HOME);
    await ui.page.waitForTimeout(1500);
    await ui.go('Bollette');
  };
  check(await a.login(anna) && await l.login(luca), 'Anna e Luca entrano');
  await enterHome(a); await enterHome(l);
  const row = (ui, title) => ui.page.locator('.bills-table tbody tr').filter({ hasText: title });
  check(await row(a, 'Luce al mare').count() === 1 && await row(l, 'Luce al mare').count() === 1, 'tutti e due vedono la luce da pagare');

  // 1. Anna paga la luce; Luca, con i dati vecchi, la paga anche lui.
  await row(a, 'Luce al mare').locator('.pay-action').click();
  await a.page.waitForTimeout(1200);
  const paidByAnna = bill(LUCE).paid_at;
  check(Boolean(paidByAnna), 'Anna segna pagata la luce');
  await row(l, 'Luce al mare').locator('.pay-action').click();
  await l.page.waitForTimeout(1500);
  check(/un altro membro della casa ha cambiato/.test(await l.toast()), `Luca viene avvisato che è già stata cambiata (${await l.toast()})`);
  check(bill(LUCE).paid_at === paidByAnna, 'il pagamento di Anna non viene sovrascritto né annullato');

  // 2. Anna elimina il gas; Luca prova a pagarlo.
  a.page.once('dialog', d => d.accept());
  await row(a, 'Gas al mare').locator('.muted-action').last().click();
  await a.confirm();
  check(!bill(GAS), 'Anna elimina il gas');
  await row(l, 'Gas al mare').locator('.pay-action').click();
  await l.page.waitForTimeout(1500);
  check(/un altro membro della casa ha cambiato/.test(await l.toast()), 'Luca viene avvisato invece di «Pagamento registrato»');
  check(!bill(GAS) && fake.rows('bills').length === 1, 'nessuna bolletta ricompare');
  check(await row(l, 'Gas al mare').count() === 0, 'e dall\'elenco di Luca il gas sparisce');

  // 3. Attività: Anna la segna fatta, Luca (dati vecchi) la segna fatta anche lui.
  await a.go('Attività casa'); await l.go('Attività casa');
  const taskBox = ui => ui.page.locator('.task-row').filter({ hasText: 'Chiudere l\'acqua' }).locator('.task-check');
  await taskBox(a).click(); await a.page.waitForTimeout(1200);
  const doneAt = fake.rows('house_tasks')[0].done_at;
  await taskBox(l).click(); await l.page.waitForTimeout(1500);
  check(Boolean(doneAt) && fake.rows('house_tasks')[0].done_at === doneAt, 'l\'attività fatta da Anna resta fatta (Luca non la riapre per sbaglio)');

  // 3b. Lista della spesa: Anna spunta il pane, Luca (dati vecchi) lo spunta anche lui.
  await a.go('Lista della spesa'); await l.go('Lista della spesa');
  const bread = ui => ui.page.locator('main label').filter({ hasText: 'Pane' }).locator('input[type=checkbox]').first();
  await bread(a).click(); await a.page.waitForTimeout(1200);
  await bread(l).click(); await l.page.waitForTimeout(1500);
  check(fake.rows('home_shopping')[0].checked === true, 'il pane spuntato da Anna resta spuntato (Luca non lo toglie per sbaglio)');
  check(/un altro membro della casa ha cambiato/.test(await l.toast()), 'e Luca viene avvisato');

  // 4. Anna aggiunge una bolletta; Luca torna all'app dopo più di un minuto e la vede.
  fake.seed('bills', [{ id: '20000000-0000-4000-8000-0000000000a3', user_id: anna.id, home_id: HOME, title: 'Acqua al mare', supplier: 'Acea', category: 'Acqua',
    amount: 30, due_date: due(10), paid_at: null, source: 'manual', created_at: new Date().toISOString() }]);
  await l.go('Bollette');
  check(await row(l, 'Acqua al mare').count() === 0, 'subito Luca non la vede ancora');
  await l.page.clock.fastForward('01:05');
  await l.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await row(l, 'Acqua al mare').first().waitFor({ timeout: 8000 }).catch(() => {});
  check(await row(l, 'Acqua al mare').count() === 1, 'tornando all\'app dopo un minuto, Luca vede la bolletta nuova');
  check(!a.errors.length && !l.errors.length, `nessun errore nelle pagine ${[...a.errors, ...l.errors].join(' | ')}`);
} finally { await browser.close(); fake.close(); }
finish();

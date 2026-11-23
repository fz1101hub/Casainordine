// Prova nel browser dei ruoli in una casa condivisa (scelta dell'utente, 23 novembre 2026), con il
// Supabase finto di scripts/prove-con-accesso.mjs: chi modifica, chi legge, il proprietario.
// Uso (app compilata per il Supabase finto, vedi prove-con-accesso.mjs):
//   node scripts/prove-ruoli.mjs [indirizzo dell'app]
import { checker, startScenario, openPage, launch } from './accesso-comune.mjs';

const { check, finish } = checker('Prove dei ruoli');
const { fake, person } = await startScenario();
const anna = person('anna', '11111111-1111-4111-8111-111111111111', 'anna@example.org');
const luca = person('luca', '22222222-2222-4222-8222-222222222222', 'luca@example.org');
const marta = person('marta', '33333333-3333-4333-8333-333333333333', 'marta@example.org');
const HOME = '10000000-0000-4000-8000-0000000000aa';
fake.seed('homes', [{ id: HOME, name: 'Casa al mare', owner_id: anna.id, created_at: '2026-11-01T10:00:00Z' }]);
fake.seed('home_members', [
  { home_id: HOME, user_id: anna.id, email: anna.email, role: 'owner', joined_at: '2026-11-01T10:00:00Z' },
  { home_id: HOME, user_id: luca.id, email: luca.email, role: 'editor', joined_at: '2026-11-02T10:00:00Z' },
  { home_id: HOME, user_id: marta.id, email: marta.email, role: 'viewer', joined_at: '2026-11-03T10:00:00Z' },
]);
fake.seed('bills', [
  { id: '20000000-0000-4000-8000-0000000000a1', user_id: anna.id, home_id: HOME, title: 'Luce della casa al mare', supplier: 'Enel', category: 'Luce', amount: 55, due_date: '2026-12-18', paid_at: null, created_at: '2026-11-04T10:00:00Z' },
  { id: '20000000-0000-4000-8000-0000000000a2', user_id: anna.id, home_id: null, title: 'Telefono personale di Anna', supplier: 'Tim', category: 'Internet', amount: 29, due_date: '2026-12-19', paid_at: null, created_at: '2026-11-04T10:00:00Z' },
]);

const browser = await launch();
try {
  const ui = await openPage(browser);
  const { page } = ui;
  const enterHome = async () => {
    await ui.go('Famiglia e inviti');
    await page.getByRole('button', { name: /Casa al mare/ }).first().click();
    await page.waitForTimeout(1200);
  };
  const spaceButtons = async () => page.getByRole('button', { name: /Casa al mare/ }).count();

  // Luca, editor: modifica, ma senza i comandi del proprietario.
  check(await ui.login(luca), 'Luca (editor) entra');
  await ui.go('Famiglia e inviti');
  check(await spaceButtons() === 1, 'la casa compare una volta sola tra gli spazi di Luca');
  await enterHome();
  check(!/sola lettura a questa casa/.test(await ui.main()), 'per chi modifica non compare l\'avviso di sola lettura');
  await ui.go('Famiglia e inviti');
  check(await page.getByRole('button', { name: 'Genera invito' }).count() === 0, 'chi modifica non invita');
  check(await page.locator('select[aria-label="Ruolo"]').count() === 0 && await page.getByRole('button', { name: 'Rimuovi membro' }).count() === 0, 'chi modifica non cambia ruoli e non rimuove membri');
  check(await page.getByText('Elimina definitivamente questa casa').count() === 0, 'chi modifica non elimina la casa');
  check(await page.getByRole('button', { name: 'Esci da questa casa' }).count() === 1, 'chi modifica può uscire dalla casa');
  await ui.go('Bollette');
  await page.getByRole('button', { name: 'Aggiungi bolletta' }).first().click();
  await page.getByLabel('Descrizione').fill('Gas della casa al mare');
  await page.getByLabel('Importo €').fill('63,40'.replace(',', '.'));
  await page.getByLabel('Data scadenza').fill('2026-12-22');
  await page.locator('.modal .modal-actions .btn-primary').click();
  await page.waitForTimeout(1500);
  const added = fake.rows('bills').find(b => b.title === 'Gas della casa al mare');
  check(added?.home_id === HOME, 'chi modifica aggiunge una bolletta, nella casa');
  check(/Gas della casa al mare/.test(await ui.main()), 'e la vede nell\'elenco');
  check(!/Telefono personale di Anna/.test(await ui.main()), 'senza vedere le bollette personali di Anna');
  check(await ui.logout(), 'Luca esce');

  // Marta, lettrice: sola lettura.
  check(await ui.login(marta), 'Marta (lettrice) entra');
  await enterHome();
  check(/sola lettura a questa casa/.test(await ui.main()), 'Marta vede l\'avviso di sola lettura');
  await ui.go('Bollette');
  check(/Gas della casa al mare/.test(await ui.main()), 'Marta vede la bolletta aggiunta da Luca');
  check(await ui.logout(), 'Marta esce');

  // Anna, proprietaria: ruoli, rimozione, eliminazione.
  check(await ui.login(anna), 'Anna (proprietaria) entra');
  await enterHome();
  await ui.go('Famiglia e inviti');
  check(await page.locator('select[aria-label="Ruolo"]').count() === 2, 'la proprietaria vede i ruoli dei 2 membri');
  const members = await page.locator('.hub-list').first().innerText();
  check(!/·\s*(owner|editor|viewer)\b/.test(members), `i ruoli sono scritti in italiano, non come codici (${members.replace(/\s+/g, ' ').slice(0, 120)})`);
  const martaRow = page.locator('.hub-item', { hasText: marta.email });
  await martaRow.locator('select[aria-label="Ruolo"]').selectOption('editor');
  await page.waitForTimeout(1200);
  check(fake.rows('home_members').find(m => m.user_id === marta.id)?.role === 'editor', 'la proprietaria rende Marta editor');
  await page.locator('.hub-item', { hasText: luca.email }).getByRole('button', { name: 'Rimuovi membro' }).click();
  await ui.confirm();
  check(!fake.rows('home_members').some(m => m.user_id === luca.id), 'la proprietaria rimuove Luca');
  check(!(await page.locator('.hub-list').first().innerText()).includes(luca.email), 'Luca sparisce dall\'elenco dei membri');
  const violations = await ui.axe();
  check(violations.length === 0, `nessuna violazione WCAG in «Famiglia e inviti» per la proprietaria ${violations.join(' ')}`);
  check(await ui.logout(), 'Anna esce');

  // Luca, rimosso: la casa non c'è più.
  check(await ui.login(luca), 'Luca rientra dopo la rimozione');
  await ui.go('Famiglia e inviti');
  check(await spaceButtons() === 0, 'per Luca la casa non c\'è più');
  await ui.go('Bollette');
  check(!/Casa al mare|della casa al mare/.test(await ui.main()), 'e non ne vede più le bollette');
  check(await ui.logout(), 'Luca esce');

  // Marta, ora editor, esce dalla casa da sola.
  check(await ui.login(marta), 'Marta rientra');
  await enterHome();
  check(!/sola lettura a questa casa/.test(await ui.main()), 'il nuovo ruolo di Marta vale subito');
  await ui.go('Famiglia e inviti');
  await page.getByRole('button', { name: 'Esci da questa casa' }).click();
  await ui.confirm();
  check(!fake.rows('home_members').some(m => m.user_id === marta.id), 'Marta lascia la casa');
  check(await spaceButtons() === 0, 'e la casa non compare più tra i suoi spazi');
  check(await ui.logout(), 'Marta esce');

  // Anna elimina la casa: nome sbagliato, poi giusto.
  check(await ui.login(anna), 'Anna rientra');
  await enterHome();
  await ui.go('Famiglia e inviti');
  await page.getByText('Elimina definitivamente questa casa').click();
  await page.getByRole('button', { name: 'Elimina casa e dati condivisi' }).click();
  await ui.confirm('Casa al monte');
  check(fake.rows('homes').length === 1 && /Nome non corrispondente/.test(await ui.toast()), 'con il nome sbagliato la casa non si elimina');
  await page.getByRole('button', { name: 'Elimina casa e dati condivisi' }).click();
  await ui.confirm('Casa al mare');
  check(fake.rows('homes').length === 0, 'con il nome giusto la casa si elimina');
  check(!fake.rows('bills').some(b => b.home_id === HOME) && fake.rows('bills').some(b => b.title === 'Telefono personale di Anna'), 'con le sue bollette, non quelle personali');
  check(await spaceButtons() === 0, 'e sparisce dagli spazi di Anna');
  check(ui.errors.length === 0, `nessun errore JavaScript${ui.errors.length ? ': ' + ui.errors.slice(0, 3).join(' | ') : ''}`);
} finally {
  await browser.close();
  await fake.close();
}
finish();

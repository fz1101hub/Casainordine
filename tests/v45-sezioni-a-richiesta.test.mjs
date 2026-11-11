// Secondo audit, A1: le sezioni che non si vedono all'avvio si scaricano quando si aprono.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const page = readFileSync(new URL('../app/page.jsx', import.meta.url), 'utf8');

test('Sezioni caricate a richiesta con next/dynamic', () => {
  assert.match(page, /import dynamic from 'next\/dynamic';/);
  for (const name of ['MailImporter', 'HouseholdHub', 'PushSettings', 'CalendarFeed', 'HomeExtra', 'V20Hub', 'V21Hub', 'SampleAccountSetup']) {
    assert.doesNotMatch(page, new RegExp(`^import ${name} from`, 'm'), `${name} importato all'avvio`);
    assert.match(page, new RegExp(`const ${name}=lazy\\(\\(\\)=>import\\('\\./${name}'\\)\\);`), name);
  }
  // La Home resta nel pacchetto iniziale: è la prima pagina che si vede.
  assert.match(page, /^import PersonalizedHome from '\.\/PersonalizedHome';$/m);
  assert.match(page, /function SectionLoading\(\)\{const \{t\}=useLanguage\(\);return <p className="import-progress" role="status">\{t\('general\.loading'\)\}<\/p>;\}/);
});

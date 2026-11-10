import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildFiveMinuteBriefing } from '../lib/v21-core.mjs';
import { v21BriefingCopy } from '../lib/v21-briefing-copy.mjs';
import { LANGUAGES, translate } from '../lib/i18n.mjs';
const source=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('Home personalizzata: «Le 5 azioni» nella lingua scelta', () => {
  const home=source('app/PersonalizedHome.jsx');
  assert.match(home,/copy:v21BriefingCopy\(language\)/);
  assert.match(home,/\[bills,tasks,extras,language\]/);
  const bills=[{id:'1',title:'Luce',due_date:'2026-11-12'}];
  for(const {code} of LANGUAGES){
    const [item]=buildFiveMinuteBriefing({bills,today:'2026-11-10',copy:v21BriefingCopy(code)});
    if(code!=='it')assert.doesNotMatch(item.label,/Pagamento entro/,code);
    assert.match(item.label,/Luce$/);
  }
});

test('Barra laterale: «Spazio personale» e «Casa condivisa» tradotti', () => {
  const page=source('app/page.jsx');
  assert.doesNotMatch(page,/"SPAZIO PERSONALE"|"CASA CONDIVISA"/);
  assert.match(page,/tr\('v32\.overview\.personalSpace'\)\.toUpperCase\(\)/);
  assert.match(page,/tr\('v32\.overview\.sharedHome'\)\.toUpperCase\(\)/);
  for(const {code} of LANGUAGES)for(const key of ['v32.overview.personalSpace','v32.overview.sharedHome'])assert.notEqual(translate(code,key),key);
});

test('revisione 3.2: il tedesco dà sempre del tu e l inglese non contiene italiano', async () => {
  const { TRANSLATIONS, MESSAGE_KEYS } = await import('../lib/i18n.mjs');
  const { billReminderCopy } = await import('../lib/notification-copy.mjs');
  const { v20AlertCopy } = await import('../lib/v20-alert-copy.mjs');
  const files = ['lib/mail-api-errors.mjs', 'lib/notification-copy.mjs', 'lib/v20-alert-copy.mjs'].map(f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'));
  // «Sie» come pronome (essi/esso) resta ammesso: si cercano solo le forme di cortesia.
  const formal = /\b(Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres|Ihnen)\b|\b[A-ZÄÖÜ][a-zäöüß]+en Sie\b|\b(erhalten|können|möchten|müssen|haben) Sie\b/;
  for (const key of MESSAGE_KEYS) assert.doesNotMatch(TRANSLATIONS.de[key], formal, key);
  for (const source of files) assert.doesNotMatch(source, /'(Wählen|Öffnen) Sie |'Ihr Postfach/);
  assert.equal(TRANSLATIONS.en['v32.flow.deleteConfirm'], 'Delete this item?');
  assert.ok(billReminderCopy && v20AlertCopy);
});

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

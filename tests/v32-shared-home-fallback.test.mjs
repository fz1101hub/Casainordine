import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LANGUAGES, TRANSLATIONS} from '../lib/i18n.mjs';
const page=readFileSync(new URL('../app/page.jsx',import.meta.url),'utf8');
test('shared-home fallback is localized for each supported language',()=>{
 for(const {code} of LANGUAGES){
  assert.equal(typeof TRANSLATIONS[code]['general.house'],'string');
  assert.ok(TRANSLATIONS[code]['general.house'].trim());
 }
 assert.ok(page.includes("h.homes?.name||tr('general.house')"));
 assert.ok(page.includes("homeMembership?.homes?.name||tr('general.house')"));
 assert.ok(!page.includes("homes?.name||'Casa'"));
});

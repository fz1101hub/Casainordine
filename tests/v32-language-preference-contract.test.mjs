import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LANGUAGES,languageStorageKey,normalizeLanguage,localeFor} from '../lib/i18n.mjs';

const provider=readFileSync(new URL('../app/LanguageProvider.jsx',import.meta.url),'utf8');
const layout=readFileSync(new URL('../app/layout.jsx',import.meta.url),'utf8');

test('document language follows the selected language after hydration',()=>{
  assert.match(layout,/<html lang="it">/);
  assert.match(provider,/document\.documentElement\.lang\s*=\s*language/);
  assert.match(provider,/\[language\]/);
});

test('all supported account languages have distinct storage keys and valid locale identifiers',()=>{
  const codes=LANGUAGES.map(item=>item.code);
  assert.deepEqual([...codes].sort(),['de','en','es','fr','it','pt']);
  const ids=['user-a','user-b'];
  const keys=ids.map(id=>languageStorageKey(id));
  assert.equal(new Set(keys).size,ids.length);
  assert.notEqual(keys[0],languageStorageKey());
  for(const code of codes){
    assert.equal(normalizeLanguage(code),code);
    assert.doesNotThrow(()=>new Intl.DateTimeFormat(localeFor(code)).format(new Date('2026-11-06T12:00:00Z')));
  }
});

test('a pending remote preference read cannot overwrite a newer manual choice',()=>{
  assert.match(provider,/selectionEpoch\.current!==epoch/);
  assert.match(provider,/request!==authRequest\.current/);
  assert.match(provider,/currentAccount\.current===user\.id/);
  assert.match(provider,/languageStorageKey\(accountId\)/);
  assert.match(provider,/\.eq\('user_id',user\.id\)/);
});

test('switching accounts resets the visible language before the remote preference read resolves',()=>{
  assert.match(provider,/if\(currentAccount\.current!==nextAccount\)\s*\{/);
  assert.match(provider,/setLanguageState\(nextAccount\?accountLanguage\(nextAccount\):deviceLanguage\(\)\)/);
  const reset=provider.indexOf('setLanguageState(nextAccount?accountLanguage(nextAccount):deviceLanguage())');
  const read=provider.indexOf("client.from('user_language_preferences')");
  assert.ok(reset>=0&&read>reset,'account-local fallback must precede remote preference fetch');
});

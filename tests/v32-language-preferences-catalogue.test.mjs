import test from 'node:test';
import assert from 'node:assert/strict';
import {LANGUAGES,normalizeLanguage,browserLanguage,localeFor,languageStorageKey,LANGUAGE_STORAGE_KEY,translate,TRANSLATIONS,MESSAGE_KEYS} from '../lib/i18n.mjs';

test('regional language tags normalize to the six supported languages',()=>{
 for(const {code,locale} of LANGUAGES){
  assert.equal(normalizeLanguage(locale),code);
  assert.equal(browserLanguage(locale),code);
  assert.equal(localeFor(locale),locale);
  assert.equal(normalizeLanguage(' '+code.toUpperCase()+' '),code);
 }
 for(const unsupported of ['ja-JP','ru-RU','',null,undefined]){
  assert.equal(normalizeLanguage(unsupported),'it');
  assert.equal(browserLanguage(unsupported),'it');
 }
});

test('per-account language storage keys remain distinct',()=>{
 assert.equal(languageStorageKey(),LANGUAGE_STORAGE_KEY);
 const a=languageStorageKey('account-a');
 const b=languageStorageKey('account-b');
 assert.notEqual(a,b);
 assert.notEqual(a,LANGUAGE_STORAGE_KEY);
 assert.equal(languageStorageKey('account-a'),a);
});

test('all catalogue entries are nonempty strings in every language',()=>{
 for(const key of MESSAGE_KEYS){
  for(const {code} of LANGUAGES){
   assert.equal(typeof TRANSLATIONS[code][key],'string',code+' '+key);
   assert.ok(TRANSLATIONS[code][key].trim().length>0,code+' '+key);
  }
 }
});

test('unknown keys and placeholder substitution are predictable',()=>{
 assert.equal(translate('en','nonexistent.test.key'),'nonexistent.test.key');
 for(const {code} of LANGUAGES){
  assert.equal(translate(code,'extra.backup.tooManyRows',{table:'documents'}).includes('documents'),true,code);
  assert.equal(translate(code,'extra.backup.tooManyRows').includes('{table}'),true,code);
 }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {acceptedLanguage,normalizeLanguage,localeFor} from '../lib/i18n-core.mjs';

test('v3.2 HTTP language negotiation respects priority, exclusion and stable ties',()=>{
 const cases=[
  ['fr-FR, en-GB;q=0.8','fr'],
  ['fr-FR;q=0.2, de-DE;q=0.9','de'],
  ['nl-NL, pt-PT;q=0.5','pt'],
  ['es-ES;q=0, en-GB;q=0.7','en'],
  ['en-GB;q=0, *;q=1','it'],
  ['de-DE;q=0.8, fr-FR;q=0.8','de'],
  ['en-GB;q=1.0000, es-ES;q=0.5','es'],
  ['en-GB;q=1e0, pt-PT;q=0.5','pt'],
  ['fr-FR;q=0.9;q=0.1, es-ES;q=0.5','es'],
  ['en-GB;foo=bar, de-DE;q=0.6','de'],
  ['en-GB;q=2, fr-FR;q=0.5','fr'],
  ['not_a_locale, de-DE;q=0.5','de'],
  ['', 'it']
 ];
 for(const [header,expected] of cases)assert.equal(acceptedLanguage(header),expected,header);
});

test('v3.2 malformed locale identifiers cannot inherit a supported language',()=>{
 for(const malformed of ['en@evil','fr/FR','pt--PT','de;foo','es<script>']){
  assert.equal(normalizeLanguage(malformed),'it');
  assert.equal(localeFor(malformed),'it-IT');
 }
 for(const [tag,code] of [['en-GB','en'],['es_ES','es'],['pt-PT','pt'],['fr-CA','fr'],['de-DE','de']]){
  assert.equal(normalizeLanguage(tag),code);
 }
});

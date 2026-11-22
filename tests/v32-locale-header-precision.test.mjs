import test from 'node:test';
import assert from 'node:assert/strict';
import {LANGUAGES,acceptedLanguage,formatMoney,formatCount} from '../lib/i18n-core.mjs';

// The language of an unauthenticated recipient must honor HTTP exclusions
// rather than the order in which the browser happens to send its preferences.
test('Accept-Language honors weighted choices, exclusions and fallback',()=>{
 assert.equal(acceptedLanguage('de-DE;q=0.4, fr-FR;q=0.9, en-GB;q=0.8'),'fr');
 assert.equal(acceptedLanguage('de-DE;q=0, en-GB;q=0.8'),'en');
 assert.equal(acceptedLanguage('en-GB;q=1.001, es-ES;q=0.7'),'es');
 assert.equal(acceptedLanguage('fr-FR;q=1e0, pt-PT;q=0.7'),'pt');
 assert.equal(acceptedLanguage('de-DE;q=0.9;q=0.8, it-IT;q=0.7'),'it');
 assert.equal(acceptedLanguage('*, xx-XX;q=0.9'),'it');
});

test('six locale formatters reject misleading precision and malformed values',()=>{
 for(const {code} of LANGUAGES){
  for(const bad of ['9007199254740993','9007199254740991.1','', ' ', '1,234.50','1e3']){
   assert.equal(formatMoney(bad,code),'—',`money ${code} ${bad}`);
   assert.equal(formatCount(bad,code),'—',`count ${code} ${bad}`);
  }
  assert.equal(formatMoney(10,code,'not-a-currency'),'—');
  assert.equal(formatMoney('0',code),new Intl.NumberFormat(LANGUAGES.find(x=>x.code===code).locale,{style:'currency',currency:'EUR'}).format(0));
 }
});

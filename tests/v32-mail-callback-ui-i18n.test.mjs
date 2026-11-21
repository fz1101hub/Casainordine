import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {translate,TRANSLATIONS} from '../lib/i18n.mjs';

const callback=readFileSync(new URL('../app/api/mail/callback/route.js',import.meta.url),'utf8');
const page=readFileSync(new URL('../app/page.jsx',import.meta.url),'utf8');
const statuses=['connected','denied','expired','other_browser','no_refresh','failed','invalid_state'];

test('OAuth callback statuses have localized UI coverage in all six languages',()=>{
  const mapping=page.match(/const MAIL_STATUS=\{([^}]+)\}/)?.[1];
  assert.ok(mapping,'MAIL_STATUS mapping missing');
  const mapped=Object.fromEntries([...mapping.matchAll(/(\w+):'([^']+)'/g)].map(([,status,key])=>[status,key]));
  assert.equal(mapped.connected,'mail.status.connected');
  for(const status of statuses){
    assert.match(callback,new RegExp("redirect\\('"+status+"'\\s*,\\s*request\\)"));
    const key=mapped[status]||'mail.status.failed';
    for(const lang of ['it','en','es','fr','de','pt']){
      assert.ok(Object.hasOwn(TRANSLATIONS[lang],key),lang+' missing '+key);
      assert.ok(translate(lang,key).trim(),lang+' empty '+key);
      assert.notEqual(translate(lang,key),key,lang+' untranslated '+key);
    }
  }
  assert.match(page,/MAIL_STATUS\[status\]\|\|'mail\.status\.failed'/);
});

test('OAuth callback never redirects with raw provider error messages',()=>{
  assert.match(callback,/encodeURIComponent\(status\)/);
  assert.doesNotMatch(callback,/redirect\(url\.searchParams\.get\(['"]error['"]\)/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OAUTH_COOKIE, oauthStateCookie, clearOauthStateCookie, readCookie, sameSecret, browserBinding, mailboxMatchesAccount } from '../lib/oauth-binding.mjs';

const source=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('OAuth: il cookie di collegamento è HttpOnly, SameSite=Lax, limitato al callback e di 10 minuti',()=>{
  const prev=process.env.APP_URL;
  try{
    process.env.APP_URL='https://casa.example';
    const c=oauthStateCookie('abc');
    assert.match(c,new RegExp(`^${OAUTH_COOKIE}=abc;`));
    for(const part of ['Path=/api/mail/callback','Max-Age=600','HttpOnly','SameSite=Lax','Secure'])assert.ok(c.includes(part),part);
    assert.match(clearOauthStateCookie(),/Max-Age=0/);
  }finally{if(prev===undefined)delete process.env.APP_URL;else process.env.APP_URL=prev;}
});

test('OAuth: il ritorno è accettato solo dal browser che ha avviato il collegamento',()=>{
  const state='s'.repeat(43);
  assert.equal(browserBinding(`a=1; ${OAUTH_COOKIE}=${state}`,state),'bound');
  assert.equal(browserBinding(`${OAUTH_COOKIE}=${'x'.repeat(43)}`,state),'mismatch');
  assert.equal(browserBinding(`${OAUTH_COOKIE}=short`,state),'mismatch');
  assert.equal(browserBinding('a=1',state),'missing');
  assert.equal(browserBinding(null,state),'missing');
  assert.equal(readCookie(' x = 1 ; y=2','y'),'2');
  assert.equal(sameSecret('',''),false);
});

test('OAuth senza cookie: solo la casella con lo stesso indirizzo verificato dell’account',()=>{
  const user={email:'Anna@Gmail.com',email_confirmed_at:'2026-11-01T10:00:00Z'};
  assert.equal(mailboxMatchesAccount(user,'anna@gmail.com'),true);
  assert.equal(mailboxMatchesAccount(user,'vittima@gmail.com'),false);
  assert.equal(mailboxMatchesAccount({...user,email_confirmed_at:null},'anna@gmail.com'),false);
  assert.equal(mailboxMatchesAccount(null,'anna@gmail.com'),false);
});

test('OAuth: start imposta il cookie e il callback lo verifica e lo cancella',()=>{
  const start=source('app/api/mail/start/route.js'),callback=source('app/api/mail/callback/route.js');
  assert.match(start,/'Set-Cookie':oauthStateCookie\(state\)/);
  assert.match(callback,/browserBinding\(request\.headers\.get\('cookie'\),state\)/);
  assert.match(callback,/binding==='mismatch'\)return redirect\('other_browser'\)/);
  assert.match(callback,/mailboxMatchesAccount\(account\?\.user,email\)/);
  assert.match(callback,/'Set-Cookie':clearOauthStateCookie\(\)/);
  // Il cookie va verificato prima di salvare la casella.
  assert.ok(callback.indexOf("binding==='missing'")<callback.indexOf("from('mail_connections').upsert"));
});

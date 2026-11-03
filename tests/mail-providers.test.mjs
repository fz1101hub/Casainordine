import test from 'node:test';
import assert from 'node:assert/strict';
import { IMAP_PROVIDERS, MAIL_PROVIDERS, isImapProvider, validateMailboxInput, providerLabel } from '../lib/mail-providers.mjs';
import { microsoftConsentUrl } from '../lib/mail-microsoft.mjs';
import { syncConnection } from '../lib/mail-sync.mjs';

test('Microsoft OAuth uses delegated read-only mail access, PKCE, offline refresh and shared callback',()=>{
  const prev={id:process.env.MICROSOFT_MAIL_CLIENT_ID,secret:process.env.MICROSOFT_MAIL_CLIENT_SECRET,url:process.env.APP_URL};
  try{
    process.env.MICROSOFT_MAIL_CLIENT_ID='test-id';process.env.MICROSOFT_MAIL_CLIENT_SECRET='secret';process.env.APP_URL='https://casa.example';
    const u=new URL(microsoftConsentUrl('nonce', 'a-unique-verifier'));
    assert.equal(u.hostname,'login.microsoftonline.com');
    assert.equal(u.searchParams.get('scope'),'offline_access User.Read Mail.Read');
    assert.equal(u.searchParams.get('response_type'),'code');
    assert.equal(u.searchParams.get('code_challenge_method'),'S256');
    assert.equal(u.searchParams.get('redirect_uri'),'https://casa.example/api/mail/callback');
    assert.equal(u.searchParams.get('state'),'nonce');
  }finally{
    for(const [key,name] of Object.entries({id:'MICROSOFT_MAIL_CLIENT_ID',secret:'MICROSOFT_MAIL_CLIENT_SECRET',url:'APP_URL'})){
      if(prev[key]===undefined)delete process.env[name];else process.env[name]=prev[key];
    }
  }
});
test('IMAP is restricted to approved TLS hosts and never accepts arbitrary server addresses',()=>{
  assert.ok(Object.keys(IMAP_PROVIDERS).length>=14);
  for(const [id,config] of Object.entries(IMAP_PROVIDERS)){
    assert.ok(MAIL_PROVIDERS.includes(id));
    assert.equal(isImapProvider(id),true);
    assert.match(config.host,/^[a-z0-9.-]+$/);
    assert.ok(providerLabel(id));
  }
  assert.equal(isImapProvider('localhost'),false);
  assert.throws(()=>validateMailboxInput({provider:'localhost',email:'x@foo.com',password:'securepw'}));
  assert.throws(()=>validateMailboxInput({provider:'icloud',email:'invalid',password:'securepw'}));
  assert.throws(()=>validateMailboxInput({provider:'icloud',email:'x@foo.com',password:'bad'}),/password/i);
});
test('IMAP account can specify iCloud short username and plaintext credential is not in public info',()=>{
  const result=validateMailboxInput({provider:'icloud',email:' Example@icloud.com ',login:'Example',password:'app-password-xyz'});
  assert.equal(result.email_address,'example@icloud.com');
  assert.equal(result.imap_login,'Example');
  assert.equal(result.host,'imap.mail.me.com');
  assert.equal(result.password,'app-password-xyz');
  assert.throws(()=>validateMailboxInput({provider:'yahoo',email:'example@yahoo.com',login:'foo\nbar',password:'secretpw'}));
});
test('Provider dispatch rejects unknown service',()=>{
  assert.throws(()=>syncConnection(null,{provider:'a-webmail-without-api'}),/sconosciuto/);
});

test('Microsoft Graph sync stores candidate PDF once and rotates encrypted refresh token',async()=>{
  const {encryptSecret,decryptSecret}=await import('../lib/mail-core.mjs');
  const {syncMicrosoftConnection}=await import('../lib/mail-microsoft.mjs');
  const oldKey=process.env.MAIL_TOKEN_ENCRYPTION_KEY;
  const oldFetch=globalThis.fetch;
  const calls={uploads:0,inserts:0,updates:[],requests:[]};
  process.env.MAIL_TOKEN_ENCRYPTION_KEY=Buffer.alloc(32,8).toString('base64');
  const initial=encryptSecret('refresh-previous');
  const pdf=Buffer.from('%PDF-1.7\n1 0 obj\nendobj\n');
  const makeJson=(body)=>({ok:true,json:async()=>body});
  const fakeUpdate=(table,data)=>({eq:async()=>{calls.updates.push({table,data});return {error:null};}});
  const admin={
    from(table){return {
      update(data){return fakeUpdate(table,data);},
      select(){return {eq(){return this;},order(){return this;},limit:async()=>({data:[],error:null}),maybeSingle:async()=>({data:null,error:null})};},
      insert:async()=>{calls.inserts++;return {error:null};}
    };},
    storage:{from(){return {upload:async()=>{calls.uploads++;return {error:null};},remove:async()=>({error:null})};}}
  };
  try{
    globalThis.fetch=async(input,options={})=>{
      const url=String(input);calls.requests.push(url);
      if(url.endsWith('/token'))return makeJson({access_token:'graph-token',refresh_token:'refresh-updated'});
      if(url.includes('/mailFolders/inbox/messages?'))return makeJson({value:[{id:'MSG-1',subject:'Bolletta gas',from:{emailAddress:{address:'fatture@fornitore.it'}},receivedDateTime:'2026-11-01T10:00:00Z',hasAttachments:true}]});
      if(url.includes('/MSG-1?$select=internetMessageHeaders'))return makeJson({internetMessageHeaders:[]});
      if(url.includes('/MSG-1/attachments?'))return makeJson({value:[{'@odata.type':'#microsoft.graph.fileAttachment',id:'ATT-1',name:'bolletta.pdf',contentType:'application/pdf',size:pdf.length,contentBytes:pdf.toString('base64')}]});
      throw new Error(`Unexpected request: ${url}`);
    };
    const result=await syncMicrosoftConnection(admin,{id:'c1',user_id:'u1',provider:'outlook',refresh_token_enc:initial},{messageLimit:5,docLimit:3});
    assert.equal(result.error,undefined);
    assert.equal(result.imported,1);
    assert.equal(calls.uploads,1);
    assert.equal(calls.inserts,1);
    const tokenChange=calls.updates.find(x=>x.data.refresh_token_enc);
    assert.ok(tokenChange);
    assert.equal(decryptSecret(tokenChange.data.refresh_token_enc),'refresh-updated');
  }finally{
    globalThis.fetch=oldFetch;
    if(oldKey===undefined)delete process.env.MAIL_TOKEN_ENCRYPTION_KEY;else process.env.MAIL_TOKEN_ENCRYPTION_KEY=oldKey;
  }
});

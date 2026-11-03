import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allowedAttachment, likelyBillEmail, flattenAttachments, safeFileName, encryptSecret, decryptSecret,
  hashState, newOAuthState, newCodeVerifier, codeChallenge, decodeGmailData,fileSignatureIsValid,googleConsentUrl
} from '../lib/mail-core.mjs';

test('OAuth uses unpredictable state and correct PKCE challenge',()=>{
  const a=newOAuthState(),b=newOAuthState(),verifier=newCodeVerifier();
  assert.notEqual(a,b);assert.equal(hashState(a).length,64);
  assert.ok(verifier.length>=43);assert.equal(codeChallenge(verifier).length,43);
});
test('Gmail consent asks only read-only scope and offline token',()=>{
  const oldId=process.env.GOOGLE_MAIL_CLIENT_ID,oldSecret=process.env.GOOGLE_MAIL_CLIENT_SECRET,oldUrl=process.env.APP_URL;
  try{
    process.env.GOOGLE_MAIL_CLIENT_ID='id';process.env.GOOGLE_MAIL_CLIENT_SECRET='secret';process.env.APP_URL='http://localhost:3000';
    const u=new URL(googleConsentUrl('state','some-verifier'));
    assert.equal(u.searchParams.get('scope'),'https://www.googleapis.com/auth/gmail.readonly');
    assert.equal(u.searchParams.get('access_type'),'offline');
    assert.equal(u.searchParams.get('code_challenge_method'),'S256');
    assert.equal(u.searchParams.get('redirect_uri'),'http://localhost:3000/api/mail/callback');
  }finally{if(oldId===undefined)delete process.env.GOOGLE_MAIL_CLIENT_ID;else process.env.GOOGLE_MAIL_CLIENT_ID=oldId;
    if(oldSecret===undefined)delete process.env.GOOGLE_MAIL_CLIENT_SECRET;else process.env.GOOGLE_MAIL_CLIENT_SECRET=oldSecret;
    if(oldUrl===undefined)delete process.env.APP_URL;else process.env.APP_URL=oldUrl;}
});
test('Tokens are authenticated-encrypted and cannot be tampered',()=>{
  const old=process.env.MAIL_TOKEN_ENCRYPTION_KEY;
  try{
    process.env.MAIL_TOKEN_ENCRYPTION_KEY=Buffer.alloc(32,7).toString('base64');
    const first=encryptSecret('refresh-token'),second=encryptSecret('refresh-token');
    assert.notEqual(first,second);assert.equal(decryptSecret(first),'refresh-token');
    const broken=first.split('.');
    const tag=Buffer.from(broken[2],'base64url');tag[0]^=1;broken[2]=tag.toString('base64url');
    assert.throws(()=>decryptSecret(broken.join('.')));
  }finally{if(old===undefined)delete process.env.MAIL_TOKEN_ENCRYPTION_KEY;else process.env.MAIL_TOKEN_ENCRYPTION_KEY=old;}
});
test('Identifies plausible bill email without copying arbitrary attachments',()=>{
  const msg={payload:{headers:[{name:'Subject',value:'La tua bolletta energia'},{name:'From',value:'servizio@fornitore.it'}],parts:[
    {filename:'bolletta.pdf',mimeType:'application/pdf',body:{size:1024,attachmentId:'abc'}},
    {mimeType:'multipart/related',parts:[{filename:'logo.png',mimeType:'image/png',body:{size:30,attachmentId:'def'}}]}
  ]}};
  assert.equal(likelyBillEmail(msg).matched,true);
  assert.equal(flattenAttachments(msg.payload).length,2);
  assert.equal(likelyBillEmail({payload:{headers:[{name:'Subject',value:'Foto delle vacanze'}]}}).matched,false);
});
test('Blocks dangerous extensions, oversize files and unsafe file names',()=>{
  assert.equal(allowedAttachment('bolletta.pdf','application/pdf',1234),'application/pdf');
  assert.equal(allowedAttachment('virus.exe','application/octet-stream',1234),null);
  assert.equal(allowedAttachment('bolletta.pdf','text/html',1234),null);
  assert.equal(allowedAttachment('bolletta.pdf','application/pdf',20_000_000),null);
  assert.equal(safeFileName('../abc\\scad:enza.pdf'),'.._abc_scad_enza.pdf');
});
test('Decodes Gmail base64url attachments and verifies magic signatures',()=>{
  const pdf=Buffer.from('%PDF-1.7\n');
  assert.deepEqual(decodeGmailData(pdf.toString('base64url')),pdf);
  assert.equal(fileSignatureIsValid(pdf,'application/pdf'),true);
  assert.equal(fileSignatureIsValid(Buffer.from('<script>'),'application/pdf'),false);
  assert.equal(fileSignatureIsValid(Buffer.from('89504e470d0a1a0a','hex'),'image/png'),true);
});

test('rejects payment receipts and advertisements as new invoice documents',async()=>{
  const {likelyBillDocument,isDocumentAttachment}=await import('../lib/mail-core.mjs');
  assert.equal(likelyBillDocument({subject:'Ricevuta di pagamento bolletta elettrica',filenames:['ricevuta.pdf']}),false);
  assert.equal(likelyBillDocument({subject:'Offerta speciale gas e fibra',filenames:['banner.png']}),false);
  assert.equal(likelyBillDocument({subject:'Nuova fattura elettronica',filenames:['fattura-2026.pdf']}),true);
  assert.equal(likelyBillDocument({subject:'Servizio idrico novembre',filenames:['documento.pdf']}),true);
  assert.equal(isDocumentAttachment('logo-company.png'),false);
  assert.equal(isDocumentAttachment('bolletta-ottobre.png'),true);
});

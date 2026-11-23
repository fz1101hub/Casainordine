import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sharedOwnedHomes, sharedTenantLeases, removeUserFiles, revokeGoogleAccess } from '../lib/account-deletion.mjs';
import { LANGUAGES, translate } from '../lib/i18n.mjs';
const source=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

function adminMock({homes=[],members={},files={},connections=[]}={}){
  const removed=[];
  const admin={
    from(table){const q={filters:{},select(){return q;},eq(k,v){q.filters[k]=v;return q;},neq(k,v){q.filters['!'+k]=v;return q;},
      limit:async()=>table==='homes'?{data:homes.filter(h=>h.owner_id===q.filters.owner_id),error:null}:{data:connections,error:null},
      then(done){ // count query on home_members
        const list=(members[q.filters.home_id]||[]).filter(u=>u!==q.filters['!user_id']);return Promise.resolve({count:list.length,error:null}).then(done);}};return q;},
    storage:{from(bucket){return {list:async folder=>({data:(files[bucket]||[]).filter(f=>!removed.includes(`${bucket}:${folder}/${f}`)).map(name=>({name})),error:null}),
      remove:async paths=>{for(const p of paths)removed.push(`${bucket}:${p}`);return {error:null};}};}}
  };
  return {admin,removed};
}
test('Eliminazione account: bloccata solo per case di proprietà con altri membri',async()=>{
  const {admin}=adminMock({homes:[{id:'h1',name:'Casa Roma',owner_id:'u1'},{id:'h2',name:'Solo mia',owner_id:'u1'}],members:{h1:['u1','u2'],h2:['u1']}});
  assert.deepEqual((await sharedOwnedHomes(admin,'u1')).map(h=>h.name),['Casa Roma']);
  assert.deepEqual(await sharedOwnedHomes(admin,'u9'),[]);
});
test('Eliminazione account: cancella i file della propria cartella nei due bucket',async()=>{
  const {admin,removed}=adminMock({files:{'house-documents':['a.pdf','b.jpg'],'mail-bills':['c.pdf']}});
  assert.equal(await removeUserFiles(admin,'u1'),3);
  assert.deepEqual(removed.sort(),['house-documents:u1/a.pdf','house-documents:u1/b.jpg','mail-bills:u1/c.pdf']);
});
test('Eliminazione account: revoca dell’accesso Gmail senza bloccare se fallisce',async()=>{
  const {admin}=adminMock({connections:[{refresh_token_enc:'non-valido'}]});
  assert.equal(await revokeGoogleAccess(admin,'u1',async()=>({ok:true})),0,'token illeggibile: si prosegue');
});
test('Eliminazione account: conferma con email, coda prima di Auth e Storage solo dopo',()=>{
  const route=source('app/api/account/delete/route.js');
  assert.match(route,/String\(confirm_email \|\| ''\)\.trim\(\)\.toLowerCase\(\) !== String\(user\.email \|\| ''\)\.trim\(\)\.toLowerCase\(\)/);
  const order=['sharedOwnedHomes(admin, user.id)','queueAccountCleanup(admin, user.id, keep, leasePaths)','admin.auth.admin.deleteUser(user.id)','finishAccountCleanup(admin, user.id)'].map(x=>route.indexOf(x));
  assert.ok(order.every((v,i)=>v>0&&(i===0||v>order[i-1])),order.join(','));
  const sql=source('supabase/migrate_v37_account.sql');
  assert.match(sql,/on delete set null/);
  assert.match(sql,/create trigger v37_before_user_delete before delete on auth\.users/);
  assert.match(sql,/primary key \(id\)/);
});
test('Password dimenticata e nuova password: collegati all’app e tradotti',()=>{
  const page=source('app/page.jsx');
  assert.match(page,/\{!signup&&<ForgotPasswordButton client=\{client\} email=\{email\}/);
  assert.match(page,/if\(event==='PASSWORD_RECOVERY'\)setRecovery\(true\);/);
  assert.match(page,/<DeleteAccountPanel client=\{client\} user=\{user\}/);
  const ui=source('app/AccountSecurity.jsx');
  assert.match(ui,/resetPasswordForEmail\(address, \{ redirectTo: window\.location\.origin \}\)/);
  assert.match(ui,/updateUser\(\{ password \}\)/);
  for(const key of ['account.forgot','account.resetSent','account.newPasswordTitle','account.deleteTitle','account.deleteHelp','account.deleteOwner','account.deleteFailed'])
    for(const {code} of LANGUAGES){const v=translate(code,key);assert.ok(v&&v!==key,`${code}: ${key}`);}
});

test('le spese di chi ha cancellato l account mostrano «ex membro» nella lingua scelta', () => {
  const hub=source('app/HouseholdHub.jsx');
  assert.doesNotMatch(hub,/\|\| 'Membro'/);
  // Dalla v4.1 (scelta del 12 novembre) il nome resta: «Nome (ex membro)», vedi v41-ex-membri.
  assert.match(hub,/nameOf=userId=>memberName\(userId,\{members:rows\.members,former:rows\.former,formerLabel:tr\('family\.formerMember'\)\}\)/);
  assert.equal(translate('it','family.formerMember'),'ex membro');
  for(const {code} of LANGUAGES){const v=translate(code,'family.formerMember');assert.ok(v&&v!=='family.formerMember',code);}
});

test('un locatore con inquilino accettato non può cancellare inavvertitamente i verbali del contratto',async()=>{
  const calls=[];
  const leases=[
    {id:'l1',property_label:'Appartamento Roma',user_id:'u1',tenant_id:'u2'},
    {id:'l2',property_label:'Solo invito',user_id:'u1',tenant_id:null},
    {id:'l3',property_label:'Di altri',user_id:'u3',tenant_id:'u4'}
  ];
  const admin={from:table=>{
    assert.equal(table,'home_leases');
    const filters=[];
    const q={select(){return q;},eq(col,v){filters.push(r=>r[col]===v);return q;},
      not(col,op,v){assert.equal(op,'is');assert.equal(v,null);filters.push(r=>r[col]!=null);return q;},
      async limit(n){calls.push(n);return {data:leases.filter(r=>filters.every(f=>f(r))),error:null};}};
    return q;
  }};
  assert.deepEqual((await sharedTenantLeases(admin,'u1')).map(x=>x.id),['l1']);
  assert.deepEqual(await sharedTenantLeases(admin,'u3'),[{id:'l3',property_label:'Di altri',user_id:'u3',tenant_id:'u4'}]);
  assert.deepEqual(calls,[101,101]);
  const route=source('app/api/account/delete/route.js');
  assert.ok(route.indexOf('sharedTenantLeases(admin, user.id)') < route.indexOf('queueAccountCleanup(admin, user.id, keep, leasePaths)'));
  assert.match(route,/error: 'accountLease'/);
  assert.match(source('app/AccountSecurity.jsx'),/body\.error === 'accountLease'/);
  for(const {code} of LANGUAGES)assert.notEqual(translate(code,'account.deleteLease'),'account.deleteLease');
});

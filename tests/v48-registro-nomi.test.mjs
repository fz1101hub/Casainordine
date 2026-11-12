// Registro delle modifiche: chi ha fatto la modifica con il suo nome (o «Nome (ex membro)») e
// l'azione a parole nelle 6 lingue, invece di «Utente 1a2b3c4d» e «UPDATE».
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LANGUAGES, translate } from '../lib/i18n.mjs';
import { memberName } from '../lib/member-names.mjs';
const hub = readFileSync(new URL('../app/V20Hub.jsx', import.meta.url), 'utf8');

test('Registro: nomi dei membri e degli ex membri al posto dell’identificativo', () => {
  assert.doesNotMatch(hub, /ui\.userLabel\+' '\+a\.actor_id\.slice\(0,8\)/);
  assert.match(hub, /\{a\.actor_id\?actorName\(a\.actor_id\):ui\.automaticProcess\}/);
  assert.match(hub, /client\.from\('home_members'\)\.select\('user_id,email'\)\.eq\('home_id',homeId\)/);
  assert.match(hub, /client\.from\('home_former_members'\)\.select\('user_id,display_name'\)\.eq\('home_id',homeId\)\.then\(r=>r\.error\?\{data:\[\],error:null\}:r\)/,
    'senza la v4.1 l’elenco degli ex membri resta vuoto, senza errori');
  const people = [{ user_id: 'u1', email: 'anna@example.com' }], former = [{ user_id: 'u2', display_name: 'bruno' }];
  assert.equal(memberName('u1', { members: people, former, formerLabel: 'ex membro' }), 'anna');
  assert.equal(memberName('u2', { members: people, former, formerLabel: 'ex membro' }), 'bruno (ex membro)');
});

test('Registro: azioni a parole in 6 lingue', () => {
  assert.match(hub, /\{auditAction\(a\.action\)\} · \{a\.summary\}/);
  for (const action of ['INSERT', 'UPDATE', 'DELETE', 'RESTORE']) {
    const it = translate('it', `audit.action.${action}`);
    assert.notEqual(it, `audit.action.${action}`);
    for (const { code } of LANGUAGES) {
      const value = translate(code, `audit.action.${action}`);
      assert.ok(value && value !== `audit.action.${action}` && value !== action, `${code} ${action}`);
    }
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {splitExpenseCents,signedMemberBalance,canEditRole} from '../lib/house-core.mjs';
import {calendarText} from '../lib/calendar.mjs';
import {validPushSubscription} from '../lib/push-validate.mjs';

const sql=readFileSync(new URL('../supabase/migrate_v18.sql',import.meta.url),'utf8');
test('split expenses exactly in cents with no loss on uneven split',()=>{
 assert.deepEqual(splitExpenseCents(100,['a','b','c']).map(s=>s.cents),[34,33,33]);
 assert.equal(splitExpenseCents(101,['a','b','c']).reduce((n,x)=>n+x.cents,0),101);
 assert.throws(()=>splitExpenseCents(100,['a','a']),/Partecipanti/);
 assert.throws(()=>splitExpenseCents(0,['a']),/Importo/);
});
test('balances are settled by participant, not rounded floats',()=>{
 const expenses=[{id:'e',paid_by:'a',amount:10.01}];
 const shares=[{expense_id:'e',user_id:'a',amount:5.01},{expense_id:'e',user_id:'b',amount:5}];
 assert.equal(signedMemberBalance(expenses,shares,'a'),500);
 assert.equal(signedMemberBalance(expenses,shares,'b'),-500);
});
test('viewer role never grants modification',()=>{
 assert.equal(canEditRole('owner'),true);assert.equal(canEditRole('editor'),true);assert.equal(canEditRole('viewer'),false);
});
test('calendar contains distinct dates and 3-day local alarm',()=>{
 const text=calendarText([{id:'x',title:'Bollo; auto',supplier:'Nome, azienda',due_date:'2026-11-20',amount:155,paid_at:null},{id:'paid',title:'Paid',due_date:'2026-11-12',paid_at:'2026-11-05'}]);
 assert.match(text,/DTSTART;VALUE=DATE:20261120/);
 assert.match(text,/DTEND;VALUE=DATE:20261121/);
 assert.match(text,/TRIGGER:-P3D/);
 assert.match(text,/Bollo\\; auto/);
 assert.doesNotMatch(text,/UID:bill-paid/);
});
test('push endpoint allowlist blocks loopback and fake HTTPS',()=>{
 const keys={p256dh:'A'.repeat(80),auth:'B'.repeat(25)};
 assert.ok(validPushSubscription({endpoint:'https://fcm.googleapis.com/fcm/send/abc',keys}));
 for(const endpoint of ['http://localhost:8000/p','https://127.0.0.1/','https://example.com/p','https://fcm.googleapis.com.evil.com/p','https://user:pass@fcm.googleapis.com/p'])assert.equal(validPushSubscription({endpoint,keys}),null);
});
test('house migration protects personal data and privileged membership RPCs (static security check)',()=>{
 for(const name of ['is_home_member','can_edit_home','create_home','invite_home_member','accept_home_invite','remove_home_member','add_home_expense','add_home_vehicle_deadline']) assert.ok(sql.includes(`function public.${name}`),name);
 assert.match(sql,/home_id is null and user_id=\(select auth\.uid\(\)\)/);
 assert.match(sql,/email_confirmed_at is not null/);
 assert.match(sql,/token_hash=encode\(sha256\(convert_to\(secret,'UTF8'\)\),'hex'\)/);
 assert.match(sql,/create policy members_read.*public\.is_home_member/);
 assert.match(sql,/create policy shares_read/);
 assert.match(sql,/repeat_every_months not in \(0,12,24\)/);
 assert.match(sql,/prevent_home_scope_change/);
 assert.match(sql,/revoke all on public\.home_expenses, public\.home_expense_shares/);
});

test('biennial recurring date handles leap day',async()=>{
 const {nextRecurringDue}=await import('../lib/dates.mjs');
 assert.equal(nextRecurringDue('2028-02-29','biennial',29),'2030-02-28');
});

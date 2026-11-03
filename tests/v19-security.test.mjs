import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrate_v19.sql',import.meta.url),'utf8');
const extra=readFileSync(new URL('../app/HomeExtra.jsx',import.meta.url),'utf8');
const cron=readFileSync(new URL('../app/api/cron/route.js',import.meta.url),'utf8');
test('all new private/shared modules use row-level security and same permissions',()=>{
 for(const name of ['home_properties','home_documents','meter_readings','meter_reminders','maintenance_assets','maintenance_events','payment_receipts','home_contracts'])assert.ok(sql.includes(`'${name}'`),name);
 assert.match(sql,/public\.v19_can_read\(user_id,home_id\)/);assert.match(sql,/public\.v19_can_edit\(user_id,home_id\)/);
 assert.match(sql,/new\.home_id is distinct from old\.home_id/);
 assert.match(sql,/Immobile non appartenente allo spazio/);
});
test('private storage policy, owner-path check and shared home membership',()=>{
 assert.match(sql,/constraint storage_owner_path check/);assert.match(sql,/values\('house-documents','house-documents',false/);
 assert.match(sql,/public\.is_home_member\(d\.home_id\)/);assert.match(sql,/v19_upload_own/);
});
test('receipts cannot mark paid from client directly',()=>{
 assert.match(sql,/function public\.confirm_payment_receipt/);assert.match(sql,/round\(b\.amount\*100\)::bigint <> round\(r\.amount\*100\)::bigint/);
 assert.match(sql,/revoke update on public\.payment_receipts from authenticated/);
 assert.match(extra,/client\.rpc\('confirm_payment_receipt'/);
});
test('cron includes home alerts as separate job within existing schedule',()=>{
 assert.match(cron,/processExtraAlerts\(admin,today,counts/);assert.match(cron,/pushAllowed\(pushPreferences\|\|\{\},'bill'\)/);
});
test('new archive does not export passwords or storage locations',()=>{
 const backup=readFileSync(new URL('../lib/home-insights.mjs',import.meta.url),'utf8');assert.match(backup,/documents:documents\.map\(\(\{storage_path,\.\.\.d\}\)=>d\)/);
 assert.doesNotMatch(extra,/MAIL_TOKEN_ENCRYPTION_KEY/);
});

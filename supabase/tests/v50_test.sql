-- Prova locale di migrate_v50_email_promemoria.sql.
\set ON_ERROR_STOP 0
\pset pager off
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-00000000000a','a@x.it'),('00000000-0000-0000-0000-00000000000b','b@x.it');
insert into public.profiles(id,email) values ('00000000-0000-0000-0000-00000000000a','a@x.it'),('00000000-0000-0000-0000-00000000000b','b@x.it') on conflict do nothing;
create or replace function pg_temp.as_user(u text) returns void language sql as $$
 select set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, false)$$;
create temp table results(test text, ok boolean);
grant all on results to authenticated, service_role;
insert into results select 'email accese di base', bool_and(reminder_emails) from public.profiles;
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
with u as (update public.profiles set reminder_emails=false returning 1) insert into results select 'ognuno spegne le proprie', count(*)=1 from u;
with u as (update public.profiles set reminder_emails=false where id='00000000-0000-0000-0000-00000000000b' returning 1) insert into results select 'non quelle degli altri', count(*)=0 from u;
do $$ begin perform 1 from public.reminder_email_log; insert into results values ('registro invisibile agli utenti', false);
exception when insufficient_privilege then insert into results values ('registro invisibile agli utenti', true); end $$;
do $$ begin update public.profiles set email='x@y.it'; insert into results values ('email del profilo non modificabile', false);
exception when insufficient_privilege then insert into results values ('email del profilo non modificabile', true); end $$;
reset role;
insert into results select 'scelta salvata', not reminder_emails from public.profiles where id='00000000-0000-0000-0000-00000000000a';
insert into public.bills(id,user_id,title,supplier,category,amount,due_date) values
 ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a','Luce','Enel','Luce',50,current_date+3);
set role service_role;
insert into public.reminder_email_log(bill_id,user_id,reminder_date) values ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a',current_date);
with i as (insert into public.reminder_email_log(bill_id,user_id,reminder_date) values ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a',current_date+1)
 on conflict (bill_id,user_id) do nothing returning 1) insert into results select 'una sola email per bolletta e persona', count(*)=0 from i;
insert into public.reminder_email_log(bill_id,user_id,reminder_date) values ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000b',current_date);
insert into results select 'il server scrive il registro', count(*)=2 from public.reminder_email_log;
reset role;
delete from public.bills where id='20000000-0000-0000-0000-000000000001';
insert into results select 'registro eliminato con la bolletta', count(*)=0 from public.reminder_email_log;
insert into results select 'anon senza permessi', not has_table_privilege('anon','public.reminder_email_log','select');
insert into results select 'authenticated senza permessi', not has_table_privilege('authenticated','public.reminder_email_log','select');
insert into results select 'RLS attiva', relrowsecurity from pg_class where oid='public.reminder_email_log'::regclass;
select test, case when ok then 'ok' else 'NO' end from results;
select count(*) filter (where not ok) as falliti from results;

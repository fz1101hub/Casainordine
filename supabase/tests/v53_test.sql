-- Prova locale di migrate_v53_push_rinviate.sql.
\set ON_ERROR_STOP 0
\pset pager off
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-00000000000a','a@x.it'),('00000000-0000-0000-0000-00000000000b','b@x.it');
create or replace function pg_temp.as_user(u text) returns void language sql as $$
 select set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, false)$$;
create temp table results(test text, ok boolean);
grant all on results to anon, authenticated, service_role;
set role service_role;
insert into public.push_deferred(user_id,dedupe_key,kind,payload,created_on) values
 ('00000000-0000-0000-0000-00000000000a','bill:1:2026-12-01','bill','{"title":"Luce","body":"Scade tra 2 giorni"}',current_date);
with i as (insert into public.push_deferred(user_id,dedupe_key,kind,payload,created_on) values
 ('00000000-0000-0000-0000-00000000000a','bill:1:2026-12-01','bill','{"title":"Doppione"}',current_date) on conflict (user_id,dedupe_key) do nothing returning 1)
 insert into results select 'una voce per persona e cosa da avvisare', count(*)=0 from i;
insert into public.push_deferred(user_id,dedupe_key,kind,payload,created_on) values
 ('00000000-0000-0000-0000-00000000000b','bill:1:2026-12-01','bill','{"title":"Luce"}',current_date);
insert into results select 'la stessa bolletta per due persone', count(*)=2 from public.push_deferred;
do $$ begin insert into public.push_deferred(user_id,dedupe_key,kind,payload,created_on) values
 ('00000000-0000-0000-0000-00000000000a','x:2','bill','"testo"',current_date); insert into results values ('testo come payload rifiutato', false);
exception when check_violation then insert into results values ('testo come payload rifiutato', true); end $$;
do $$ begin insert into public.push_deferred(user_id,dedupe_key,kind,payload,created_on) values
 ('00000000-0000-0000-0000-00000000000a','x:3','bill',jsonb_build_object('body',repeat('x',5000)),current_date); insert into results values ('payload enorme rifiutato', false);
exception when check_violation then insert into results values ('payload enorme rifiutato', true); end $$;
reset role;
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
do $$ begin perform 1 from public.push_deferred; insert into results values ('invisibile agli utenti', false);
exception when insufficient_privilege then insert into results values ('invisibile agli utenti', true); end $$;
do $$ begin insert into public.push_deferred(user_id,dedupe_key,kind,payload,created_on) values
 ('00000000-0000-0000-0000-00000000000a','bill:9:2026-12-01','bill','{}',current_date); insert into results values ('gli utenti non scrivono', false);
exception when insufficient_privilege then insert into results values ('gli utenti non scrivono', true); end $$;
reset role;
set role anon;
do $$ begin perform 1 from public.push_deferred; insert into results values ('invisibile senza accesso', false);
exception when insufficient_privilege then insert into results values ('invisibile senza accesso', true); end $$;
reset role;
delete from auth.users where id='00000000-0000-0000-0000-00000000000b';
insert into results select 'eliminato con l''account', count(*)=1 from public.push_deferred;
insert into results select 'RLS attiva', relrowsecurity from pg_class where oid='public.push_deferred'::regclass;
insert into results select 'nessuna regola di accesso per gli utenti', count(*)=0 from pg_policies where tablename='push_deferred';
select test, case when ok then 'ok' else 'NO' end from results;
select count(*) filter (where not ok) as falliti from results;

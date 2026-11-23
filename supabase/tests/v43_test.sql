-- Prova locale di migrate_v43_automazioni.sql: regole di accesso, limiti e avvisi.
\set ON_ERROR_STOP 0
\pset pager off
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-00000000000a','a@x.it'),('00000000-0000-0000-0000-00000000000b','b@x.it'),
 ('00000000-0000-0000-0000-00000000000c','c@x.it'),('00000000-0000-0000-0000-00000000000d','d@x.it');
insert into public.homes(id,name,owner_id) values ('10000000-0000-0000-0000-000000000001','Casa prova','00000000-0000-0000-0000-00000000000a');
insert into public.home_members(home_id,user_id,email,role) values
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a','a@x.it','owner'),
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000b','b@x.it','editor'),
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000c','c@x.it','viewer')
 on conflict do nothing;
create or replace function pg_temp.as_user(u text) returns void language sql as $$
 select set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, false)$$;
create temp table results(test text, ok boolean);
grant all on results to authenticated;

set role authenticated;
-- A (proprietaria) crea una regola della casa
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.home_automations(home_id,kind,name,amount_threshold) values ('10000000-0000-0000-0000-000000000001','bill_amount','Bollette care',150);
insert into results select 'proprietaria crea', count(*)=1 from public.home_automations;
-- C (sola lettura) vede ma non crea, non cambia, non cancella
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
insert into results select 'lettore vede', count(*)=1 from public.home_automations;
do $$ begin
 insert into public.home_automations(home_id,kind,name,amount_threshold) values ('10000000-0000-0000-0000-000000000001','bill_amount','Del lettore',10);
 insert into results values ('lettore non crea', false);
exception when others then insert into results values ('lettore non crea', true); end $$;
with u as (update public.home_automations set paused=true returning 1) insert into results select 'lettore non sospende', count(*)=0 from u;
with d as (delete from public.home_automations returning 1) insert into results select 'lettore non cancella', count(*)=0 from d;
-- B (editor) sospende; non può cambiare autore o casa
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
with u as (update public.home_automations set paused=true returning 1) insert into results select 'editor sospende', count(*)=1 from u;
do $$ begin
 update public.home_automations set user_id='00000000-0000-0000-0000-00000000000b';
 insert into results values ('autore non si cambia', false);
exception when insufficient_privilege then insert into results values ('autore non si cambia', true); end $$;
do $$ begin
 update public.home_automations set home_id=null;
 insert into results values ('casa non si cambia', false);
exception when insufficient_privilege then insert into results values ('casa non si cambia', true); end $$;
-- D (esterna) non vede nulla; la sua regola personale non la vede nessun altro
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
insert into results select 'esterna non vede', count(*)=0 from public.home_automations;
insert into public.home_automations(kind,name,every_months,next_on,days_before) values ('recurring','Filtri del condizionatore',3,'2026-12-01',7);
insert into results select 'personale creata', count(*)=1 from public.home_automations;
do $$ begin
 insert into public.home_automations(home_id,kind,name,amount_threshold) values ('10000000-0000-0000-0000-000000000001','bill_amount','Intrusa',10);
 insert into results values ('esterna non scrive nella casa', false);
exception when others then insert into results values ('esterna non scrive nella casa', true); end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into results select 'personale altrui invisibile', count(*)=1 from public.home_automations;
-- Dati coerenti con il tipo
do $$ begin
 insert into public.home_automations(kind,name,amount_threshold,days_before) values ('bill_amount','Mista',10,5);
 insert into results values ('dati del tipo sbagliato', false);
exception when check_violation then insert into results values ('dati del tipo sbagliato', true); end $$;
do $$ begin
 insert into public.home_automations(kind,name,every_months,next_on,days_before) values ('recurring','Troppo spesso',0,'2026-12-01',0);
 insert into results values ('frequenza fuori limite', false);
exception when check_violation then insert into results values ('frequenza fuori limite', true); end $$;
-- Limite di 30 per spazio
insert into public.home_automations(kind,name,days_before) select 'contract_renewal','Rinnovo '||g,30 from generate_series(1,30) g;
insert into results select '30 regole personali', count(*)=30 from public.home_automations where home_id is null;
do $$ begin
 insert into public.home_automations(kind,name,days_before) values ('contract_renewal','Una di troppo',30);
 insert into results values ('trentunesima rifiutata', false);
exception when raise_exception then insert into results values ('trentunesima rifiutata', true); end $$;
-- Il limite personale non tocca la casa
insert into public.home_automations(home_id,kind,name,days_before) values ('10000000-0000-0000-0000-000000000001','contract_renewal','Rinnovi casa',60);
insert into results select 'casa separata dal personale', count(*)=2 from public.home_automations where home_id is not null;
reset role;
-- Avvisi di tipo «automation» e preferenza push
insert into public.user_alerts(user_id,kind,reference_id,event_date,title,body)
 values ('00000000-0000-0000-0000-00000000000a','automation',gen_random_uuid(),'2026-12-01','t','b');
insert into results select 'avviso automation ammesso', count(*)=1 from public.user_alerts where kind='automation';
insert into results select 'preferenza push predefinita', (select column_default from information_schema.columns where table_name='user_alert_preferences' and column_name='push_automations')='true';
-- anon non ha permessi
insert into results select 'anon senza permessi', not has_table_privilege('anon','public.home_automations','select');
select test, case when ok then 'ok' else 'NO' end from results;
select count(*) filter (where not ok) as falliti from results;

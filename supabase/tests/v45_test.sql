-- Prova locale di migrate_v45_stagionale.sql.
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
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.home_seasonal_settings(home_id,climate,home_type,features) values ('10000000-0000-0000-0000-000000000001','cold','house',array['boiler','garden']);
insert into results select 'profilo della casa', count(*)=1 from public.home_seasonal_settings;
do $$ begin
 insert into public.home_seasonal_settings(home_id) values ('10000000-0000-0000-0000-000000000001');
 insert into results values ('un solo profilo per casa', false);
exception when unique_violation then insert into results values ('un solo profilo per casa', true); end $$;
do $$ begin
 insert into public.home_seasonal_settings(climate,features) values ('mild',array['piscina']);
 insert into results values ('dotazione sconosciuta rifiutata', false);
exception when check_violation then insert into results values ('dotazione sconosciuta rifiutata', true); end $$;
insert into public.home_seasonal_settings(climate) values ('warm');
insert into results select 'profilo personale separato', count(*)=2 from public.home_seasonal_settings;
insert into public.home_seasonal_done(home_id,item_id,period) values ('10000000-0000-0000-0000-000000000001','gutters','2026');
do $$ begin
 insert into public.home_seasonal_done(home_id,item_id,period) values ('10000000-0000-0000-0000-000000000001','gutters','2026');
 insert into results values ('una volta per stagione', false);
exception when unique_violation then insert into results values ('una volta per stagione', true); end $$;
do $$ begin
 insert into public.home_seasonal_done(home_id,item_id,period) values ('10000000-0000-0000-0000-000000000001','Gutters; drop','2026');
 insert into results values ('voce con nome non valido rifiutata', false);
exception when check_violation then insert into results values ('voce con nome non valido rifiutata', true); end $$;
-- C (sola lettura)
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
insert into results select 'lettore vede profilo e voci fatte', (select count(*) from public.home_seasonal_settings)=1 and (select count(*) from public.home_seasonal_done)=1;
with u as (update public.home_seasonal_settings set climate='warm' returning 1) insert into results select 'lettore non cambia il profilo', count(*)=0 from u;
do $$ begin
 insert into public.home_seasonal_done(home_id,item_id,period) values ('10000000-0000-0000-0000-000000000001','drains','2027');
 insert into results values ('lettore non segna', false);
exception when others then insert into results values ('lettore non segna', true); end $$;
with d as (delete from public.home_seasonal_done returning 1) insert into results select 'lettore non toglie', count(*)=0 from d;
-- B (editor)
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
with u as (update public.home_seasonal_settings set climate='mild', features=array['air_conditioning'] returning 1) insert into results select 'editor cambia il profilo', count(*)=1 from u;
insert into public.home_seasonal_done(home_id,item_id,period) values ('10000000-0000-0000-0000-000000000001','drains','2027');
with d as (delete from public.home_seasonal_done where item_id='gutters' returning 1) insert into results select 'editor toglie una voce fatta', count(*)=1 from d;
do $$ begin update public.home_seasonal_done set period='2030'; insert into results values ('voce fatta non modificabile', false);
exception when insufficient_privilege then insert into results values ('voce fatta non modificabile', true); end $$;
do $$ begin update public.home_seasonal_settings set home_id=null; insert into results values ('casa del profilo non si cambia', false);
exception when insufficient_privilege then insert into results values ('casa del profilo non si cambia', true); end $$;
-- D (esterna)
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
insert into results select 'esterna non vede', (select count(*) from public.home_seasonal_settings)=0 and (select count(*) from public.home_seasonal_done)=0;
do $$ begin
 insert into public.home_seasonal_done(home_id,item_id,period) values ('10000000-0000-0000-0000-000000000001','detectors','2026');
 insert into results values ('esterna non scrive nella casa', false);
exception when others then insert into results values ('esterna non scrive nella casa', true); end $$;
reset role;
delete from auth.users where id='00000000-0000-0000-0000-00000000000b';
insert into results select 'voce fatta da chi se ne va resta nella casa', (select user_id from public.home_seasonal_done where item_id='drains')='00000000-0000-0000-0000-00000000000a';
insert into results select 'anon senza permessi', not has_table_privilege('anon','public.home_seasonal_done','select') and not has_table_privilege('anon','public.home_seasonal_settings','select');
select test, case when ok then 'ok' else 'NO' end from results;
select count(*) filter (where not ok) as falliti from results;

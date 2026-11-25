-- Prova locale di migrate_v61_vaccini_bambini.sql.
\set ON_ERROR_STOP 0
\pset pager off
insert into auth.users(id,email) values ('00000000-0000-0000-0000-00000000000a','a@x.it'),('00000000-0000-0000-0000-00000000000c','c@x.it');
create or replace function pg_temp.as_user(u text) returns void language sql as $$
 select set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, false)$$;
create temp table results(test text, ok boolean);
grant all on results to authenticated;
create or replace function pg_temp.refused(label text, stmt text) returns void language plpgsql as $$
begin execute stmt; insert into results values (label, false);
exception when others then insert into results values (label, true); end $$;
create or replace function pg_temp.works(label text, stmt text) returns void language plpgsql as $$
begin execute stmt; insert into results values (label, true);
exception when others then insert into results values (label || ' — ' || sqlerrm, false); end $$;
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.works('bambino con il calendario delle obbligatorie', $$insert into public.health_people(id,name,relation,birth_on,vaccine_plan) values ('90000000-0000-0000-0000-000000000001','Luca','child','2026-09-20','mandatory')$$);
insert into results select 'di partenza il calendario è spento', (select column_default from information_schema.columns where table_name='health_people' and column_name='vaccine_plan') like '''off''%';
select pg_temp.refused('piano sconosciuto rifiutato', $$update public.health_people set vaccine_plan='qualcuno' where id='90000000-0000-0000-0000-000000000001'$$);
select pg_temp.works('piano con le raccomandate', $$update public.health_people set vaccine_plan='all' where id='90000000-0000-0000-0000-000000000001'$$);
select pg_temp.works('prima dose dell''esavalente prenotata', $$insert into public.health_appointments(person_id,kind,title,on_date,schedule_key) values ('90000000-0000-0000-0000-000000000001','vaccine','Esavalente 1','2026-11-20','hexa_1')$$);
select pg_temp.refused('stessa tappa due volte rifiutata', $$insert into public.health_appointments(person_id,kind,title,on_date,schedule_key) values ('90000000-0000-0000-0000-000000000001','vaccine','Di nuovo','2026-11-21','hexa_1')$$);
select pg_temp.refused('chiave con caratteri strani rifiutata', $$insert into public.health_appointments(person_id,kind,title,on_date,schedule_key) values ('90000000-0000-0000-0000-000000000001','vaccine','Strana','2026-11-21','Hexa-1!')$$);
select pg_temp.works('tappa cambiata', $$update public.health_appointments set schedule_key='hexa_2' where schedule_key='hexa_1'$$);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
with u as (update public.health_people set vaccine_plan='off' returning 1) insert into results select 'esterna non cambia il piano', count(*)=0 from u;
reset role;
select test, case when ok then 'ok' else 'NO' end from results;
select count(*) filter (where not ok) as falliti from results;

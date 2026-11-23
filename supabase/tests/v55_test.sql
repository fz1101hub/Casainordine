-- Prova locale di migrate_v55_autoletture_giorno.sql.
\set ON_ERROR_STOP 0
\pset pager off
insert into auth.users(id,email) values ('00000000-0000-0000-0000-00000000000a','a@x.it');
create or replace function pg_temp.as_user(u text) returns void language sql as $$
 select set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, false)$$;
create temp table results(test text, ok boolean);
grant all on results to authenticated;
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.meter_reminders(id,meter_name,next_due_on,repeat_months) values ('90000000-0000-0000-0000-000000000001','Gas','2026-01-31',1);
insert into results select 'il giorno scelto si ricorda da solo', due_day=31 from public.meter_reminders where id='90000000-0000-0000-0000-000000000001';
insert into public.meter_reminders(id,meter_name,next_due_on,repeat_months,due_day) values ('90000000-0000-0000-0000-000000000002','Acqua','2026-02-28',1,30);
insert into results select 'un giorno dato resta', due_day=30 from public.meter_reminders where id='90000000-0000-0000-0000-000000000002';
do $$ begin insert into public.meter_reminders(meter_name,next_due_on,repeat_months,due_day) values ('Luce','2026-01-10',1,32);
 insert into results values ('giorno fuori dal mese rifiutato', false);
exception when check_violation then insert into results values ('giorno fuori dal mese rifiutato', true); end $$;
reset role;
-- Il lavoro giornaliero (chiave di servizio) cambia solo la data: il giorno resta.
update public.meter_reminders set next_due_on='2026-02-28' where id='90000000-0000-0000-0000-000000000001';
insert into results select 'spostando la data il giorno resta', due_day=31 from public.meter_reminders where id='90000000-0000-0000-0000-000000000001';
insert into results select 'funzione non eseguibile dagli utenti', not has_function_privilege('authenticated','private.v55_meter_due_day()','execute');
select test, case when ok then 'ok' else 'NO' end from results;
select count(*) filter (where not ok) as falliti from results;

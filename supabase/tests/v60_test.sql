-- Prova locale di migrate_v60_salute.sql.
\set ON_ERROR_STOP 0
\pset pager off
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-00000000000a','a@x.it'),('00000000-0000-0000-0000-00000000000b','b@x.it'),
 ('00000000-0000-0000-0000-00000000000c','c@x.it');
insert into public.homes(id,name,owner_id) values ('10000000-0000-0000-0000-000000000001','Casa prova','00000000-0000-0000-0000-00000000000a');
insert into public.home_members(home_id,user_id,email,role) values
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a','a@x.it','owner'),
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000b','b@x.it','viewer')
 on conflict do nothing;
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
select pg_temp.works('io, nello spazio personale', $$insert into public.health_people(id,name,relation) values ('80000000-0000-0000-0000-000000000001','Anna','self')$$);
select pg_temp.works('la mamma, nella casa', $$insert into public.health_people(id,home_id,name,relation,birth_on) values ('80000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Mamma','parent','1950-05-01')$$);
select pg_temp.refused('relazione sconosciuta rifiutata', $$update public.health_people set relation='vicino' where id='80000000-0000-0000-0000-000000000001'$$);
insert into public.home_stock_items(id,home_id,name,unit,quantity) values ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Cardioaspirina','pcs',30);
insert into public.home_stock_items(id,name,unit,quantity) values ('40000000-0000-0000-0000-000000000002','Vitamina D','pcs',10);
select pg_temp.works('terapia della mamma alle 8 e alle 20 con la scorta della casa', $$insert into public.health_therapies(id,person_id,kind,name,dose,times,start_on,stock_item_id,stock_use) values
 ('81000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000002','medicine','Cardioaspirina','1 compressa','{08:00,20:00}','2026-11-01','40000000-0000-0000-0000-000000000001',1)$$);
select pg_temp.refused('scorta personale su una terapia della casa rifiutata', $$update public.health_therapies set stock_item_id='40000000-0000-0000-0000-000000000002' where id='81000000-0000-0000-0000-000000000001'$$);
select pg_temp.refused('nessun orario rifiutato', $$update public.health_therapies set times='{}' where id='81000000-0000-0000-0000-000000000001'$$);
select pg_temp.refused('fine prima dell''inizio rifiutata', $$update public.health_therapies set end_on='2026-10-01' where id='81000000-0000-0000-0000-000000000001'$$);
select pg_temp.refused('giorno della settimana 8 rifiutato', $$update public.health_therapies set weekdays='{1,8}' where id='81000000-0000-0000-0000-000000000001'$$);
select pg_temp.works('solo lunedì e giovedì', $$update public.health_therapies set weekdays='{1,4}' where id='81000000-0000-0000-0000-000000000001'$$);
select pg_temp.works('dose presa', $$insert into public.health_doses(therapy_id,due_at,status,done_at) values ('81000000-0000-0000-0000-000000000001','2026-11-25 07:00+00','taken',now())$$);
select pg_temp.refused('stessa dose due volte rifiutata', $$insert into public.health_doses(therapy_id,due_at) values ('81000000-0000-0000-0000-000000000001','2026-11-25 07:00+00')$$);
select pg_temp.refused('stato sconosciuto rifiutato', $$update public.health_doses set status='forse' where therapy_id='81000000-0000-0000-0000-000000000001'$$);
select pg_temp.works('vaccino antinfluenzale con promemoria', $$insert into public.health_appointments(id,person_id,kind,title,on_date,at_time,place,reminders,repeat_months) values
 ('82000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000002','vaccine','Antinfluenzale','2026-11-28','10:30','Farmacia',array['day_before','hour_before'],12)$$);
select pg_temp.refused('promemoria sconosciuto rifiutato', $$update public.health_appointments set reminders=array['sempre'] where id='82000000-0000-0000-0000-000000000001'$$);
select pg_temp.refused('ripetizione oltre 10 anni rifiutata', $$update public.health_appointments set repeat_months=121 where id='82000000-0000-0000-0000-000000000001'$$);
select pg_temp.works('visita fatta', $$update public.health_appointments set done_on='2026-11-28' where id='82000000-0000-0000-0000-000000000001'$$);
-- Limite: 30 persone per spazio (Anna è la prima nel suo spazio personale).
select pg_temp.works('altre 29 persone', $$insert into public.health_people(name) select 'Persona ' || g from generate_series(1,29) g$$);
select pg_temp.refused('la 31ª persona rifiutata', $$insert into public.health_people(name) values ('Troppe')$$);
-- B (sola lettura) vede la mamma, non Anna; non cambia niente
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
insert into results select 'lettore vede la persona, la terapia, le dosi e le visite della casa',
 (select count(*) from public.health_people where id='80000000-0000-0000-0000-000000000002')=1
 and (select count(*) from public.health_therapies)=1 and (select count(*) from public.health_doses)=1 and (select count(*) from public.health_appointments)=1;
insert into results select 'lettore non vede le persone personali di A', count(*)=0 from public.health_people where home_id is null;
with u as (update public.health_therapies set dose='2 compresse' returning 1) insert into results select 'lettore non cambia la dose', count(*)=0 from u;
select pg_temp.refused('lettore non segna dosi', $$insert into public.health_doses(therapy_id,due_at,status) values ('81000000-0000-0000-0000-000000000001','2026-11-25 19:00+00','taken')$$);
-- C (esterna) non vede e non scrive
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
insert into results select 'esterna non vede persone, terapie, dosi e visite',
 (select count(*) from public.health_people)=0 and (select count(*) from public.health_therapies)=0 and (select count(*) from public.health_doses)=0 and (select count(*) from public.health_appointments)=0;
select pg_temp.refused('esterna non aggiunge terapie', $$insert into public.health_therapies(person_id,name,times) values ('80000000-0000-0000-0000-000000000002','Intrusa','{09:00}')$$);
select pg_temp.refused('esterna non legge i promemoria mandati', $$select * from public.health_reminders_sent$$);
reset role;
insert into public.health_reminders_sent(appointment_id,code,due_at) values ('82000000-0000-0000-0000-000000000001','day_before','2026-11-27 17:00+00');
select pg_temp.refused('stesso promemoria due volte rifiutato', $$insert into public.health_reminders_sent(appointment_id,code,due_at) values ('82000000-0000-0000-0000-000000000001','day_before','2026-11-27 17:00+00')$$);
insert into results select 'avvisi health ammessi', pg_get_constraintdef(oid) like '%''health''%' from pg_constraint where conname='user_alerts_kind_check';
insert into results select 'interruttori push e dettagli', count(*)=2 from information_schema.columns where table_name='user_alert_preferences' and column_name in ('push_health','health_push_details');
insert into results select 'dettagli nascosti di partenza', column_default='false' from information_schema.columns where table_name='user_alert_preferences' and column_name='health_push_details';
insert into results select 'funzioni interne non chiamabili',
 not has_function_privilege('authenticated','private.v60_limit()','execute') and not has_function_privilege('authenticated','private.v60_stock_guard()','execute')
 and not has_function_privilege('anon','private.v60_person_access(uuid,boolean)','execute');
delete from public.health_people where id='80000000-0000-0000-0000-000000000002';
insert into results select 'persona cancellata con terapie, dosi, visite e promemoria',
 (select count(*) from public.health_therapies)=0 and (select count(*) from public.health_doses)=0 and (select count(*) from public.health_appointments)=0 and (select count(*) from public.health_reminders_sent)=0;
select test, case when ok then 'ok' else 'NO' end from results;
select count(*) filter (where not ok) as falliti from results;

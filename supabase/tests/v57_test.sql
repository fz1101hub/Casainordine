-- Prova locale di migrate_v57_giardino.sql.
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
create or replace function pg_temp.refused(label text, stmt text) returns void language plpgsql as $$
begin execute stmt; insert into results values (label, false);
exception when others then insert into results values (label, true); end $$;
create or replace function pg_temp.works(label text, stmt text) returns void language plpgsql as $$
begin execute stmt; insert into results values (label, true);
exception when others then insert into results values (label || ' — ' || sqlerrm, false); end $$;
set role authenticated;

-- A (proprietaria): pianta della casa con piano e registro
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.works('pianta creata', $$insert into public.home_garden_plants(id,home_id,name,preset,kind,location) values
 ('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Limone sul terrazzo','citrus','fruit','Terrazzo')$$);
select pg_temp.works('intervento creato', $$insert into public.home_garden_tasks(id,plant_id,kind,title,product,months,every_days,next_on) values
 ('51000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','fertilize','Concimazione','Concime per agrumi','{3,4,5,6,7,8,9,10}',30,'2026-03-01')$$);
select pg_temp.works('registro scritto', $$insert into public.home_garden_log(plant_id,task_id,done_on,kind,title,product) values
 ('50000000-0000-0000-0000-000000000001','51000000-0000-0000-0000-000000000001','2026-03-02','fertilize','Concimazione','Concime per agrumi')$$);
select pg_temp.refused('mese 13 rifiutato', $$insert into public.home_garden_tasks(plant_id,title,months) values ('50000000-0000-0000-0000-000000000001','Sbagliato','{13}')$$);
select pg_temp.refused('senza mesi rifiutato', $$insert into public.home_garden_tasks(plant_id,title,months) values ('50000000-0000-0000-0000-000000000001','Sbagliato','{}')$$);
select pg_temp.refused('ripetizione oltre un anno rifiutata', $$insert into public.home_garden_tasks(plant_id,title,months,every_days) values ('50000000-0000-0000-0000-000000000001','Sbagliato','{3}',400)$$);
select pg_temp.refused('tipo sconosciuto rifiutato', $$insert into public.home_garden_tasks(plant_id,kind,title,months) values ('50000000-0000-0000-0000-000000000001','magia','Sbagliato','{3}')$$);
select pg_temp.refused('proposta con un nome strano rifiutata', $$insert into public.home_garden_plants(name,preset) values ('Strana','Limone!')$$);
-- Seconda pianta, personale di A: il registro non può citare un intervento di un'altra pianta
select pg_temp.works('pianta personale', $$insert into public.home_garden_plants(id,name) values ('50000000-0000-0000-0000-000000000002','Basilico')$$);
select pg_temp.refused('registro con intervento di un''altra pianta rifiutato', $$insert into public.home_garden_log(plant_id,task_id,done_on,title) values
 ('50000000-0000-0000-0000-000000000002','51000000-0000-0000-0000-000000000001','2026-03-02','Sbagliato')$$);

-- C (sola lettura): vede, non scrive
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
insert into results select 'lettore vede la pianta', count(*)=1 from public.home_garden_plants;
insert into results select 'lettore vede il piano', count(*)=1 from public.home_garden_tasks;
insert into results select 'lettore vede il registro', count(*)=1 from public.home_garden_log;
select pg_temp.refused('lettore non aggiunge interventi', $$insert into public.home_garden_tasks(plant_id,title,months) values ('50000000-0000-0000-0000-000000000001','Del lettore','{4}')$$);
with u as (update public.home_garden_tasks set next_on='2026-04-01' returning 1) insert into results select 'lettore non sposta le date', count(*)=0 from u;
with d as (delete from public.home_garden_plants returning 1) insert into results select 'lettore non cancella', count(*)=0 from d;

-- B (editor): segna fatto e aggiunge; non sposta pianta né intervento
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
with u as (update public.home_garden_tasks set last_done_on='2026-03-31', next_on='2026-04-30' returning 1) insert into results select 'editor segna fatto', count(*)=1 from u;
select pg_temp.works('editor aggiunge un intervento', $$insert into public.home_garden_tasks(plant_id,kind,title,months) values ('50000000-0000-0000-0000-000000000001','pruning','Potatura','{3,4}')$$);
select pg_temp.refused('intervento non si sposta su un''altra pianta', $$update public.home_garden_tasks set plant_id='50000000-0000-0000-0000-000000000002'$$);
select pg_temp.refused('pianta non cambia casa', $$update public.home_garden_plants set home_id=null$$);
insert into results select 'editor non vede la pianta personale di A', count(*)=0 from public.home_garden_plants where id='50000000-0000-0000-0000-000000000002';

-- D (esterna)
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
insert into results select 'esterna non vede piante', count(*)=0 from public.home_garden_plants;
insert into results select 'esterna non vede piani', count(*)=0 from public.home_garden_tasks;
select pg_temp.refused('esterna non aggiunge interventi', $$insert into public.home_garden_tasks(plant_id,title,months) values ('50000000-0000-0000-0000-000000000001','Intrusa','{4}')$$);
select pg_temp.refused('esterna non mette piante nella casa', $$insert into public.home_garden_plants(home_id,name) values ('10000000-0000-0000-0000-000000000001','Intrusa')$$);
-- Limite di 40 interventi per pianta (pianta personale di D)
insert into public.home_garden_plants(id,name) values ('50000000-0000-0000-0000-000000000004','Rosa di D');
insert into public.home_garden_tasks(plant_id,title,months) select '50000000-0000-0000-0000-000000000004','Intervento '||g,'{5}' from generate_series(1,40) g;
select pg_temp.refused('quarantunesimo intervento rifiutato', $$insert into public.home_garden_tasks(plant_id,title,months) values ('50000000-0000-0000-0000-000000000004','Uno di troppo','{5}')$$);
-- Limite di 300 piante per spazio
insert into public.home_garden_plants(name) select 'Pianta '||g from generate_series(1,299) g;
select pg_temp.refused('trecentunesima pianta rifiutata', $$insert into public.home_garden_plants(name) values ('Una di troppo')$$);

-- Cancellando la pianta se ne vanno piano e registro
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
delete from public.home_garden_plants where id='50000000-0000-0000-0000-000000000001';
reset role;
insert into results select 'piano e registro cancellati con la pianta',
 not exists(select 1 from public.home_garden_tasks where plant_id='50000000-0000-0000-0000-000000000001')
 and not exists(select 1 from public.home_garden_log where plant_id='50000000-0000-0000-0000-000000000001');
insert into results select 'avvisi del giardino ammessi', (select count(*) from (select 1 where 'garden' = any(
 select unnest(regexp_matches(pg_get_constraintdef(oid), '''([a-z_]+)''', 'g')) from pg_constraint where conname='user_alerts_kind_check')) x)=1;
insert into results select 'push del giardino accese di base', (select column_default from information_schema.columns
 where table_schema='public' and table_name='user_alert_preferences' and column_name='push_garden')='true';
insert into results select 'anon senza permessi', not has_table_privilege('anon','public.home_garden_plants','select')
 and not has_table_privilege('anon','public.home_garden_tasks','select') and not has_table_privilege('anon','public.home_garden_log','select');
insert into results select 'controllo di accesso fuori dall''API', to_regprocedure('public.v57_plant_access(uuid,boolean)') is null
 and to_regprocedure('private.v57_plant_access(uuid,boolean)') is not null;
select test, case when ok then 'ok' else 'NO' end from results;
select count(*) filter (where not ok) as falliti from results;

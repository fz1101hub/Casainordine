-- Prova locale di migrate_v58_giardino_orto.sql.
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
select pg_temp.works('pomodori con semina, raccolta, aiuola e famiglia', $$insert into public.home_garden_plants(id,home_id,name,preset,kind,planted_on,harvest_days,bed,family) values
 ('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Pomodori','tomato','vegetable','2026-04-20',75,'Aiuola 1','solanaceae')$$);
select pg_temp.refused('famiglia sconosciuta rifiutata', $$update public.home_garden_plants set family='rettili' where id='50000000-0000-0000-0000-000000000001'$$);
select pg_temp.refused('raccolta dopo più di 400 giorni rifiutata', $$update public.home_garden_plants set harvest_days=500 where id='50000000-0000-0000-0000-000000000001'$$);
select pg_temp.refused('fine coltura prima della semina rifiutata', $$update public.home_garden_plants set ended_on='2026-04-01' where id='50000000-0000-0000-0000-000000000001'$$);
select pg_temp.works('coltura finita', $$update public.home_garden_plants set ended_on='2026-09-30' where id='50000000-0000-0000-0000-000000000001'$$);
insert into public.home_stock_items(id,home_id,name,unit,quantity,threshold) values ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Rame','kg',1,0.5);
insert into public.home_stock_items(id,name,unit,quantity) values ('40000000-0000-0000-0000-000000000002','Rame mio','kg',1);
select pg_temp.works('trattamento con la scorta della casa e i giorni di attesa', $$insert into public.home_garden_tasks(id,plant_id,kind,title,months,stock_item_id,stock_use,wait_days) values
 ('51000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','treatment','Rame','{6,7,8}','40000000-0000-0000-0000-000000000001',0.05,20)$$);
select pg_temp.refused('scorta di un altro spazio rifiutata', $$update public.home_garden_tasks set stock_item_id='40000000-0000-0000-0000-000000000002' where id='51000000-0000-0000-0000-000000000001'$$);
select pg_temp.refused('quantità per volta zero rifiutata', $$update public.home_garden_tasks set stock_use=0 where id='51000000-0000-0000-0000-000000000001'$$);
select pg_temp.refused('attesa negativa rifiutata', $$update public.home_garden_tasks set wait_days=-1 where id='51000000-0000-0000-0000-000000000001'$$);
select pg_temp.works('registro con i giorni di attesa', $$insert into public.home_garden_log(plant_id,task_id,done_on,kind,title,wait_days) values
 ('50000000-0000-0000-0000-000000000001','51000000-0000-0000-0000-000000000001','2026-07-01','treatment','Rame',20)$$);
-- La scorta cancellata lascia l'intervento senza collegamento.
reset role;
delete from public.home_stock_items where id='40000000-0000-0000-0000-000000000001';
insert into results select 'scorta cancellata: collegamento tolto', stock_item_id is null from public.home_garden_tasks where id='51000000-0000-0000-0000-000000000001';
set role authenticated;
-- B (sola lettura) vede i campi nuovi ma non li cambia
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
insert into results select 'lettore vede aiuola e famiglia', count(*)=1 from public.home_garden_plants where bed='Aiuola 1' and family='solanaceae';
with u as (update public.home_garden_plants set bed='Altra' returning 1) insert into results select 'lettore non cambia l''aiuola', count(*)=0 from u;
-- C (esterna) non collega la sua scorta alla pianta della casa
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
insert into public.home_stock_items(id,name) values ('40000000-0000-0000-0000-000000000003','Concime di C');
select pg_temp.refused('esterna non aggiunge interventi con la sua scorta', $$insert into public.home_garden_tasks(plant_id,title,months,stock_item_id) values
 ('50000000-0000-0000-0000-000000000001','Intrusa','{5}','40000000-0000-0000-0000-000000000003')$$);
reset role;
insert into results select 'controllo della scorta non chiamabile', not has_function_privilege('authenticated','private.v58_garden_stock_guard()','execute');
select test, case when ok then 'ok' else 'NO' end from results;
select count(*) filter (where not ok) as falliti from results;

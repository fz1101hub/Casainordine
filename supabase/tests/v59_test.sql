-- Prova locale di migrate_v59_animali_foto_meteo_730.sql.
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

-- ===== Animali =====
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
-- Documenti: uno della casa, uno personale di A.
insert into public.home_documents(id,user_id,home_id,name,mime_type,storage_path,file_size) values
 ('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-000000000001','Fattura veterinario.pdf','application/pdf','00000000-0000-0000-0000-00000000000a/vet.pdf',100),
 ('30000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-00000000000a',null,'Mia foto.jpg','image/jpeg','00000000-0000-0000-0000-00000000000a/mia.jpg',100),
 ('30000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-000000000001','Limone.jpg','image/jpeg','00000000-0000-0000-0000-00000000000a/limone.jpg',100);
insert into public.home_stock_items(id,home_id,name,unit,quantity) values ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Crocchette','kg',10);
insert into public.home_stock_items(id,name,unit,quantity) values ('40000000-0000-0000-0000-000000000002','Crocchette mie','kg',3);
select pg_temp.works('cane della casa con le crocchette della casa', $$insert into public.home_pets(id,home_id,name,species,preset,breed,sex,birth_on,weight_kg,food_stock_item_id,food_daily,vet_name) values
 ('60000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Fido','dog','dog_adult','Meticcio','male','2020-03-01',18.5,'40000000-0000-0000-0000-000000000001',0.25,'Dott.ssa Rossi')$$);
select pg_temp.refused('cibo di un altro spazio rifiutato', $$update public.home_pets set food_stock_item_id='40000000-0000-0000-0000-000000000002' where id='60000000-0000-0000-0000-000000000001'$$);
select pg_temp.refused('peso zero rifiutato', $$update public.home_pets set weight_kg=0 where id='60000000-0000-0000-0000-000000000001'$$);
select pg_temp.refused('specie sconosciuta rifiutata', $$update public.home_pets set species='drago' where id='60000000-0000-0000-0000-000000000001'$$);
select pg_temp.refused('non c''è più prima della nascita rifiutato', $$update public.home_pets set ended_on='2019-01-01' where id='60000000-0000-0000-0000-000000000001'$$);
select pg_temp.works('antirabbica ogni 3 anni con la scorta della casa', $$insert into public.home_pet_tasks(id,pet_id,kind,title,every_days,next_on,stock_item_id,stock_use) values
 ('61000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','vaccine','Antirabbica',1095,'2027-03-01','40000000-0000-0000-0000-000000000001',1)$$);
select pg_temp.refused('ripetizione oltre 3 anni rifiutata', $$update public.home_pet_tasks set every_days=1096 where id='61000000-0000-0000-0000-000000000001'$$);
select pg_temp.refused('scorta personale nel piano di un animale della casa rifiutata', $$update public.home_pet_tasks set stock_item_id='40000000-0000-0000-0000-000000000002' where id='61000000-0000-0000-0000-000000000001'$$);
select pg_temp.works('visita con spesa, peso e fattura della casa', $$insert into public.home_pet_log(pet_id,task_id,done_on,kind,title,weight_kg,cost_cents,document_id) values
 ('60000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000001','2026-03-01','vaccine','Antirabbica',18.2,6500,'30000000-0000-0000-0000-000000000001')$$);
select pg_temp.works('nota di diario dell''animale', $$insert into public.home_pet_log(pet_id,done_on,kind,title) values ('60000000-0000-0000-0000-000000000001','2026-03-02','note','Mangia meno')$$);
select pg_temp.refused('fattura personale su un animale della casa rifiutata', $$insert into public.home_pet_log(pet_id,done_on,kind,title,document_id) values
 ('60000000-0000-0000-0000-000000000001','2026-03-01','vet_visit','Visita','30000000-0000-0000-0000-000000000002')$$);
select pg_temp.refused('spesa negativa rifiutata', $$insert into public.home_pet_log(pet_id,done_on,title,cost_cents) values ('60000000-0000-0000-0000-000000000001','2026-03-01','Visita',-1)$$);
select pg_temp.works('gatto personale', $$insert into public.home_pets(id,name,species) values ('60000000-0000-0000-0000-000000000002','Micia','cat')$$);
select pg_temp.works('voce del piano del gatto', $$insert into public.home_pet_tasks(id,pet_id,kind,title,every_days) values ('61000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000002','antiparasitic','Pipetta',30)$$);
select pg_temp.refused('registro del cane con la voce del gatto rifiutato', $$insert into public.home_pet_log(pet_id,task_id,done_on,title) values
 ('60000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000002','2026-03-01','Pipetta')$$);
-- Limite: 50 animali per spazio (il gatto personale è il primo).
select pg_temp.works('altri 49 animali personali', $$insert into public.home_pets(name) select 'Pesce ' || g from generate_series(1,49) g$$);
select pg_temp.refused('il 51° animale rifiutato', $$insert into public.home_pets(name) values ('Troppi')$$);
-- B (sola lettura) vede ma non cambia
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
insert into results select 'lettore vede il cane, il piano e il registro',
 (select count(*) from public.home_pets where id='60000000-0000-0000-0000-000000000001')=1
 and (select count(*) from public.home_pet_tasks where pet_id='60000000-0000-0000-0000-000000000001')=1
 and (select count(*) from public.home_pet_log where pet_id='60000000-0000-0000-0000-000000000001')=2;
insert into results select 'lettore non vede il gatto personale di A', count(*)=0 from public.home_pets where id='60000000-0000-0000-0000-000000000002';
with u as (update public.home_pets set name='Rex' where id='60000000-0000-0000-0000-000000000001' returning 1) insert into results select 'lettore non cambia il nome', count(*)=0 from u;
select pg_temp.refused('lettore non aggiunge al registro', $$insert into public.home_pet_log(pet_id,done_on,title) values ('60000000-0000-0000-0000-000000000001','2026-03-01','Intruso')$$);
-- C (esterna) non vede e non scrive
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
insert into results select 'esterna non vede gli animali', count(*)=0 from public.home_pets;
insert into results select 'esterna non vede il registro', count(*)=0 from public.home_pet_log;
select pg_temp.refused('esterna non aggiunge voci al piano', $$insert into public.home_pet_tasks(pet_id,title) values ('60000000-0000-0000-0000-000000000001','Intrusa')$$);
select pg_temp.refused('esterna non crea un animale nella casa', $$insert into public.home_pets(home_id,name) values ('10000000-0000-0000-0000-000000000001','Intruso')$$);

-- ===== Foto e diario delle piante =====
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.home_garden_plants(id,home_id,name,kind) values ('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Limone','fruit');
insert into public.home_garden_plants(id,home_id,name,kind) values ('50000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Rosa','ornamental');
select pg_temp.works('nota di diario della pianta', $$insert into public.home_garden_log(id,plant_id,done_on,kind,title,notes) values
 ('52000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','2026-05-10','note','Foglie gialle','Forse troppa acqua')$$);
select pg_temp.works('foto della pianta legata alla nota', $$insert into public.home_garden_photos(plant_id,log_id,document_id,caption,taken_on) values
 ('50000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000003','Foglie','2026-05-10')$$);
select pg_temp.refused('stessa foto due volte sulla stessa pianta rifiutata', $$insert into public.home_garden_photos(plant_id,document_id) values
 ('50000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000003')$$);
select pg_temp.refused('foto personale su una pianta della casa rifiutata', $$insert into public.home_garden_photos(plant_id,document_id) values
 ('50000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002')$$);
select pg_temp.refused('foto della rosa legata alla nota del limone rifiutata', $$insert into public.home_garden_photos(plant_id,log_id,document_id) values
 ('50000000-0000-0000-0000-000000000002','52000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000003')$$);
select pg_temp.refused('didascalia troppo lunga rifiutata', $$update public.home_garden_photos set caption=repeat('x',201) where plant_id='50000000-0000-0000-0000-000000000001'$$);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
insert into results select 'lettore vede la foto', count(*)=1 from public.home_garden_photos;
select pg_temp.refused('lettore non aggiunge foto', $$insert into public.home_garden_photos(plant_id,document_id) values
 ('50000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000003')$$);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
insert into results select 'esterna non vede le foto', count(*)=0 from public.home_garden_photos;

-- ===== Meteo =====
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.works('impostazioni della casa con il luogo del meteo', $$insert into public.home_seasonal_settings(home_id,climate,weather_lat,weather_lon,weather_place) values
 ('10000000-0000-0000-0000-000000000001','mild',45.46,9.19,'Milano')$$);
select pg_temp.refused('latitudine senza longitudine rifiutata', $$update public.home_seasonal_settings set weather_lon=null where home_id='10000000-0000-0000-0000-000000000001'$$);
select pg_temp.refused('latitudine impossibile rifiutata', $$update public.home_seasonal_settings set weather_lat=95 where home_id='10000000-0000-0000-0000-000000000001'$$);
select pg_temp.works('avviso di gelata spento', $$update public.home_seasonal_settings set frost_alerts=false where home_id='10000000-0000-0000-0000-000000000001'$$);
insert into results select 'posizione arrotondata a 2 decimali', weather_lat=45.46 from public.home_seasonal_settings where home_id='10000000-0000-0000-0000-000000000001';
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
with u as (update public.home_seasonal_settings set weather_place='Altrove' returning 1) insert into results select 'lettore non cambia il luogo del meteo', count(*)=0 from u;

-- ===== Spese detraibili =====
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.works('voce manuale: caldaia nuova con bonifico parlante', $$insert into public.home_tax_items(id,home_id,tax_year,category,description,amount_cents,paid_on,payment_method,supplier,supplier_tax_code) values
 ('70000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',2026,'energy','Caldaia a condensazione',350000,'2026-04-10','tax_transfer','Termo Srl','01234567890')$$);
select pg_temp.works('visita del veterinario dal registro, con fattura', $$insert into public.home_tax_items(home_id,tax_year,category,description,amount_cents,paid_on,payment_method,source,source_id,document_id) values
 ('10000000-0000-0000-0000-000000000001',2026,'veterinary','Antirabbica Fido',6500,'2026-03-01','traceable','pet_log','62000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001')$$);
select pg_temp.refused('stessa visita segnata due volte rifiutata', $$insert into public.home_tax_items(home_id,tax_year,category,description,amount_cents,source,source_id) values
 ('10000000-0000-0000-0000-000000000001',2026,'veterinary','Di nuovo',6500,'pet_log','62000000-0000-0000-0000-000000000001')$$);
select pg_temp.refused('voce manuale con origine rifiutata', $$insert into public.home_tax_items(home_id,tax_year,category,description,amount_cents,source_id) values
 ('10000000-0000-0000-0000-000000000001',2026,'other','Strana',100,'62000000-0000-0000-0000-000000000009')$$);
select pg_temp.refused('documento personale su una voce della casa rifiutato', $$update public.home_tax_items set document_id='30000000-0000-0000-0000-000000000002' where id='70000000-0000-0000-0000-000000000001'$$);
select pg_temp.refused('importo zero rifiutato', $$update public.home_tax_items set amount_cents=0 where id='70000000-0000-0000-0000-000000000001'$$);
select pg_temp.refused('modo di pagamento sconosciuto rifiutato', $$update public.home_tax_items set payment_method='baratto' where id='70000000-0000-0000-0000-000000000001'$$);
select pg_temp.refused('categoria con caratteri strani rifiutata', $$update public.home_tax_items set category='Energia!' where id='70000000-0000-0000-0000-000000000001'$$);
select pg_temp.works('spesa medica personale', $$insert into public.home_tax_items(tax_year,category,description,amount_cents,payment_method,document_id) values
 (2026,'medical','Occhiali',25000,'traceable','30000000-0000-0000-0000-000000000002')$$);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
insert into results select 'lettore vede le voci della casa, non quelle personali di A', count(*)=2 from public.home_tax_items;
select pg_temp.refused('lettore non aggiunge voci', $$insert into public.home_tax_items(home_id,tax_year,category,description,amount_cents) values
 ('10000000-0000-0000-0000-000000000001',2026,'other','Intrusa',100)$$);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
insert into results select 'esterna non vede le voci', count(*)=0 from public.home_tax_items;

-- ===== Avvisi e funzioni interne =====
reset role;
insert into results select 'avvisi pet e weather ammessi', pg_get_constraintdef(oid) like '%''pet''%' and pg_get_constraintdef(oid) like '%''weather''%'
 from pg_constraint where conname='user_alerts_kind_check';
insert into results select 'interruttori push di animali e meteo', count(*)=2 from information_schema.columns
 where table_name='user_alert_preferences' and column_name in ('push_pets','push_weather');
insert into results select 'funzioni interne non chiamabili',
 not has_function_privilege('authenticated','private.v59_limit()','execute')
 and not has_function_privilege('authenticated','private.v59_reference_guard()','execute')
 and not has_function_privilege('authenticated','private.v59_same_space(uuid,uuid,uuid,uuid)','execute')
 and not has_function_privilege('anon','private.v59_pet_access(uuid,boolean)','execute');
-- Cancellare l'animale cancella piano e registro; la scorta cancellata toglie il collegamento.
delete from public.home_stock_items where id='40000000-0000-0000-0000-000000000001';
insert into results select 'scorta cancellata: collegamenti tolti',
 (select food_stock_item_id is null from public.home_pets where id='60000000-0000-0000-0000-000000000001')
 and (select stock_item_id is null from public.home_pet_tasks where id='61000000-0000-0000-0000-000000000001');
delete from public.home_pets where id='60000000-0000-0000-0000-000000000001';
insert into results select 'animale cancellato con piano e registro',
 (select count(*) from public.home_pet_tasks where pet_id='60000000-0000-0000-0000-000000000001')=0
 and (select count(*) from public.home_pet_log where pet_id='60000000-0000-0000-0000-000000000001')=0;
select test, case when ok then 'ok' else 'NO' end from results;
select count(*) filter (where not ok) as falliti from results;

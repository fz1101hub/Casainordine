-- Prova locale di migrate_v46_scorte.sql.
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
insert into public.home_stock_items(id,home_id,name,unit,quantity,threshold,usual_buy) values ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Caffè','pack',2,1,3);
insert into results select 'scorta creata', count(*)=1 from public.home_stock_items;
insert into results select 'meno uno', public.v46_adjust_stock('40000000-0000-0000-0000-000000000001',-1)=1;
insert into results select 'non scende sotto zero', public.v46_adjust_stock('40000000-0000-0000-0000-000000000001',-5)=0;
insert into results select 'più uno', public.v46_adjust_stock('40000000-0000-0000-0000-000000000001',1)=1;
do $$ begin perform public.v46_adjust_stock('40000000-0000-0000-0000-000000000001',1000000); insert into results values ('variazione enorme rifiutata', false);
exception when invalid_parameter_value then insert into results values ('variazione enorme rifiutata', true); end $$;
do $$ begin insert into public.home_stock_items(name,unit) values ('Sale','tonnellate'); insert into results values ('unità sconosciuta rifiutata', false);
exception when check_violation then insert into results values ('unità sconosciuta rifiutata', true); end $$;
-- C (sola lettura): vede, non tocca le quantità neanche con la funzione
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
insert into results select 'lettore vede', count(*)=1 from public.home_stock_items;
do $$ begin perform public.v46_adjust_stock('40000000-0000-0000-0000-000000000001',-1); insert into results values ('lettore non scala', false);
exception when no_data_found then insert into results values ('lettore non scala', true); end $$;
-- B (editor): scala e modifica; non sposta la scorta
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
insert into results select 'editor scala', public.v46_adjust_stock('40000000-0000-0000-0000-000000000001',-1)=0;
with u as (update public.home_stock_items set threshold=2, location='Dispensa' returning 1) insert into results select 'editor modifica', count(*)=1 from u;
do $$ begin update public.home_stock_items set home_id=null; insert into results values ('casa non si cambia', false);
exception when insufficient_privilege then insert into results values ('casa non si cambia', true); end $$;
-- D (esterna)
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
insert into results select 'esterna non vede', count(*)=0 from public.home_stock_items;
do $$ begin perform public.v46_adjust_stock('40000000-0000-0000-0000-000000000001',5); insert into results values ('esterna non scala', false);
exception when no_data_found then insert into results values ('esterna non scala', true); end $$;
-- Limite di 300 per spazio (personale di D)
insert into public.home_stock_items(name) select 'Scorta '||g from generate_series(1,300) g;
do $$ begin insert into public.home_stock_items(name) values ('Una di troppo'); insert into results values ('trecentunesima rifiutata', false);
exception when raise_exception then insert into results values ('trecentunesima rifiutata', true); end $$;
reset role;
insert into results select 'anon senza permessi', not has_table_privilege('anon','public.home_stock_items','select') and not has_function_privilege('anon','public.v46_adjust_stock(uuid,numeric)','execute');
select test, case when ok then 'ok' else 'NO' end from results;
select count(*) filter (where not ok) as falliti from results;

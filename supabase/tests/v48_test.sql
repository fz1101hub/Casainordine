-- Prova locale di migrate_v48_fondo.sql.
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
insert into public.maintenance_assets(id,home_id,name,purchased_on) values ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Caldaia','2014-03-01');
insert into public.home_replacement_plans(asset_id,item_type,cost,saved) values ('30000000-0000-0000-0000-000000000001','boiler',2500,500);
insert into results select 'piano creato', count(*)=1 from public.home_replacement_plans;
insert into public.home_replacement_plans(asset_id,item_type,cost,saved) values ('30000000-0000-0000-0000-000000000001','boiler',2600,600)
 on conflict (asset_id) do update set asset_id=excluded.asset_id, item_type=excluded.item_type, cost=excluded.cost, saved=excluded.saved;
insert into results select 'upsert come PostgREST', (select cost from public.home_replacement_plans)=2600;
do $$ begin insert into public.home_replacement_plans(asset_id,item_type) values (gen_random_uuid(),'boiler'); insert into results values ('oggetto inesistente rifiutato', false);
exception when others then insert into results values ('oggetto inesistente rifiutato', true); end $$;
do $$ begin update public.home_replacement_plans set life_years=99; insert into results values ('vita fuori limite rifiutata', false);
exception when check_violation then insert into results values ('vita fuori limite rifiutata', true); end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
insert into results select 'lettore vede', count(*)=1 from public.home_replacement_plans;
with u as (update public.home_replacement_plans set saved=0 returning 1) insert into results select 'lettore non modifica', count(*)=0 from u;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
with u as (update public.home_replacement_plans set saved=900 returning 1) insert into results select 'editor modifica', count(*)=1 from u;
do $$ begin update public.home_replacement_plans set created_by='00000000-0000-0000-0000-00000000000b'; insert into results values ('autore non si cambia', false);
exception when insufficient_privilege then insert into results values ('autore non si cambia', true); end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
insert into results select 'esterna non vede', count(*)=0 from public.home_replacement_plans;
do $$ begin insert into public.home_replacement_plans(asset_id,item_type) values ('30000000-0000-0000-0000-000000000001','boiler'); insert into results values ('esterna non scrive', false);
exception when others then insert into results values ('esterna non scrive', true); end $$;
reset role;
delete from public.maintenance_assets where id='30000000-0000-0000-0000-000000000001';
insert into results select 'piano eliminato con l''oggetto', count(*)=0 from public.home_replacement_plans;
insert into results select 'anon senza permessi', not has_table_privilege('anon','public.home_replacement_plans','select');
select test, case when ok then 'ok' else 'NO' end from results;
select count(*) filter (where not ok) as falliti from results;

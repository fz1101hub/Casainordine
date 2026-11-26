-- Prova locale di migrate_v65_scadenze_prevenzione.sql.
\set ON_ERROR_STOP 0
\pset pager off
insert into auth.users(id,email) values ('00000000-0000-0000-0000-00000000000a','a@x.it');
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
select pg_temp.works('certificato medico sportivo', $$insert into public.family_documents(holder,kind,expires_on,notice_days) values ('Luca','sport_certificate','2027-09-15',30)$$);
select pg_temp.works('persona con sesso e screening', $$insert into public.health_people(id,name,relation,birth_on,sex,screening_plan) values ('95000000-0000-0000-0000-000000000001','Anna','self','1972-03-04','female',true)$$);
select pg_temp.refused('sesso sconosciuto rifiutato', $$update public.health_people set sex='x' where id='95000000-0000-0000-0000-000000000001'$$);
select pg_temp.works('screening spenti', $$update public.health_people set screening_plan=false, sex=null where id='95000000-0000-0000-0000-000000000001'$$);
select pg_temp.works('Home con il riquadro delle rate', $$insert into public.user_home_preferences(user_id,widget_order) values ('00000000-0000-0000-0000-00000000000a', array['installments','bills','shopping','tasks','five_minutes','medicines','health','pets','garden','documents'])$$);
select pg_temp.refused('undici riquadri rifiutati', $$update public.user_home_preferences set widget_order=array['installments','bills','shopping','tasks','five_minutes','medicines','health','pets','garden','documents','meteo'] where user_id='00000000-0000-0000-0000-00000000000a'$$);
reset role;
select test, case when ok then 'ok' else 'NO' end from results;
select count(*) filter (where not ok) as falliti from results;

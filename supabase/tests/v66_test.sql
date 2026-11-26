-- Prova locale di migrate_v66_uscite_home.sql: il riquadro «spending» si salva, una volta sola.
\set ON_ERROR_STOP 0
\pset pager off
insert into auth.users(id,email) values ('00000000-0000-0000-0000-00000000000a','a@x.it');
create or replace function pg_temp.as_user(u text) returns void language sql as $$
 select set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, false)$$;
create temp table results(test text, ok boolean);
grant all on results to authenticated;
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.user_home_preferences(user_id, widget_order) values ('00000000-0000-0000-0000-00000000000a', array['bills','spending']);
insert into results select 'riquadro delle uscite salvato', (select widget_order from public.user_home_preferences) = array['bills','spending'];
do $$ begin update public.user_home_preferences set widget_order = array['spending','spending']; insert into results values ('due volte rifiutato', false);
exception when check_violation then insert into results values ('due volte rifiutato', true); end $$;
update public.user_home_preferences set widget_order = array['bills','shopping','tasks','five_minutes','medicines','health','pets','garden','documents','installments','spending'];
insert into results select 'tutti e undici', cardinality((select widget_order from public.user_home_preferences)) = 11;
do $$ begin update public.user_home_preferences set widget_order = array['bills','altro']; insert into results values ('riquadro sconosciuto rifiutato', false);
exception when check_violation then insert into results values ('riquadro sconosciuto rifiutato', true); end $$;
reset role;
select test, case when ok then 'ok' else 'NO' end from results;
select count(*) filter (where not ok) as falliti from results;

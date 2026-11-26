-- Prova locale di migrate_v63_documenti_home.sql.
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
select pg_temp.works('passaporto di Luca', $$insert into public.family_documents(id,holder,kind,expires_on,notice_days) values ('93000000-0000-0000-0000-000000000001','Luca','passport','2027-05-12',180)$$);
select pg_temp.works('carta d''identità senza scadenza', $$insert into public.family_documents(holder,kind,expires_on) values ('Nonno Gino','identity_card',null)$$);
select pg_temp.refused('tipo sconosciuto rifiutato', $$insert into public.family_documents(holder,kind) values ('Luca','tessera_magica')$$);
select pg_temp.refused('preavviso di 3 giorni rifiutato', $$insert into public.family_documents(holder,notice_days) values ('Luca',3)$$);
select pg_temp.refused('nome vuoto rifiutato', $$insert into public.family_documents(holder) values ('  ')$$);
select pg_temp.works('rinnovato: nuova scadenza', $$update public.family_documents set expires_on='2037-05-12' where id='93000000-0000-0000-0000-000000000001'$$);
select pg_temp.refused('non si sposta in un altro spazio', $$update public.family_documents set user_id='00000000-0000-0000-0000-00000000000c' where id='93000000-0000-0000-0000-000000000001'$$);
select pg_temp.works('Home con nove riquadri', $$insert into public.user_home_preferences(user_id,widget_order) values ('00000000-0000-0000-0000-00000000000a', array['medicines','health','pets','garden','documents','bills','shopping','tasks','five_minutes'])$$);
select pg_temp.refused('riquadro ripetuto rifiutato', $$update public.user_home_preferences set widget_order=array['medicines','medicines'] where user_id='00000000-0000-0000-0000-00000000000a'$$);
select pg_temp.refused('riquadro sconosciuto rifiutato', $$update public.user_home_preferences set widget_order=array['bills','meteo'] where user_id='00000000-0000-0000-0000-00000000000a'$$);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
insert into results select 'esterna non vede i documenti', not exists(select 1 from public.family_documents);
with u as (update public.family_documents set expires_on='2020-01-01' returning 1) insert into results select 'esterna non cambia i documenti', count(*)=0 from u;
reset role;
select pg_temp.works('avviso «document» accettato', $$insert into public.user_alerts(user_id,kind,reference_id,event_date,title,body) values ('00000000-0000-0000-0000-00000000000a','document','93000000-0000-0000-0000-000000000001','2037-05-12','Passaporto','Scade')$$);
insert into results select 'interruttore push dei documenti acceso di partenza', (select column_default from information_schema.columns where table_name='user_alert_preferences' and column_name='push_documents') = 'true';
select test, case when ok then 'ok' else 'NO' end from results;
select count(*) filter (where not ok) as falliti from results;

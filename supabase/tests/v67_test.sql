-- Prova locale di migrate_v67_scadenze_fiscali.sql.
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

-- A: spazio personale e casa.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.tax_calendar_settings(groups, remind_days, done) values (array['730','isee'], 10, array['730_2026','doc_cu_2025']);
insert into public.tax_calendar_settings(home_id, groups) values ('10000000-0000-0000-0000-000000000001', array['imu']);
insert into results select 'impostazioni salvate', (select count(*) from public.tax_calendar_settings) = 2;
do $$ begin insert into public.tax_calendar_settings(groups) values (array['730']); insert into results values ('una sola riga personale', false);
exception when unique_violation then insert into results values ('una sola riga personale', true); end $$;
do $$ begin update public.tax_calendar_settings set groups = array['tasse_strane'] where home_id is null; insert into results values ('gruppo sconosciuto rifiutato', false);
exception when check_violation then insert into results values ('gruppo sconosciuto rifiutato', true); end $$;
do $$ begin update public.tax_calendar_settings set done = array['<script>'] where home_id is null; insert into results values ('chiave fatta non valida rifiutata', false);
exception when check_violation then insert into results values ('chiave fatta non valida rifiutata', true); end $$;
do $$ begin update public.tax_calendar_settings set remind_days = 90 where home_id is null; insert into results values ('preavviso oltre 60 giorni rifiutato', false);
exception when check_violation then insert into results values ('preavviso oltre 60 giorni rifiutato', true); end $$;
do $$ begin update public.tax_calendar_settings set home_id = null where home_id is not null; insert into results values ('non si sposta tra spazi', false);
exception when insufficient_privilege then insert into results values ('non si sposta tra spazi', true); end $$;

-- B (editor della casa) vede e cambia quelle della casa, non quelle personali di A.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
insert into results select 'editor vede solo la casa', (select count(*) from public.tax_calendar_settings) = 1;
with u as (update public.tax_calendar_settings set done = array['imu_first_2027'] returning 1) insert into results select 'editor segna fatto', count(*) = 1 from u;
-- C (lettore) vede ma non cambia.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
with u as (update public.tax_calendar_settings set groups = array['730'] returning 1) insert into results select 'lettore non cambia', count(*) = 0 from u;
insert into results select 'lettore vede', (select count(*) from public.tax_calendar_settings) = 1;
-- D (estraneo) non vede niente.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
insert into results select 'estraneo non vede', (select count(*) from public.tax_calendar_settings) = 0;
reset role;

insert into public.user_alerts(user_id, kind, reference_id, event_date, title, body)
 select '00000000-0000-0000-0000-00000000000a', 'tax', id, '2027-09-30', 't', 'b' from public.tax_calendar_settings where home_id is null;
insert into results select 'avviso «tax» accettato', (select count(*) from public.user_alerts where kind = 'tax') = 1;
insert into results select 'interruttore push_taxes acceso di partenza', (select column_default from information_schema.columns where table_name = 'user_alert_preferences' and column_name = 'push_taxes') = 'true';
insert into results select 'anon senza permessi', not has_table_privilege('anon', 'public.tax_calendar_settings', 'select');
select test, case when ok then 'ok' else 'NO' end from results;
select count(*) filter (where not ok) as falliti from results;

-- Casa in Ordine: controlli programmati con Supabase Cron (pg_cron + pg_net).
--
-- Da eseguire una volta nel SQL Editor di Supabase, DOPO aver pubblicato su Vercel la versione
-- dell'app che accetta le chiamate di Supabase Cron (intestazione x-casa-cron-token).
-- Rieseguibile: le chiavi già create restano, i job con lo stesso nome vengono aggiornati.
--
-- Cosa fa:
--  - promemoria e riepiloghi (/api/cron) ogni giorno alle 07:07 UTC (08:07 in inverno,
--    09:07 in estate, ora italiana);
--  - lettura delle caselle email (/api/mail/cron) ogni 3 ore: ogni casella si legge comunque al
--    massimo una volta ogni 20 ore, le chiamate in più servono a raggiungerle tutte;
--  - cancella la cronologia dei job più vecchia di 7 giorni.
-- I cron di Vercel (vercel.json) restano come riserva: una seconda chiamata nello stesso giorno
-- non manda nulla due volte.
--
-- La chiave delle chiamate viene generata qui e salvata nel Vault del database: non va copiata
-- su Vercel, perché l'app la verifica con la funzione v35_cron_token_valid.
-- Se l'indirizzo dell'app cambia: select vault.update_secret(id, 'https://nuovo-indirizzo')
--   from vault.secrets where name='casa_app_url';
-- Per controllare le esecuzioni: select * from cron.job_run_details order by start_time desc limit 20;
-- e le risposte dell'app: select id, status_code, left(content,200) from net._http_response order by created desc;

begin;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$ begin
  if not exists (select 1 from vault.secrets where name = 'casa_cron_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'casa_cron_token',
      'Chiave delle chiamate di Supabase Cron alle API di Casa in Ordine');
  end if;
  if not exists (select 1 from vault.secrets where name = 'casa_app_url') then
    perform vault.create_secret('https://casainordine.vercel.app', 'casa_app_url',
      'Indirizzo pubblico di Casa in Ordine, senza barra finale');
  end if;
end $$;

-- Verifica della chiave, usata dall'app con la chiave di servizio.
create or replace function public.v35_cron_token_valid(token text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(length(token) = 64, false) and exists (
    select 1 from vault.decrypted_secrets s where s.name = 'casa_cron_token' and s.decrypted_secret = token
  )
$$;
revoke all on function public.v35_cron_token_valid(text) from public, anon, authenticated;
grant execute on function public.v35_cron_token_valid(text) to service_role;

-- Chiamata a un'API dell'app con la chiave; la risposta finisce in net._http_response.
create or replace function public.v35_call_app(path text, timeout_ms int default 60000) returns bigint
language plpgsql security definer set search_path = '' as $$
declare base text; token text;
begin
  select decrypted_secret into base from vault.decrypted_secrets where name = 'casa_app_url';
  select decrypted_secret into token from vault.decrypted_secrets where name = 'casa_cron_token';
  if base is null or token is null then raise exception 'Configurazione di Supabase Cron incompleta'; end if;
  return net.http_get(
    url := rtrim(base, '/') || path,
    headers := jsonb_build_object('x-casa-cron-token', token),
    timeout_milliseconds := timeout_ms
  );
end $$;
revoke all on function public.v35_call_app(text, int) from public, anon, authenticated;

select cron.schedule('casa-promemoria', '7 7 * * *', $job$select public.v35_call_app('/api/cron', 60000)$job$);
select cron.schedule('casa-email', '17 */3 * * *', $job$select public.v35_call_app('/api/mail/cron', 300000)$job$);
select cron.schedule('casa-pulizia-cron', '43 3 * * *', $job$delete from cron.job_run_details where end_time < now() - interval '7 days'$job$);

commit;

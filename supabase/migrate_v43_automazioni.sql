-- Casa in Ordine: automazioni personalizzate (Fase 2 della roadmap, 3.3).
-- Da eseguire una volta nel SQL Editor di Supabase, DOPO migrate_v42_permessi.sql. Rieseguibile.
--
-- Regole scelte dalla persona per farsi avvisare:
--   - bill_amount: una bolletta da pagare supera una soglia (anche solo di una categoria o fornitore);
--   - contract_renewal: un contratto si rinnova entro N giorni;
--   - recurring: un promemoria ogni N mesi da una data di partenza (con anticipo facoltativo).
-- Il controllo programmato (/api/cron, lib/automation-alerts.mjs) crea gli avvisi in user_alerts
-- con il tipo «automation»: lo stesso avviso non si crea due volte (unicità già presente su
-- utente, tipo, voce e data) e la notifica push parte solo la prima volta.
-- Accesso: nello spazio personale solo chi ha creato la regola; in una casa condivisa tutti i
-- membri la vedono, solo proprietario ed editor la creano, la cambiano o la cancellano.
-- Al massimo 30 regole per spazio. Finché la migrazione non è eseguita l'app mostra che la sezione
-- va attivata e il controllo programmato salta le automazioni senza errori.
begin;

create table if not exists public.home_automations (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 home_id uuid references public.homes(id) on delete cascade,
 kind text not null check (kind in ('bill_amount','contract_renewal','recurring')),
 name text not null check (char_length(btrim(name)) between 2 and 80),
 amount_threshold numeric(12,2),
 category text check (category is null or char_length(category) between 1 and 40),
 supplier_match text check (supplier_match is null or char_length(supplier_match) between 1 and 80),
 service_match text check (service_match is null or char_length(service_match) between 1 and 80),
 days_before smallint,
 every_months smallint,
 next_on date,
 notify_all boolean not null default false,
 paused boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 -- Ogni tipo ha i suoi dati, negli stessi limiti che controlla l'app (lib/automations.mjs).
 constraint home_automations_fields check (
  (kind = 'bill_amount' and amount_threshold > 0 and amount_threshold <= 100000
    and days_before is null and every_months is null and next_on is null and service_match is null)
  or (kind = 'contract_renewal' and days_before between 1 and 180
    and amount_threshold is null and every_months is null and next_on is null and category is null and supplier_match is null)
  or (kind = 'recurring' and every_months between 1 and 24 and next_on is not null and days_before between 0 and 180
    and amount_threshold is null and category is null and supplier_match is null and service_match is null)
 )
);
create index if not exists idx_home_automations_home on public.home_automations(home_id) where home_id is not null;
create index if not exists idx_home_automations_user on public.home_automations(user_id) where home_id is null;
comment on table public.home_automations is
 'Automazioni personalizzate: regole di avviso su soglie delle bollette, rinnovi dei contratti e promemoria periodici (Fase 2).';

-- Al massimo 30 regole per spazio (casa condivisa, oppure spazio personale di una persona).
create or replace function public.v43_automation_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 -- Due inserimenti insieme nello stesso spazio non superano il limite: uno aspetta l'altro.
 perform pg_advisory_xact_lock(hashtextextended('v43_automations:' || coalesce(new.home_id, new.user_id)::text, 0));
 if (select count(*) from public.home_automations a
     where case when new.home_id is null then a.home_id is null and a.user_id = new.user_id else a.home_id = new.home_id end) >= 30 then
  raise exception 'Hai già 30 automazioni in questo spazio: sospendi o cancella quelle che non servono.' using errcode = 'P0001';
 end if;
 return new;
end $$;
revoke all on function public.v43_automation_limit() from public, anon, authenticated;
drop trigger if exists v43_automation_limit on public.home_automations;
create trigger v43_automation_limit before insert on public.home_automations
 for each row execute function public.v43_automation_limit();

create or replace function public.v43_automation_touch() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
revoke all on function public.v43_automation_touch() from public, anon, authenticated;
drop trigger if exists v43_automation_touch on public.home_automations;
create trigger v43_automation_touch before update on public.home_automations
 for each row execute function public.v43_automation_touch();

alter table public.home_automations enable row level security;
drop policy if exists v43_automations_read on public.home_automations;
drop policy if exists v43_automations_insert on public.home_automations;
drop policy if exists v43_automations_update on public.home_automations;
drop policy if exists v43_automations_delete on public.home_automations;
create policy v43_automations_read on public.home_automations for select to authenticated
 using (public.v19_can_read(user_id, home_id));
create policy v43_automations_insert on public.home_automations for insert to authenticated
 with check (user_id = (select auth.uid()) and public.v19_can_edit(user_id, home_id));
create policy v43_automations_update on public.home_automations for update to authenticated
 using (public.v19_can_edit(user_id, home_id)) with check (public.v19_can_edit(user_id, home_id));
create policy v43_automations_delete on public.home_automations for delete to authenticated
 using (public.v19_can_edit(user_id, home_id));
-- Autore, casa e date non si cambiano dall'app: si cambiano solo i dati della regola.
revoke all on public.home_automations from anon, authenticated;
grant select, insert, delete on public.home_automations to authenticated;
grant update (name, amount_threshold, category, supplier_match, service_match, days_before, every_months, next_on, notify_all, paused)
 on public.home_automations to authenticated;

-- Avvisi creati dalle automazioni e interruttore delle loro notifiche push.
alter table public.user_alerts drop constraint if exists user_alerts_kind_check;
alter table public.user_alerts add constraint user_alerts_kind_check
 check (kind in ('contract','maintenance','warranty','meter','missing_bill','mail_sync','move','savings','fraud','automation'));
alter table public.user_alert_preferences add column if not exists push_automations boolean not null default true;

commit;

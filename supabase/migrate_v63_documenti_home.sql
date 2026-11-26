-- Casa in Ordine: documenti di famiglia in scadenza e nuovi riquadri della Home (scelte dell'utente
-- del 26 novembre 2026, notte). Da eseguire una volta nel SQL Editor di Supabase, DOPO
-- migrate_v62_scheda_spese_bilanci.sql. Rieseguibile.
--
-- - family_documents: carta d'identità, passaporto, patente, tessera sanitaria, permesso di
--   soggiorno e altri documenti di chi vive in casa, con la data di scadenza (o senza scadenza) e
--   quanti giorni prima avvisare. Il lavoro giornaliero manda l'avviso «document» quando comincia il
--   periodo per il rinnovo e il giorno dopo la scadenza, se nel frattempo non è stata cambiata.
--   Niente numeri dei documenti né scansioni: solo chi, che cosa e quando scade.
-- - user_home_preferences: la Home può mostrare anche medicine di oggi, visite e vaccini, animali,
--   giardino e documenti (fino a 9 riquadri, ognuno una volta sola).
-- Limite: 300 documenti per spazio.
begin;

create table if not exists public.family_documents (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 home_id uuid references public.homes(id) on delete cascade,
 holder text not null check (char_length(btrim(holder)) between 1 and 80),
 kind text not null default 'identity_card' check (kind in ('identity_card','passport','driving_license','health_card','residence_permit','other')),
 label text not null default '' check (char_length(label) <= 80),
 expires_on date,
 notice_days smallint not null default 90 check (notice_days between 7 and 365),
 notes text not null default '' check (char_length(notes) <= 500),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists idx_family_documents_home on public.family_documents(home_id) where home_id is not null;
create index if not exists idx_family_documents_user on public.family_documents(user_id) where home_id is null;
-- Il lavoro giornaliero cerca i documenti con una scadenza.
create index if not exists idx_family_documents_expiry on public.family_documents(expires_on) where expires_on is not null;
comment on table public.family_documents is 'Documenti di famiglia (identità, passaporto, patente…) con la scadenza e il preavviso.';

drop trigger if exists v63_documents_touch on public.family_documents;
create trigger v63_documents_touch before update on public.family_documents for each row execute function private.v60_touch();

create or replace function private.v63_documents_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('v63_documents:' || coalesce(new.home_id, new.user_id)::text, 0));
 if (select count(*) from public.family_documents d
     where case when new.home_id is null then d.home_id is null and d.user_id = new.user_id else d.home_id = new.home_id end) >= 300 then
  raise exception 'Ci sono già 300 documenti in questo spazio.' using errcode = 'P0001';
 end if;
 return new;
end $$;
revoke all on function private.v63_documents_limit() from public, anon, authenticated;
drop trigger if exists v63_documents_limit on public.family_documents;
create trigger v63_documents_limit before insert on public.family_documents for each row execute function private.v63_documents_limit();

alter table public.family_documents enable row level security;
drop policy if exists v63_read on public.family_documents;
drop policy if exists v63_insert on public.family_documents;
drop policy if exists v63_update on public.family_documents;
drop policy if exists v63_delete on public.family_documents;
create policy v63_read on public.family_documents for select to authenticated using (private.v19_can_read(user_id, home_id));
create policy v63_insert on public.family_documents for insert to authenticated with check (user_id = (select auth.uid()) and private.v19_can_edit(user_id, home_id));
create policy v63_update on public.family_documents for update to authenticated using (private.v19_can_edit(user_id, home_id)) with check (private.v19_can_edit(user_id, home_id));
create policy v63_delete on public.family_documents for delete to authenticated using (private.v19_can_edit(user_id, home_id));
revoke all on public.family_documents from anon, authenticated;
grant select, insert, delete on public.family_documents to authenticated;
grant update (holder, kind, label, expires_on, notice_days, notes) on public.family_documents to authenticated;

-- Avvisi dei documenti e il loro interruttore delle notifiche push.
alter table public.user_alerts drop constraint if exists user_alerts_kind_check;
alter table public.user_alerts add constraint user_alerts_kind_check
 check (kind in ('contract','maintenance','warranty','meter','missing_bill','mail_sync','move','savings','fraud','automation','garden','pet','weather','health','document'));
alter table public.user_alert_preferences add column if not exists push_documents boolean not null default true;

-- Riquadri della Home: i quattro di prima più medicine, salute, animali, giardino e documenti.
alter table public.user_home_preferences drop constraint if exists user_home_preferences_widgets_check;
alter table public.user_home_preferences add constraint user_home_preferences_widgets_check check (
 cardinality(widget_order) between 1 and 9
 and widget_order <@ array['bills','shopping','tasks','five_minutes','medicines','health','pets','garden','documents']::text[]
 and array_position(widget_order, null) is null
 and cardinality(array_positions(widget_order,'bills')) <= 1 and cardinality(array_positions(widget_order,'shopping')) <= 1
 and cardinality(array_positions(widget_order,'tasks')) <= 1 and cardinality(array_positions(widget_order,'five_minutes')) <= 1
 and cardinality(array_positions(widget_order,'medicines')) <= 1 and cardinality(array_positions(widget_order,'health')) <= 1
 and cardinality(array_positions(widget_order,'pets')) <= 1 and cardinality(array_positions(widget_order,'garden')) <= 1
 and cardinality(array_positions(widget_order,'documents')) <= 1);

commit;

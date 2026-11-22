-- Casa in Ordine: professionisti di fiducia (Fase 2 della roadmap, 3.3).
-- Da eseguire una volta nel SQL Editor di Supabase, DOPO migrate_v43_automazioni.sql. Rieseguibile.
--
-- - home_professionals: idraulico, elettricista, caldaista… con contatti e una nota condivisa.
--   Accesso come le altre voci della casa: i membri leggono, proprietario ed editor scrivono;
--   nello spazio personale solo l'autore.
-- - home_professional_notes: la nota privata di ciascuno su un professionista. La vede e la
--   cambia solo chi l'ha scritta, e solo finché può vedere il professionista.
-- - maintenance_events.professional_id: chi ha fatto l'intervento, così ogni professionista ha
--   l'elenco dei suoi interventi e il totale speso. Deve essere dello stesso spazio dell'intervento.
-- Finché la migrazione non è eseguita, la sezione Professionisti dice che va attivata e il resto
-- dell'app funziona come prima.
begin;

create table if not exists public.home_professionals (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 home_id uuid references public.homes(id) on delete cascade,
 name text not null check (char_length(btrim(name)) between 2 and 120),
 trade text not null check (char_length(btrim(trade)) between 2 and 60),
 phone text not null default '' check (char_length(phone) <= 40),
 email text not null default '' check (char_length(email) <= 160),
 notes text not null default '' check (char_length(notes) <= 1500),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists idx_home_professionals_home on public.home_professionals(home_id) where home_id is not null;
create index if not exists idx_home_professionals_user on public.home_professionals(user_id) where home_id is null;
comment on table public.home_professionals is
 'Professionisti di fiducia della casa (o dello spazio personale): contatti, mestiere e nota condivisa (Fase 2).';

create table if not exists public.home_professional_notes (
 professional_id uuid not null references public.home_professionals(id) on delete cascade,
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 note text not null check (char_length(note) between 1 and 1500),
 updated_at timestamptz not null default now(),
 primary key (professional_id, user_id)
);
create index if not exists idx_home_professional_notes_user on public.home_professional_notes(user_id);
comment on table public.home_professional_notes is
 'Nota privata di una persona su un professionista: la vede solo chi l''ha scritta (Fase 2).';

alter table public.maintenance_events add column if not exists professional_id uuid
 references public.home_professionals(id) on delete set null;
create index if not exists idx_maintenance_events_professional on public.maintenance_events(professional_id) where professional_id is not null;

create or replace function public.v44_touch() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
revoke all on function public.v44_touch() from public, anon, authenticated;
drop trigger if exists v44_professionals_touch on public.home_professionals;
create trigger v44_professionals_touch before update on public.home_professionals
 for each row execute function public.v44_touch();
drop trigger if exists v44_professional_notes_touch on public.home_professional_notes;
create trigger v44_professional_notes_touch before update on public.home_professional_notes
 for each row execute function public.v44_touch();

-- L'intervento e il professionista devono stare nello stesso spazio.
create or replace function public.v44_event_professional_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare ref_user uuid; ref_home uuid;
begin
 if new.professional_id is null then return new; end if;
 select user_id, home_id into ref_user, ref_home from public.home_professionals where id = new.professional_id;
 if not found or ref_home is distinct from new.home_id or (ref_home is null and ref_user is distinct from new.user_id) then
  raise exception 'Professionista non appartenente allo spazio';
 end if;
 return new;
end $$;
revoke all on function public.v44_event_professional_guard() from public, anon, authenticated;
drop trigger if exists v44_event_professional_guard on public.maintenance_events;
create trigger v44_event_professional_guard before insert or update of professional_id on public.maintenance_events
 for each row execute function public.v44_event_professional_guard();

-- Regole di accesso.
alter table public.home_professionals enable row level security;
drop policy if exists v44_professionals_read on public.home_professionals;
drop policy if exists v44_professionals_insert on public.home_professionals;
drop policy if exists v44_professionals_update on public.home_professionals;
drop policy if exists v44_professionals_delete on public.home_professionals;
create policy v44_professionals_read on public.home_professionals for select to authenticated
 using (public.v19_can_read(user_id, home_id));
create policy v44_professionals_insert on public.home_professionals for insert to authenticated
 with check (user_id = (select auth.uid()) and public.v19_can_edit(user_id, home_id));
create policy v44_professionals_update on public.home_professionals for update to authenticated
 using (public.v19_can_edit(user_id, home_id)) with check (public.v19_can_edit(user_id, home_id));
create policy v44_professionals_delete on public.home_professionals for delete to authenticated
 using (public.v19_can_edit(user_id, home_id));
revoke all on public.home_professionals from anon, authenticated;
grant select, insert, delete on public.home_professionals to authenticated;
grant update (name, trade, phone, email, notes) on public.home_professionals to authenticated;

-- Nota privata: solo chi la scrive, e solo su un professionista che può vedere
-- (anche chi ha la casa in sola lettura può tenere una sua nota).
create or replace function public.v44_can_see_professional(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.home_professionals p where p.id = target and public.v19_can_read(p.user_id, p.home_id))
$$;
revoke all on function public.v44_can_see_professional(uuid) from public, anon;
grant execute on function public.v44_can_see_professional(uuid) to authenticated;
alter table public.home_professional_notes enable row level security;
drop policy if exists v44_professional_notes_own on public.home_professional_notes;
create policy v44_professional_notes_own on public.home_professional_notes for all to authenticated
 using (user_id = (select auth.uid()) and public.v44_can_see_professional(professional_id))
 with check (user_id = (select auth.uid()) and public.v44_can_see_professional(professional_id));
revoke all on public.home_professional_notes from anon, authenticated;
grant select, insert, delete on public.home_professional_notes to authenticated;
-- professional_id serve al salvataggio con upsert (PostgREST riscrive le colonne inviate).
grant update (professional_id, note) on public.home_professional_notes to authenticated;

commit;

-- Casa in Ordine: saldi tra coinquilini calcolati nel database.
-- Da eseguire una volta nel SQL Editor di Supabase, DOPO migrate_v33_audit.sql. Rieseguibile.
--
-- Prima l'app calcolava i saldi nel browser sulle ultime 250 spese: dopo qualche mese di spese
-- quotidiane le cifre da rimborsare risultavano sbagliate. La funzione somma tutte le spese della
-- casa in centesimi interi; le regole di accesso (RLS) restano attive: security invoker.
begin;

create or replace function public.v33_home_balances(home uuid)
returns table(user_id uuid, balance_cents bigint)
language sql stable security invoker set search_path='' as $$
  with paid as (
    select e.paid_by as uid, sum(round(e.amount*100))::bigint as cents
    from public.home_expenses e where e.home_id=home group by e.paid_by
  ), owed as (
    select s.user_id as uid, sum(round(s.amount*100))::bigint as cents
    from public.home_expense_shares s join public.home_expenses e on e.id=s.expense_id
    where e.home_id=home group by s.user_id
  )
  select m.user_id, coalesce(p.cents,0)-coalesce(o.cents,0)
  from public.home_members m
  left join paid p on p.uid=m.user_id
  left join owed o on o.uid=m.user_id
  where m.home_id=home and public.is_home_member(home)
$$;
revoke all on function public.v33_home_balances(uuid) from public, anon;
grant execute on function public.v33_home_balances(uuid) to authenticated;

create index if not exists idx_v34_home_expense_shares_expense on public.home_expense_shares(expense_id);

commit;

-- Casa in Ordine: nella lista della spesa si possono cambiare solo testo, quantità e spunta.
-- Da eseguire una volta nel SQL Editor di Supabase, DOPO migrate_v37_account.sql. Rieseguibile.
--
-- La regola shopping_update controlla solo che chi modifica possa scrivere nella casa: senza
-- limiti sulle colonne, un membro poteva attribuire un elemento a un altro (created_by) o
-- spostarlo in un'altra delle sue case (home_id). L'app modifica solo la spunta.
-- La cancellazione di un account (migrate_v37_account.sql) continua ad azzerare created_by:
-- le chiavi esterne agiscono con i permessi del proprietario della tabella.
begin;
revoke update on public.home_shopping from anon, authenticated;
grant update (title, quantity, checked) on public.home_shopping to authenticated;
commit;

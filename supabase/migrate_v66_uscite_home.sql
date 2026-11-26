-- Casa in Ordine: riquadro «Uscite del mese» nella Home (scelta dell'utente del 26 novembre 2026,
-- mattina). Da eseguire una volta nel SQL Editor di Supabase, DOPO migrate_v65_scadenze_prevenzione.sql.
-- Rieseguibile.
--
-- - user_home_preferences: il riquadro «spending» (uscite di questo mese e del prossimo, dalla
--   previsione delle uscite), fino a 11 riquadri.
begin;

alter table public.user_home_preferences drop constraint if exists user_home_preferences_widgets_check;
alter table public.user_home_preferences add constraint user_home_preferences_widgets_check check (
 cardinality(widget_order) between 1 and 11
 and widget_order <@ array['bills','shopping','tasks','five_minutes','medicines','health','pets','garden','documents','installments','spending']::text[]
 and array_position(widget_order, null) is null
 and cardinality(array_positions(widget_order,'bills')) <= 1 and cardinality(array_positions(widget_order,'shopping')) <= 1
 and cardinality(array_positions(widget_order,'tasks')) <= 1 and cardinality(array_positions(widget_order,'five_minutes')) <= 1
 and cardinality(array_positions(widget_order,'medicines')) <= 1 and cardinality(array_positions(widget_order,'health')) <= 1
 and cardinality(array_positions(widget_order,'pets')) <= 1 and cardinality(array_positions(widget_order,'garden')) <= 1
 and cardinality(array_positions(widget_order,'documents')) <= 1 and cardinality(array_positions(widget_order,'installments')) <= 1
 and cardinality(array_positions(widget_order,'spending')) <= 1);

commit;

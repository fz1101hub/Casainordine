-- Casa in Ordine: giro orario delle notifiche push rinviate (23 novembre 2026).
-- Da eseguire nel SQL Editor di Supabase DOPO migrate_v53_push_rinviate.sql e DOPO aver pubblicato
-- su Vercel la versione dell'app con /api/cron/push. Richiede migrate_v35_cron.sql (pg_cron, pg_net
-- e la funzione v35_call_app). Rieseguibile: un job con lo stesso nome viene aggiornato.
-- Resta fuori da scripts/db-tests.sh, come migrate_v35_cron.sql: pg_cron c'è solo su Supabase.
--
-- Ogni ora, al minuto 37: manda le push rinviate a chi non è più nell'orario silenzioso. Se non
-- c'è niente da mandare legge una tabella vuota e finisce. Vercel non serve: il piano gratuito
-- permette solo lavori giornalieri.
select cron.schedule('casa-push-rinviate', '37 * * * *', $job$select public.v35_call_app('/api/cron/push', 60000)$job$);

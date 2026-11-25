-- Casa in Ordine: giro dei promemoria della salute ogni 5 minuti (25 novembre 2026, sera).
-- Da eseguire nel SQL Editor di Supabase DOPO migrate_v60_salute.sql. Richiede migrate_v35_cron.sql
-- (pg_cron, pg_net e la funzione v35_call_app). Rieseguibile: un job con lo stesso nome viene aggiornato.
-- Resta fuori da scripts/db-tests.sh, come migrate_v35_cron.sql: pg_cron c'è solo su Supabase.
--
-- Ogni 5 minuti /api/cron/health manda i promemoria delle terapie arrivate all'orario (dosi degli
-- ultimi 30 minuti non ancora avvisate) e delle visite (il giorno prima alle 18, la mattina alle 8,
-- un'ora prima). Se non c'è niente da mandare legge poche righe e finisce.
select cron.schedule('casa-salute', '*/5 * * * *', $job$select public.v35_call_app('/api/cron/health', 60000)$job$);

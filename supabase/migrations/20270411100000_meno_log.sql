-- =====================================================================
-- MENO SCRITTURE E MENO LOG NEL DATABASE
-- - Ogni giro di pg_cron lascia una riga in cron.job_run_details: con il
--   controllo delle chiamate ogni minuto sono ~45.000 righe al mese.
--   Ogni notte si tengono solo gli ultimi 2 giorni.
-- - Le ricerche di gioco scadute si cancellano una volta all'ora (prima ogni
--   5 minuti): il sito già non mostra quelle finite.
-- =====================================================================

do $$
begin
  perform cron.schedule('pulizia-registro-cron', '40 3 * * *',
    $q$delete from cron.job_run_details where end_time < now() - interval '2 days'$q$);
  perform cron.schedule('pulizia-ricerca-gioco', '0 * * * *', 'select public.purge_ended_play_requests()');
  -- pulizia subito
  delete from cron.job_run_details where end_time < now() - interval '2 days';
exception when others then
  raise notice 'pg_cron non disponibile: %', sqlerrm;
end;
$$;

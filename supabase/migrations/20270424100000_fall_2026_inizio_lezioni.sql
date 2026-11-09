-- =====================================================================
-- FALL 2026: INIZIO DELLE LEZIONI ALLA DATA DEL CALENDARIO (25 AGOSTO)
-- La migrazione del calendario automatico gli aveva messo «domani» per far
-- partire le lezioni subito. Si rimette la data vera; se le lezioni non sono
-- ancora partite, il calendario le fa partire adesso.
-- =====================================================================
update public.academic_terms
set classes_start = date '2026-08-25'
where academic_year = '2026-27' and semester = 'fall' and status <> 'published';

select public.academic_calendar_tick();

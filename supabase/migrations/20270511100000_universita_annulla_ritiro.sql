-- =====================================================================
-- UNIVERSITÀ: LO STAFF ANNULLA UN RITIRO FATTO PER SBAGLIO
-- academic_staff_reinstate(iscrizione): un corso ritirato (W) torna
-- «iscritto» (compiti, paper e assignment fatti prima contano di nuovo).
-- Solo con il permesso universita.gestire e finché il semestre non è
-- simulato. Il giocatore riceve un messaggio di SISTEMA.
-- Pulsante «Annulla ritiro» nella pagina Università del personaggio
-- (/universita?pg=<id>), sul corso segnato W.
-- =====================================================================

create or replace function public.academic_staff_reinstate(p_enrollment bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.enrollments;
  t public.academic_terms;
  v_course text;
begin
  if not public.has_permission('universita.gestire') then
    raise exception 'Non hai il permesso di gestire l''università.' using errcode = '42501';
  end if;
  select * into e from public.enrollments where id = p_enrollment for update;
  if e.id is null then raise exception 'Iscrizione non trovata.' using errcode = 'P0001'; end if;
  if e.status <> 'withdrawn' then raise exception 'Questo corso non è ritirato.' using errcode = 'P0001'; end if;
  select * into t from public.academic_terms where id = e.term_id;
  if t.status not in ('registration_open', 'in_progress') then
    raise exception 'Il semestre è già stato simulato: il ritiro non si può più annullare.' using errcode = 'P0001';
  end if;
  update public.enrollments set status = 'enrolled' where id = p_enrollment;
  select c.code || ' ' || c.name into v_course from public.courses c where c.id = e.course_id;
  perform public.send_system_message((select owner_id from public.characters where id = e.character_id),
    '🎓 Lo staff ha annullato il tuo ritiro da ' || coalesce(v_course, 'un corso')
    || ': sei di nuovo iscritto e il corso conta per gli esami. Lo trovi nella pagina Università.');
end;
$$;
revoke execute on function public.academic_staff_reinstate(bigint) from public, anon;
grant execute on function public.academic_staff_reinstate(bigint) to authenticated;

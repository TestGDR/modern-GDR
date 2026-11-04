-- =====================================================================
-- COMPLETA LE ISCRIZIONI SOTTO IL MINIMO
-- Una volta: chi ha un Major ed è sotto uni_crediti_min nel semestre con
-- le iscrizioni aperte viene completato con i corsi del Major (i corsi
-- già scelti restano). L'iscrizione automatica della migrazione
-- 20270218100000 saltava chi aveva già qualche corso.
-- =====================================================================
do $$
declare
  v_term uuid := (select id from public.academic_terms where status = 'registration_open' limit 1);
  v_min int := coalesce(public.uni_n('uni_crediti_min'), 12)::int;
  r record;
begin
  if v_term is null then return; end if;
  for r in
    select c.id from public.characters c
    where c.status = 'approvata' and c.study_track_id is not null
      and (select coalesce(sum(co.credits), 0) from public.enrollments e join public.courses co on co.id = e.course_id
           where e.character_id = c.id and e.term_id = v_term and e.status <> 'withdrawn') < v_min
  loop
    perform public.academic_auto_enroll(r.id, v_term);
  end loop;
end;
$$;

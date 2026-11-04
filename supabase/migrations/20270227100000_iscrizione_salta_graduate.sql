-- =====================================================================
-- UNIVERSITÀ: L'ISCRIZIONE AUTOMATICA SALTA I GRADUATE
-- Approvando un personaggio Graduate (magistrale) l'iscrizione automatica
-- chiedeva la sua carriera undergraduate, che non esiste, e l'errore
-- bloccava l'approvazione. Ora i Graduate vengono saltati.
-- =====================================================================
create or replace function public.academic_auto_enroll(p_character uuid, p_term uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_min int := coalesce(public.uni_n('uni_crediti_min'), 12)::int;
  v_major uuid;
  v_minor uuid;
  v_premed boolean;
  v_target int;
  v_have int;
  v_added int := 0;
  c record;
begin
  select study_track_id, minor_id into v_major, v_minor from public.characters where id = p_character and status = 'approvata';
  if v_major is null or not public.character_is_student(p_character) then return 0; end if;
  if (select status from public.academic_terms where id = p_term) is distinct from 'registration_open' then return 0; end if;
  -- i Graduate (magistrale) non seguono i corsi undergraduate: niente iscrizione
  if exists (select 1 from public.characters c join public.sheet_options o on o.id = c.year_id where c.id = p_character and o.sort_order = 5)
     and not exists (select 1 from public.student_records where character_id = p_character) then
    return 0;
  end if;
  v_premed := exists (select 1 from public.premed_students where character_id = p_character);
  -- livello dei corsi adatto all'anno
  begin
    v_target := case (public.uni_record(p_character)).class_standing
      when 'senior' then 400 when 'junior' then 300 when 'sophomore' then 200 else 100 end;
  exception when others then
    return 0;
  end;

  for c in
    with req as (
      select m.course_id as id from public.major_required_courses m where m.major_id = v_major
    ), subj as (
      select prefix, kind from public.major_subjects where major_id = v_major
    ), main as (
      select prefix from subj where kind = 'principale'
      union
      -- Major senza materie scritte: le sigle dei suoi corsi obbligatori
      select distinct split_part(co.code, ' ', 1) from req join public.courses co on co.id = req.id
      where not exists (select 1 from subj where kind = 'principale')
    ), aff as (
      select prefix from subj where kind = 'affine'
    ), extra as (
      select m.course_id as id from public.major_required_courses m where m.major_id = v_minor
      union
      select pc.course_id from public.premed_courses pc where v_premed
    )
    select co.id, co.credits,
      case when co.id in (select id from req) then 0
           when split_part(co.code, ' ', 1) in (select prefix from main) then 1
           when co.id in (select id from extra) then 2
           when split_part(co.code, ' ', 1) in (select prefix from aff) then 3
           else 4 end as prio
    from public.courses co
    where co.active
      and (co.id in (select id from req)
           or split_part(co.code, ' ', 1) in (select prefix from main)
           or co.id in (select id from extra)
           or split_part(co.code, ' ', 1) in (select prefix from aff)
           or co.id in (select course_id from public.general_courses))
    order by prio, abs(co.level - v_target), co.level, co.code
  loop
    select coalesce(sum(co.credits), 0) into v_have from public.enrollments e join public.courses co on co.id = e.course_id
    where e.character_id = p_character and e.term_id = p_term and e.status <> 'withdrawn';
    exit when v_have >= v_min;
    begin
      perform public.academic_enroll_core(p_term, p_character, c.id);
      v_added := v_added + c.credits;
    exception when others then
      -- corso non ancora possibile (livello, prerequisiti, già superato, crediti massimi): si passa al prossimo
      null;
    end;
  end loop;
  return v_added;
end;
$$;
revoke execute on function public.academic_auto_enroll(uuid, uuid) from public, anon, authenticated;

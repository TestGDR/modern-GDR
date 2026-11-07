-- =====================================================================
-- UNIVERSITÀ: CHI ARRIVA DOPO PARTE COME SE AVESSE FREQUENTATO DALL'INIZIO
-- 1. Corsi riconosciuti: chi è creato Sophomore, Junior o Senior ha già
--    superato i corsi obbligatori del Major degli anni prima (e i loro
--    prerequisiti), senza voto: valgono per prerequisiti e laurea, non
--    danno crediti in più (sono già nei crediti di partenza).
-- 2. Media di partenza: alla prima iscrizione un tiro per ogni semestre già
--    frequentato (caratteristica + abilità di un corso del Major + d10 +
--    bonus del Major contro la CD del livello) dà la media dei crediti di
--    partenza, che entra nel GPA cumulativo pesata su quei crediti.
-- 3. Arrivo a semestre in corso: chi non ha mai seguito corsi si iscrive
--    anche a semestre iniziato (anche poco prima degli esami), sceglie
--    l'impegno, cambia i corsi e recupera i compiti delle settimane
--    passate; agli esami è trattato come gli altri. Chi arriva nel
--    semestre di primavera ha anche i crediti del semestre d'autunno.
-- =====================================================================

-- 1. corsi riconosciuti
create table if not exists public.academic_transfer_courses (
  character_id uuid not null references public.characters (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (character_id, course_id)
);
alter table public.academic_transfer_courses enable row level security;
revoke all on public.academic_transfer_courses from anon, authenticated;
grant select on public.academic_transfer_courses to authenticated;
drop policy if exists "Corsi riconosciuti: proprietario e staff" on public.academic_transfer_courses;
create policy "Corsi riconosciuti: proprietario e staff" on public.academic_transfer_courses for select to authenticated
  using ((select public.owns_character(character_id)) or (select public.uni_staff()));
drop policy if exists "Corsi riconosciuti: solo dalle funzioni" on public.academic_transfer_courses;
create policy "Corsi riconosciuti: solo dalle funzioni" on public.academic_transfer_courses for insert to authenticated with check (false);
drop policy if exists "Corsi riconosciuti: non si modificano" on public.academic_transfer_courses;
create policy "Corsi riconosciuti: non si modificano" on public.academic_transfer_courses for update to authenticated using (false);
drop policy if exists "Corsi riconosciuti: tolti dalle funzioni" on public.academic_transfer_courses;
create policy "Corsi riconosciuti: tolti dalle funzioni" on public.academic_transfer_courses for delete to authenticated using (false);

-- 2. media di partenza
alter table public.student_records add column if not exists start_gpa numeric(3, 2);
alter table public.student_records add column if not exists start_gpa_credits int not null default 0;
alter table public.student_records add column if not exists start_rolls jsonb not null default '[]'::jsonb;

-- Ultimo voto pubblicato di un corso; un corso riconosciuto vale come superato (4.0)
create or replace function public.uni_last_points(p_character uuid, p_course uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select e.grade_points from public.enrollments e join public.academic_terms t on t.id = e.term_id
     where e.character_id = p_character and e.course_id = p_course and e.status = 'completed' and t.status = 'published'
     order by t.created_at desc, e.id desc limit 1),
    (select 4.0 from public.academic_transfer_courses tc where tc.character_id = p_character and tc.course_id = p_course))
$$;
revoke execute on function public.uni_last_points(uuid, uuid) from public, anon, authenticated;

-- GPA cumulativo con la media di partenza (pesata sui suoi crediti)
create or replace function public.uni_blend_gpa(p_character uuid, p_cum numeric, p_credits int)
returns numeric
language sql
stable
set search_path = ''
as $$
  select case
    when r.start_gpa is null or coalesce(r.start_gpa_credits, 0) <= 0 then p_cum
    when p_cum is null or coalesce(p_credits, 0) <= 0 then r.start_gpa
    else round((p_cum * p_credits + r.start_gpa * r.start_gpa_credits) / (p_credits + r.start_gpa_credits), 2)
  end
  from (select 1) x left join public.student_records r on r.character_id = p_character
$$;
revoke execute on function public.uni_blend_gpa(uuid, numeric, int) from public, anon, authenticated;

-- Riconosce i corsi degli anni prima e tira la media di partenza.
-- p_year: 1 Freshman … 4 Senior; p_gpa_credits: crediti di partenza da coprire con la media.
create or replace function public.uni_start_career(p_character uuid, p_year int, p_gpa_credits int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_major uuid := (select study_track_id from public.characters where id = p_character);
  v_limit int := greatest(1, least(4, coalesce(p_year, 1))) * 100;
  v_sem int := greatest(0, coalesce(p_gpa_credits, 0)) / 15;
  cd_lv numeric[] := public.uni_list('uni_cd_livelli');
  v_base numeric := coalesce(public.uni_n('uni_punteggio_base'), 75);
  v_per numeric := coalesce(public.uni_n('uni_punti_per_margine'), 4);
  v_majorb int := coalesce(public.uni_n('uni_bonus_major'), 1)::int;
  v_int uuid := (select id from public.attributes where code = 'INT');
  v_courses jsonb;
  v_n int;
  v_i int;
  v_level int;
  co jsonb;
  v_attr int; v_skill int; v_d int; v_total int; v_cd int; v_score int;
  g record;
  v_sum numeric := 0;
  v_rolls jsonb := '[]'::jsonb;
begin
  -- corsi obbligatori del Major sotto il livello dell'anno, con i loro prerequisiti
  if v_major is not null and v_limit > 100 then
    insert into public.academic_transfer_courses (character_id, course_id)
    with recursive need as (
      select m.course_id from public.major_required_courses m where m.major_id = v_major
      union
      select cp.prerequisite_id from public.course_prerequisites cp join need n on n.course_id = cp.course_id
    )
    select p_character, c.id from need n join public.courses c on c.id = n.course_id
    where c.level < v_limit
    on conflict do nothing;
  end if;

  if v_sem <= 0 then return; end if;

  -- corsi su cui tirare: i riconosciuti, altrimenti gli obbligatori del Major (dal livello più basso)
  select coalesce(jsonb_agg(jsonb_build_object('code', c.code, 'level', c.level, 'attribute_id', c.attribute_id, 'skill_id', c.skill_id)
                            order by c.level, c.code), '[]'::jsonb)
    into v_courses
  from public.courses c
  where c.id in (select course_id from public.academic_transfer_courses where character_id = p_character);
  if jsonb_array_length(v_courses) = 0 then
    select coalesce(jsonb_agg(jsonb_build_object('code', c.code, 'level', c.level, 'attribute_id', c.attribute_id, 'skill_id', c.skill_id)
                              order by c.level, c.code), '[]'::jsonb)
      into v_courses
    from public.major_required_courses m join public.courses c on c.id = m.course_id
    where m.major_id = v_major;
  end if;
  v_n := jsonb_array_length(v_courses);

  for v_i in 0 .. v_sem - 1 loop
    v_level := least(4, v_i / 2 + 1);
    if v_n > 0 then
      co := v_courses -> (v_i % v_n);
    else
      co := jsonb_build_object('code', 'Studio', 'level', v_level * 100, 'attribute_id', v_int, 'skill_id', null);
    end if;
    v_attr := coalesce((select value from public.character_attributes
                        where character_id = p_character and attribute_id = (co ->> 'attribute_id')::uuid), 0);
    v_skill := coalesce((select level from public.character_skills
                         where character_id = p_character and skill_id = nullif(co ->> 'skill_id', '')::uuid), 0);
    v_d := public.academic_die();
    v_total := v_attr + v_skill + v_d + case when v_n > 0 then v_majorb else 0 end;
    v_cd := coalesce(cd_lv[v_level], 13 + v_level - 1)::int;
    v_score := greatest(0, least(100, round(v_base + (v_total - v_cd) * v_per)))::int;
    select * into g from public.uni_grade(v_score);
    v_sum := v_sum + g.points;
    v_rolls := v_rolls || jsonb_build_object('semester', v_i + 1, 'course', co ->> 'code', 'attr', v_attr, 'skill', v_skill,
      'd10', v_d, 'bonus', case when v_n > 0 then v_majorb else 0 end, 'total', v_total, 'cd', v_cd,
      'score', v_score, 'letter', g.letter, 'points', g.points);
  end loop;

  update public.student_records
  set start_gpa = round(v_sum / v_sem, 2),
      start_gpa_credits = v_sem * 15,
      start_rolls = v_rolls,
      cumulative_gpa = coalesce(cumulative_gpa, round(v_sum / v_sem, 2)),
      updated_at = now()
  where character_id = p_character;
end;
$$;
revoke execute on function public.uni_start_career(uuid, int, int) from public, anon, authenticated;

-- Carriera: si crea alla prima iscrizione. Crediti di partenza dall'anno (+ il semestre
-- d'autunno a chi arriva in primavera), corsi riconosciuti e media di partenza.
create or replace function public.uni_record(p_character uuid)
returns public.student_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.student_records;
  v_year int;
  v_list numeric[] := public.uni_list('uni_crediti_partenza');
  v_year_credits int;
  v_spring int := 0;
  v_start int;
begin
  select * into r from public.student_records where character_id = p_character;
  if r.character_id is not null then return r; end if;
  select o.sort_order into v_year from public.characters c left join public.sheet_options o on o.id = c.year_id where c.id = p_character;
  if v_year = 5 then
    raise exception 'I Graduate (magistrale) non seguono i corsi undergraduate.' using errcode = 'P0001';
  end if;
  v_year := greatest(1, least(4, coalesce(v_year, 1)));
  v_year_credits := coalesce(v_list[v_year], 0)::int;
  -- semestre di primavera: il semestre d'autunno dell'anno è già passato
  if (select semester from public.academic_terms where status <> 'published' order by created_at desc limit 1) = 'spring' then
    v_spring := greatest(0, (coalesce(v_list[v_year + 1], public.uni_n('uni_crediti_laurea'), 120)::int - v_year_credits) / 2);
  end if;
  v_start := v_year_credits + v_spring
    + coalesce((public.trait_effect(p_character, 'start_credits') ->> 'value')::int, 0);
  insert into public.student_records (character_id, start_credits, credits_earned, class_standing)
  values (p_character, v_start, v_start, public.uni_class(v_start));
  perform public.uni_start_career(p_character, v_year, v_year_credits + v_spring);
  select * into r from public.student_records where character_id = p_character;
  return r;
end;
$$;
revoke execute on function public.uni_record(uuid) from public, anon, authenticated;

-- 3. arrivo a semestre in corso: mai seguito corsi e nessuna iscrizione prima dell'inizio
create or replace function public.academic_late_open(p_character uuid, p_term uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.academic_terms t where t.id = p_term and t.status = 'in_progress' and t.first_started_at is not null)
    and not exists (select 1 from public.enrollments e where e.character_id = p_character and e.term_id <> p_term)
    and not exists (
      select 1 from public.enrollments e join public.academic_terms t on t.id = e.term_id
      where e.character_id = p_character and e.term_id = p_term and e.created_at <= t.first_started_at)
$$;
revoke execute on function public.academic_late_open(uuid, uuid) from public, anon, authenticated;

-- Compiti che uno studente presente dall'inizio avrebbe già potuto fare
create or replace function public.uni_homework_due(p_term uuid)
returns int
language sql
stable
set search_path = ''
as $$
  select least(coalesce(public.uni_n('uni_compiti_max'), 3)::int,
    floor(extract(epoch from now() - coalesce(t.first_started_at, t.started_at, now()))
          / (greatest(1, coalesce(public.uni_n('uni_compiti_giorni'), 7)) * 86400))::int + 1)
  from public.academic_terms t where t.id = p_term
$$;
revoke execute on function public.uni_homework_due(uuid) from public, anon, authenticated;

-- Carriera cancellata (reset della scheda): via anche i corsi riconosciuti
create or replace function public.student_records_clear_transfer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.academic_transfer_courses where character_id = old.character_id;
  return null;
end;
$$;
revoke execute on function public.student_records_clear_transfer() from public, anon, authenticated;
drop trigger if exists student_records_clear_transfer on public.student_records;
create trigger student_records_clear_transfer after delete on public.student_records
  for each row execute function public.student_records_clear_transfer();

-- iscrizione: anche per chi arriva a semestre in corso; i corsi riconosciuti non si rifanno
create or replace function public.academic_enroll_core(p_term uuid, p_character uuid, p_course uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.academic_terms;
  r public.student_records;
  co public.courses;
  v_credits int;
  v_effort text;
  v_max int;
  v_last numeric;
  v_last_letter text;
  p record;
begin
  select * into t from public.academic_terms where id = p_term;
  if t.status is distinct from 'registration_open' and not public.academic_late_open(p_character, p_term) then raise exception 'Le iscrizioni di questo semestre sono chiuse.' using errcode = 'P0001'; end if;
  r := public.uni_record(p_character);
  if r.academic_status = 'suspended' then raise exception 'Sei in sospensione accademica: salti questo semestre.' using errcode = 'P0001'; end if;
  if r.academic_status = 'dismissed' then raise exception 'Sei stato espulso dall''università.' using errcode = 'P0001'; end if;
  if r.academic_status = 'graduated' then raise exception 'Sei già laureato.' using errcode = 'P0001'; end if;
  select * into co from public.courses where id = p_course and active;
  if co.id is null then raise exception 'Corso non disponibile.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.enrollments where character_id = p_character and term_id = p_term and course_id = p_course) then
    raise exception 'Sei già iscritto a questo corso.' using errcode = 'P0001';
  end if;

  -- già superato? si ripete solo sotto il minimo (C−)
  select e.grade_points, e.letter_grade into v_last, v_last_letter
  from public.enrollments e join public.academic_terms tt on tt.id = e.term_id
  where e.character_id = p_character and e.course_id = p_course and e.status = 'completed' and tt.status = 'published'
  order by tt.created_at desc, e.id desc limit 1;
  if v_last is not null and v_last >= public.uni_n('uni_voto_minimo_requisiti') then
    raise exception 'Hai già superato % con %.', co.code, replace(v_last_letter, '-', '−') using errcode = 'P0001';
  end if;

  if exists (select 1 from public.academic_transfer_courses where character_id = p_character and course_id = p_course) then
    raise exception '% ti è già riconosciuto dagli anni precedenti.', co.code using errcode = 'P0001';
  end if;

  -- livello: 300 da Junior, 400 da Senior
  if coalesce(public.uni_n('uni_blocco_livelli'), 1) = 1 then
    if co.level = 300 and r.class_standing not in ('junior', 'senior') then
      raise exception 'I corsi 300 sono per Junior e Senior.' using errcode = 'P0001';
    end if;
    if co.level = 400 and r.class_standing <> 'senior' then
      raise exception 'I corsi 400 sono per i Senior.' using errcode = 'P0001';
    end if;
  end if;

  -- prerequisiti
  for p in select cp.min_grade, c2.code, c2.id from public.course_prerequisites cp join public.courses c2 on c2.id = cp.prerequisite_id where cp.course_id = p_course loop
    if coalesce(public.uni_last_points(p_character, p.id), -1) < public.uni_points(p.min_grade) then
      raise exception 'Per % serve prima % con almeno %.', co.code, p.code, replace(p.min_grade, '-', '−') using errcode = 'P0001';
    end if;
  end loop;

  -- crediti del semestre
  select coalesce(sum(c.credits), 0), max(e.effort) into v_credits, v_effort
  from public.enrollments e join public.courses c on c.id = e.course_id
  where e.character_id = p_character and e.term_id = p_term and e.status <> 'withdrawn';
  v_effort := coalesce(v_effort, 'normal');
  v_max := case when v_effort = 'intense' then public.uni_n('uni_crediti_max_intenso') else public.uni_n('uni_crediti_max') end::int;
  -- Instancabile (fino a 21) o Studente lavoratore (al massimo 15)
  if public.trait_effect(p_character, 'credit_limit') is not null then
    v_max := case when v_effort = 'intense' then least(v_max, (public.trait_effect(p_character, 'credit_limit') ->> 'max')::int)
                  else (public.trait_effect(p_character, 'credit_limit') ->> 'max')::int end;
  end if;
  if v_credits + co.credits > v_max then
    raise exception 'Superi il massimo di % crediti per il semestre.', v_max using errcode = 'P0001';
  end if;

  insert into public.enrollments (character_id, term_id, course_id, effort, is_retake, retake_after_f)
  values (p_character, p_term, p_course, v_effort, v_last is not null, coalesce(v_last_letter = 'F', false));
  update public.student_records set enrolled_since_term_id = coalesce(enrolled_since_term_id, p_term), updated_at = now()
  where character_id = p_character;
end;
$$;

-- iscrizione automatica: anche a semestre in corso per chi arriva
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
  if (select status from public.academic_terms where id = p_term) is distinct from 'registration_open'
     and not public.academic_late_open(p_character, p_term) then return 0; end if;
  -- i Graduate (magistrale) non seguono i corsi undergraduate: niente iscrizione
  if exists (select 1 from public.characters ch join public.sheet_options o on o.id = ch.year_id where ch.id = p_character and o.sort_order = 5)
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

create or replace function public.academic_auto_enroll_me(p_character uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_term uuid := (select id from public.academic_terms where status in ('registration_open', 'in_progress') limit 1);
begin
  if not public.owns_character(p_character) then raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501'; end if;
  if v_term is null or ((select status from public.academic_terms where id = v_term) = 'in_progress'
                        and not public.academic_late_open(p_character, v_term)) then
    raise exception 'Le iscrizioni non sono aperte.' using errcode = 'P0001';
  end if;
  if (select study_track_id from public.characters where id = p_character) is null then
    raise exception 'Prima scegli il Major nella scheda.' using errcode = 'P0001';
  end if;
  return public.academic_auto_enroll(p_character, v_term);
end;
$$;

-- approvazione o cambio di Major: iscrizione automatica anche a semestre in corso (la decide academic_auto_enroll)
create or replace function public.characters_auto_enroll()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_term uuid := (select id from public.academic_terms where status in ('registration_open', 'in_progress') limit 1);
begin
  if v_term is not null and new.status = 'approvata' and new.study_track_id is not null
     and (old.status is distinct from 'approvata' or old.study_track_id is distinct from new.study_track_id)
     and not exists (select 1 from public.enrollments where character_id = new.id and term_id = v_term) then
    perform public.academic_auto_enroll(new.id, v_term);
  end if;
  return null;
end;
$$;

-- chi arriva a semestre in corso può ancora cambiare i corsi
create or replace function public.academic_drop(p_term uuid, p_character uuid, p_course uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.owns_character(p_character) then raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501'; end if;
  if (select status from public.academic_terms where id = p_term) is distinct from 'registration_open'
     and not public.academic_late_open(p_character, p_term) then
    raise exception 'Le iscrizioni sono chiuse: ora si può solo ritirare il corso (W).' using errcode = 'P0001';
  end if;
  delete from public.enrollments where character_id = p_character and term_id = p_term and course_id = p_course;
end;
$$;

-- ... e scegliere l'impegno
create or replace function public.academic_set_effort(p_term uuid, p_character uuid, p_effort text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_credits int;
begin
  if not public.owns_character(p_character) then raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501'; end if;
  if p_effort not in ('minimal', 'normal', 'intense') then raise exception 'Impegno non valido.' using errcode = 'P0001'; end if;
  if p_effort = 'intense' and public.trait_flag(p_character, 'no_intense_effort') then
    raise exception 'Con Vita sociale intensa non puoi scegliere l''impegno intenso.' using errcode = 'P0001';
  end if;
  if p_effort = 'intense' and public.character_full_time_job(p_character) then
    raise exception 'Con un lavoro full time non puoi scegliere l''impegno intenso: passa al part time o lascia il lavoro.' using errcode = 'P0001';
  end if;
  if (select status from public.academic_terms where id = p_term) is distinct from 'registration_open'
     and not public.academic_late_open(p_character, p_term) then
    raise exception 'L''impegno si sceglie durante le iscrizioni.' using errcode = 'P0001';
  end if;
  select coalesce(sum(c.credits), 0) into v_credits from public.enrollments e join public.courses c on c.id = e.course_id
  where e.character_id = p_character and e.term_id = p_term;
  if p_effort = 'intense' and v_credits > public.uni_n('uni_crediti_max_intenso') then
    raise exception 'Con l''impegno intenso puoi seguire al massimo % crediti.', public.uni_n('uni_crediti_max_intenso')::int using errcode = 'P0001';
  end if;
  if v_credits = 0 then raise exception 'Prima iscriviti ad almeno un corso.' using errcode = 'P0001'; end if;
  update public.enrollments set effort = p_effort where character_id = p_character and term_id = p_term;
end;
$$;

-- compiti: chi è arrivato a semestre in corso recupera quelli delle settimane passate
create or replace function public.academic_homework(p_enrollment bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e record;
  v_count int;
  v_last timestamptz;
  v_points_so_far int;
  v_attr int; v_skill int; v_mods int; v_cd int;
  v_d int; v_extra int; v_crit text; v_dval int; v_total int; v_margin int; v_points int;
  v_days int := coalesce(public.uni_n('uni_compiti_giorni'), 7)::int;
  eff numeric[] := public.uni_list('uni_impegno');
  m jsonb;
  v_credits int;
  v_smin int; v_fmax int;
  v_majorb int; v_job int;
begin
  select en.*, co.level, co.cd_modifier, co.attribute_id, co.skill_id, co.code, co.department, co.area, t.status as term_status
    into e
  from public.enrollments en
  join public.courses co on co.id = en.course_id
  join public.academic_terms t on t.id = en.term_id
  where en.id = p_enrollment
  for update of en;
  if e.id is null or not public.owns_character(e.character_id) then
    raise exception 'Iscrizione non trovata.' using errcode = '42501';
  end if;
  if e.term_status <> 'in_progress' then raise exception 'I compiti si fanno durante il semestre in corso.' using errcode = 'P0001'; end if;
  if e.status <> 'enrolled' then raise exception 'Non segui più questo corso.' using errcode = 'P0001'; end if;

  select count(*), max(created_at), coalesce(sum(points), 0) into v_count, v_last, v_points_so_far
  from public.homework where enrollment_id = p_enrollment;
  if v_count >= coalesce(public.uni_n('uni_compiti_max'), 3) then
    raise exception 'Hai già fatto tutti i compiti di %.', e.code using errcode = 'P0001';
  end if;
  if v_last is not null and v_last > now() - make_interval(days => v_days)
     and not (public.academic_late_term(e.character_id, e.term_id) and v_count < public.uni_homework_due(e.term_id)) then
    raise exception 'Il prossimo compito di % si può fare dal %.', e.code, to_char(v_last + make_interval(days => v_days), 'DD/MM') using errcode = 'P0001';
  end if;

  v_attr := coalesce((select value from public.character_attributes where character_id = e.character_id and attribute_id = e.attribute_id), 0);
  v_skill := coalesce((select level from public.character_skills where character_id = e.character_id and skill_id = e.skill_id), 0);
  select coalesce(sum(c.credits), 0) into v_credits
  from public.enrollments x join public.courses c on c.id = x.course_id
  where x.character_id = e.character_id and x.term_id = e.term_id and x.status = 'enrolled';
  -- il compito vale come il coursework anche per le voci
  m := public.trait_mods(e.character_id, jsonb_build_object('system', 'academic', 'skill_id', e.skill_id, 'exam_type', 'coursework',
    'department', e.department, 'area', e.area, 'retake', e.is_retake, 'credits', v_credits));
  v_smin := (m ->> 'success_min')::int;
  v_fmax := (m ->> 'failure_max')::int;
  -- lavoro full time e corsi del Major, come negli esami
  v_job := case when public.character_full_time_job(e.character_id) then -coalesce(public.uni_n('uni_lavoro_full_malus'), 1)::int else 0 end;
  v_majorb := case when public.uni_major_course(e.character_id, e.department) then coalesce(public.uni_n('uni_bonus_major'), 1)::int else 0 end;
  v_mods := (m ->> 'total')::int
    + coalesce(eff[case when e.effort = 'minimal' then 1 when e.effort = 'intense' and v_job = 0 then 3 else 2 end], 0)::int
    + v_majorb + v_job + e.tutor_bonus;
  v_cd := coalesce((public.uni_list('uni_cd_livelli'))[e.level / 100], 14)::int + e.cd_modifier + coalesce((public.uni_list('uni_cd_prove'))[1], -2)::int + (m ->> 'cd')::int;

  v_d := public.academic_die();
  v_extra := null;
  v_crit := 'none';
  v_dval := v_d;
  if v_d >= v_smin then
    v_extra := public.academic_die(); v_crit := 'success'; v_dval := v_d + v_extra;
  elsif v_d <= v_fmax then
    v_extra := public.academic_die(); v_crit := 'failure'; v_dval := v_d - v_extra;
  end if;
  v_total := v_attr + v_skill + v_dval + v_mods;
  v_margin := v_total - v_cd;
  v_points := case when v_margin < 0 then 0
                   when v_crit = 'success' then coalesce(public.uni_n('uni_compiti_punti_critico'), 2)::int
                   else 1 end;
  -- mai oltre il massimo di punti per corso
  v_points := greatest(0, least(v_points, coalesce(public.uni_n('uni_compiti_punti_max'), 3)::int - v_points_so_far));

  insert into public.homework (enrollment_id, characteristic_value, skill_value, d10, crit_type, extra_d10, modifiers, total, cd, margin, points)
  values (p_enrollment, v_attr, v_skill, v_d, v_crit, v_extra, v_mods, v_total, v_cd, v_margin, v_points);
  return jsonb_build_object('total', v_total, 'cd', v_cd, 'margin', v_margin, 'crit', v_crit, 'points', v_points);
end;
$$;

-- esami: GPA con la media di partenza, corsi riconosciuti validi per la laurea
create or replace function public.academic_simulate(p_term uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.academic_terms;
  cd_lv numeric[] := public.uni_list('uni_cd_livelli');
  cd_off numeric[] := public.uni_list('uni_cd_prove');
  w numeric[] := public.uni_list('uni_pesi_prove');
  eff numeric[] := public.uni_list('uni_impegno');
  v_base numeric := public.uni_n('uni_punteggio_base');
  v_per numeric := public.uni_n('uni_punti_per_margine');
  v_gpa_min numeric := public.uni_n('uni_gpa_minimo');
  v_req numeric := public.uni_n('uni_voto_minimo_requisiti');
  types text[] := array['coursework', 'midterm', 'final'];
  e record;
  s record;
  r public.student_records;
  v_attr int; v_skill int; v_traits int; v_effort int; v_load int; v_retake int; v_mods int;
  v_term_credits int; v_cdbase int; v_cd int;
  v_d int; v_extra int; v_crit text; v_dval int; v_total int; v_margin int; v_score int;
  v_sum numeric; v_wsum numeric;
  g record;
  v_attempted int; v_earned int; v_term_gpa numeric; v_cum numeric; v_total_credits int; v_gpa_credits int;
  v_before text; v_after text; v_pc int; v_after_susp boolean; v_deans boolean; v_grad boolean; v_honors text;
  v_class text; v_text text; v_major uuid;
  v_majorb int; v_job int;
  v_courses int := 0; v_students int := 0;
  m jsonb;
  v_smin int; v_fmax int;
  v_cool uuid; v_first int;
  v_bump uuid; v_gap int; v_fs int; v_next int;
  v_th numeric[] := public.uni_list('uni_soglie_voti');
begin
  perform public.uni_require_staff();
  select * into t from public.academic_terms where id = p_term for update;
  if t.id is null then raise exception 'Semestre non trovato.' using errcode = 'P0001'; end if;
  -- idempotente: un secondo lancio non ritira i dadi
  if t.status in ('simulated', 'published') then
    return jsonb_build_object('gia_simulato', true);
  end if;
  if t.status <> 'in_progress' then
    raise exception 'Prima chiudi le iscrizioni (semestre in corso).' using errcode = 'P0001';
  end if;
  v_wsum := coalesce(w[1], 20) + coalesce(w[2], 30) + coalesce(w[3], 50);

  -- 1. esami: tre tiri per ogni iscrizione attiva
  for e in
    select en.*, co.level, co.cd_modifier, co.attribute_id, co.skill_id, co.credits, co.department, co.area
    from public.enrollments en join public.courses co on co.id = en.course_id
    where en.term_id = p_term and en.status = 'enrolled'
    order by en.character_id, en.id
  loop
    v_attr := coalesce((select value from public.character_attributes where character_id = e.character_id and attribute_id = e.attribute_id), 0);
    v_skill := coalesce((select level from public.character_skills where character_id = e.character_id and skill_id = e.skill_id), 0);
    -- lavoro full time: malus, e l'impegno intenso vale come normale
    v_job := case when public.character_full_time_job(e.character_id) then -coalesce(public.uni_n('uni_lavoro_full_malus'), 1)::int else 0 end;
    v_effort := coalesce(eff[case when e.effort = 'minimal' then 1 when e.effort = 'intense' and v_job = 0 then 3 else 2 end], 0)::int;
    -- corsi dei dipartimenti del proprio Major
    v_majorb := case when public.uni_major_course(e.character_id, e.department) then coalesce(public.uni_n('uni_bonus_major'), 1)::int else 0 end;
    select coalesce(sum(c.credits), 0) into v_term_credits
    from public.enrollments x join public.courses c on c.id = x.course_id
    where x.character_id = e.character_id and x.term_id = p_term and x.status = 'enrolled';
    v_load := case when v_term_credits > public.uni_n('uni_carico_pesante_oltre') then -public.uni_n('uni_carico_pesante_malus')::int else 0 end;
    -- Instancabile: niente malus del carico pesante
    if public.trait_effect(e.character_id, 'no_heavy_load') is not null then v_load := 0; end if;
    v_retake := case when e.retake_after_f then public.uni_n('uni_bonus_ripetizione')::int else 0 end;
    v_mods := v_effort + v_load + v_retake + e.master_modifier + v_majorb + v_job + e.tutor_bonus;
    v_cdbase := coalesce(cd_lv[e.level / 100], 14)::int + e.cd_modifier;
    v_sum := 0;
    for i in 1..3 loop
      -- voci accademiche (e quelle di tutti i tiri) per questa prova
      m := public.trait_mods(e.character_id, jsonb_build_object('system', 'academic', 'skill_id', e.skill_id, 'exam_type', types[i],
        'department', e.department, 'area', e.area, 'retake', e.is_retake, 'credits', v_term_credits));
      v_traits := (m ->> 'total')::int;
      v_smin := (m ->> 'success_min')::int;
      v_fmax := (m ->> 'failure_max')::int;
      v_d := public.academic_die();
      v_extra := null;
      v_crit := 'none';
      v_dval := v_d;
      if v_d >= v_smin then
        v_extra := public.academic_die();
        v_crit := 'success';
        v_dval := v_d + v_extra;
      elsif v_d <= v_fmax then
        v_extra := public.academic_die();
        v_crit := 'failure';
        v_dval := v_d - v_extra;
      end if;
      v_total := v_attr + v_skill + v_dval + v_mods + v_traits;
      v_cd := v_cdbase + coalesce(cd_off[i], 0)::int + (m ->> 'cd')::int;
      v_margin := v_total - v_cd;
      -- Sangue freddo: una volta per semestre, alla prima prova andata male si ritira il d10 e si tiene il secondo
      v_first := null;
      if v_margin < 0 then
        select o.id into v_cool from public.character_options co join public.creation_options o on o.id = co.option_id
        where co.character_id = e.character_id
          and exists (select 1 from jsonb_array_elements(o.effects) x where x ->> 'type' = 'reroll' and x ->> 'system' = 'academic')
        limit 1;
        if v_cool is not null and public.trait_uses_left(e.character_id, v_cool, 'semester') > 0 then
          v_first := v_d;
          v_d := public.academic_die();
          v_extra := null;
          v_crit := 'none';
          v_dval := v_d;
          if v_d >= v_smin then
            v_extra := public.academic_die();
            v_crit := 'success';
            v_dval := v_d + v_extra;
          elsif v_d <= v_fmax then
            v_extra := public.academic_die();
            v_crit := 'failure';
            v_dval := v_d - v_extra;
          end if;
          v_total := v_attr + v_skill + v_dval + v_mods + v_traits;
          v_margin := v_total - v_cd;
          insert into public.trait_uses (character_id, option_id, context)
          values (e.character_id, v_cool, jsonb_build_object('term', p_term, 'enrollment', e.id, 'exam', types[i]));
        end if;
        v_cool := null;
      end if;
      v_score := greatest(0, least(100, v_base + v_margin * v_per))::int;
      insert into public.exam_rolls (enrollment_id, exam_type, characteristic_value, skill_value, d10, crit_type, extra_d10, modifiers, total, cd, margin, score)
      values (e.id, types[i], v_attr, v_skill, v_d, v_crit, v_extra,
              jsonb_build_object('tratti', v_traits, 'impegno', v_effort, 'carico', v_load, 'ripetizione', v_retake,
                                 'major', v_majorb, 'lavoro', v_job, 'tutor', e.tutor_bonus, 'master', e.master_modifier, 'nota_master', nullif(e.master_note, ''), 'totale', v_mods + v_traits,
                                 'voci', m -> 'items', 'cd_voci', (m ->> 'cd')::int, 'sangue_freddo', v_first),
              v_total, v_cd, v_margin, v_score);
      v_sum := v_sum + v_score * coalesce(w[i], 0);
    end loop;
    select * into g from public.uni_grade(round(v_sum / v_wsum)::int);
    update public.enrollments
    set status = 'completed', final_score = round(v_sum / v_wsum)::int, letter_grade = g.letter, grade_points = g.points
    where id = e.id;
    -- Pupillo dei professori: una volta per semestre, a un passo dal voto superiore
    select o.id, coalesce((x ->> 'max_gap')::int, 1) into v_bump, v_gap
    from public.character_options co join public.creation_options o on o.id = co.option_id
    cross join lateral jsonb_array_elements(o.effects) x
    where co.character_id = e.character_id and x ->> 'type' = 'grade_bump'
    limit 1;
    if v_bump is not null and public.trait_uses_left(e.character_id, v_bump, 'semester') > 0 then
      select final_score into v_fs from public.enrollments where id = e.id;
      select min(x)::int into v_next from unnest(v_th) x where x > v_fs;
      if v_next is not null and v_next - v_fs <= v_gap then
        select * into g from public.uni_grade(v_next);
        update public.enrollments set final_score = v_next, letter_grade = g.letter, grade_points = g.points where id = e.id;
        insert into public.trait_uses (character_id, option_id, context)
        values (e.character_id, v_bump, jsonb_build_object('term', p_term, 'enrollment', e.id, 'from', v_fs, 'to', v_next));
      end if;
    end if;
    v_bump := null;
    v_courses := v_courses + 1;
  end loop;

  -- 2. grade replacement: nel cumulativo conta solo l'ultimo tentativo di ogni corso
  update public.enrollments en
  set counts_in_gpa = (en.id = (
    select e2.id from public.enrollments e2 join public.academic_terms t2 on t2.id = e2.term_id
    where e2.character_id = en.character_id and e2.course_id = en.course_id and e2.status = 'completed'
      and (t2.status = 'published' or t2.id = p_term)
    order by t2.created_at desc, e2.id desc limit 1))
  where en.status = 'completed'
    and en.character_id in (select character_id from public.enrollments where term_id = p_term);

  -- 3. pagella di ogni studente del semestre
  for s in select distinct character_id from public.enrollments where term_id = p_term loop
    r := public.uni_record(s.character_id);
    select coalesce(sum(c.credits), 0), coalesce(sum(c.credits) filter (where en.grade_points > 0), 0),
           round(sum(en.grade_points * c.credits) / nullif(sum(c.credits), 0), 2)
      into v_attempted, v_earned, v_term_gpa
    from public.enrollments en join public.courses c on c.id = en.course_id
    where en.character_id = s.character_id and en.term_id = p_term and en.status = 'completed';
    select round(sum(en.grade_points * c.credits) / nullif(sum(c.credits), 0), 2),
           coalesce(sum(c.credits) filter (where en.grade_points > 0), 0), coalesce(sum(c.credits), 0)
      into v_cum, v_total_credits, v_gpa_credits
    from public.enrollments en join public.courses c on c.id = en.course_id join public.academic_terms tt on tt.id = en.term_id
    where en.character_id = s.character_id and en.status = 'completed' and en.counts_in_gpa
      and (tt.status = 'published' or tt.id = p_term);
    v_total_credits := r.start_credits + v_total_credits;
    -- media di partenza pesata sui suoi crediti
    v_cum := public.uni_blend_gpa(s.character_id, v_cum, v_gpa_credits);

    v_before := r.academic_status;
    v_after := v_before;
    v_pc := r.probation_count;
    v_after_susp := r.after_suspension;
    if v_attempted > 0 then
      if v_before = 'good_standing' then
        if v_cum < v_gpa_min then v_after := 'probation'; v_pc := v_pc + 1; end if;
      elsif v_before = 'probation' then
        if v_cum >= v_gpa_min then
          v_after := 'good_standing';
          v_after_susp := false;
        elsif v_term_gpa >= v_gpa_min then
          v_after := 'probation';
        elsif r.after_suspension then
          v_after := 'dismissed';
        else
          v_after := 'suspended';
        end if;
      end if;
    end if;

    v_class := public.uni_class(v_total_credits);
    v_deans := v_term_gpa >= public.uni_n('uni_deans_gpa') and v_attempted >= public.uni_n('uni_deans_crediti');
    -- laurea: crediti, GPA e corsi obbligatori del Major con almeno C−
    select study_track_id into v_major from public.characters where id = s.character_id;
    v_grad := v_after in ('good_standing', 'probation')
      and v_total_credits >= public.uni_n('uni_crediti_laurea')
      and coalesce(v_cum, 0) >= v_gpa_min
      and not exists (
        select 1 from public.major_required_courses m
        where m.major_id = v_major
          and not exists (select 1 from public.academic_transfer_courses tc
                          where tc.character_id = s.character_id and tc.course_id = m.course_id)
          and coalesce((
            select e3.grade_points from public.enrollments e3 join public.academic_terms t3 on t3.id = e3.term_id
            where e3.character_id = s.character_id and e3.course_id = m.course_id and e3.status = 'completed'
              and (t3.status = 'published' or t3.id = p_term)
            order by t3.created_at desc, e3.id desc limit 1), -1) < v_req);
    v_honors := null;
    if v_grad then
      v_after := 'graduated';
      v_honors := case when v_cum >= public.uni_n('uni_lode_summa') then 'summa cum laude'
                       when v_cum >= public.uni_n('uni_lode_magna') then 'magna cum laude'
                       when v_cum >= public.uni_n('uni_lode_cum') then 'cum laude' end;
    end if;

    v_text := case when v_attempted = 0 then 'Tutti i corsi ritirati.'
      else 'GPA del semestre ' || to_char(v_term_gpa, 'FM0.00') || ' · Cumulativo ' || to_char(v_cum, 'FM0.00') end
      || ' · ' || v_total_credits || ' crediti · ' || initcap(v_class)
      || case when v_deans then ' · Dean''s List' else '' end
      || case when public.trait_flag(s.character_id, 'scholarship') and not public.academic_late_term(s.character_id, p_term)
                and not public.merit_scholarship_lost(s.character_id)
                and (v_after in ('probation', 'suspended', 'dismissed') or (v_cum is not null and v_cum < coalesce(public.uni_n('uni_borsa_gpa_min'), 2.5)))
              then ' · Borsa di studio accademica persa' else '' end
      || case v_after when 'probation' then ' · Academic Probation' when 'suspended' then ' · Academic Suspension (salta un semestre)'
           when 'dismissed' then ' · Academic Dismissal' when 'graduated' then ' · Laurea' || coalesce(' ' || v_honors, '')
             || coalesce(case when (public.uni_minor_status(s.character_id, p_term) ->> 'complete')::boolean
                              then ' · Minor in ' || (public.uni_minor_status(s.character_id, p_term) ->> 'minor') end, '') else '' end;

    insert into public.term_reports (character_id, term_id, credits_attempted, credits_earned, term_gpa, cumulative_gpa_after,
      credits_total_after, standing_before, standing_after, class_standing_after, probation_count_after, after_suspension_after,
      deans_list, graduated, honors, report_text)
    values (s.character_id, p_term, v_attempted, v_earned, v_term_gpa, v_cum, v_total_credits, v_before, v_after, v_class,
      v_pc, v_after_susp, coalesce(v_deans, false), v_grad, v_honors, v_text);
    v_students := v_students + 1;
  end loop;

  -- 4. chi era sospeso salta questo semestre e rientra in probation
  for r in select * from public.student_records sr
           where sr.academic_status = 'suspended' and sr.suspended_term_id is distinct from p_term
             and not exists (select 1 from public.term_reports tr where tr.character_id = sr.character_id and tr.term_id = p_term)
  loop
    insert into public.term_reports (character_id, term_id, cumulative_gpa_after, credits_total_after, standing_before, standing_after,
      class_standing_after, probation_count_after, after_suspension_after, report_text)
    values (r.character_id, p_term, r.cumulative_gpa, r.credits_earned, 'suspended', 'probation', r.class_standing,
      r.probation_count, true, 'Rientro dopo la sospensione: Academic Probation. Se il prossimo semestre va male, espulsione.');
  end loop;

  update public.academic_terms set status = 'simulated', simulated_at = now() where id = p_term;
  return jsonb_build_object('corsi', v_courses, 'studenti', v_students);
end;
$$;

-- pagina Università: corsi riconosciuti, media di partenza, arrivo a semestre in corso
create or replace function public.academic_extras(p_character uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.characters where id = p_character and owner_id = auth.uid()) and not public.uni_staff() then
    raise exception 'Non hai i permessi necessari.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'minor', public.uni_minor_status(p_character, null),
    'premed', public.uni_premed_status(p_character, null),
    'major_departments', coalesce((
      select jsonb_agg(distinct c.department) from public.characters ch
      join public.major_required_courses m on m.major_id = ch.study_track_id join public.courses c on c.id = m.course_id
      where ch.id = p_character and btrim(c.department) <> ''), '[]'::jsonb),
    'major_bonus', coalesce(public.uni_n('uni_bonus_major'), 1)::int,
    'full_time_job', public.character_full_time_job(p_character),
    -- corsi riconosciuti e media di partenza
    'recognized', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'code', c.code, 'name', c.name, 'credits', c.credits, 'level', c.level) order by c.level, c.code)
      from public.academic_transfer_courses tc join public.courses c on c.id = tc.course_id
      where tc.character_id = p_character), '[]'::jsonb),
    'start_gpa', (select start_gpa from public.student_records where character_id = p_character),
    'start_gpa_credits', coalesce((select start_gpa_credits from public.student_records where character_id = p_character), 0),
    'start_rolls', coalesce((select start_rolls from public.student_records where character_id = p_character), '[]'::jsonb),
    -- arrivato a semestre in corso
    'late_open', coalesce(public.academic_late_open(p_character, (select id from public.academic_terms where status = 'in_progress' limit 1)), false),
    'homework_due', (select case when public.academic_late_term(p_character, t.id) then public.uni_homework_due(t.id) end
                     from public.academic_terms t where t.status = 'in_progress' limit 1),
    'job_malus', coalesce(public.uni_n('uni_lavoro_full_malus'), 1)::int,
    'tutor_price', coalesce(public.setting_int('servizio_tutor'), 400),
    'tutor_max', coalesce(public.setting_int('servizio_tutor_max'), 2),
    'tutored', coalesce((
      select jsonb_agg(e.id) from public.enrollments e join public.academic_terms t on t.id = e.term_id
      where e.character_id = p_character and e.tutor_bonus > 0 and t.status <> 'published'), '[]'::jsonb));
end;
$$;

-- =====================================================================
-- PERSONAGGI GIÀ ISCRITTI: corsi riconosciuti e media di partenza
-- L'anno di partenza si ricava dai crediti di partenza (tolti quelli di
-- Advanced Placement). Chi era iscritto, nel semestre con le iscrizioni
-- aperte, a un corso ora riconosciuto ne viene tolto e reiscritto in
-- automatico; a semestre già in corso il corso resta.
-- =====================================================================
do $$
declare
  r record;
  v_list numeric[] := public.uni_list('uni_crediti_partenza');
  v_base int;
  v_year int;
  v_term uuid := (select id from public.academic_terms where status = 'registration_open' limit 1);
  v_cum numeric;
  v_cr int;
  v_n int;
  v_gpa numeric;
begin
  for r in
    select sr.* from public.student_records sr join public.characters ch on ch.id = sr.character_id
    where sr.academic_status <> 'graduated' and sr.start_gpa is null
      and not exists (select 1 from public.academic_transfer_courses tc where tc.character_id = sr.character_id)
  loop
    v_base := r.start_credits - coalesce((public.trait_effect(r.character_id, 'start_credits') ->> 'value')::int, 0);
    v_year := 1;
    for i in 1 .. 4 loop
      if coalesce(v_list[i], 999) <= v_base then v_year := i; end if;
    end loop;
    if v_year <= 1 then continue; end if;
    perform public.uni_start_career(r.character_id, v_year, coalesce(v_list[v_year], 0)::int);

    -- GPA cumulativo con la media di partenza
    select round(sum(en.grade_points * c.credits) / nullif(sum(c.credits), 0), 2), coalesce(sum(c.credits), 0)
      into v_cum, v_cr
    from public.enrollments en join public.courses c on c.id = en.course_id join public.academic_terms t on t.id = en.term_id
    where en.character_id = r.character_id and en.status = 'completed' and en.counts_in_gpa and t.status = 'published';
    update public.student_records set cumulative_gpa = public.uni_blend_gpa(r.character_id, v_cum, v_cr), updated_at = now()
    where character_id = r.character_id;

    -- iscrizioni aperte: via i corsi riconosciuti, poi si completa il carico
    if v_term is not null then
      delete from public.enrollments e
      using public.academic_transfer_courses tc
      where e.character_id = r.character_id and e.term_id = v_term
        and tc.character_id = e.character_id and tc.course_id = e.course_id;
      perform public.academic_auto_enroll(r.character_id, v_term);
    end if;

    select count(*) into v_n from public.academic_transfer_courses where character_id = r.character_id;
    select start_gpa into v_gpa from public.student_records where character_id = r.character_id;
    insert into public.system_messages (user_id, body)
    select ch.owner_id,
      '🎓 Università: dagli anni già frequentati ti ' || case when v_n = 1 then 'è stato riconosciuto 1 corso' else 'sono stati riconosciuti ' || v_n || ' corsi' end
      || ' del Major' || coalesce(' e la tua media di partenza è ' || to_char(v_gpa, 'FM0.00'), '')
      || '. Li trovi nella pagina Università.'
    from public.characters ch where ch.id = r.character_id and ch.owner_id is not null;
  end loop;
end;
$$;

select ch.name as personaggio, sr.start_credits as crediti_partenza, sr.start_gpa as media_partenza, sr.cumulative_gpa as gpa,
  (select count(*) from public.academic_transfer_courses tc where tc.character_id = sr.character_id) as corsi_riconosciuti
from public.student_records sr join public.characters ch on ch.id = sr.character_id
order by ch.name;

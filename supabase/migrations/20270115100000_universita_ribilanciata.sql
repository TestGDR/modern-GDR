-- =====================================================================
-- UNIVERSITÀ RIBILANCIATA
-- 1. CD per livello 13/14/15/16 (era 14/15/16/17).
-- 2. +uni_bonus_major (1) agli esami e ai compiti nei corsi dei dipartimenti
--    del proprio Major (i dipartimenti dei suoi corsi obbligatori).
-- 3. Borsa di studio accademica persa solo con il GPA cumulativo sotto
--    uni_borsa_gpa_min o con la probation (non più per un solo semestre).
-- 4. Impegno intenso vietato con un lavoro full time; chi lavora full time
--    ha −uni_lavoro_full_malus (1) agli esami e ai compiti.
-- 5. Minor: completato con uni_minor_corsi (4) corsi dell'elenco del suo
--    indirizzo superati con almeno C−; scritto nella pagella della laurea.
-- 6. La pagella scrive di nuovo «Borsa di studio accademica persa».
-- =====================================================================

-- ---------------------------------------------------------------------
-- IMPOSTAZIONI
-- ---------------------------------------------------------------------
update public.game_settings set value = '[13, 14, 15, 16]' where key = 'uni_cd_livelli' and value = '[14, 15, 16, 17]'::jsonb;
-- è un decimale (2.5): era registrata come numero intero
update public.game_settings set kind = 'decimal',
  description = 'Una borsa si perde per sempre quando il GPA cumulativo scende sotto questo valore (o con la probation).'
where key = 'uni_borsa_gpa_min';

insert into public.game_settings (key, value, kind, label, description, sort_order) values
  ('uni_bonus_major', '1', 'number', 'Università · Bonus nei corsi del Major',
   'Si somma a esami e compiti dei corsi dei dipartimenti del proprio Major.', 240),
  ('uni_lavoro_full_malus', '1', 'number', 'Università · Malus di chi lavora full time',
   'Si toglie a esami e compiti di chi ha un lavoro full time (che non può scegliere l''impegno intenso).', 241),
  ('uni_minor_corsi', '4', 'number', 'Università · Corsi per completare il Minor',
   'Corsi dell''elenco del Minor (i corsi obbligatori di quell''indirizzo) da superare con almeno C−.', 242)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- AIUTI
-- ---------------------------------------------------------------------
-- il corso è di un dipartimento del Major del personaggio?
create or replace function public.uni_major_course(p_character uuid, p_department text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(btrim(p_department), '') <> '' and exists (
    select 1 from public.characters ch
    join public.major_required_courses m on m.major_id = ch.study_track_id
    join public.courses c on c.id = m.course_id
    where ch.id = p_character and lower(c.department) = lower(btrim(p_department)))
$$;
revoke execute on function public.uni_major_course(uuid, text) from public, anon, authenticated;

-- lavora full time?
create or replace function public.character_full_time_job(p_character uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.character_jobs where character_id = p_character and mode = 'full_time')
$$;
revoke execute on function public.character_full_time_job(uuid) from public, anon, authenticated;

-- Minor: corsi dell'elenco del suo indirizzo e quanti sono superati (p_term = anche quel semestre non ancora pubblicato)
create or replace function public.uni_minor_status(p_character uuid, p_term uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with ch as (
    select c.minor_id, o.name as minor from public.characters c left join public.sheet_options o on o.id = c.minor_id where c.id = p_character
  ),
  req as (
    select co.id, co.code, co.name, co.credits,
      (select e.grade_points from public.enrollments e join public.academic_terms t on t.id = e.term_id
       where e.character_id = p_character and e.course_id = co.id and e.status = 'completed'
         and (t.status = 'published' or t.id = p_term)
       order by t.created_at desc, e.id desc limit 1) as grade_points
    from ch join public.major_required_courses m on m.major_id = ch.minor_id join public.courses co on co.id = m.course_id
  ),
  agg as (
    select count(*)::int as total,
      count(*) filter (where grade_points >= coalesce(public.uni_n('uni_voto_minimo_requisiti'), 1.7))::int as done
    from req
  )
  select case when (select minor_id from ch) is null then null else jsonb_build_object(
    'minor_id', (select minor_id from ch), 'minor', (select minor from ch),
    'needed', least(coalesce(public.uni_n('uni_minor_corsi'), 4)::int, (select total from agg)),
    'done', (select done from agg),
    'complete', (select total from agg) > 0 and (select done from agg) >= least(coalesce(public.uni_n('uni_minor_corsi'), 4)::int, (select total from agg)),
    'courses', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'code', code, 'name', name, 'credits', credits, 'grade_points', grade_points,
      'passed', grade_points >= coalesce(public.uni_n('uni_voto_minimo_requisiti'), 1.7)) order by code) from req), '[]'::jsonb)) end
$$;
revoke execute on function public.uni_minor_status(uuid, uuid) from public, anon, authenticated;

-- per la pagina Università: Minor, dipartimenti del Major, lavoro full time
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
    'major_departments', coalesce((
      select jsonb_agg(distinct c.department) from public.characters ch
      join public.major_required_courses m on m.major_id = ch.study_track_id join public.courses c on c.id = m.course_id
      where ch.id = p_character and btrim(c.department) <> ''), '[]'::jsonb),
    'major_bonus', coalesce(public.uni_n('uni_bonus_major'), 1)::int,
    'full_time_job', public.character_full_time_job(p_character),
    'job_malus', coalesce(public.uni_n('uni_lavoro_full_malus'), 1)::int);
end;
$$;
revoke execute on function public.academic_extras(uuid) from public, anon;
grant execute on function public.academic_extras(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- BORSA ACCADEMICA: conta il GPA cumulativo
-- ---------------------------------------------------------------------
create or replace function public.merit_scholarship_lost(p_character uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.term_reports tr join public.academic_terms t on t.id = tr.term_id
    where tr.character_id = p_character and t.status = 'published'
      and not public.academic_late_term(p_character, t.id)
      and (tr.standing_after in ('probation', 'suspended', 'dismissed')
           or (tr.cumulative_gpa_after is not null and tr.cumulative_gpa_after < coalesce(public.uni_n('uni_borsa_gpa_min'), 2.5)))
  )
$$;
revoke execute on function public.merit_scholarship_lost(uuid) from public, anon, authenticated;

create or replace function public.academic_terms_scholarship_notice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_min numeric := coalesce(public.uni_n('uni_borsa_gpa_min'), 2.5);
begin
  if new.status <> 'published' or old.status = 'published' then
    return null;
  end if;
  for r in
    select c.id, c.owner_id, c.name, tr.standing_after
    from public.term_reports tr join public.characters c on c.id = tr.character_id
    where tr.term_id = new.id
      and public.trait_flag(c.id, 'scholarship')
      and not public.academic_late_term(c.id, new.id)
      and (tr.standing_after in ('probation', 'suspended', 'dismissed') or (tr.cumulative_gpa_after is not null and tr.cumulative_gpa_after < v_min))
      and not exists (
        select 1 from public.term_reports p join public.academic_terms t on t.id = p.term_id
        where p.character_id = c.id and p.term_id <> new.id and t.status = 'published'
          and not public.academic_late_term(c.id, t.id)
          and (p.standing_after in ('probation', 'suspended', 'dismissed') or (p.cumulative_gpa_after is not null and p.cumulative_gpa_after < v_min)))
  loop
    perform public.send_system_message(r.owner_id,
      '🎓 ' || public.first_name(r.name) || ' ha perso la Borsa di studio accademica: '
      || case when r.standing_after in ('probation', 'suspended', 'dismissed') then 'il semestre l''ha portato in Academic Probation'
              else 'il GPA cumulativo è sceso sotto ' || to_char(v_min, 'FM0.0') end
      || '. Da ora retta del college e camera si pagano ogni mese (Utility → Servizi bancari).');
  end loop;
  return null;
end;
$$;

-- ---------------------------------------------------------------------
-- IMPEGNO INTENSO E LAVORO FULL TIME
-- ---------------------------------------------------------------------
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
  if (select status from public.academic_terms where id = p_term) is distinct from 'registration_open' then
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

create or replace function public.join_job(p_character uuid, p_role uuid, p_mode text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.job_roles;
begin
  if not public.owns_character(p_character) then
    raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501';
  end if;
  if p_mode not in ('full_time', 'part_time') then
    raise exception 'Scegli full time o part time.' using errcode = 'P0001';
  end if;
  select jr.* into r from public.job_roles jr join public.jobs j on j.id = jr.job_id
  where jr.id = p_role and j.active;
  if r.id is null then
    raise exception 'Questo lavoro non esiste o non è attivo.' using errcode = 'P0001';
  end if;
  if not r.self_select then
    raise exception 'Questo ruolo lo assegna lo staff: chiedilo con un ticket.' using errcode = 'P0001';
  end if;
  -- full time e impegno intenso all'università non stanno insieme
  if p_mode = 'full_time' and exists (
    select 1 from public.enrollments e join public.academic_terms t on t.id = e.term_id
    where e.character_id = p_character and e.effort = 'intense' and e.status = 'enrolled'
      and t.status in ('registration_open', 'in_progress')) then
    raise exception 'Questo semestre hai scelto l''impegno intenso all''università: con un full time non si può. Scegli il part time.' using errcode = 'P0001';
  end if;
  insert into public.character_jobs (character_id, job_id, role_id, mode, assigned_by)
  values (p_character, r.job_id, r.id, p_mode, auth.uid())
  on conflict (character_id, job_id) do update set role_id = excluded.role_id, mode = excluded.mode,
    assigned_by = excluded.assigned_by, created_at = now();
end;
$$;

-- ---------------------------------------------------------------------
-- ESAMI: bonus del Major, lavoro full time, pagella (borsa e Minor)
-- ---------------------------------------------------------------------
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
  v_attempted int; v_earned int; v_term_gpa numeric; v_cum numeric; v_total_credits int;
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
    v_mods := v_effort + v_load + v_retake + e.master_modifier + v_majorb + v_job;
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
                                 'major', v_majorb, 'lavoro', v_job, 'master', e.master_modifier, 'nota_master', nullif(e.master_note, ''), 'totale', v_mods + v_traits,
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
           coalesce(sum(c.credits) filter (where en.grade_points > 0), 0)
      into v_cum, v_total_credits
    from public.enrollments en join public.courses c on c.id = en.course_id join public.academic_terms tt on tt.id = en.term_id
    where en.character_id = s.character_id and en.status = 'completed' and en.counts_in_gpa
      and (tt.status = 'published' or tt.id = p_term);
    v_total_credits := r.start_credits + v_total_credits;

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


-- ---------------------------------------------------------------------
-- COMPITI: bonus del Major e lavoro full time
-- ---------------------------------------------------------------------
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
  if v_last is not null and v_last > now() - make_interval(days => v_days) then
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
    + v_majorb + v_job;
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


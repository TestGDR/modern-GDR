-- =====================================================================
-- VANTAGGI, SVANTAGGI E TRATTI: SECONDA TAPPA
-- - Le voci accademiche diventano selezionabili e valgono negli esami e
--   nei compiti: modificatori per prova, dipartimento e area (STEM o
--   umanistica), corsi ripetuti, soglie dei critici, CD (Nella lista nera),
--   limiti di crediti (Instancabile 21, Studente lavoratore 15), niente
--   carico pesante, crediti di partenza (Advanced Placement), Pupillo dei
--   professori (sale al voto superiore se manca 1 punto), Sangue freddo
--   (ritira il d10 della prima prova andata male), Vita sociale intensa
--   (niente impegno intenso), Visto studentesco (resta full-time), Borsa a
--   rischio (segnalata in pagella). Le voci generali non valgono negli esami
--   (solo quelle accademiche e quelle "in tutti i tiri": Metodico, Imprevedibile…).
-- - I personaggi già approvati possono aggiungere voci nuove una volta,
--   pagandole con i PX rimasti: le approva lo staff (personaggi.approvare).
-- - Le voci con un PNG collegato (Mentore, Coinquilino, Nemico…) creano da
--   sole il PNG da completare quando la scheda o la richiesta è approvata.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. AREA DEI CORSI (STEM / umanistica)
-- ---------------------------------------------------------------------
alter table public.courses
  add column if not exists area text not null default '' check (area in ('', 'stem', 'umanistica'));
update public.courses set area = case
  when department in ('Scienze naturali', 'Medicina', 'Matematica e ingegneria') then 'stem'
  when department in ('Studi umanistici', 'Scienze sociali e diritto', 'Arti') then 'umanistica'
  else '' end
where area = '';

-- voci accademiche ora selezionabili
update public.creation_options set available = true where scope = 'accademica';

-- ---------------------------------------------------------------------
-- 2. MOTORE: anche il modificatore della CD
-- ---------------------------------------------------------------------
create or replace function public.trait_mods(p_character uuid, p_ctx jsonb, p_situational uuid[] default '{}')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cap int := coalesce(public.setting_int('tetto_modificatori'), 4);
  v_system text := coalesce(p_ctx ->> 'system', 'general');
  v_skill uuid := nullif(p_ctx ->> 'skill_id', '')::uuid;
  v_cats text[];
  r record;
  e jsonb;
  w jsonb;
  v_val int;
  v_sum int := 0;
  v_items jsonb := '[]'::jsonb;
  v_smin int := 10;
  v_fmax int := 1;
  v_override boolean := false;
  v_cd int := 0;
  v_esys text;
  v_ok boolean;
begin
  -- categorie del tiro: quella indicata, oppure quelle dell'abilità
  if p_ctx ? 'category' and coalesce(p_ctx ->> 'category', '') <> '' then
    v_cats := array[p_ctx ->> 'category'];
  else
    select coalesce(array_agg(category), '{}') into v_cats from public.skill_categories where skill_id = v_skill;
  end if;

  for r in
    select o.id, o.name, o.roll_modifier, o.roll_skill_id, o.effects, co.level, co.choice_value
    from public.character_options co join public.creation_options o on o.id = co.option_id
    where co.character_id = p_character
  loop
    -- voci vecchie: modificatore all'abilità indicata (o a tutti i tiri)
    if r.roll_modifier is not null and (r.roll_skill_id is null or r.roll_skill_id = v_skill) then
      v_sum := v_sum + r.roll_modifier;
      v_items := v_items || jsonb_build_object('name', r.name, 'value', r.roll_modifier);
    end if;
    for e in select * from jsonb_array_elements(r.effects) loop
      w := coalesce(e -> 'when', '{}'::jsonb);
      v_esys := coalesce(w ->> 'system', e ->> 'system', 'general');
      -- sistema: general vale anche in combattimento; any vale ovunque
      v_ok := v_esys = 'any' or v_esys = v_system or (v_esys = 'general' and v_system = 'combat');
      if v_ok and w ? 'category' then
        v_ok := v_cats && array(select jsonb_array_elements_text(w -> 'category'));
      end if;
      if v_ok and w ? 'exam_type' then
        v_ok := (p_ctx ->> 'exam_type') = any (array(select jsonb_array_elements_text(w -> 'exam_type')));
      end if;
      if v_ok and w ? 'department' then
        v_ok := lower(coalesce(p_ctx ->> 'department', '')) = lower(case when w ->> 'department' = '$choice' then r.choice_value else w ->> 'department' end);
      end if;
      if v_ok and w ? 'area' then
        v_ok := coalesce(p_ctx ->> 'area', '') = (w ->> 'area');
      end if;
      if v_ok and w ? 'retake' then
        v_ok := coalesce((p_ctx ->> 'retake')::boolean, false);
      end if;
      if v_ok and w ? 'min_credits' then
        v_ok := coalesce((p_ctx ->> 'credits')::int, 0) > (w ->> 'min_credits')::int;
      end if;
      -- situazionali: solo se confermati
      if v_ok and coalesce((e ->> 'situational')::boolean, false) then
        v_ok := r.id = any (p_situational);
      end if;
      continue when not v_ok;

      if e ->> 'type' = 'roll_modifier' then
        v_val := case e ->> 'value' when '$level' then r.level when '-$level' then -r.level else (e ->> 'value')::int end;
        v_sum := v_sum + v_val;
        v_items := v_items || jsonb_build_object('name', r.name, 'value', v_val);
      elsif e ->> 'type' = 'cd_modifier' then
        v_cd := v_cd + (e ->> 'value')::int;
      elsif e ->> 'type' = 'crit_range' then
        if coalesce((e ->> 'override')::boolean, false) then
          v_override := true;
          v_smin := coalesce((e ->> 'success_min')::int, 10);
          v_fmax := coalesce((e ->> 'failure_max')::int, 1);
        elsif not v_override then
          v_smin := least(v_smin, coalesce((e ->> 'success_min')::int, 10));
          v_fmax := greatest(v_fmax, coalesce((e ->> 'failure_max')::int, 1));
        end if;
      end if;
    end loop;
  end loop;

  return jsonb_build_object('total', greatest(-v_cap, least(v_cap, v_sum)), 'raw', v_sum, 'items', v_items,
    'success_min', v_smin, 'failure_max', v_fmax, 'cd', v_cd);
end;
$$;

-- Primo effetto di un tipo tra le voci del personaggio (null se non c'è)
create or replace function public.trait_effect(p_character uuid, p_type text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select e from public.character_options co join public.creation_options o on o.id = co.option_id
  cross join lateral jsonb_array_elements(o.effects) e
  where co.character_id = p_character and e ->> 'type' = p_type
  limit 1
$$;
revoke execute on function public.trait_effect(uuid, text) from public, anon, authenticated;

-- Il personaggio ha una regola speciale (rule_flag)?
create or replace function public.trait_flag(p_character uuid, p_flag text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.character_options co join public.creation_options o on o.id = co.option_id
    cross join lateral jsonb_array_elements(o.effects) e
    where co.character_id = p_character and e ->> 'type' = 'rule_flag' and e ->> 'flag' = p_flag)
$$;
revoke execute on function public.trait_flag(uuid, text) from public, anon, authenticated;

-- Le scelte "le decide il Master" (Nemico, Nella lista nera) le scrive solo lo staff
create or replace function public.character_options_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or public.has_permission('personaggi.modificare_tutti') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.source := 'creazione';
    new.npc_id := null;
    new.note := '';
  else
    new.source := old.source;
    new.npc_id := old.npc_id;
    new.note := old.note;
  end if;
  if exists (select 1 from public.creation_options where id = new.option_id and requires_choice = 'master') then
    new.choice_value := case when tg_op = 'INSERT' then '' else old.choice_value end;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. UNIVERSITÀ CON LE VOCI
-- ---------------------------------------------------------------------
create or replace function public.uni_record(p_character uuid)
returns public.student_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.student_records;
  v_year int;
  v_start int;
begin
  select * into r from public.student_records where character_id = p_character;
  if r.character_id is not null then return r; end if;
  select o.sort_order into v_year from public.characters c left join public.sheet_options o on o.id = c.year_id where c.id = p_character;
  if v_year = 5 then
    raise exception 'I Graduate (magistrale) non seguono i corsi undergraduate.' using errcode = 'P0001';
  end if;
  v_start := coalesce((public.uni_list('uni_crediti_partenza'))[greatest(1, least(4, coalesce(v_year, 1)))], 0)::int
    + coalesce((public.trait_effect(p_character, 'start_credits') ->> 'value')::int, 0);
  insert into public.student_records (character_id, start_credits, credits_earned, class_standing)
  values (p_character, v_start, v_start, public.uni_class(v_start))
  returning * into r;
  return r;
end;
$$;

create or replace function public.academic_enroll(p_term uuid, p_character uuid, p_course uuid)
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
  if not public.owns_character(p_character) then raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501'; end if;
  select * into t from public.academic_terms where id = p_term;
  if t.status is distinct from 'registration_open' then raise exception 'Le iscrizioni di questo semestre sono chiuse.' using errcode = 'P0001'; end if;
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

create or replace function public.academic_withdraw(p_enrollment bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.enrollments;
  t public.academic_terms;
begin
  select * into e from public.enrollments where id = p_enrollment for update;
  if e.id is null or not public.owns_character(e.character_id) then raise exception 'Iscrizione non trovata.' using errcode = '42501'; end if;
  select * into t from public.academic_terms where id = e.term_id;
  if t.status <> 'in_progress' or not t.withdraw_open then
    raise exception 'Il ritiro non è più possibile in questo semestre.' using errcode = 'P0001';
  end if;
  if e.status <> 'enrolled' then raise exception 'Questo corso è già ritirato o concluso.' using errcode = 'P0001'; end if;
  -- Visto studentesco: si resta full-time
  if public.trait_flag(e.character_id, 'must_stay_full_time') and (
    select coalesce(sum(c.credits), 0) from public.enrollments x join public.courses c on c.id = x.course_id
    where x.character_id = e.character_id and x.term_id = e.term_id and x.status = 'enrolled' and x.id <> e.id
  ) < public.uni_n('uni_crediti_min') then
    raise exception 'Con il visto studentesco devi restare full-time (almeno % crediti).', public.uni_n('uni_crediti_min')::int using errcode = 'P0001';
  end if;
  update public.enrollments set status = 'withdrawn' where id = p_enrollment;
end;
$$;

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
    v_effort := coalesce(eff[case e.effort when 'minimal' then 1 when 'normal' then 2 else 3 end], 0)::int;
    select coalesce(sum(c.credits), 0) into v_term_credits
    from public.enrollments x join public.courses c on c.id = x.course_id
    where x.character_id = e.character_id and x.term_id = p_term and x.status = 'enrolled';
    v_load := case when v_term_credits > public.uni_n('uni_carico_pesante_oltre') then -public.uni_n('uni_carico_pesante_malus')::int else 0 end;
    -- Instancabile: niente malus del carico pesante
    if public.trait_effect(e.character_id, 'no_heavy_load') is not null then v_load := 0; end if;
    v_retake := case when e.retake_after_f then public.uni_n('uni_bonus_ripetizione')::int else 0 end;
    v_mods := v_effort + v_load + v_retake + e.master_modifier;
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
                                 'master', e.master_modifier, 'nota_master', nullif(e.master_note, ''), 'totale', v_mods + v_traits,
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
      || case when v_attempted > 0 and v_term_gpa < 2.5 and public.trait_flag(s.character_id, 'merit_scholarship') then ' · Borsa di merito persa' else '' end
      || case v_after when 'probation' then ' · Academic Probation' when 'suspended' then ' · Academic Suspension (salta un semestre)'
           when 'dismissed' then ' · Academic Dismissal' when 'graduated' then ' · Laurea' || coalesce(' ' || v_honors, '') else '' end;

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
  v_mods := (m ->> 'total')::int
    + coalesce(eff[case e.effort when 'minimal' then 1 when 'normal' then 2 else 3 end], 0)::int;
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

-- ---------------------------------------------------------------------
-- 4. PNG COLLEGATI ALLE VOCI
-- ---------------------------------------------------------------------
create or replace function public.npcs_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  u record;
  v_pg text;
begin
  -- i PNG creati dalle voci della scheda: l'avviso allo staff arriva quando il giocatore li completa
  if new.kind <> 'giocatore' or current_setting('app.png_auto', true) = 'on' then return null; end if;
  select public.first_name(name) into v_pg from public.characters where id = new.owner_character_id;
  -- proposta (nuova o modificata) → staff
  if new.status = 'proposto' and (tg_op = 'INSERT' or old.status is distinct from 'proposto' or old.name <> new.name or old.description <> new.description) then
    for u in
      select p.id from public.profiles p join public.user_levels l on l.id = p.level_id
      where (l.is_admin or 'png.gestire' = any (l.permissions)) and p.id is distinct from auth.uid()
    loop
      perform public.send_system_message(u.id,
        '🎭 PNG da approvare: ' || new.name || coalesce(' (' || nullif(new.role, '') || ')', '') || ', proposto per ' || coalesce(v_pg, 'un personaggio')
        || '. Lo trovi in Utility → PNG.');
    end loop;
  end if;
  -- esito → giocatore
  if tg_op = 'UPDATE' and new.status is distinct from old.status and new.status in ('approvato', 'rifiutato') then
    perform public.send_system_message((select owner_id from public.characters where id = new.owner_character_id),
      case when new.status = 'approvato' then '🎭 Il tuo PNG ' || new.name || ' è stato approvato: da ora il Master può interpretarlo in gioco.'
           else '🎭 Il tuo PNG ' || new.name || ' non è stato approvato' || coalesce(': ' || nullif(new.review_note, ''), '.') || ' Puoi correggerlo e riproporlo da Utility → PNG.' end);
  end if;
  return null;
end;
$$;

-- Crea i PNG da completare per le voci con un PNG collegato che non ne hanno ancora uno
create or replace function public.trait_link_npcs(p_character uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  c public.characters;
  v_npc uuid;
  v_n int := 0;
begin
  select * into c from public.characters where id = p_character;
  if c.id is null then return 0; end if;
  for r in
    select co.option_id, o.name, o.secret_default, co.choice_value, e ->> 'role' as role
    from public.character_options co join public.creation_options o on o.id = co.option_id
    cross join lateral (select x from jsonb_array_elements(o.effects) x where x ->> 'type' = 'linked_npc' limit 1) l (e)
    where co.character_id = p_character and co.npc_id is null
  loop
    perform set_config('app.png_auto', 'on', true);
    insert into public.npcs (name, role, description, kind, owner_character_id, secret, status, created_by)
    values (left(coalesce(nullif(r.role, ''), 'PNG') || ' di ' || public.first_name(c.name), 60), left(coalesce(r.role, ''), 60),
      'PNG collegato alla voce «' || r.name || '»' || coalesce(' (' || nullif(r.choice_value, '') || ')', '')
        || '. Il giocatore completa nome, descrizione e ritratto; poi lo approva lo staff.',
      'giocatore', p_character, r.secret_default, 'proposto', c.owner_id)
    returning id into v_npc;
    perform set_config('app.png_auto', 'off', true);
    update public.character_options set npc_id = v_npc where character_id = p_character and option_id = r.option_id;
    v_n := v_n + 1;
  end loop;
  if v_n > 0 then
    perform public.send_system_message(c.owner_id,
      '🎭 Dalle voci della tua scheda sono nati ' || case when v_n = 1 then 'un PNG' else v_n || ' PNG' end
      || ' da completare: li trovi in Utility → PNG → I miei. Quando li modifichi, li approva lo staff.');
  end if;
  return v_n;
end;
$$;
revoke execute on function public.trait_link_npcs(uuid) from public, anon, authenticated;

-- All'approvazione della scheda
create or replace function public.characters_link_npcs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'approvata' and old.status is distinct from 'approvata' then
    perform public.trait_link_npcs(new.id);
  end if;
  return null;
end;
$$;
revoke execute on function public.characters_link_npcs() from public, anon, authenticated;
drop trigger if exists characters_link_npcs on public.characters;
create trigger characters_link_npcs after update of status on public.characters
  for each row execute function public.characters_link_npcs();

-- ---------------------------------------------------------------------
-- 5. VOCI AGGIUNTE DOPO L'APPROVAZIONE (una volta, le approva lo staff)
-- ---------------------------------------------------------------------
create table public.option_requests (
  id bigint generated always as identity primary key,
  character_id uuid not null references public.characters (id) on delete cascade,
  -- [{ option_id, level, choice }]
  items jsonb not null check (jsonb_typeof(items) = 'array'),
  px_cost int not null default 0,
  note text not null default '' check (char_length(note) <= 500),
  status text not null default 'in_attesa' check (status in ('in_attesa', 'approvata', 'rifiutata')),
  review_note text not null default '' check (char_length(review_note) <= 500),
  reviewed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
-- una sola richiesta in attesa o approvata per personaggio (dopo un rifiuto si riprova)
create unique index option_requests_once on public.option_requests (character_id) where status <> 'rifiutata';
create index option_requests_character_idx on public.option_requests (character_id);
create index option_requests_reviewer_idx on public.option_requests (reviewed_by);
alter table public.option_requests enable row level security;
revoke all on public.option_requests from anon, authenticated;
grant select on public.option_requests to authenticated;
create policy "Richieste di voci: proprietario e staff" on public.option_requests for select to authenticated
  using (public.npc_mine(character_id) or (select public.has_permission('personaggi.approvare')));
create policy "Richieste di voci: solo dalle funzioni" on public.option_requests for insert to authenticated with check (false);
create policy "Richieste di voci: non si modificano" on public.option_requests for update to authenticated using (false);
create policy "Richieste di voci: non si cancellano" on public.option_requests for delete to authenticated using (false);
create trigger option_requests_log after update on public.option_requests
  for each row execute function public.log_admin_change();

-- Controlla le voci richieste e restituisce il costo in PX (gli svantaggi ne danno)
create or replace function public.option_request_check(p_character uuid, p_items jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  it jsonb;
  o public.creation_options;
  v_cost int := 0;
  v_lvl int;
  v_choice text;
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 10 then
    raise exception 'Scegli da 1 a 10 voci.' using errcode = 'P0001';
  end if;
  if (select count(distinct x ->> 'option_id') from jsonb_array_elements(p_items) x) <> jsonb_array_length(p_items) then
    raise exception 'Una voce è ripetuta.' using errcode = 'P0001';
  end if;
  for it in select * from jsonb_array_elements(p_items) loop
    select * into o from public.creation_options where id = (it ->> 'option_id')::uuid;
    if o.id is null or not o.active or not o.available or o.kind = 'tenore' then
      raise exception '"%" non si può scegliere.', coalesce(o.name, 'Voce') using errcode = 'P0001';
    end if;
    if exists (select 1 from public.character_options where character_id = p_character and option_id = o.id) then
      raise exception 'Hai già "%".', o.name using errcode = 'P0001';
    end if;
    v_lvl := coalesce((it ->> 'level')::int, 1);
    if v_lvl < 1 or v_lvl > o.max_level then raise exception '"%": livello non valido.', o.name using errcode = 'P0001'; end if;
    v_choice := btrim(coalesce(it ->> 'choice', ''));
    if o.requires_choice in ('testo', 'dipartimento', 'area', 'gruppo') and v_choice = '' then
      raise exception '"%": indica %.', o.name, coalesce(nullif(o.choice_hint, ''), 'la scelta richiesta') using errcode = 'P0001';
    end if;
    v_cost := v_cost + o.cost_px * v_lvl;
  end loop;

  -- prova con le voci aggiunte: massimi, scelte, incompatibilità (poi si annulla)
  begin
    insert into public.character_options (character_id, option_id, level, choice_value)
    select p_character, (x ->> 'option_id')::uuid, coalesce((x ->> 'level')::int, 1), left(btrim(coalesce(x ->> 'choice', '')), 80)
    from jsonb_array_elements(p_items) x;
    perform public.check_character_options(p_character);
    if exists (
      select 1 from public.character_options co1 join public.creation_options o1 on o1.id = co1.option_id
      join public.character_options co2 on co2.character_id = co1.character_id and co2.option_id = any (o1.incompatible_ids)
      where co1.character_id = p_character
    ) then
      raise exception 'Una voce è incompatibile con quelle che hai già.' using errcode = 'P0001';
    end if;
    raise exception 'prova riuscita' using errcode = 'P0099';
  exception when sqlstate 'P0099' then
    null;
  end;
  return v_cost;
end;
$$;
revoke execute on function public.option_request_check(uuid, jsonb) from public, anon, authenticated;

-- Il giocatore invia la richiesta
create or replace function public.option_request_submit(p_character uuid, p_items jsonb, p_note text default '')
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cost int;
  v_px int;
  v_id bigint;
  v_name text;
  u record;
begin
  if not public.owns_character(p_character) then raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501'; end if;
  if exists (select 1 from public.option_requests where character_id = p_character and status = 'in_attesa') then
    raise exception 'Hai già una richiesta in attesa.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.option_requests where character_id = p_character and status = 'approvata') then
    raise exception 'Hai già aggiunto le tue voci nuove: ora le cambia solo lo staff.' using errcode = 'P0001';
  end if;
  v_cost := public.option_request_check(p_character, p_items);
  select px, public.first_name(name) into v_px, v_name from public.characters where id = p_character;
  if v_cost > v_px then
    raise exception 'Queste voci costano % PX e te ne restano %.', v_cost, v_px using errcode = 'P0001';
  end if;
  insert into public.option_requests (character_id, items, px_cost, note)
  values (p_character, (select jsonb_agg(jsonb_build_object('option_id', x ->> 'option_id', 'level', coalesce((x ->> 'level')::int, 1),
            'choice', left(btrim(coalesce(x ->> 'choice', '')), 80))) from jsonb_array_elements(p_items) x),
          v_cost, left(btrim(coalesce(p_note, '')), 500))
  returning id into v_id;
  for u in
    select p.id from public.profiles p join public.user_levels l on l.id = p.level_id
    where (l.is_admin or 'personaggi.approvare' = any (l.permissions)) and p.id is distinct from auth.uid()
  loop
    perform public.send_system_message(u.id, '✨ ' || v_name || ' chiede di aggiungere voci nuove alla scheda. La richiesta è in Gestione → Voci nuove dei personaggi.');
  end loop;
  return v_id;
end;
$$;
revoke execute on function public.option_request_submit(uuid, jsonb, text) from public, anon;
grant execute on function public.option_request_submit(uuid, jsonb, text) to authenticated;

-- Il giocatore ritira la richiesta finché è in attesa
create or replace function public.option_request_cancel(p_request bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.option_requests r
  where r.id = p_request and r.status = 'in_attesa' and public.owns_character(r.character_id);
  if not found then raise exception 'Richiesta non trovata o già esaminata.' using errcode = 'P0001'; end if;
end;
$$;
revoke execute on function public.option_request_cancel(bigint) from public, anon;
grant execute on function public.option_request_cancel(bigint) to authenticated;

-- Lo staff approva (le voci entrano in scheda e si tolgono i PX) o rifiuta
create or replace function public.option_request_review(p_request bigint, p_approve boolean, p_note text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.option_requests;
  c public.characters;
  v_cost int;
  v_start int;
begin
  if not public.has_permission('personaggi.approvare') then
    raise exception 'Non hai il permesso di approvare le schede.' using errcode = '42501';
  end if;
  select * into r from public.option_requests where id = p_request for update;
  if r.id is null or r.status <> 'in_attesa' then raise exception 'Richiesta non trovata o già esaminata.' using errcode = 'P0001'; end if;
  select * into c from public.characters where id = r.character_id for update;

  if p_approve then
    v_cost := public.option_request_check(r.character_id, r.items);
    if v_cost > c.px then
      raise exception 'Al personaggio restano % PX: le voci ne costano %.', c.px, v_cost using errcode = 'P0001';
    end if;
    insert into public.character_options (character_id, option_id, level, choice_value, secret)
    select r.character_id, o.id, coalesce((x ->> 'level')::int, 1), left(btrim(coalesce(x ->> 'choice', '')), 80), o.secret_default
    from jsonb_array_elements(r.items) x join public.creation_options o on o.id = (x ->> 'option_id')::uuid;
    update public.characters set px = px - v_cost where id = r.character_id;
    -- Advanced Placement con la carriera già aperta: crediti riconosciuti subito
    select sum((e ->> 'value')::int) into v_start
    from jsonb_array_elements(r.items) x join public.creation_options o on o.id = (x ->> 'option_id')::uuid
    cross join lateral jsonb_array_elements(o.effects) e
    where e ->> 'type' = 'start_credits';
    if coalesce(v_start, 0) > 0 then
      update public.student_records
      set start_credits = start_credits + v_start, credits_earned = credits_earned + v_start,
          class_standing = public.uni_class(credits_earned + v_start), updated_at = now()
      where character_id = r.character_id;
    end if;
    perform public.trait_link_npcs(r.character_id);
  end if;

  update public.option_requests
  set status = case when p_approve then 'approvata' else 'rifiutata' end, px_cost = coalesce(v_cost, px_cost),
      review_note = left(btrim(coalesce(p_note, '')), 500), reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_request;
  perform public.send_system_message(c.owner_id,
    case when p_approve then '✨ Le voci nuove di ' || public.first_name(c.name) || ' sono state approvate e sono nella scheda (−' || v_cost || ' PX).'
         else '✨ Le voci nuove di ' || public.first_name(c.name) || ' non sono state approvate' || coalesce(': ' || nullif(btrim(p_note), ''), '.')
           || ' Puoi correggerle e inviare una nuova richiesta dalla scheda → Tratti.' end);
end;
$$;
revoke execute on function public.option_request_review(bigint, boolean, text) from public, anon;
grant execute on function public.option_request_review(bigint, boolean, text) to authenticated;

-- Le richieste con i nomi delle voci (staff: tutte; giocatore: le proprie)
create or replace function public.option_requests_list(p_character uuid default null, p_status text default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'character_id', r.character_id, 'character_name', c.name, 'px', c.px, 'px_cost', r.px_cost,
    'note', r.note, 'status', r.status, 'review_note', r.review_note, 'created_at', r.created_at, 'reviewed_at', r.reviewed_at,
    'items', (select coalesce(jsonb_agg(jsonb_build_object('option_id', o.id, 'name', o.name, 'kind', o.kind, 'scope', o.scope,
                'level', coalesce((x ->> 'level')::int, 1), 'choice', x ->> 'choice', 'cost', o.cost_px * coalesce((x ->> 'level')::int, 1),
                'description', o.description)), '[]'::jsonb)
              from jsonb_array_elements(r.items) x join public.creation_options o on o.id = (x ->> 'option_id')::uuid)
  ) order by r.created_at desc), '[]'::jsonb)
  from public.option_requests r join public.characters c on c.id = r.character_id
  where (p_character is null or r.character_id = p_character)
    and (p_status is null or r.status = p_status)
    and (public.has_permission('personaggi.approvare') or c.owner_id = auth.uid())
$$;
revoke execute on function public.option_requests_list(uuid, text) from public, anon;
grant execute on function public.option_requests_list(uuid, text) to authenticated;

-- personaggi già approvati con voci che hanno un PNG collegato
select public.trait_link_npcs(id) from public.characters where status = 'approvata';

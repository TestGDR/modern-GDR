-- =====================================================================
-- UNIVERSITÀ: RENDIMENTO NEGLI ANNI GIÀ FREQUENTATI
-- - Tre voci accademiche (incompatibili tra loro) decidono la fascia dei
--   voti degli anni passati: Carriera eccellente (vantaggio, 2 punti),
--   Buona carriera (vantaggio, 1 punto), Carriera ai limiti (svantaggio,
--   1 punto). Senza nessuna: Sufficiente. Fasce in game_settings uni_fascia_*.
-- - Ogni corso riconosciuto e ogni blocco di crediti degli anni passati ha
--   un voto dentro la fascia: caratteristica + abilità + d10 (+ Major)
--   contro la CD del livello decide dove si cade nella fascia. La media di
--   partenza è la media di questi voti, pesata sui crediti.
-- - Riconosciuti anche i corsi del Minor e del Pre-Med sotto il livello
--   dell'anno di partenza (anche se il Minor o il Pre-Med si sceglie dopo).
-- - I personaggi già iscritti scelgono il rendimento una volta sola dalla
--   pagina Università (academic_choose_profile), pagando o ricevendo i PX.
-- =====================================================================

-- 1. fasce
insert into public.game_settings (key, value, kind, label, description, sort_order) values
  ('uni_fascia_eccellente', '[3.7, 4.0]', 'numbers', 'Università · Fascia «Carriera eccellente»', 'Media minima e massima dei voti degli anni già frequentati.', 250),
  ('uni_fascia_buona', '[3.0, 3.6]', 'numbers', 'Università · Fascia «Buona carriera»', 'Media minima e massima dei voti degli anni già frequentati.', 251),
  ('uni_fascia_sufficiente', '[2.3, 2.9]', 'numbers', 'Università · Fascia «Sufficiente» (nessuna voce)', 'Media minima e massima dei voti degli anni già frequentati.', 252),
  ('uni_fascia_limiti', '[2.0, 2.2]', 'numbers', 'Università · Fascia «Carriera ai limiti»', 'Media minima e massima dei voti degli anni già frequentati.', 253)
on conflict (key) do nothing;

-- 2. colonne
alter table public.academic_transfer_courses add column if not exists letter_grade text;
alter table public.academic_transfer_courses add column if not exists grade_points numeric(3, 2);
alter table public.student_records add column if not exists start_year int;
alter table public.student_records add column if not exists academic_profile text;
alter table public.student_records add column if not exists profile_chosen boolean not null default false;

-- 3. nuovo tipo di effetto: academic_profile
create or replace function public.creation_options_check_effects()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  e jsonb;
  v_types text[] := array['roll_modifier', 'crit_range', 'reroll', 'forced_reroll', 'cd_modifier', 'credit_limit', 'no_heavy_load',
    'start_credits', 'grade_bump', 'rule_flag', 'narrative', 'narrative_privilege', 'access', 'linked_npc',
    'injury_threshold', 'injury_band', 'team_rating_bonus', 'roster', 'extra_sport', 'academic_profile'];
begin
  for e in select * from jsonb_array_elements(new.effects) loop
    if jsonb_typeof(e) <> 'object' or not ((e ->> 'type') = any (v_types)) then
      raise exception 'Effetto sconosciuto in "%": %', new.name, coalesce(e ->> 'type', e::text) using errcode = 'P0001';
    end if;
  end loop;
  return new;
end;
$$;

-- 4. le tre voci del catalogo
insert into public.creation_options (kind, scope, subgroup, name, cost_px, max_level, requires_choice, choice_hint, secret_default, is_origin, available, description, effects, sort_order)
select v.kind, 'accademica', '', v.name,
       case v.kind when 'vantaggio' then v.pts else -v.pts end * coalesce(public.setting_int('voci_px_per_punto'), 40),
       1, null, '', false, false, true, v.descr, v.eff::jsonb,
       coalesce((select max(sort_order) from public.creation_options), 0) + row_number() over ()
from (values
  ('vantaggio', 'Carriera eccellente', 2,
   'Negli anni già frequentati sei stato uno studente da A: i voti dei corsi passati stanno tra 3.7 e 4.0. Vale se parti dal secondo anno in poi (o arrivi nel semestre di primavera).',
   '[{"type":"academic_profile","value":"eccellente"}]'),
  ('vantaggio', 'Buona carriera', 1,
   'Negli anni già frequentati hai avuto buoni voti: i corsi passati stanno tra 3.0 e 3.6. Vale se parti dal secondo anno in poi (o arrivi nel semestre di primavera).',
   '[{"type":"academic_profile","value":"buona"}]'),
  ('svantaggio', 'Carriera ai limiti', 1,
   'Negli anni già frequentati te la sei cavata a stento: i corsi passati stanno tra 2.0 e 2.2, a un passo dalla probation. Vale se parti dal secondo anno in poi (o arrivi nel semestre di primavera).',
   '[{"type":"academic_profile","value":"limiti"}]')
) as v (kind, name, pts, descr, eff)
on conflict (kind, name) do nothing;

select public.set_option_incompatible(a, b, false) from (values
  ('Carriera eccellente', 'Buona carriera'), ('Carriera eccellente', 'Carriera ai limiti'), ('Buona carriera', 'Carriera ai limiti')
) as x (a, b);

-- 5. fascia del personaggio (senza voce: sufficiente)
create or replace function public.uni_profile_of(p_character uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select x ->> 'value' from public.character_options co join public.creation_options o on o.id = co.option_id
    cross join lateral jsonb_array_elements(o.effects) x
    where co.character_id = p_character and x ->> 'type' = 'academic_profile' limit 1), 'sufficiente')
$$;
revoke execute on function public.uni_profile_of(uuid) from public, anon, authenticated;

create or replace function public.uni_profile_band(p_profile text)
returns numeric[]
language sql
stable
set search_path = ''
as $$
  select coalesce(public.uni_list('uni_fascia_' || coalesce(p_profile, 'sufficiente')),
    case p_profile when 'eccellente' then array[3.7, 4.0] when 'buona' then array[3.0, 3.6] when 'limiti' then array[2.0, 2.2]
      else array[2.3, 2.9] end)
$$;
revoke execute on function public.uni_profile_band(text) from public, anon, authenticated;

-- Voto in lettere più alto che non supera i punti
create or replace function public.uni_letter_floor(p_points numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select l from (values ('A', 4.0), ('A-', 3.7), ('B+', 3.3), ('B', 3.0), ('B-', 2.7), ('C+', 2.3), ('C', 2.0), ('C-', 1.7),
    ('D+', 1.3), ('D', 1.0), ('D-', 0.7), ('F', 0.0)) v (l, p)
  where p <= p_points + 0.001 order by p desc limit 1
$$;
revoke execute on function public.uni_letter_floor(numeric) from public, anon, authenticated;

-- Un voto degli anni passati: il tiro decide dove si cade nella fascia
create or replace function public.uni_past_roll(p_character uuid, p_attr uuid, p_skill uuid, p_level int, p_band numeric[], p_bonus int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attr int := coalesce((select value from public.character_attributes where character_id = p_character and attribute_id = p_attr), 0);
  v_skill int := coalesce((select level from public.character_skills where character_id = p_character and skill_id = p_skill), 0);
  v_d int := public.academic_die();
  v_lv int := greatest(1, least(4, coalesce(p_level, 100) / 100));
  v_cd int := coalesce((public.uni_list('uni_cd_livelli'))[v_lv], 13 + v_lv - 1)::int;
  v_total int;
  v_pos numeric;
  v_points numeric;
begin
  v_total := v_attr + v_skill + v_d + coalesce(p_bonus, 0);
  -- margine −5 = fondo della fascia, +5 = cima
  v_pos := greatest(0, least(1, (v_total - v_cd + 5) / 10.0));
  v_points := round(p_band[1] + (p_band[2] - p_band[1]) * v_pos, 2);
  return jsonb_build_object('attr', v_attr, 'skill', v_skill, 'd10', v_d, 'bonus', coalesce(p_bonus, 0), 'total', v_total, 'cd', v_cd,
    'points', v_points, 'letter', public.uni_letter_floor(v_points));
end;
$$;
revoke execute on function public.uni_past_roll(uuid, uuid, uuid, int, numeric[], int) from public, anon, authenticated;

-- 6. corsi riconosciuti: Major, Minor e Pre-Med sotto il livello dell'anno di partenza.
-- Se il rendimento è già scelto, i corsi nuovi ricevono subito il voto. Restituisce i corsi aggiunti.
create or replace function public.uni_recognize(p_character uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.student_records;
  v_major uuid;
  v_minor uuid;
  v_limit int;
  v_n int;
  v_band numeric[];
  c record;
  x jsonb;
begin
  select * into r from public.student_records where character_id = p_character;
  if r.character_id is null or coalesce(r.start_year, 1) <= 1 then return 0; end if;
  select study_track_id, minor_id into v_major, v_minor from public.characters where id = p_character;
  v_limit := least(4, r.start_year) * 100;
  insert into public.academic_transfer_courses (character_id, course_id)
  with recursive need as (
    select m.course_id from public.major_required_courses m where m.major_id in (v_major, v_minor)
    union
    select pc.course_id from public.premed_courses pc where exists (select 1 from public.premed_students where character_id = p_character)
    union
    select cp.prerequisite_id from public.course_prerequisites cp join need n on n.course_id = cp.course_id
  )
  select p_character, co.id from need n join public.courses co on co.id = n.course_id
  where co.level < v_limit
  on conflict do nothing;
  get diagnostics v_n = row_count;

  if r.profile_chosen and v_n > 0 then
    v_band := public.uni_profile_band(r.academic_profile);
    for c in
      select tc.course_id, co.attribute_id, co.skill_id, co.level, co.department
      from public.academic_transfer_courses tc join public.courses co on co.id = tc.course_id
      where tc.character_id = p_character and tc.grade_points is null
    loop
      x := public.uni_past_roll(p_character, c.attribute_id, c.skill_id, c.level, v_band,
        case when public.uni_major_course(p_character, c.department) then coalesce(public.uni_n('uni_bonus_major'), 1)::int else 0 end);
      update public.academic_transfer_courses set grade_points = (x ->> 'points')::numeric, letter_grade = x ->> 'letter'
      where character_id = p_character and course_id = c.course_id;
    end loop;
  end if;
  return v_n;
end;
$$;
revoke execute on function public.uni_recognize(uuid) from public, anon, authenticated;

-- GPA cumulativo rifatto: corsi pubblicati + media di partenza
create or replace function public.uni_refresh_cum(p_character uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cum numeric;
  v_cr int;
begin
  select round(sum(en.grade_points * c.credits) / nullif(sum(c.credits), 0), 2), coalesce(sum(c.credits), 0)
    into v_cum, v_cr
  from public.enrollments en join public.courses c on c.id = en.course_id join public.academic_terms t on t.id = en.term_id
  where en.character_id = p_character and en.status = 'completed' and en.counts_in_gpa and t.status = 'published';
  update public.student_records set cumulative_gpa = public.uni_blend_gpa(p_character, v_cum, v_cr), updated_at = now()
  where character_id = p_character;
end;
$$;
revoke execute on function public.uni_refresh_cum(uuid) from public, anon, authenticated;

-- 7. voti degli anni passati: un voto per ogni corso riconosciuto e per ogni blocco
-- degli altri crediti (al massimo 12 per blocco); media di partenza pesata sui crediti
create or replace function public.uni_grade_start(p_character uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.student_records;
  v_profile text := public.uni_profile_of(p_character);
  v_band numeric[];
  v_major uuid := (select study_track_id from public.characters where id = p_character);
  v_majorb int := coalesce(public.uni_n('uni_bonus_major'), 1)::int;
  v_int uuid := (select id from public.attributes where code = 'INT');
  v_rolls jsonb := '[]'::jsonb;
  v_sum numeric := 0;
  v_cr int := 0;
  v_rec_cr int;
  v_left int;
  v_chunk int;
  v_done int := 0;
  v_tpl jsonb;
  v_n int;
  v_i int := 0;
  c record;
  t jsonb;
  x jsonb;
begin
  select * into r from public.student_records where character_id = p_character;
  if r.character_id is null then return; end if;
  v_band := public.uni_profile_band(v_profile);

  -- corsi riconosciuti
  for c in
    select tc.course_id, co.code, co.name, co.credits, co.attribute_id, co.skill_id, co.level, co.department
    from public.academic_transfer_courses tc join public.courses co on co.id = tc.course_id
    where tc.character_id = p_character order by co.level, co.code
  loop
    x := public.uni_past_roll(p_character, c.attribute_id, c.skill_id, c.level, v_band,
      case when public.uni_major_course(p_character, c.department) then v_majorb else 0 end);
    update public.academic_transfer_courses set grade_points = (x ->> 'points')::numeric, letter_grade = x ->> 'letter'
    where character_id = p_character and course_id = c.course_id;
    v_rolls := v_rolls || (x || jsonb_build_object('label', c.code || ' · ' || c.name, 'credits', c.credits, 'level', c.level));
    v_sum := v_sum + (x ->> 'points')::numeric * c.credits;
    v_cr := v_cr + c.credits;
  end loop;
  v_rec_cr := v_cr;

  -- gli altri crediti degli anni passati, a blocchi
  v_left := greatest(0, coalesce(r.start_gpa_credits, 0) - v_rec_cr);
  select coalesce(jsonb_agg(jsonb_build_object('attribute_id', co.attribute_id, 'skill_id', co.skill_id, 'department', co.department)
                            order by co.level, co.code), '[]'::jsonb)
    into v_tpl
  from public.major_required_courses m join public.courses co on co.id = m.course_id where m.major_id = v_major;
  v_n := jsonb_array_length(v_tpl);
  while v_left > 0 loop
    v_chunk := least(12, v_left);
    t := case when v_n > 0 then v_tpl -> (v_i % v_n) else jsonb_build_object('attribute_id', v_int) end;
    x := public.uni_past_roll(p_character, nullif(t ->> 'attribute_id', '')::uuid, nullif(t ->> 'skill_id', '')::uuid,
      least(4, 1 + (v_rec_cr + v_done) / 30) * 100, v_band, case when v_n > 0 then v_majorb else 0 end);
    v_rolls := v_rolls || (x || jsonb_build_object('label', 'Altri corsi', 'credits', v_chunk, 'level', least(4, 1 + (v_rec_cr + v_done) / 30) * 100));
    v_sum := v_sum + (x ->> 'points')::numeric * v_chunk;
    v_cr := v_cr + v_chunk;
    v_done := v_done + v_chunk;
    v_left := v_left - v_chunk;
    v_i := v_i + 1;
  end loop;

  update public.student_records
  set academic_profile = v_profile,
      start_gpa = case when v_cr > 0 then round(v_sum / v_cr, 2) end,
      start_gpa_credits = v_cr,
      start_rolls = v_rolls,
      updated_at = now()
  where character_id = p_character;
  perform public.uni_refresh_cum(p_character);
end;
$$;
revoke execute on function public.uni_grade_start(uuid) from public, anon, authenticated;

-- 8. alla prima iscrizione: anno di partenza, corsi riconosciuti, voti degli anni passati
create or replace function public.uni_start_career(p_character uuid, p_year int, p_gpa_credits int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.student_records
  set start_year = greatest(1, least(4, coalesce(p_year, 1))), start_gpa_credits = greatest(0, coalesce(p_gpa_credits, 0))
  where character_id = p_character;
  perform public.uni_recognize(p_character);
  if coalesce(p_gpa_credits, 0) > 0 then
    perform public.uni_grade_start(p_character);
  end if;
end;
$$;
revoke execute on function public.uni_start_career(uuid, int, int) from public, anon, authenticated;

-- I personaggi nuovi hanno scelto il rendimento in creazione
create or replace function public.student_records_profile_chosen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.profile_chosen := true;
  return new;
end;
$$;
revoke execute on function public.student_records_profile_chosen() from public, anon, authenticated;
drop trigger if exists student_records_profile_chosen on public.student_records;
create trigger student_records_profile_chosen before insert on public.student_records
  for each row execute function public.student_records_profile_chosen();

-- 9. Minor, Major o Pre-Med cambiati: si riconoscono anche i loro corsi degli anni passati
create or replace function public.characters_recognize_courses()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.student_records where character_id = new.id) then
    perform public.uni_recognize(new.id);
  end if;
  return null;
end;
$$;
revoke execute on function public.characters_recognize_courses() from public, anon, authenticated;
drop trigger if exists characters_recognize_courses on public.characters;
create trigger characters_recognize_courses after update of minor_id, study_track_id on public.characters
  for each row when (old.minor_id is distinct from new.minor_id or old.study_track_id is distinct from new.study_track_id)
  execute function public.characters_recognize_courses();

create or replace function public.premed_students_recognize()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.uni_recognize(new.character_id);
  return null;
end;
$$;
revoke execute on function public.premed_students_recognize() from public, anon, authenticated;
drop trigger if exists premed_students_recognize on public.premed_students;
create trigger premed_students_recognize after insert on public.premed_students
  for each row execute function public.premed_students_recognize();

-- 10. personaggi già iscritti: scelgono il rendimento una volta sola
create or replace function public.academic_choose_profile(p_character uuid, p_option uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.student_records;
  o public.creation_options;
  v_px int;
  v_cost int := 0;
  v_neg int;
  v_cap int := coalesce(public.setting_int('voci_svantaggi_px_max'), 160);
begin
  if not public.owns_character(p_character) then raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501'; end if;
  select * into r from public.student_records where character_id = p_character for update;
  if r.character_id is null then raise exception 'La tua carriera non è ancora iniziata.' using errcode = 'P0001'; end if;
  if r.profile_chosen then raise exception 'Il rendimento degli anni passati l''hai già scelto.' using errcode = 'P0001'; end if;
  if coalesce(r.start_gpa_credits, 0) <= 0 then raise exception 'Non hai anni già frequentati da valutare.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.character_options co join public.creation_options x on x.id = co.option_id
             where co.character_id = p_character and x.effects @> '[{"type":"academic_profile"}]') then
    raise exception 'Hai già una voce di rendimento in scheda.' using errcode = 'P0001';
  end if;

  if p_option is not null then
    select * into o from public.creation_options where id = p_option and active and effects @> '[{"type":"academic_profile"}]';
    if o.id is null then raise exception 'Scelta non valida.' using errcode = 'P0001'; end if;
    select px into v_px from public.characters where id = p_character;
    if o.cost_px > 0 then
      if o.cost_px > v_px then
        raise exception '«%» costa % PX e te ne restano %.', o.name, o.cost_px, v_px using errcode = 'P0001';
      end if;
      v_cost := o.cost_px;
    else
      -- uno svantaggio restituisce PX solo fino al tetto degli svantaggi
      select coalesce(-sum(x.cost_px * co.level), 0) into v_neg
      from public.character_options co join public.creation_options x on x.id = co.option_id
      where co.character_id = p_character and x.cost_px < 0 and co.source = 'creazione';
      v_cost := -least(-o.cost_px, greatest(0, v_cap - v_neg));
    end if;
    insert into public.character_options (character_id, option_id, level, choice_value, note)
    values (p_character, o.id, 1, '', 'Scelto dalla pagina Università.');
    if v_cost <> 0 then
      perform set_config('app.invio_scheda', 'on', true);
      update public.characters set px = px - v_cost where id = p_character;
      perform set_config('app.invio_scheda', 'off', true);
    end if;
  end if;

  update public.student_records set profile_chosen = true where character_id = p_character;
  perform public.uni_grade_start(p_character);
  return jsonb_build_object('px', -v_cost, 'start_gpa', (select start_gpa from public.student_records where character_id = p_character));
end;
$$;
revoke execute on function public.academic_choose_profile(uuid, uuid) from public, anon;
grant execute on function public.academic_choose_profile(uuid, uuid) to authenticated;

-- Minor e Pre-Med: i corsi riconosciuti valgono come superati
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
      coalesce((select e.grade_points from public.enrollments e join public.academic_terms t on t.id = e.term_id
       where e.character_id = p_character and e.course_id = co.id and e.status = 'completed'
         and (t.status = 'published' or t.id = p_term)
       order by t.created_at desc, e.id desc limit 1),
      (select coalesce(tc.grade_points, 4.0) from public.academic_transfer_courses tc
       where tc.character_id = p_character and tc.course_id = co.id)) as grade_points
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

create or replace function public.uni_premed_status(p_character uuid, p_term uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with req as (
    select co.id, co.code, co.name, co.credits, pc.sort_order,
      coalesce((select e.grade_points from public.enrollments e join public.academic_terms t on t.id = e.term_id
       where e.character_id = p_character and e.course_id = co.id and e.status = 'completed'
         and (t.status = 'published' or t.id = p_term)
       order by t.created_at desc, e.id desc limit 1),
      (select coalesce(tc.grade_points, 4.0) from public.academic_transfer_courses tc
       where tc.character_id = p_character and tc.course_id = co.id)) as grade_points
    from public.premed_courses pc join public.courses co on co.id = pc.course_id
  ),
  agg as (
    select count(*)::int as total,
      count(*) filter (where grade_points >= coalesce(public.uni_n('uni_voto_minimo_requisiti'), 1.7))::int as done
    from req
  )
  select jsonb_build_object(
    'enrolled', exists (select 1 from public.premed_students where character_id = p_character),
    'total', (select total from agg),
    'done', (select done from agg),
    'complete', (select total from agg) > 0 and (select done from agg) >= (select total from agg),
    'courses', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'code', code, 'name', name, 'credits', credits, 'grade_points', grade_points,
      'passed', grade_points >= coalesce(public.uni_n('uni_voto_minimo_requisiti'), 1.7)) order by sort_order, code) from req), '[]'::jsonb))
$$;

-- pagina Università: voti dei corsi riconosciuti e scelta del rendimento
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
      select jsonb_agg(jsonb_build_object('id', c.id, 'code', c.code, 'name', c.name, 'credits', c.credits, 'level', c.level,
        'letter_grade', tc.letter_grade, 'grade_points', tc.grade_points) order by c.level, c.code)
      from public.academic_transfer_courses tc join public.courses c on c.id = tc.course_id
      where tc.character_id = p_character), '[]'::jsonb),
    'start_gpa', (select start_gpa from public.student_records where character_id = p_character),
    'start_gpa_credits', coalesce((select start_gpa_credits from public.student_records where character_id = p_character), 0),
    'start_rolls', coalesce((select start_rolls from public.student_records where character_id = p_character), '[]'::jsonb),
    -- rendimento degli anni passati (i già iscritti lo scelgono una volta)
    'profile', (
      select jsonb_build_object(
        'current', coalesce(sr.academic_profile, public.uni_profile_of(p_character)),
        'chosen', sr.profile_chosen,
        'can_choose', not sr.profile_chosen and coalesce(sr.start_gpa_credits, 0) > 0 and sr.academic_status <> 'graduated',
        'px', (select px from public.characters where id = p_character),
        'sufficiente', public.uni_profile_band('sufficiente'),
        'options', coalesce((
          select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'cost_px', o.cost_px, 'description', o.description,
            'band', public.uni_profile_band(o.effects -> 0 ->> 'value')) order by o.cost_px desc)
          from public.creation_options o where o.active and o.effects @> '[{"type":"academic_profile"}]'), '[]'::jsonb))
      from public.student_records sr where sr.character_id = p_character),
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
-- PERSONAGGI GIÀ ISCRITTI: anno di partenza, corsi di Minor e Pre-Med
-- riconosciuti, e un avviso per scegliere il rendimento degli anni passati
-- (finché non lo scelgono resta la media già tirata).
-- =====================================================================
do $$
declare
  r record;
  v_list numeric[] := public.uni_list('uni_crediti_partenza');
  v_base int;
  v_year int;
begin
  for r in select * from public.student_records where start_year is null loop
    v_base := r.start_credits - coalesce((public.trait_effect(r.character_id, 'start_credits') ->> 'value')::int, 0);
    v_year := 1;
    for i in 1 .. 4 loop
      if coalesce(v_list[i], 999) <= v_base then v_year := i; end if;
    end loop;
    update public.student_records set start_year = v_year where character_id = r.character_id;
    perform public.uni_recognize(r.character_id);
  end loop;

  insert into public.system_messages (user_id, body)
  select ch.owner_id,
    '🎓 Università: ora puoi scegliere com''è andata la tua carriera negli anni già frequentati (eccellente, buona, sufficiente o ai limiti). '
    || 'Ogni corso passato riceverà un voto in quella fascia. Lo trovi nella pagina Università, nel riquadro «Anni già frequentati»: si sceglie una volta sola.'
  from public.student_records sr join public.characters ch on ch.id = sr.character_id
  where not sr.profile_chosen and coalesce(sr.start_gpa_credits, 0) > 0 and sr.academic_status <> 'graduated' and ch.owner_id is not null;
end;
$$;

select ch.name as personaggio, sr.start_year as anno_di_partenza, sr.start_gpa as media_partenza,
  (select count(*) from public.academic_transfer_courses tc where tc.character_id = sr.character_id) as corsi_riconosciuti,
  case when sr.profile_chosen then 'scelto' when coalesce(sr.start_gpa_credits, 0) > 0 then 'da scegliere' else '—' end as rendimento
from public.student_records sr join public.characters ch on ch.id = sr.character_id
order by ch.name;

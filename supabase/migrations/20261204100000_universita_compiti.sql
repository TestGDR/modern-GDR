-- =====================================================================
-- UNIVERSITÀ: COMPITI DURANTE IL SEMESTRE
-- Durante il semestre in corso lo studente può fare dei compiti per ogni
-- corso: un tiro come il coursework (caratteristica + abilità + d10 +
-- tratti e impegno, contro CD − 2). Riuscito = +1 punto sul voto del corso,
-- successo critico = +2; al massimo 3 compiti e 3 punti per corso, uno ogni
-- 7 giorni (tutto in impostazioni). Il bonus si aggiunge al punteggio
-- quando la simulazione chiude il corso (bilanciato: in media +2/3 punti,
-- circa un terzo di lettera).
-- L'Università esce dalla scheda: ora è una sezione della barra laterale.
-- =====================================================================

insert into public.game_settings (key, value, kind, label, description, sort_order) values
  ('uni_compiti_max', '3', 'number', 'Università · Compiti per corso', 'Quanti compiti si possono fare per ogni corso in un semestre.', 227),
  ('uni_compiti_punti_max', '3', 'number', 'Università · Punti massimi dai compiti', 'Punti che i compiti possono aggiungere al voto di un corso.', 228),
  ('uni_compiti_punti_critico', '2', 'number', 'Università · Punti di un compito con successo critico', 'Un compito riuscito vale 1 punto; con un 10 naturale questo valore.', 229),
  ('uni_compiti_giorni', '7', 'number', 'Università · Giorni tra un compito e l''altro', 'Per lo stesso corso.', 230)
on conflict (key) do nothing;

alter table public.enrollments add column if not exists homework_bonus int not null default 0;

create table public.homework (
  id bigint generated always as identity primary key,
  enrollment_id bigint not null references public.enrollments (id) on delete cascade,
  characteristic_value int not null,
  skill_value int not null,
  d10 int not null,
  crit_type text not null check (crit_type in ('none', 'success', 'failure')),
  extra_d10 int,
  modifiers int not null default 0,
  total int not null,
  cd int not null,
  margin int not null,
  points int not null default 0,
  created_at timestamptz not null default now()
);
create index homework_enrollment_idx on public.homework (enrollment_id, created_at);

alter table public.homework enable row level security;
revoke all on public.homework from anon, authenticated;
grant select on public.homework to authenticated;
create policy "Compiti: staff" on public.homework for select to authenticated using ((select public.uni_staff()));
create policy "Compiti: solo dalle funzioni" on public.homework for insert to authenticated with check (false);
create policy "Compiti: non si modificano" on public.homework for update to authenticated using (false);
create policy "Compiti: non si cancellano" on public.homework for delete to authenticated using (false);

-- Fa un compito: tiro del database, salvato
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
begin
  select en.*, co.level, co.cd_modifier, co.attribute_id, co.skill_id, co.code, t.status as term_status
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
  v_mods := public.uni_traits(e.character_id, e.skill_id)
    + coalesce(eff[case e.effort when 'minimal' then 1 when 'normal' then 2 else 3 end], 0)::int;
  v_cd := coalesce((public.uni_list('uni_cd_livelli'))[e.level / 100], 14)::int + e.cd_modifier + coalesce((public.uni_list('uni_cd_prove'))[1], -2)::int;

  v_d := public.academic_die();
  v_extra := null;
  v_crit := 'none';
  v_dval := v_d;
  if v_d = 10 then
    v_extra := public.academic_die(); v_crit := 'success'; v_dval := 10 + v_extra;
  elsif v_d = 1 then
    v_extra := public.academic_die(); v_crit := 'failure'; v_dval := 1 - v_extra;
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
revoke execute on function public.academic_homework(bigint) from public, anon;
grant execute on function public.academic_homework(bigint) to authenticated;

-- I compiti di un personaggio (proprietario e staff)
create or replace function public.academic_homework_list(p_character uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.characters where id = p_character and owner_id = auth.uid()) and not public.uni_staff() then
    raise exception 'Non hai i permessi necessari.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', h.id, 'enrollment_id', h.enrollment_id, 'attr', h.characteristic_value, 'skill', h.skill_value,
      'd10', h.d10, 'crit', h.crit_type, 'extra', h.extra_d10, 'mods', h.modifiers, 'total', h.total, 'cd', h.cd, 'margin', h.margin,
      'points', h.points, 'created_at', h.created_at) order by h.created_at)
    from public.homework h join public.enrollments e on e.id = h.enrollment_id
    where e.character_id = p_character), '[]'::jsonb);
end;
$$;
revoke execute on function public.academic_homework_list(uuid) from public, anon;
grant execute on function public.academic_homework_list(uuid) to authenticated;

-- Quando la simulazione chiude un corso, i punti dei compiti si aggiungono al voto
create or replace function public.enrollments_homework_bonus()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bonus int;
  g record;
begin
  if old.status = 'enrolled' and new.status = 'completed' and new.final_score is not null then
    select least(coalesce(public.uni_n('uni_compiti_punti_max'), 3)::int, coalesce(sum(points), 0)::int) into v_bonus
    from public.homework where enrollment_id = new.id;
    if v_bonus > 0 then
      new.homework_bonus := v_bonus;
      new.final_score := least(100, new.final_score + v_bonus);
      select * into g from public.uni_grade(new.final_score);
      new.letter_grade := g.letter;
      new.grade_points := g.points;
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.enrollments_homework_bonus() from public, anon, authenticated;
drop trigger if exists enrollments_homework_bonus on public.enrollments;
create trigger enrollments_homework_bonus before update of status on public.enrollments
  for each row execute function public.enrollments_homework_bonus();

-- Gli avvisi di SISTEMA indicano la nuova sezione Università della barra laterale
create or replace function public.academic_term_create(p_year text, p_semester text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  u record;
begin
  perform public.uni_require_staff();
  if exists (select 1 from public.academic_terms where status <> 'published') then
    raise exception 'C''è già un semestre in corso: prima pubblica i suoi risultati.' using errcode = 'P0001';
  end if;
  insert into public.academic_terms (academic_year, semester) values (p_year, p_semester) returning id into v_id;
  for u in select distinct c.owner_id from public.characters c where c.status = 'approvata' loop
    perform public.send_system_message(u.owner_id,
      '🎓 Sono aperte le iscrizioni ai corsi del semestre ' || public.uni_term_label(p_year, p_semester)
      || '. Scegli i corsi dall''icona Università della barra laterale.');
  end loop;
  return v_id;
end;
$$;

create or replace function public.academic_publish(p_term uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.academic_terms;
  rep record;
  v_year uuid;
  v_label text;
begin
  perform public.uni_require_staff();
  select * into t from public.academic_terms where id = p_term for update;
  if t.status is distinct from 'simulated' then raise exception 'Si pubblica solo un semestre simulato.' using errcode = 'P0001'; end if;
  v_label := public.uni_term_label(t.academic_year, t.semester);
  for rep in select tr.*, c.owner_id, c.name from public.term_reports tr join public.characters c on c.id = tr.character_id where tr.term_id = p_term loop
    update public.student_records
    set credits_earned = rep.credits_total_after,
        cumulative_gpa = rep.cumulative_gpa_after,
        class_standing = rep.class_standing_after,
        academic_status = rep.standing_after,
        probation_count = rep.probation_count_after,
        after_suspension = rep.after_suspension_after,
        suspended_term_id = case when rep.standing_after = 'suspended' then p_term else null end,
        graduated_term_id = case when rep.graduated then p_term else graduated_term_id end,
        honors = case when rep.graduated then rep.honors else honors end,
        updated_at = now()
    where character_id = rep.character_id;
    -- anno di corso in scheda (Graduate dopo la laurea)
    select id into v_year from public.sheet_options
    where kind = 'anno' and sort_order = case when rep.graduated then 5
      else case rep.class_standing_after when 'freshman' then 1 when 'sophomore' then 2 when 'junior' then 3 else 4 end end
    order by id limit 1;
    if v_year is not null then
      update public.characters set year_id = v_year where id = rep.character_id;
    end if;
    perform public.send_system_message(rep.owner_id,
      '📜 Risultati di ' || v_label || ' per ' || public.first_name(rep.name) || ': ' || rep.report_text
      || E'\nLa pagella completa è nell''icona Università della barra laterale.');
  end loop;
  update public.academic_terms set status = 'published', published_at = now() where id = p_term;
end;
$$;

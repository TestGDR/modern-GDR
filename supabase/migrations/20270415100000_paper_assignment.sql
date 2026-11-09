-- =====================================================================
-- UNIVERSITÀ: PAPER E ASSIGNMENT
-- Facoltativi. Un tiro di dado fatto in chat con caratteristica + abilità
-- di un corso a cui si è iscritti (semestre in corso) si può registrare,
-- uscendo dalla chat o dalla pagina Università entro uni_lavori_ore (24),
-- come:
--   assignment: deve superare la CD del corso → +1 ai tre tiri d'esame del corso
--   paper:      deve superare la CD del corso + 2 → +2 ai tre tiri d'esame
-- Al massimo uni_lavori_max (2) assignment e 2 paper per semestre; su un
-- corso al massimo uni_lavori_tetto_corso (+2) da paper e assignment.
-- Un tiro vale una volta sola. Tutto ricontrollato qui (academic_work_register).
-- Due funzioni sole: academic_work_options (lettura) e academic_work_register.
-- =====================================================================

insert into public.game_settings (key, value, kind, label, description, sort_order) values
  ('uni_assignment_bonus', '1', 'number', 'Università · Bonus di un assignment', 'Quanto aggiunge un assignment ai tre tiri d''esame del suo corso.', 231),
  ('uni_paper_bonus', '2', 'number', 'Università · Bonus di un paper', 'Quanto aggiunge un paper ai tre tiri d''esame del suo corso.', 232),
  ('uni_paper_cd', '2', 'number', 'Università · CD in più del paper', 'Il paper deve superare la CD del corso più questo valore (l''assignment la CD del corso).', 233),
  ('uni_lavori_max', '2', 'number', 'Università · Paper e assignment per semestre', 'Quanti assignment e quanti paper (ognuno) si registrano in un semestre.', 234),
  ('uni_lavori_tetto_corso', '2', 'number', 'Università · Bonus massimo per corso', 'Quanto possono aggiungere in tutto paper e assignment ai tiri di un corso.', 235),
  ('uni_lavori_ore', '24', 'number', 'Università · Ore per registrare un tiro', 'Entro quante ore dal tiro in chat lo si registra come paper o assignment.', 236)
on conflict (key) do nothing;

create table if not exists public.academic_works (
  id bigint generated always as identity primary key,
  character_id uuid not null references public.characters (id) on delete cascade,
  term_id uuid not null references public.academic_terms (id) on delete cascade,
  enrollment_id bigint not null references public.enrollments (id) on delete cascade,
  kind text not null check (kind in ('assignment', 'paper')),
  -- il tiro della chat: vale una volta sola
  message_id bigint not null unique,
  roll_total int not null,
  cd int not null,
  bonus int not null,
  created_at timestamptz not null default now()
);
create index if not exists academic_works_character_idx on public.academic_works (character_id, term_id);
create index if not exists academic_works_enrollment_idx on public.academic_works (enrollment_id);

alter table public.academic_works enable row level security;
revoke all on public.academic_works from anon, authenticated;
grant select on public.academic_works to authenticated;
drop policy if exists "Paper e assignment: i propri e lo staff" on public.academic_works;
create policy "Paper e assignment: i propri e lo staff" on public.academic_works for select to authenticated
  using ((select public.owns_character(character_id)) or (select public.has_permission('universita.gestire')));
drop policy if exists "Paper e assignment: solo dalle funzioni (inserimento)" on public.academic_works;
create policy "Paper e assignment: solo dalle funzioni (inserimento)" on public.academic_works for insert to authenticated with check (false);
drop policy if exists "Paper e assignment: solo dalle funzioni (modifica)" on public.academic_works;
create policy "Paper e assignment: solo dalle funzioni (modifica)" on public.academic_works for update to authenticated using (false);
drop policy if exists "Paper e assignment: solo dalle funzioni (eliminazione)" on public.academic_works;
create policy "Paper e assignment: solo dalle funzioni (eliminazione)" on public.academic_works for delete to authenticated using (false);

-- Bonus di un'iscrizione (con il tetto per corso)
create or replace function public.academic_work_bonus(p_enrollment bigint)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select least(coalesce(public.uni_n('uni_lavori_tetto_corso'), 2)::int, coalesce(sum(w.bonus), 0)::int)
  from public.academic_works w where w.enrollment_id = p_enrollment;
$$;
revoke execute on function public.academic_work_bonus(bigint) from public, anon, authenticated;

-- Le scelte possibili di un tiro (per corso e tipo), già filtrate da CD e limiti
create or replace function public.academic_work_choices(p_character uuid, p_term uuid, p_roll jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'enrollment_id', x.enrollment_id, 'code', x.code, 'name', x.name, 'kind', x.kind, 'cd', x.cd, 'bonus', x.bonus)
           order by x.code, x.kind), '[]'::jsonb)
  from (
    select en.id as enrollment_id, c.code, c.name, k.kind,
           coalesce((public.uni_list('uni_cd_livelli'))[c.level / 100], 14)::int + c.cd_modifier
             + case when k.kind = 'paper' then coalesce(public.uni_n('uni_paper_cd'), 2)::int else 0 end as cd,
           case when k.kind = 'paper' then coalesce(public.uni_n('uni_paper_bonus'), 2)::int
                else coalesce(public.uni_n('uni_assignment_bonus'), 1)::int end as bonus
    from public.enrollments en
    join public.courses c on c.id = en.course_id
    join public.attributes a on a.id = c.attribute_id
    left join public.skills s on s.id = c.skill_id
    cross join (values ('assignment'), ('paper')) as k (kind)
    where en.character_id = p_character and en.term_id = p_term and en.status = 'enrolled'
      and a.code = p_roll ->> 'attribute'
      and coalesce(s.name, '') = coalesce(p_roll ->> 'skill', '')
  ) x
  where (p_roll ->> 'total')::int >= x.cd
    -- limite per semestre di quel tipo
    and (select count(*) from public.academic_works w
         where w.character_id = p_character and w.term_id = p_term and w.kind = x.kind) < coalesce(public.uni_n('uni_lavori_max'), 2)
    -- tetto del corso
    and (select coalesce(sum(w.bonus), 0) from public.academic_works w where w.enrollment_id = x.enrollment_id) + x.bonus
        <= coalesce(public.uni_n('uni_lavori_tetto_corso'), 2);
$$;
revoke execute on function public.academic_work_choices(uuid, uuid, jsonb) from public, anon, authenticated;

-- Lettura (uscendo dalla chat o dalla pagina Università): conti, registrati e tiri utilizzabili
create or replace function public.academic_work_options(p_character uuid, p_room uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_term public.academic_terms;
begin
  if not public.owns_character(p_character) then
    raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501';
  end if;
  select * into v_term from public.academic_terms where status = 'in_progress' order by created_at desc limit 1;
  if v_term.id is null or not exists (
    select 1 from public.enrollments where character_id = p_character and term_id = v_term.id and status = 'enrolled'
  ) then
    return jsonb_build_object('open', false);
  end if;
  return jsonb_build_object(
    'open', true,
    'term', public.uni_term_label(v_term.academic_year, v_term.semester),
    'max', coalesce(public.uni_n('uni_lavori_max'), 2)::int,
    'cap', coalesce(public.uni_n('uni_lavori_tetto_corso'), 2)::int,
    'hours', coalesce(public.uni_n('uni_lavori_ore'), 24)::int,
    'assignment', (select count(*) from public.academic_works w where w.character_id = p_character and w.term_id = v_term.id and w.kind = 'assignment'),
    'paper', (select count(*) from public.academic_works w where w.character_id = p_character and w.term_id = v_term.id and w.kind = 'paper'),
    'works', (select coalesce(jsonb_agg(jsonb_build_object('kind', w.kind, 'code', c.code, 'bonus', w.bonus, 'total', w.roll_total, 'cd', w.cd, 'at', w.created_at)
                order by w.created_at), '[]'::jsonb)
              from public.academic_works w join public.enrollments en on en.id = w.enrollment_id join public.courses c on c.id = en.course_id
              where w.character_id = p_character and w.term_id = v_term.id),
    'rolls', (select coalesce(jsonb_agg(jsonb_build_object(
                 'message_id', m.id, 'total', (m.roll_data ->> 'total')::int, 'attribute', m.roll_data ->> 'attribute',
                 'skill', m.roll_data ->> 'skill', 'at', m.created_at, 'room', r.name,
                 'choices', public.academic_work_choices(p_character, v_term.id, m.roll_data)) order by m.created_at desc), '[]'::jsonb)
              from public.messages m join public.rooms r on r.id = m.room_id
              where m.character_id = p_character and m.kind = 'dado' and m.roll_data is not null
                and m.created_at > now() - make_interval(hours => coalesce(public.uni_n('uni_lavori_ore'), 24)::int)
                and m.created_at > coalesce(v_term.started_at, v_term.created_at)
                and (p_room is null or m.room_id = p_room)
                and not exists (select 1 from public.academic_works w where w.message_id = m.id)
                -- solo i tiri con caratteristica e abilità di un corso del semestre
                and exists (
                  select 1 from public.enrollments en join public.courses c on c.id = en.course_id
                  join public.attributes a on a.id = c.attribute_id left join public.skills s on s.id = c.skill_id
                  where en.character_id = p_character and en.term_id = v_term.id and en.status = 'enrolled'
                    and a.code = m.roll_data ->> 'attribute' and coalesce(s.name, '') = coalesce(m.roll_data ->> 'skill', '')))
  );
end;
$$;
revoke execute on function public.academic_work_options(uuid, uuid) from public, anon;
grant execute on function public.academic_work_options(uuid, uuid) to authenticated;

-- Registra un tiro come paper o assignment (ricontrolla tutto)
create or replace function public.academic_work_register(p_character uuid, p_message bigint, p_enrollment bigint, p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_term public.academic_terms;
  m public.messages;
  v_choice jsonb;
begin
  if not public.owns_character(p_character) then
    raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501';
  end if;
  if p_kind not in ('assignment', 'paper') then
    raise exception 'Scegli paper o assignment.' using errcode = 'P0001';
  end if;
  select * into v_term from public.academic_terms where status = 'in_progress' order by created_at desc limit 1;
  if v_term.id is null then
    raise exception 'Non c''è un semestre in corso.' using errcode = 'P0001';
  end if;
  -- un tiro alla volta per personaggio
  perform 1 from public.characters where id = p_character for update;
  select * into m from public.messages where id = p_message;
  if m.id is null or m.character_id <> p_character or m.kind <> 'dado' or m.roll_data is null then
    raise exception 'Tiro non trovato.' using errcode = 'P0001';
  end if;
  if m.created_at <= now() - make_interval(hours => coalesce(public.uni_n('uni_lavori_ore'), 24)::int)
     or m.created_at <= coalesce(v_term.started_at, v_term.created_at) then
    raise exception 'Questo tiro è troppo vecchio per essere registrato.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.academic_works where message_id = p_message) then
    raise exception 'Questo tiro è già registrato.' using errcode = 'P0001';
  end if;
  select c into v_choice
  from jsonb_array_elements(public.academic_work_choices(p_character, v_term.id, m.roll_data)) c
  where (c ->> 'enrollment_id')::bigint = p_enrollment and c ->> 'kind' = p_kind;
  if v_choice is null then
    raise exception 'Non si può registrare: il tiro non supera la CD, non è del corso o hai raggiunto il limite.' using errcode = 'P0001';
  end if;
  insert into public.academic_works (character_id, term_id, enrollment_id, kind, message_id, roll_total, cd, bonus)
  values (p_character, v_term.id, p_enrollment, p_kind, p_message, (m.roll_data ->> 'total')::int,
          (v_choice ->> 'cd')::int, (v_choice ->> 'bonus')::int);
  return v_choice;
end;
$$;
revoke execute on function public.academic_work_register(uuid, bigint, bigint, text) from public, anon;
grant execute on function public.academic_work_register(uuid, bigint, bigint, text) to authenticated;

-- Simulazione degli esami: in più il bonus di paper e assignment (voce «lavori»)
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
  v_majorb int; v_job int; v_work int;
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
    -- paper e assignment registrati per questo corso
    v_work := public.academic_work_bonus(e.id);
    v_mods := v_effort + v_load + v_retake + e.master_modifier + v_majorb + v_job + e.tutor_bonus + v_work;
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
                                 'major', v_majorb, 'lavoro', v_job, 'tutor', e.tutor_bonus, 'lavori', v_work, 'master', e.master_modifier, 'nota_master', nullif(e.master_note, ''), 'totale', v_mods + v_traits,
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

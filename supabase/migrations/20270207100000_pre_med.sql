-- =====================================================================
-- COLLEGE ALL'AMERICANA: NIENTE INDIRIZZI POST-LAUREA, PERCORSO PRE-MED
-- 1. Medicina e Giurisprudenza negli Stati Uniti sono scuole dopo il
--    college: «Medicina» diventa il Major «Scienze biomediche» (anche il
--    dipartimento dei corsi MED), «Giurisprudenza» diventa «Studi
--    giuridici». Chi li aveva resta iscritto con il nome nuovo.
-- 2. Corsi nuovi: Fisica generale, Biochimica, Sociologia. Patologia e
--    Medicina d'urgenza diventano corsi da college.
-- 3. Percorso Pre-Med: si segue con qualsiasi Major (pagina Università),
--    elenco dei corsi richiesti dalle scuole di medicina in
--    premed_courses; chi lo segue ha il bonus del Major (+1, non si somma)
--    nei corsi di Scienze biomediche; completato (tutti con almeno C−)
--    compare nella pagella della laurea.
-- =====================================================================

-- 1. INDIRIZZI
update public.sheet_options set name = 'Scienze biomediche' where kind = 'indirizzo' and name = 'Medicina';
update public.sheet_options set name = 'Studi giuridici' where kind = 'indirizzo' and name = 'Giurisprudenza';

update public.courses set department = 'Scienze biomediche' where department = 'Medicina';
-- le voci con il dipartimento scelto (Talento naturale, Lacune di base…)
update public.character_options set choice_value = 'Scienze biomediche'
where choice_value = 'Medicina'
  and option_id in (select id from public.creation_options where effects::text like '%department%');

update public.courses set name = 'Fondamenti di malattie umane',
  description = 'Come nascono le malattie e come si riconoscono: la base per chi punta a medicina.'
where code = 'MED 330';
update public.courses set code = 'MED 240', name = 'Primo soccorso ed EMT', level = 200,
  description = 'La certificazione da Emergency Medical Technician: soccorso, triage, turni in ambulanza.'
where code = 'MED 420';

-- 2. CORSI NUOVI
insert into public.courses (code, name, department, credits, level, attribute_id, skill_id, description, area)
select v.code, v.name, v.dept, v.credits, v.level, a.id, s.id, v.descr, v.area
from (values
  ('PHYS 101', 'Fisica generale', 'Scienze naturali', 4, 100, 'INT', 'Scienze naturali', 'Meccanica, elettricità e onde. Con laboratorio.', 'stem'),
  ('BIOC 310', 'Biochimica', 'Scienze naturali', 3, 300, 'INT', 'Scienze naturali', 'Proteine, enzimi e metabolismo: la chimica della vita.', 'stem'),
  ('SOC 101', 'Introduzione alla sociologia', 'Scienze sociali e diritto', 3, 100, 'INT', 'Scienze sociali ed economia', 'Società, gruppi, disuguaglianze.', 'umanistica')
) as v (code, name, dept, credits, level, attr, skill, descr, area)
join public.attributes a on a.code = v.attr
left join public.skills s on s.name = v.skill
on conflict (code) do nothing;

insert into public.course_prerequisites (course_id, prerequisite_id)
select c.id, p.id from public.courses c join public.courses p on p.code = 'CHEM 201'
where c.code = 'BIOC 310'
on conflict do nothing;

-- corsi obbligatori di Scienze biomediche
delete from public.major_required_courses
where major_id = (select id from public.sheet_options where kind = 'indirizzo' and name = 'Scienze biomediche');
insert into public.major_required_courses (major_id, course_id)
select o.id, c.id
from public.sheet_options o
join public.courses c on c.code in ('BIO 101', 'CHEM 101', 'CHEM 201', 'BIOC 310', 'MED 101', 'MED 220')
where o.kind = 'indirizzo' and o.name = 'Scienze biomediche'
on conflict do nothing;

-- 3. PRE-MED
create table if not exists public.premed_courses (
  course_id uuid primary key references public.courses (id) on delete cascade,
  sort_order int not null default 0
);
alter table public.premed_courses enable row level security;
revoke all on public.premed_courses from anon;
drop policy if exists "Pre-Med: corsi letti da tutti" on public.premed_courses;
create policy "Pre-Med: corsi letti da tutti" on public.premed_courses for select to authenticated using (true);
drop policy if exists "Pre-Med: lo staff aggiunge" on public.premed_courses;
create policy "Pre-Med: lo staff aggiunge" on public.premed_courses for insert to authenticated
  with check ((select public.has_permission('universita.gestire')));
drop policy if exists "Pre-Med: lo staff modifica" on public.premed_courses;
create policy "Pre-Med: lo staff modifica" on public.premed_courses for update to authenticated
  using ((select public.has_permission('universita.gestire'))) with check ((select public.has_permission('universita.gestire')));
drop policy if exists "Pre-Med: lo staff toglie" on public.premed_courses;
create policy "Pre-Med: lo staff toglie" on public.premed_courses for delete to authenticated
  using ((select public.has_permission('universita.gestire')));
drop trigger if exists premed_courses_log on public.premed_courses;
create trigger premed_courses_log after insert or update or delete on public.premed_courses
  for each row execute function public.log_admin_change();

insert into public.premed_courses (course_id, sort_order)
select c.id, v.ord
from (values ('BIO 101', 1), ('CHEM 101', 2), ('CHEM 201', 3), ('PHYS 101', 4), ('BIOC 310', 5), ('MATH 201', 6), ('PSY 101', 7), ('SOC 101', 8))
  as v (code, ord)
join public.courses c on c.code = v.code
on conflict (course_id) do nothing;

-- chi segue il percorso (si scrive solo con academic_set_premed)
create table if not exists public.premed_students (
  character_id uuid primary key references public.characters (id) on delete cascade,
  since timestamptz not null default now()
);
alter table public.premed_students enable row level security;
revoke all on public.premed_students from anon;
drop policy if exists "Pre-Med: il proprietario e lo staff" on public.premed_students;
create policy "Pre-Med: il proprietario e lo staff" on public.premed_students for select to authenticated
  using (exists (select 1 from public.characters c where c.id = character_id and c.owner_id = (select auth.uid()))
         or (select public.has_permission('universita.gestire')));
drop policy if exists "Pre-Med: solo dalla funzione" on public.premed_students;
create policy "Pre-Med: solo dalla funzione" on public.premed_students for insert to authenticated with check (false);
drop policy if exists "Pre-Med: non si modifica" on public.premed_students;
create policy "Pre-Med: non si modifica" on public.premed_students for update to authenticated using (false);
drop policy if exists "Pre-Med: non si cancella" on public.premed_students;
create policy "Pre-Med: non si cancella" on public.premed_students for delete to authenticated using (false);

create or replace function public.academic_set_premed(p_character uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.owns_character(p_character) then raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501'; end if;
  if p_on then
    insert into public.premed_students (character_id) values (p_character) on conflict do nothing;
  else
    delete from public.premed_students where character_id = p_character;
  end if;
end;
$$;
revoke execute on function public.academic_set_premed(uuid, boolean) from public, anon;
grant execute on function public.academic_set_premed(uuid, boolean) to authenticated;

-- stato del percorso (p_term = anche quel semestre non ancora pubblicato)
create or replace function public.uni_premed_status(p_character uuid, p_term uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with req as (
    select co.id, co.code, co.name, co.credits, pc.sort_order,
      (select e.grade_points from public.enrollments e join public.academic_terms t on t.id = e.term_id
       where e.character_id = p_character and e.course_id = co.id and e.status = 'completed'
         and (t.status = 'published' or t.id = p_term)
       order by t.created_at desc, e.id desc limit 1) as grade_points
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
revoke execute on function public.uni_premed_status(uuid, uuid) from public, anon, authenticated;

-- bonus del Major: anche per chi segue il Pre-Med, nei corsi di Scienze biomediche (non si somma)
create or replace function public.uni_major_course(p_character uuid, p_department text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(btrim(p_department), '') <> '' and (
    exists (
      select 1 from public.characters ch
      join public.major_required_courses m on m.major_id = ch.study_track_id
      join public.courses c on c.id = m.course_id
      where ch.id = p_character and lower(c.department) = lower(btrim(p_department)))
    or (lower(btrim(p_department)) = 'scienze biomediche'
        and exists (select 1 from public.premed_students where character_id = p_character)))
$$;
revoke execute on function public.uni_major_course(uuid, text) from public, anon, authenticated;

-- pagina Università: anche il Pre-Med
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
    'job_malus', coalesce(public.uni_n('uni_lavoro_full_malus'), 1)::int,
    'tutor_price', coalesce(public.setting_int('servizio_tutor'), 400),
    'tutor_max', coalesce(public.setting_int('servizio_tutor_max'), 2),
    'tutored', coalesce((
      select jsonb_agg(e.id) from public.enrollments e join public.academic_terms t on t.id = e.term_id
      where e.character_id = p_character and e.tutor_bonus > 0 and t.status <> 'published'), '[]'::jsonb));
end;
$$;
revoke execute on function public.academic_extras(uuid) from public, anon;
grant execute on function public.academic_extras(uuid) to authenticated;

-- pagella della laurea: «Pre-Med completato»
create or replace function public.term_reports_premed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.graduated and (public.uni_premed_status(new.character_id, new.term_id) ->> 'complete')::boolean then
    new.report_text := coalesce(new.report_text, '') || ' · Pre-Med completato';
  end if;
  return new;
end;
$$;
revoke execute on function public.term_reports_premed() from public, anon, authenticated;
drop trigger if exists term_reports_premed on public.term_reports;
create trigger term_reports_premed before insert on public.term_reports
  for each row execute function public.term_reports_premed();

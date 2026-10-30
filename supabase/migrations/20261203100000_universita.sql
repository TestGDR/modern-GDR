-- =====================================================================
-- SISTEMA ACCADEMICO (college americano)
-- Dal documento "Sistema Accademico – Specifica per Claude Code".
-- Semestri Fall/Spring, iscrizione ai corsi, esami risolti con il tiro
-- Interlock (caratteristica + abilità + d10, 10 → +d10, 1 → −d10, senza
-- catena), voti in lettere, GPA con grade replacement, anno di corso dai
-- crediti, probation/sospensione/espulsione, Dean's List, laurea e lodi.
--
-- Adattamenti al progetto (decisi con l'utente, 30/10/2026):
-- - i valori "CONFIG" stanno in game_settings (chiavi uni_*), modificabili
--   da Gestione → Università, non in un file di codice;
-- - tiri e calcoli nel database, in una transazione, con il permesso
--   universita.gestire (niente chiave segreta);
-- - il Major è l'Indirizzo della scheda (sheet_options 'indirizzo'):
--   si aggiungono solo i corsi obbligatori;
-- - crediti di partenza dall'anno scelto in creazione (Sophomore 30,
--   Junior 60, Senior 90, fuori dal GPA); i Graduate non seguono questi corsi;
-- - CD bilanciate sui valori del gioco (simulazione Monte Carlo): 14/15/16/17;
-- - voti e pagelle li vedono il proprietario e lo staff; i risultati
--   arrivano ai giocatori solo dopo la pubblicazione.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ABILITÀ NUOVA PER I CORSI (Ingegneria non aveva un'abilità)
-- ---------------------------------------------------------------------
insert into public.skills (attribute_id, name, description, category, sort_order)
select a.id, 'Ingegneria e progettazione', 'Progettare, calcolare strutture e circuiti, disegno tecnico', 'Studio', 12
from public.attributes a
where a.code = 'INT' and not exists (select 1 from public.skills where lower(name) = 'ingegneria e progettazione');

-- ---------------------------------------------------------------------
-- 2. IMPOSTAZIONI (CONFIG) IN game_settings
-- ---------------------------------------------------------------------
alter table public.game_settings drop constraint if exists game_settings_kind_check;
alter table public.game_settings add constraint game_settings_kind_check check (kind in ('number', 'numbers', 'level', 'decimal'));

insert into public.game_settings (key, value, kind, label, description, sort_order) values
  ('uni_cd_livelli', '[14, 15, 16, 17]', 'numbers', 'Università · CD base per livello', 'CD dei corsi 100, 200, 300 e 400 (prima del modificatore del singolo corso).', 201),
  ('uni_cd_prove', '[-2, 0, 1]', 'numbers', 'Università · Correzione CD delle prove', 'Coursework, midterm e final: si sommano alla CD base.', 202),
  ('uni_pesi_prove', '[20, 30, 50]', 'numbers', 'Università · Peso delle prove (%)', 'Coursework, midterm e final nel punteggio del corso.', 203),
  ('uni_punteggio_base', '75', 'number', 'Università · Punteggio a margine zero', 'Punteggio di una prova con TOTALE = CD.', 204),
  ('uni_punti_per_margine', '4', 'number', 'Università · Punti per ogni punto di margine', 'PUNTEGGIO = base + margine × questo valore (tra 0 e 100).', 205),
  ('uni_soglie_voti', '[93, 90, 87, 83, 80, 77, 73, 70, 67, 63, 60]', 'numbers', 'Università · Soglie dei voti', 'Punteggio minimo di A, A−, B+, B, B−, C+, C, C−, D+, D, D− (sotto: F).', 206),
  ('uni_impegno', '[-2, 0, 2]', 'numbers', 'Università · Modificatore dell''impegno', 'Minimo, normale, intenso: si somma a tutti i tiri del semestre.', 207),
  ('uni_crediti_min', '12', 'number', 'Università · Crediti minimi (full-time)', 'Sotto questa soglia l''iscrizione è segnalata come incompleta.', 208),
  ('uni_crediti_max', '18', 'number', 'Università · Crediti massimi', 'Massimo di crediti per semestre.', 209),
  ('uni_crediti_max_intenso', '15', 'number', 'Università · Crediti massimi con impegno intenso', 'Chi sceglie l''impegno intenso non può superarli.', 210),
  ('uni_carico_pesante_oltre', '15', 'number', 'Università · Carico pesante oltre', 'Oltre questi crediti scatta il malus del carico pesante.', 211),
  ('uni_carico_pesante_malus', '1', 'number', 'Università · Malus del carico pesante', 'Si toglie a tutti i tiri del semestre.', 212),
  ('uni_bonus_ripetizione', '1', 'number', 'Università · Bonus di chi ripete dopo una F', 'Si somma ai tiri del corso ripetuto.', 213),
  ('uni_master_max', '3', 'number', 'Università · Bonus/malus massimo del Master', 'Il Master può dare da −questo a +questo per PG e corso.', 214),
  ('uni_voto_minimo_requisiti', '1.7', 'decimal', 'Università · Grade points minimi per prerequisiti e obbligatori', '1.7 = C−. Serve per i prerequisiti e per i corsi obbligatori del Major.', 215),
  ('uni_blocco_livelli', '1', 'number', 'Università · Corsi 300/400 solo a Junior/Senior', '1 = sì, 0 = no.', 216),
  ('uni_soglie_anno', '[30, 60, 90]', 'numbers', 'Università · Crediti per l''anno di corso', 'Crediti per diventare Sophomore, Junior e Senior.', 217),
  ('uni_crediti_partenza', '[0, 30, 60, 90]', 'numbers', 'Università · Crediti di partenza per anno', 'Crediti già riconosciuti a chi è creato Freshman, Sophomore, Junior, Senior (fuori dal GPA).', 218),
  ('uni_crediti_laurea', '120', 'number', 'Università · Crediti per la laurea', 'Bachelor''s degree.', 219),
  ('uni_gpa_minimo', '2.0', 'decimal', 'Università · GPA minimo', 'Sotto questo GPA cumulativo si va in probation; serve anche per la laurea.', 220),
  ('uni_deans_gpa', '3.5', 'decimal', 'Università · GPA per la Dean''s List', 'GPA del semestre.', 221),
  ('uni_deans_crediti', '12', 'number', 'Università · Crediti per la Dean''s List', 'Crediti con voto nel semestre.', 222),
  ('uni_lode_cum', '3.5', 'decimal', 'Università · Cum laude', 'GPA cumulativo alla laurea.', 223),
  ('uni_lode_magna', '3.7', 'decimal', 'Università · Magna cum laude', 'GPA cumulativo alla laurea.', 224),
  ('uni_lode_summa', '3.9', 'decimal', 'Università · Summa cum laude', 'GPA cumulativo alla laurea.', 225),
  ('uni_mesi_semestre', '6', 'number', 'Università · Mesi tra un semestre e l''altro', 'Dopo questi mesi lo staff riceve un promemoria (la simulazione la lancia sempre il Master).', 226)
on conflict (key) do nothing;

-- le impostazioni dell'università le modifica anche chi gestisce l'università
create policy "Impostazioni dell'università: modifica con permesso"
  on public.game_settings for update to authenticated
  using (key like 'uni\_%' and (select public.has_permission('universita.gestire')))
  with check (key like 'uni\_%' and (select public.has_permission('universita.gestire')));

create or replace function public.uni_n(p_key text)
returns numeric
language sql
stable
set search_path = ''
as $$ select (value #>> '{}')::numeric from public.game_settings where key = p_key $$;

create or replace function public.uni_list(p_key text)
returns numeric[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(x::numeric order by i), '{}')
  from public.game_settings s, jsonb_array_elements_text(s.value) with ordinality as t (x, i)
  where s.key = p_key and jsonb_typeof(s.value) = 'array'
$$;

-- Voto in lettere e grade points dal punteggio (scala standard US, soglie in impostazioni)
create or replace function public.uni_grade(p_score int, out letter text, out points numeric)
language plpgsql
stable
set search_path = ''
as $$
declare
  t numeric[] := public.uni_list('uni_soglie_voti');
  letters text[] := array['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-'];
  pts numeric[] := array[4.0, 3.7, 3.3, 3.0, 2.7, 2.3, 2.0, 1.7, 1.3, 1.0, 0.7];
begin
  for i in 1..11 loop
    if p_score >= coalesce(t[i], 1000) then
      letter := letters[i];
      points := pts[i];
      return;
    end if;
  end loop;
  letter := 'F';
  points := 0;
end;
$$;

create or replace function public.uni_points(p_letter text)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case p_letter when 'A' then 4.0 when 'A-' then 3.7 when 'B+' then 3.3 when 'B' then 3.0 when 'B-' then 2.7
    when 'C+' then 2.3 when 'C' then 2.0 when 'C-' then 1.7 when 'D+' then 1.3 when 'D' then 1.0 when 'D-' then 0.7 else 0 end
$$;

-- Anno di corso dai crediti
create or replace function public.uni_class(p_credits int)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_credits >= coalesce((public.uni_list('uni_soglie_anno'))[3], 90) then 'senior'
    when p_credits >= coalesce((public.uni_list('uni_soglie_anno'))[2], 60) then 'junior'
    when p_credits >= coalesce((public.uni_list('uni_soglie_anno'))[1], 30) then 'sophomore'
    else 'freshman' end
$$;

-- "Fall 2026", "Spring 2027"
create or replace function public.uni_term_label(p_year text, p_semester text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_semester when 'fall' then 'Fall ' || split_part(p_year, '-', 1)
    else 'Spring ' || (split_part(p_year, '-', 1)::int + 1)::text end
$$;

revoke execute on function public.uni_n(text), public.uni_list(text), public.uni_grade(int), public.uni_points(text),
  public.uni_class(int), public.uni_term_label(text, text) from public, anon;
grant execute on function public.uni_n(text), public.uni_list(text), public.uni_grade(int), public.uni_points(text),
  public.uni_class(int), public.uni_term_label(text, text) to authenticated;

-- Staff dell'università (o chi vede tutte le schede)
create or replace function public.uni_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select public.has_permission('universita.gestire') or public.has_permission('personaggi.vedere_tutti') $$;
revoke execute on function public.uni_staff() from public, anon;
grant execute on function public.uni_staff() to authenticated;

-- Permesso al livello Master (l'Amministratore li ha già tutti)
update public.user_levels
set permissions = array_append(permissions, 'universita.gestire')
where name = 'Master' and not ('universita.gestire' = any (permissions));

-- ---------------------------------------------------------------------
-- 3. CATALOGO: CORSI, PREREQUISITI, CORSI OBBLIGATORI DEGLI INDIRIZZI
-- ---------------------------------------------------------------------
create table public.courses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (char_length(code) between 2 and 12),
  name text not null check (char_length(name) between 2 and 80),
  department text not null default '' check (char_length(department) <= 60),
  credits int not null default 3 check (credits between 1 and 6),
  level int not null check (level in (100, 200, 300, 400)),
  attribute_id uuid not null references public.attributes (id) on delete restrict,
  skill_id uuid references public.skills (id) on delete set null,
  cd_modifier int not null default 0 check (cd_modifier between -5 and 5),
  description text not null default '' check (char_length(description) <= 500),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index courses_attribute_idx on public.courses (attribute_id);
create index courses_skill_idx on public.courses (skill_id);

create table public.course_prerequisites (
  course_id uuid not null references public.courses (id) on delete cascade,
  prerequisite_id uuid not null references public.courses (id) on delete cascade,
  min_grade text not null default 'C-' check (min_grade in ('A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-')),
  primary key (course_id, prerequisite_id),
  check (course_id <> prerequisite_id)
);
create index course_prerequisites_prereq_idx on public.course_prerequisites (prerequisite_id);

create table public.major_required_courses (
  major_id uuid not null references public.sheet_options (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  primary key (major_id, course_id)
);
create index major_required_courses_course_idx on public.major_required_courses (course_id);

alter table public.courses enable row level security;
alter table public.course_prerequisites enable row level security;
alter table public.major_required_courses enable row level security;
revoke all on public.courses, public.course_prerequisites, public.major_required_courses from anon, authenticated;
grant select, insert, update, delete on public.courses, public.course_prerequisites, public.major_required_courses to authenticated;
create policy "Corsi: li leggono tutti" on public.courses for select to authenticated using (true);
create policy "Corsi: li crea lo staff" on public.courses for insert to authenticated with check ((select public.has_permission('universita.gestire')));
create policy "Corsi: li modifica lo staff" on public.courses for update to authenticated
  using ((select public.has_permission('universita.gestire'))) with check ((select public.has_permission('universita.gestire')));
create policy "Corsi: li elimina lo staff" on public.courses for delete to authenticated using ((select public.has_permission('universita.gestire')));
create policy "Prerequisiti: li leggono tutti" on public.course_prerequisites for select to authenticated using (true);
create policy "Prerequisiti: li crea lo staff" on public.course_prerequisites for insert to authenticated with check ((select public.has_permission('universita.gestire')));
create policy "Prerequisiti: li modifica lo staff" on public.course_prerequisites for update to authenticated
  using ((select public.has_permission('universita.gestire'))) with check ((select public.has_permission('universita.gestire')));
create policy "Prerequisiti: li elimina lo staff" on public.course_prerequisites for delete to authenticated using ((select public.has_permission('universita.gestire')));
create policy "Obbligatori: li leggono tutti" on public.major_required_courses for select to authenticated using (true);
create policy "Obbligatori: li crea lo staff" on public.major_required_courses for insert to authenticated with check ((select public.has_permission('universita.gestire')));
create policy "Obbligatori: li modifica lo staff" on public.major_required_courses for update to authenticated
  using ((select public.has_permission('universita.gestire'))) with check ((select public.has_permission('universita.gestire')));
create policy "Obbligatori: li elimina lo staff" on public.major_required_courses for delete to authenticated using ((select public.has_permission('universita.gestire')));

create trigger courses_log after insert or update or delete on public.courses
  for each row execute function public.log_admin_change();
create trigger course_prerequisites_log after insert or update or delete on public.course_prerequisites
  for each row execute function public.log_admin_change();
create trigger major_required_courses_log after insert or update or delete on public.major_required_courses
  for each row execute function public.log_admin_change();

-- ---------------------------------------------------------------------
-- 4. SEMESTRI, CARRIERE, ISCRIZIONI, TIRI, PAGELLE
-- ---------------------------------------------------------------------
create table public.academic_terms (
  id uuid primary key default gen_random_uuid(),
  academic_year text not null check (academic_year ~ '^[0-9]{4}-[0-9]{2}$'),
  semester text not null check (semester in ('fall', 'spring')),
  status text not null default 'registration_open' check (status in ('registration_open', 'in_progress', 'simulated', 'published')),
  withdraw_open boolean not null default true,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  simulated_at timestamptz,
  published_at timestamptz,
  reminded_at timestamptz,
  unique (academic_year, semester)
);
-- un solo semestre non ancora pubblicato alla volta
create unique index academic_terms_one_open on public.academic_terms ((true)) where status <> 'published';

create table public.student_records (
  character_id uuid primary key references public.characters (id) on delete cascade,
  start_credits int not null default 0,
  -- crediti ottenuti in tutto (compresi quelli di partenza)
  credits_earned int not null default 0,
  cumulative_gpa numeric(3, 2),
  class_standing text not null default 'freshman' check (class_standing in ('freshman', 'sophomore', 'junior', 'senior')),
  academic_status text not null default 'good_standing'
    check (academic_status in ('good_standing', 'probation', 'suspended', 'dismissed', 'graduated')),
  probation_count int not null default 0,
  -- rientrato dopo una sospensione: se fallisce di nuovo, espulso
  after_suspension boolean not null default false,
  suspended_term_id uuid references public.academic_terms (id) on delete set null,
  enrolled_since_term_id uuid references public.academic_terms (id) on delete set null,
  graduated_term_id uuid references public.academic_terms (id) on delete set null,
  honors text,
  updated_at timestamptz not null default now()
);
create index student_records_suspended_idx on public.student_records (suspended_term_id);
create index student_records_since_idx on public.student_records (enrolled_since_term_id);
create index student_records_graduated_idx on public.student_records (graduated_term_id);

create table public.enrollments (
  id bigint generated always as identity primary key,
  character_id uuid not null references public.characters (id) on delete cascade,
  term_id uuid not null references public.academic_terms (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete restrict,
  effort text not null default 'normal' check (effort in ('minimal', 'normal', 'intense')),
  master_modifier int not null default 0 check (master_modifier between -10 and 10),
  master_note text not null default '' check (char_length(master_note) <= 200),
  status text not null default 'enrolled' check (status in ('enrolled', 'withdrawn', 'completed')),
  final_score int,
  letter_grade text,
  grade_points numeric(2, 1),
  is_retake boolean not null default false,
  retake_after_f boolean not null default false,
  counts_in_gpa boolean not null default false,
  created_at timestamptz not null default now(),
  unique (character_id, term_id, course_id)
);
create index enrollments_term_idx on public.enrollments (term_id);
create index enrollments_course_idx on public.enrollments (course_id);

create table public.exam_rolls (
  id bigint generated always as identity primary key,
  enrollment_id bigint not null references public.enrollments (id) on delete cascade,
  exam_type text not null check (exam_type in ('coursework', 'midterm', 'final')),
  characteristic_value int not null,
  skill_value int not null,
  d10 int not null,
  crit_type text not null check (crit_type in ('none', 'success', 'failure')),
  extra_d10 int,
  modifiers jsonb not null default '{}',
  total int not null,
  cd int not null,
  margin int not null,
  score int not null,
  created_at timestamptz not null default now()
);
create index exam_rolls_enrollment_idx on public.exam_rolls (enrollment_id);

create table public.term_reports (
  character_id uuid not null references public.characters (id) on delete cascade,
  term_id uuid not null references public.academic_terms (id) on delete cascade,
  credits_attempted int not null default 0,
  credits_earned int not null default 0,
  term_gpa numeric(3, 2),
  cumulative_gpa_after numeric(3, 2),
  credits_total_after int not null default 0,
  standing_before text not null,
  standing_after text not null,
  class_standing_after text not null,
  probation_count_after int not null default 0,
  after_suspension_after boolean not null default false,
  deans_list boolean not null default false,
  graduated boolean not null default false,
  honors text,
  report_text text not null default '',
  created_at timestamptz not null default now(),
  primary key (character_id, term_id)
);
create index term_reports_term_idx on public.term_reports (term_id);

alter table public.academic_terms enable row level security;
alter table public.student_records enable row level security;
alter table public.enrollments enable row level security;
alter table public.exam_rolls enable row level security;
alter table public.term_reports enable row level security;
revoke all on public.academic_terms, public.student_records, public.enrollments, public.exam_rolls, public.term_reports from anon, authenticated;
grant select on public.academic_terms, public.student_records, public.enrollments, public.exam_rolls, public.term_reports to authenticated;
-- i semestri li vedono tutti; il resto solo lo staff (i giocatori leggono il proprio con academic_overview)
create policy "Semestri: li leggono tutti" on public.academic_terms for select to authenticated using (true);
create policy "Semestri: solo dalle funzioni" on public.academic_terms for insert to authenticated with check (false);
create policy "Semestri: modificati dalle funzioni" on public.academic_terms for update to authenticated using (false);
create policy "Semestri: eliminati dalle funzioni" on public.academic_terms for delete to authenticated using (false);
create policy "Carriere: staff" on public.student_records for select to authenticated using ((select public.uni_staff()));
create policy "Carriere: solo dalle funzioni" on public.student_records for insert to authenticated with check (false);
create policy "Carriere: modificate dalle funzioni" on public.student_records for update to authenticated using (false);
create policy "Carriere: eliminate dalle funzioni" on public.student_records for delete to authenticated using (false);
create policy "Iscrizioni: staff" on public.enrollments for select to authenticated using ((select public.uni_staff()));
create policy "Iscrizioni: solo dalle funzioni" on public.enrollments for insert to authenticated with check (false);
create policy "Iscrizioni: modificate dalle funzioni" on public.enrollments for update to authenticated using (false);
create policy "Iscrizioni: eliminate dalle funzioni" on public.enrollments for delete to authenticated using (false);
create policy "Tiri d'esame: staff" on public.exam_rolls for select to authenticated using ((select public.uni_staff()));
create policy "Tiri d'esame: solo dalle funzioni" on public.exam_rolls for insert to authenticated with check (false);
create policy "Tiri d'esame: non si modificano" on public.exam_rolls for update to authenticated using (false);
create policy "Tiri d'esame: non si cancellano" on public.exam_rolls for delete to authenticated using (false);
create policy "Pagelle: staff" on public.term_reports for select to authenticated using ((select public.uni_staff()));
create policy "Pagelle: solo dalle funzioni" on public.term_reports for insert to authenticated with check (false);
create policy "Pagelle: modificate dalle funzioni" on public.term_reports for update to authenticated using (false);
create policy "Pagelle: eliminate dalle funzioni" on public.term_reports for delete to authenticated using (false);

create trigger academic_terms_log after insert or update or delete on public.academic_terms
  for each row execute function public.log_admin_change();

-- ---------------------------------------------------------------------
-- 5. DADI E MODIFICATORI
-- ---------------------------------------------------------------------
-- d10 con generatore crittografico (gen_random_uuid); per i test i risultati
-- si impongono con la variabile di sessione app.dadi_test ("7,10,3"), non raggiungibile dal sito
create or replace function public.academic_die()
returns int
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_list text := nullif(current_setting('app.dadi_test', true), '');
  v_first text;
begin
  if v_list is not null then
    v_first := split_part(v_list, ',', 1);
    perform set_config('app.dadi_test', substr(v_list, char_length(v_first) + 2), true);
    return v_first::int;
  end if;
  return 1 + (('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 7))::bit(28)::int % 10);
end;
$$;
revoke execute on function public.academic_die() from public, anon, authenticated;

-- Vantaggi e svantaggi della scheda sull'abilità del corso (tetto ±3 come nei tiri normali)
create or replace function public.uni_traits(p_character uuid, p_skill uuid)
returns int
language sql
stable
set search_path = ''
as $$
  select greatest(-coalesce(public.setting_int('tetto_modificatori'), 3),
         least(coalesce(public.setting_int('tetto_modificatori'), 3), coalesce(sum(o.roll_modifier), 0)::int))
  from public.character_options co
  join public.creation_options o on o.id = co.option_id
  where co.character_id = p_character
    and o.roll_modifier is not null
    and (o.roll_skill_id is null or o.roll_skill_id = p_skill)
$$;
revoke execute on function public.uni_traits(uuid, uuid) from public, anon, authenticated;

-- Ultimo tentativo pubblicato di un corso (grade points), null se mai fatto
create or replace function public.uni_last_points(p_character uuid, p_course uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select e.grade_points from public.enrollments e join public.academic_terms t on t.id = e.term_id
  where e.character_id = p_character and e.course_id = p_course and e.status = 'completed' and t.status = 'published'
  order by t.created_at desc, e.id desc limit 1
$$;
revoke execute on function public.uni_last_points(uuid, uuid) from public, anon, authenticated;

-- Carriera dello studente (la crea con i crediti di partenza dell'anno scelto in scheda)
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
  v_start := coalesce((public.uni_list('uni_crediti_partenza'))[greatest(1, least(4, coalesce(v_year, 1)))], 0)::int;
  insert into public.student_records (character_id, start_credits, credits_earned, class_standing)
  values (p_character, v_start, v_start, public.uni_class(v_start))
  returning * into r;
  return r;
end;
$$;
revoke execute on function public.uni_record(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. ISCRIZIONE (giocatore)
-- ---------------------------------------------------------------------
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
  if v_credits + co.credits > v_max then
    raise exception 'Superi il massimo di % crediti per il semestre.', v_max using errcode = 'P0001';
  end if;

  insert into public.enrollments (character_id, term_id, course_id, effort, is_retake, retake_after_f)
  values (p_character, p_term, p_course, v_effort, v_last is not null, coalesce(v_last_letter = 'F', false));
  update public.student_records set enrolled_since_term_id = coalesce(enrolled_since_term_id, p_term), updated_at = now()
  where character_id = p_character;
end;
$$;

-- Toglie un corso durante le iscrizioni
create or replace function public.academic_drop(p_term uuid, p_character uuid, p_course uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.owns_character(p_character) then raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501'; end if;
  if (select status from public.academic_terms where id = p_term) is distinct from 'registration_open' then
    raise exception 'Le iscrizioni sono chiuse: ora si può solo ritirare il corso (W).' using errcode = 'P0001';
  end if;
  delete from public.enrollments where character_id = p_character and term_id = p_term and course_id = p_course;
end;
$$;

-- Impegno del semestre (minimo, normale, intenso)
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

-- Ritiro (W) durante il semestre, finché lo staff lo consente
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
  update public.enrollments set status = 'withdrawn' where id = p_enrollment;
end;
$$;

revoke execute on function public.academic_enroll(uuid, uuid, uuid), public.academic_drop(uuid, uuid, uuid),
  public.academic_set_effort(uuid, uuid, text), public.academic_withdraw(bigint) from public, anon;
grant execute on function public.academic_enroll(uuid, uuid, uuid), public.academic_drop(uuid, uuid, uuid),
  public.academic_set_effort(uuid, uuid, text), public.academic_withdraw(bigint) to authenticated;

-- ---------------------------------------------------------------------
-- 7. SEMESTRI E MODIFICATORI (staff)
-- ---------------------------------------------------------------------
create or replace function public.uni_require_staff()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_permission('universita.gestire') then
    raise exception 'Non hai il permesso di gestire l''università.' using errcode = '42501';
  end if;
end;
$$;
revoke execute on function public.uni_require_staff() from public, anon, authenticated;

-- Nuovo semestre con le iscrizioni aperte (avviso a tutti i personaggi approvati)
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
      || '. Scegli i corsi dalla tua Scheda → Università.');
  end loop;
  return v_id;
end;
$$;

-- Iscrizioni aperte ⇄ semestre in corso
create or replace function public.academic_term_set_status(p_term uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.academic_terms;
begin
  perform public.uni_require_staff();
  select * into t from public.academic_terms where id = p_term for update;
  if t.id is null then raise exception 'Semestre non trovato.' using errcode = 'P0001'; end if;
  if not ((t.status = 'registration_open' and p_status = 'in_progress') or (t.status = 'in_progress' and p_status = 'registration_open')) then
    raise exception 'Cambio di stato non consentito.' using errcode = 'P0001';
  end if;
  update public.academic_terms set status = p_status, started_at = case when p_status = 'in_progress' then now() else started_at end
  where id = p_term;
end;
$$;

create or replace function public.academic_term_withdraw(p_term uuid, p_open boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.uni_require_staff();
  update public.academic_terms set withdraw_open = p_open where id = p_term and status in ('registration_open', 'in_progress');
  if not found then raise exception 'Semestre non modificabile.' using errcode = 'P0001'; end if;
end;
$$;

-- Elimina un semestre non ancora simulato (con le sue iscrizioni)
create or replace function public.academic_term_delete(p_term uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.uni_require_staff();
  delete from public.academic_terms where id = p_term and status in ('registration_open', 'in_progress');
  if not found then raise exception 'Si eliminano solo i semestri non ancora simulati.' using errcode = 'P0001'; end if;
end;
$$;

-- Bonus/malus del Master per PG e corso, con nota
create or replace function public.academic_set_modifier(p_enrollment bigint, p_value int, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max int := coalesce(public.uni_n('uni_master_max'), 3)::int;
begin
  perform public.uni_require_staff();
  if abs(p_value) > v_max then raise exception 'Il bonus/malus va da −% a +%.', v_max, v_max using errcode = 'P0001'; end if;
  update public.enrollments e set master_modifier = p_value, master_note = left(btrim(coalesce(p_note, '')), 200)
  where e.id = p_enrollment and e.status = 'enrolled'
    and exists (select 1 from public.academic_terms t where t.id = e.term_id and t.status in ('registration_open', 'in_progress'));
  if not found then raise exception 'Iscrizione non modificabile (semestre già simulato o corso ritirato).' using errcode = 'P0001'; end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 8. SIMULAZIONE E PUBBLICAZIONE (staff, tutto in una transazione)
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
  v_courses int := 0; v_students int := 0;
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
    select en.*, co.level, co.cd_modifier, co.attribute_id, co.skill_id, co.credits
    from public.enrollments en join public.courses co on co.id = en.course_id
    where en.term_id = p_term and en.status = 'enrolled'
    order by en.character_id, en.id
  loop
    v_attr := coalesce((select value from public.character_attributes where character_id = e.character_id and attribute_id = e.attribute_id), 0);
    v_skill := coalesce((select level from public.character_skills where character_id = e.character_id and skill_id = e.skill_id), 0);
    v_traits := public.uni_traits(e.character_id, e.skill_id);
    v_effort := coalesce(eff[case e.effort when 'minimal' then 1 when 'normal' then 2 else 3 end], 0)::int;
    select coalesce(sum(c.credits), 0) into v_term_credits
    from public.enrollments x join public.courses c on c.id = x.course_id
    where x.character_id = e.character_id and x.term_id = p_term and x.status = 'enrolled';
    v_load := case when v_term_credits > public.uni_n('uni_carico_pesante_oltre') then -public.uni_n('uni_carico_pesante_malus')::int else 0 end;
    v_retake := case when e.retake_after_f then public.uni_n('uni_bonus_ripetizione')::int else 0 end;
    v_mods := v_traits + v_effort + v_load + v_retake + e.master_modifier;
    v_cdbase := coalesce(cd_lv[e.level / 100], 14)::int + e.cd_modifier;
    v_sum := 0;
    for i in 1..3 loop
      v_d := public.academic_die();
      v_extra := null;
      v_crit := 'none';
      v_dval := v_d;
      if v_d = 10 then
        v_extra := public.academic_die();
        v_crit := 'success';
        v_dval := 10 + v_extra;
      elsif v_d = 1 then
        v_extra := public.academic_die();
        v_crit := 'failure';
        v_dval := 1 - v_extra;
      end if;
      v_total := v_attr + v_skill + v_dval + v_mods;
      v_cd := v_cdbase + coalesce(cd_off[i], 0)::int;
      v_margin := v_total - v_cd;
      v_score := greatest(0, least(100, v_base + v_margin * v_per))::int;
      insert into public.exam_rolls (enrollment_id, exam_type, characteristic_value, skill_value, d10, crit_type, extra_d10, modifiers, total, cd, margin, score)
      values (e.id, types[i], v_attr, v_skill, v_d, v_crit, v_extra,
              jsonb_build_object('tratti', v_traits, 'impegno', v_effort, 'carico', v_load, 'ripetizione', v_retake,
                                 'master', e.master_modifier, 'nota_master', nullif(e.master_note, ''), 'totale', v_mods),
              v_total, v_cd, v_margin, v_score);
      v_sum := v_sum + v_score * coalesce(w[i], 0);
    end loop;
    select * into g from public.uni_grade(round(v_sum / v_wsum)::int);
    update public.enrollments
    set status = 'completed', final_score = round(v_sum / v_wsum)::int, letter_grade = g.letter, grade_points = g.points
    where id = e.id;
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

-- Pubblica: aggiorna le carriere e l'anno in scheda, avvisa gli studenti
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
      || E'\nLa pagella completa è nella Scheda → Università.');
  end loop;
  update public.academic_terms set status = 'published', published_at = now() where id = p_term;
end;
$$;

revoke execute on function public.academic_term_create(text, text), public.academic_term_set_status(uuid, text),
  public.academic_term_withdraw(uuid, boolean), public.academic_term_delete(uuid), public.academic_set_modifier(bigint, int, text),
  public.academic_simulate(uuid), public.academic_publish(uuid) from public, anon;
grant execute on function public.academic_term_create(text, text), public.academic_term_set_status(uuid, text),
  public.academic_term_withdraw(uuid, boolean), public.academic_term_delete(uuid), public.academic_set_modifier(bigint, int, text),
  public.academic_simulate(uuid), public.academic_publish(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 9. LETTURE PER L'INTERFACCIA
-- ---------------------------------------------------------------------
-- Tiri di un'iscrizione
create or replace function public.uni_rolls_json(p_enrollment bigint)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('type', x.exam_type, 'attr', x.characteristic_value, 'skill', x.skill_value, 'd10', x.d10,
    'crit', x.crit_type, 'extra', x.extra_d10, 'mods', x.modifiers, 'total', x.total, 'cd', x.cd, 'margin', x.margin, 'score', x.score)
    order by array_position(array['coursework', 'midterm', 'final'], x.exam_type)), '[]'::jsonb)
  from public.exam_rolls x where x.enrollment_id = p_enrollment
$$;
revoke execute on function public.uni_rolls_json(bigint) from public, anon, authenticated;

-- Tutto quello che serve alla scheda → Università (proprietario e staff;
-- ai giocatori i risultati arrivano solo dopo la pubblicazione)
create or replace function public.academic_overview(p_character uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
  v_staff boolean := public.uni_staff();
  r public.student_records;
  v_term public.academic_terms;
  v_year_order int;
begin
  select ch.id, ch.name, ch.owner_id, ch.status, ch.study_track_id, mj.name as major, yr.name as year_name, yr.sort_order as year_order
    into c
  from public.characters ch
  left join public.sheet_options mj on mj.id = ch.study_track_id
  left join public.sheet_options yr on yr.id = ch.year_id
  where ch.id = p_character;
  if c.id is null then raise exception 'Personaggio non trovato.' using errcode = 'P0001'; end if;
  if c.owner_id is distinct from auth.uid() and not v_staff then
    raise exception 'Non hai i permessi necessari.' using errcode = '42501';
  end if;
  select * into r from public.student_records where character_id = p_character;
  select * into v_term from public.academic_terms where status <> 'published' limit 1;
  v_year_order := coalesce(c.year_order, 1);

  return jsonb_build_object(
    'character', jsonb_build_object('id', c.id, 'name', c.name, 'status', c.status, 'major_id', c.study_track_id, 'major', c.major,
                                    'year', c.year_name, 'graduate', v_year_order = 5 and r.character_id is null),
    'staff', v_staff,
    'record', case when r.character_id is null then
        jsonb_build_object('credits_earned', coalesce((public.uni_list('uni_crediti_partenza'))[least(4, v_year_order)], 0),
                           'cumulative_gpa', null, 'academic_status', 'good_standing', 'new', true,
                           'class_standing', public.uni_class(coalesce((public.uni_list('uni_crediti_partenza'))[least(4, v_year_order)], 0)::int))
      else to_jsonb(r) end,
    'term', case when v_term.id is null then null else jsonb_build_object('id', v_term.id, 'label', public.uni_term_label(v_term.academic_year, v_term.semester),
      'status', v_term.status, 'withdraw_open', v_term.withdraw_open) end,
    -- iscrizioni del semestre aperto (i risultati solo allo staff finché non è pubblicato)
    'current', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'course_id', e.course_id, 'code', co.code, 'name', co.name, 'credits', co.credits,
        'level', co.level, 'effort', e.effort, 'status', e.status, 'is_retake', e.is_retake,
        'master_modifier', case when v_staff then e.master_modifier end, 'master_note', case when v_staff then e.master_note end,
        'letter_grade', case when v_staff then e.letter_grade end, 'final_score', case when v_staff then e.final_score end,
        'rolls', case when v_staff then public.uni_rolls_json(e.id) else '[]'::jsonb end) order by co.code)
      from public.enrollments e join public.courses co on co.id = e.course_id
      where e.character_id = p_character and e.term_id = v_term.id), '[]'::jsonb),
    -- storico: semestri pubblicati (lo staff vede anche quello simulato)
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'term_id', t.id, 'label', public.uni_term_label(t.academic_year, t.semester), 'status', t.status,
        'report', (select to_jsonb(tr) from public.term_reports tr where tr.character_id = p_character and tr.term_id = t.id),
        'courses', coalesce((
          select jsonb_agg(jsonb_build_object('id', e.id, 'course_id', e.course_id, 'code', co.code, 'name', co.name, 'credits', co.credits,
            'level', co.level, 'status', e.status, 'effort', e.effort, 'letter_grade', e.letter_grade, 'grade_points', e.grade_points,
            'final_score', e.final_score, 'is_retake', e.is_retake, 'counts_in_gpa', e.counts_in_gpa,
            'master_modifier', e.master_modifier, 'master_note', e.master_note, 'rolls', public.uni_rolls_json(e.id)) order by co.code)
          from public.enrollments e join public.courses co on co.id = e.course_id
          where e.character_id = p_character and e.term_id = t.id), '[]'::jsonb)
      ) order by t.created_at)
      from public.academic_terms t
      where (t.status = 'published' or (v_staff and t.status = 'simulated'))
        and (exists (select 1 from public.enrollments e where e.character_id = p_character and e.term_id = t.id)
             or exists (select 1 from public.term_reports tr where tr.character_id = p_character and tr.term_id = t.id))), '[]'::jsonb),
    -- ultimo voto pubblicato di ogni corso (per i controlli di prerequisiti e ripetizioni)
    'passed', coalesce((
      select jsonb_object_agg(x.course_id, x.grade_points) from (
        select distinct on (e.course_id) e.course_id, e.grade_points
        from public.enrollments e join public.academic_terms t on t.id = e.term_id
        where e.character_id = p_character and e.status = 'completed' and t.status = 'published'
        order by e.course_id, t.created_at desc, e.id desc) x), '{}'::jsonb),
    'required', coalesce((select jsonb_agg(m.course_id) from public.major_required_courses m where m.major_id = c.study_track_id), '[]'::jsonb)
  );
end;
$$;
revoke execute on function public.academic_overview(uuid) from public, anon;
grant execute on function public.academic_overview(uuid) to authenticated;

-- Staff: tutte le iscrizioni di un semestre (per modificatori, anteprima e pubblicazione)
create or replace function public.academic_term_view(p_term uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.uni_require_staff();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'character_id', s.character_id, 'name', ch.name,
      'record', (select to_jsonb(sr) from public.student_records sr where sr.character_id = s.character_id),
      'report', (select to_jsonb(tr) from public.term_reports tr where tr.character_id = s.character_id and tr.term_id = p_term),
      'courses', (
        select jsonb_agg(jsonb_build_object('id', e.id, 'code', co.code, 'name', co.name, 'credits', co.credits, 'level', co.level,
          'status', e.status, 'effort', e.effort, 'master_modifier', e.master_modifier, 'master_note', e.master_note,
          'letter_grade', e.letter_grade, 'final_score', e.final_score, 'is_retake', e.is_retake, 'rolls', public.uni_rolls_json(e.id)) order by co.code)
        from public.enrollments e join public.courses co on co.id = e.course_id
        where e.character_id = s.character_id and e.term_id = p_term)
    ) order by ch.name)
    from (select character_id from public.enrollments where term_id = p_term
          union select character_id from public.term_reports where term_id = p_term) s
    join public.characters ch on ch.id = s.character_id), '[]'::jsonb);
end;
$$;
revoke execute on function public.academic_term_view(uuid) from public, anon;
grant execute on function public.academic_term_view(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 10. RESET DELLA SCHEDA E PROMEMORIA
-- ---------------------------------------------------------------------
-- Il reset della scheda (admin_reset_character) cancella anche università e salute
create or replace function public.reset_character_extras()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('app.reset_scheda', true) = 'on' then
    delete from public.term_reports where character_id = new.id;
    delete from public.enrollments where character_id = new.id;
    delete from public.student_records where character_id = new.id;
    delete from public.character_wounds where character_id = new.id;
    delete from public.character_health where character_id = new.id;
  end if;
  return null;
end;
$$;
revoke execute on function public.reset_character_extras() from public, anon, authenticated;
drop trigger if exists characters_reset_extras on public.characters;
create trigger characters_reset_extras after update on public.characters
  for each row execute function public.reset_character_extras();

-- Promemoria allo staff: sono passati i mesi del semestre (una volta a settimana)
create or replace function public.academic_reminder()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.academic_terms;
  u record;
begin
  select * into t from public.academic_terms order by created_at desc limit 1;
  if t.id is null then return; end if;
  if t.created_at > now() - make_interval(months => coalesce(public.uni_n('uni_mesi_semestre'), 6)::int) then return; end if;
  if t.reminded_at is not null and t.reminded_at > now() - interval '7 days' then return; end if;
  for u in
    select p.id from public.profiles p join public.user_levels l on l.id = p.level_id
    where l.is_admin or 'universita.gestire' = any (l.permissions)
  loop
    perform public.send_system_message(u.id,
      '🎓 Promemoria università: sono passati ' || coalesce(public.uni_n('uni_mesi_semestre'), 6)::int || ' mesi da '
      || public.uni_term_label(t.academic_year, t.semester)
      || case when t.status = 'published' then '. È ora di aprire le iscrizioni al prossimo semestre (Gestione → Università).'
              else '. Il semestre è ancora aperto: chiudi le iscrizioni, simula e pubblica (Gestione → Università).' end);
  end loop;
  update public.academic_terms set reminded_at = now() where id = t.id;
end;
$$;
revoke execute on function public.academic_reminder() from public, anon, authenticated;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('universita-promemoria', '0 10 * * *', 'select public.academic_reminder()');
exception when others then
  raise notice 'pg_cron non disponibile: %', sqlerrm;
end $$;

-- ---------------------------------------------------------------------
-- 11. CATALOGO DI PARTENZA (modificabile da Gestione → Università)
-- ---------------------------------------------------------------------
insert into public.courses (code, name, department, credits, level, attribute_id, skill_id, description)
select v.code, v.name, v.dept, v.credits, v.level, a.id, s.id, v.descr
from (values
  -- Scienze naturali e medicina
  ('BIO 101', 'Biologia generale', 'Scienze naturali', 4, 100, 'INT', 'Scienze naturali', 'Cellula, evoluzione, ecosistemi. Con laboratorio.'),
  ('CHEM 101', 'Chimica generale', 'Scienze naturali', 4, 100, 'INT', 'Scienze naturali', 'Atomi, legami, reazioni. Con laboratorio.'),
  ('BIO 201', 'Genetica', 'Scienze naturali', 3, 200, 'INT', 'Scienze naturali', 'Ereditarietà, DNA, biotecnologie.'),
  ('CHEM 201', 'Chimica organica', 'Scienze naturali', 3, 200, 'INT', 'Scienze naturali', 'Il corso che fa piangere i pre-med.'),
  ('BIO 310', 'Biologia marina', 'Scienze naturali', 3, 300, 'INT', 'Scienze naturali', 'Oceano, barriere coralline, uscite in barca.'),
  ('BIO 320', 'Microbiologia', 'Scienze naturali', 3, 300, 'INT', 'Scienze naturali', 'Batteri, virus, colture in laboratorio.'),
  ('BIO 410', 'Seminario di ricerca biologica', 'Scienze naturali', 3, 400, 'INT', 'Studio e ricerca', 'Progetto di ricerca individuale.'),
  ('MED 101', 'Anatomia umana', 'Medicina', 3, 100, 'INT', 'Medicina e primo soccorso', 'Il corpo umano, sistema per sistema.'),
  ('MED 220', 'Fisiologia', 'Medicina', 3, 200, 'INT', 'Medicina e primo soccorso', 'Come funziona il corpo.'),
  ('MED 330', 'Patologia generale', 'Medicina', 3, 300, 'INT', 'Medicina e primo soccorso', 'Malattie e diagnosi.'),
  ('MED 420', 'Medicina d''urgenza', 'Medicina', 3, 400, 'INT', 'Medicina e primo soccorso', 'Pronto soccorso e casi clinici.'),
  -- Matematica, informatica, ingegneria
  ('MATH 101', 'Analisi I', 'Matematica e ingegneria', 3, 100, 'INT', 'Matematica e statistica', 'Limiti, derivate, integrali.'),
  ('MATH 201', 'Statistica', 'Matematica e ingegneria', 3, 200, 'INT', 'Matematica e statistica', 'Probabilità e analisi dei dati.'),
  ('MATH 301', 'Algebra lineare', 'Matematica e ingegneria', 3, 300, 'INT', 'Matematica e statistica', 'Matrici, spazi vettoriali.'),
  ('CS 101', 'Introduzione alla programmazione', 'Matematica e ingegneria', 3, 100, 'INT', 'Informatica e tecnologia', 'Il primo codice, il primo bug.'),
  ('CS 210', 'Strutture dati', 'Matematica e ingegneria', 3, 200, 'INT', 'Informatica e tecnologia', 'Liste, alberi, grafi, algoritmi.'),
  ('CS 320', 'Basi di dati', 'Matematica e ingegneria', 3, 300, 'INT', 'Informatica e tecnologia', 'SQL e progettazione dei dati.'),
  ('CS 410', 'Sicurezza informatica', 'Matematica e ingegneria', 3, 400, 'INT', 'Informatica e tecnologia', 'Attacchi, difese, crittografia.'),
  ('ENGR 101', 'Fondamenti di ingegneria', 'Matematica e ingegneria', 3, 100, 'INT', 'Ingegneria e progettazione', 'Disegno tecnico e metodo ingegneristico.'),
  ('ENGR 201', 'Elettrotecnica', 'Matematica e ingegneria', 3, 200, 'INT', 'Ingegneria e progettazione', 'Circuiti e misure.'),
  ('ENGR 301', 'Progettazione meccanica', 'Matematica e ingegneria', 3, 300, 'INT', 'Ingegneria e progettazione', 'Dal modello al prototipo.'),
  ('ENGR 410', 'Progetto finale di ingegneria', 'Matematica e ingegneria', 3, 400, 'INT', 'Ingegneria e progettazione', 'Capstone in squadra.'),
  -- Scienze sociali, economia e diritto
  ('ECON 101', 'Microeconomia', 'Scienze sociali e diritto', 3, 100, 'INT', 'Scienze sociali ed economia', 'Domanda, offerta, mercati.'),
  ('ECON 201', 'Macroeconomia', 'Scienze sociali e diritto', 3, 200, 'INT', 'Scienze sociali ed economia', 'Crescita, inflazione, politica monetaria.'),
  ('ECON 310', 'Economia aziendale', 'Scienze sociali e diritto', 3, 300, 'INT', 'Scienze sociali ed economia', 'Bilanci e strategia d''impresa.'),
  ('ECON 410', 'Seminario di economia', 'Scienze sociali e diritto', 3, 400, 'INT', 'Scienze sociali ed economia', 'Tesina su un caso reale.'),
  ('PSY 101', 'Introduzione alla psicologia', 'Scienze sociali e diritto', 3, 100, 'INT', 'Scienze sociali ed economia', 'Mente, comportamento, emozioni.'),
  ('PSY 230', 'Psicologia sociale', 'Scienze sociali e diritto', 3, 200, 'INT', 'Scienze sociali ed economia', 'Gruppi, influenza, pregiudizi.'),
  ('PSY 320', 'Psicologia dello sviluppo', 'Scienze sociali e diritto', 3, 300, 'INT', 'Scienze sociali ed economia', 'Dall''infanzia all''età adulta.'),
  ('PSY 410', 'Psicologia clinica', 'Scienze sociali e diritto', 3, 400, 'EMP', 'Ascolto e supporto', 'Colloquio clinico e casi.'),
  ('LAW 101', 'Introduzione al diritto', 'Scienze sociali e diritto', 3, 100, 'INT', 'Diritto e politica', 'Fonti, contratti, tribunali americani.'),
  ('LAW 310', 'Diritto costituzionale', 'Scienze sociali e diritto', 3, 300, 'INT', 'Diritto e politica', 'La Costituzione e la Corte Suprema.'),
  ('LAW 420', 'Diritto penale', 'Scienze sociali e diritto', 3, 400, 'INT', 'Diritto e politica', 'Reati, processo, moot court.'),
  ('POL 101', 'Scienza politica', 'Scienze sociali e diritto', 3, 100, 'INT', 'Diritto e politica', 'Istituzioni e sistemi politici.'),
  ('POL 220', 'Dibattito e retorica', 'Scienze sociali e diritto', 3, 200, 'PRE', 'Persuasione e dibattito', 'Argomentare e vincere un dibattito.'),
  ('POL 330', 'Relazioni internazionali', 'Scienze sociali e diritto', 3, 300, 'INT', 'Diritto e politica', 'Diplomazia e conflitti.'),
  ('POL 410', 'Campagne elettorali', 'Scienze sociali e diritto', 3, 400, 'PRE', 'Leadership', 'Organizzare e guidare una campagna.'),
  -- Studi umanistici e comunicazione
  ('UNIV 101', 'Metodo di studio', 'Studi umanistici', 1, 100, 'INT', 'Studio e ricerca', 'Come sopravvivere al college.'),
  ('ENG 101', 'Composizione inglese', 'Studi umanistici', 3, 100, 'INT', 'Scrittura e giornalismo', 'Scrivere saggi accademici.'),
  ('ENG 220', 'Letteratura americana', 'Studi umanistici', 3, 200, 'INT', 'Lettere e filosofia', 'Da Twain a Morrison.'),
  ('HIST 101', 'Storia americana', 'Studi umanistici', 3, 100, 'INT', 'Lettere e filosofia', 'Dalla rivoluzione a oggi.'),
  ('HIST 210', 'Storia contemporanea', 'Studi umanistici', 3, 200, 'INT', 'Lettere e filosofia', 'Il Novecento e oltre.'),
  ('PHIL 201', 'Etica', 'Studi umanistici', 3, 200, 'INT', 'Lettere e filosofia', 'Giusto, sbagliato, e tutto quello in mezzo.'),
  ('PHIL 320', 'Filosofia politica', 'Studi umanistici', 3, 300, 'INT', 'Lettere e filosofia', 'Potere, libertà, giustizia.'),
  ('LIT 410', 'Laboratorio di scrittura creativa', 'Studi umanistici', 3, 400, 'INT', 'Scrittura e giornalismo', 'Racconti e workshop.'),
  ('LANG 101', 'Spagnolo I', 'Studi umanistici', 3, 100, 'INT', 'Lingue straniere', 'Livello base.'),
  ('LANG 201', 'Spagnolo II', 'Studi umanistici', 3, 200, 'INT', 'Lingue straniere', 'Livello intermedio.'),
  ('LANG 301', 'Spagnolo III', 'Studi umanistici', 3, 300, 'INT', 'Lingue straniere', 'Livello avanzato.'),
  ('JOUR 210', 'Giornalismo digitale', 'Studi umanistici', 3, 200, 'INT', 'Scrittura e giornalismo', 'Notizie, social, verifiche dei fatti.'),
  ('JOUR 320', 'Giornalismo d''inchiesta', 'Studi umanistici', 3, 300, 'INT', 'Osservazione e indagine', 'Fonti, documenti, segreti.'),
  ('JOUR 410', 'Redazione del giornale del college', 'Studi umanistici', 3, 400, 'INT', 'Scrittura e giornalismo', 'Si pubblica davvero.'),
  ('COMM 110', 'Public speaking', 'Studi umanistici', 3, 100, 'PRE', 'Oratoria', 'Parlare in pubblico senza tremare.'),
  ('COMM 210', 'Comunicazione e media', 'Studi umanistici', 3, 200, 'PRE', 'Stile e immagine', 'Brand personale e social media.'),
  -- Arti
  ('ART 101', 'Disegno dal vero', 'Arti', 3, 100, 'EMP', 'Arti visive', 'Matita, carboncino, modelli.'),
  ('ART 220', 'Fotografia', 'Arti', 3, 200, 'EMP', 'Fotografia e video', 'Luce, composizione, camera oscura.'),
  ('ART 310', 'Pittura', 'Arti', 3, 300, 'EMP', 'Arti visive', 'Olio, acrilico, ricerca personale.'),
  ('ART 410', 'Mostra di fine corso', 'Arti', 3, 400, 'EMP', 'Arti visive', 'Una mostra vera, al campus.'),
  ('THEA 101', 'Recitazione I', 'Arti', 3, 100, 'EMP', 'Recitazione', 'Corpo, voce, personaggio.'),
  ('THEA 210', 'Improvvisazione teatrale', 'Arti', 3, 200, 'EMP', 'Recitazione', 'Sì, e…'),
  ('THEA 301', 'Teatro musicale', 'Arti', 3, 300, 'EMP', 'Canto', 'Il musical di primavera.'),
  ('MUS 101', 'Teoria e pratica musicale', 'Arti', 3, 100, 'RIF', 'Strumenti musicali', 'Lettura, armonia, strumento.'),
  ('MUS 210', 'Canto corale', 'Arti', 3, 200, 'EMP', 'Canto', 'Il coro del college.'),
  ('MUS 410', 'Concerto finale', 'Arti', 3, 400, 'RIF', 'Strumenti musicali', 'Il recital di fine percorso.'),
  ('DANC 101', 'Danza moderna', 'Arti', 2, 100, 'RIF', 'Danza', 'Tecnica e coreografia.'),
  -- Educazione fisica (laboratori da 1 credito)
  ('PE 101', 'Educazione fisica', 'Educazione fisica', 1, 100, 'VIG', 'Atletica', 'Corsa e preparazione atletica.'),
  ('PE 110', 'Nuoto', 'Educazione fisica', 1, 100, 'VIG', 'Nuoto e sport acquatici', 'In piscina all''alba.'),
  ('PE 120', 'Yoga e mindfulness', 'Educazione fisica', 1, 100, 'EMP', 'Autocontrollo', 'Respirare prima degli esami.'),
  ('PE 201', 'Allenamento della forza', 'Educazione fisica', 1, 200, 'VIG', 'Forza', 'Sala pesi e programmazione.')
) as v (code, name, dept, credits, level, attr, skill, descr)
join public.attributes a on a.code = v.attr
left join public.skills s on lower(s.name) = lower(v.skill)
on conflict (code) do nothing;

insert into public.course_prerequisites (course_id, prerequisite_id)
select c.id, p.id
from (values
  ('BIO 201', 'BIO 101'), ('CHEM 201', 'CHEM 101'), ('BIO 310', 'BIO 201'), ('BIO 320', 'BIO 201'), ('BIO 410', 'BIO 310'),
  ('MED 220', 'MED 101'), ('MED 330', 'MED 220'), ('MED 420', 'MED 330'),
  ('MATH 201', 'MATH 101'), ('MATH 301', 'MATH 201'), ('CS 210', 'CS 101'), ('CS 320', 'CS 210'), ('CS 410', 'CS 320'),
  ('ENGR 201', 'ENGR 101'), ('ENGR 301', 'ENGR 201'), ('ENGR 301', 'MATH 101'), ('ENGR 410', 'ENGR 301'),
  ('ECON 201', 'ECON 101'), ('ECON 310', 'ECON 201'), ('ECON 410', 'ECON 310'),
  ('PSY 230', 'PSY 101'), ('PSY 320', 'PSY 230'), ('PSY 410', 'PSY 320'),
  ('LAW 310', 'LAW 101'), ('LAW 420', 'LAW 310'), ('POL 330', 'POL 101'), ('POL 410', 'POL 330'),
  ('ENG 220', 'ENG 101'), ('PHIL 320', 'PHIL 201'), ('LIT 410', 'ENG 220'),
  ('LANG 201', 'LANG 101'), ('LANG 301', 'LANG 201'), ('JOUR 210', 'ENG 101'), ('JOUR 320', 'JOUR 210'), ('JOUR 410', 'JOUR 320'),
  ('ART 310', 'ART 101'), ('ART 410', 'ART 310'), ('THEA 210', 'THEA 101'), ('THEA 301', 'THEA 101'), ('MUS 410', 'MUS 101')
) as v (course, prereq)
join public.courses c on c.code = v.course
join public.courses p on p.code = v.prereq
on conflict do nothing;

insert into public.major_required_courses (major_id, course_id)
select o.id, c.id
from (values
  ('Biologia', 'BIO 101'), ('Biologia', 'CHEM 101'), ('Biologia', 'BIO 201'), ('Biologia', 'BIO 310'), ('Biologia', 'BIO 410'),
  ('Economia', 'ECON 101'), ('Economia', 'ECON 201'), ('Economia', 'MATH 101'), ('Economia', 'MATH 201'), ('Economia', 'ECON 310'), ('Economia', 'ECON 410'),
  ('Giurisprudenza', 'LAW 101'), ('Giurisprudenza', 'POL 101'), ('Giurisprudenza', 'LAW 310'), ('Giurisprudenza', 'LAW 420'),
  ('Informatica', 'CS 101'), ('Informatica', 'MATH 101'), ('Informatica', 'CS 210'), ('Informatica', 'CS 320'), ('Informatica', 'CS 410'),
  ('Ingegneria', 'ENGR 101'), ('Ingegneria', 'MATH 101'), ('Ingegneria', 'ENGR 201'), ('Ingegneria', 'ENGR 301'), ('Ingegneria', 'ENGR 410'),
  ('Lettere', 'ENG 101'), ('Lettere', 'HIST 101'), ('Lettere', 'ENG 220'), ('Lettere', 'PHIL 201'), ('Lettere', 'LIT 410'),
  ('Medicina', 'BIO 101'), ('Medicina', 'CHEM 101'), ('Medicina', 'MED 101'), ('Medicina', 'MED 220'), ('Medicina', 'MED 330'), ('Medicina', 'MED 420'),
  ('Psicologia', 'PSY 101'), ('Psicologia', 'PSY 230'), ('Psicologia', 'MATH 201'), ('Psicologia', 'PSY 320'), ('Psicologia', 'PSY 410'),
  ('Scienze politiche', 'POL 101'), ('Scienze politiche', 'POL 220'), ('Scienze politiche', 'LAW 101'), ('Scienze politiche', 'POL 330'), ('Scienze politiche', 'POL 410'),
  ('Giornalismo', 'ENG 101'), ('Giornalismo', 'JOUR 210'), ('Giornalismo', 'COMM 110'), ('Giornalismo', 'JOUR 320'), ('Giornalismo', 'JOUR 410'),
  ('Arti visive', 'ART 101'), ('Arti visive', 'ART 220'), ('Arti visive', 'ART 310'), ('Arti visive', 'ART 410'),
  ('Teatro e musica', 'THEA 101'), ('Teatro e musica', 'MUS 101'), ('Teatro e musica', 'THEA 301'), ('Teatro e musica', 'MUS 410')
) as v (major, course)
join public.sheet_options o on o.kind = 'indirizzo' and o.name = v.major
join public.courses c on c.code = v.course
on conflict do nothing;

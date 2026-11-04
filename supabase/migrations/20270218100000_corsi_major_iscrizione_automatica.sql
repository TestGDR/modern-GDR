-- =====================================================================
-- UNIVERSITÀ: PIÙ CORSI PER OGNI MAJOR E ISCRIZIONE AUTOMATICA
-- 1. 54 corsi nuovi, divisi per dipartimento e livello: ogni Major ha
--    corsi da 100 e 200 per i primi anni e corsi da 300 e 400 dopo.
-- 2. Iscrizione automatica ai corsi del Major fino ai crediti minimi
--    (uni_crediti_min, 12): prima i corsi obbligatori, poi quelli con la
--    stessa sigla (CS, BIO…), poi gli altri del dipartimento; si saltano
--    quelli non ancora possibili (livello, prerequisiti, già superati).
--    Succede quando si aprono le iscrizioni di un semestre, quando un
--    personaggio viene approvato o cambia Major a iscrizioni aperte, e con
--    il pulsante «Iscrivimi ai corsi del Major». Poi ognuno può togliere e
--    aggiungere corsi come sempre.
-- =====================================================================

-- 1. CORSI NUOVI
insert into public.courses (code, name, department, credits, level, attribute_id, skill_id, description, area)
select v.code, v.name, v.dept, v.credits, v.level, a.id, s.id, v.descr, v.area
from (values
  ('BIO 110', 'Ecologia', 'Scienze naturali', 3, 100, 'INT', 'Scienze naturali', 'Ecosistemi, clima e biodiversità, con uscite sulla costa.', 'stem'),
  ('BIO 120', 'Introduzione alla biologia marina', 'Scienze naturali', 3, 100, 'INT', 'Scienze naturali', 'L''oceano davanti al campus: maree, plancton, pesci.', 'stem'),
  ('BIO 210', 'Biologia cellulare', 'Scienze naturali', 3, 200, 'INT', 'Scienze naturali', 'Come funziona una cellula, dal DNA alle proteine.', 'stem'),
  ('BIO 230', 'Zoologia', 'Scienze naturali', 3, 200, 'INT', 'Scienze naturali', 'Gli animali: anatomia, comportamento, evoluzione.', 'stem'),
  ('BIO 330', 'Evoluzione', 'Scienze naturali', 3, 300, 'INT', 'Scienze naturali', 'Selezione naturale, genetica delle popolazioni, specie.', 'stem'),
  ('BIO 420', 'Biotecnologie', 'Scienze naturali', 3, 400, 'INT', 'Scienze naturali', 'Ingegneria genetica, CRISPR e le loro applicazioni.', 'stem'),
  ('MED 110', 'Introduzione alla salute pubblica', 'Scienze biomediche', 3, 100, 'INT', 'Medicina e primo soccorso', 'Epidemie, prevenzione e sanità nelle città americane.', 'stem'),
  ('MED 120', 'Nutrizione', 'Scienze biomediche', 3, 100, 'INT', 'Medicina e primo soccorso', 'Cosa mangiamo e cosa ci fa: diete, sport, salute.', 'stem'),
  ('MED 230', 'Neuroscienze', 'Scienze biomediche', 3, 200, 'INT', 'Medicina e primo soccorso', 'Il cervello e il sistema nervoso.', 'stem'),
  ('MED 310', 'Farmacologia di base', 'Scienze biomediche', 3, 300, 'INT', 'Medicina e primo soccorso', 'Come agiscono i farmaci e perché a volte fanno male.', 'stem'),
  ('MED 410', 'Ricerca clinica', 'Scienze biomediche', 3, 400, 'INT', 'Studio e ricerca', 'Studi clinici, statistica medica ed etica della ricerca.', 'stem'),
  ('MATH 102', 'Analisi II', 'Matematica e ingegneria', 3, 100, 'INT', 'Matematica e statistica', 'Integrali, serie e funzioni di più variabili.', 'stem'),
  ('MATH 110', 'Matematica discreta', 'Matematica e ingegneria', 3, 100, 'INT', 'Matematica e statistica', 'Logica, insiemi, grafi: la matematica dei computer.', 'stem'),
  ('CS 110', 'Sviluppo web', 'Matematica e ingegneria', 3, 100, 'INT', 'Informatica e tecnologia', 'HTML, CSS e JavaScript: il primo sito che funziona.', 'stem'),
  ('CS 120', 'Programmazione in Python', 'Matematica e ingegneria', 3, 100, 'INT', 'Informatica e tecnologia', 'Script, dati e piccoli programmi utili.', 'stem'),
  ('CS 230', 'Architettura dei calcolatori', 'Matematica e ingegneria', 3, 200, 'INT', 'Informatica e tecnologia', 'Come è fatto un computer, dal processore alla memoria.', 'stem'),
  ('CS 250', 'Sviluppo di app', 'Matematica e ingegneria', 3, 200, 'INT', 'Informatica e tecnologia', 'App per telefono, dall''idea allo store.', 'stem'),
  ('CS 330', 'Intelligenza artificiale', 'Matematica e ingegneria', 3, 300, 'INT', 'Informatica e tecnologia', 'Apprendimento automatico, reti neurali e i loro limiti.', 'stem'),
  ('CS 340', 'Reti di calcolatori', 'Matematica e ingegneria', 3, 300, 'INT', 'Informatica e tecnologia', 'Internet dall''interno: protocolli, server, cloud.', 'stem'),
  ('CS 420', 'Progetto software', 'Matematica e ingegneria', 3, 400, 'INT', 'Informatica e tecnologia', 'Un vero progetto in squadra, dal codice al rilascio.', 'stem'),
  ('ENGR 110', 'Disegno CAD', 'Matematica e ingegneria', 3, 100, 'INT', 'Ingegneria e progettazione', 'Progettare al computer in 2D e 3D.', 'stem'),
  ('ENGR 220', 'Scienza dei materiali', 'Matematica e ingegneria', 3, 200, 'INT', 'Ingegneria e progettazione', 'Metalli, plastiche, compositi: come scegliere.', 'stem'),
  ('ENGR 320', 'Robotica', 'Matematica e ingegneria', 3, 300, 'INT', 'Ingegneria e progettazione', 'Sensori, motori e robot che si muovono da soli.', 'stem'),
  ('ENGR 420', 'Energie rinnovabili', 'Matematica e ingegneria', 3, 400, 'INT', 'Ingegneria e progettazione', 'Solare, eolico e reti elettriche del futuro.', 'stem'),
  ('ECON 110', 'Finanza personale', 'Scienze sociali e diritto', 3, 100, 'INT', 'Scienze sociali ed economia', 'Budget, prestiti, investimenti: i soldi della vita reale.', 'umanistica'),
  ('ECON 220', 'Marketing', 'Scienze sociali e diritto', 3, 200, 'INT', 'Scienze sociali ed economia', 'Clienti, marchi e campagne pubblicitarie.', 'umanistica'),
  ('ECON 320', 'Finanza aziendale', 'Scienze sociali e diritto', 3, 300, 'INT', 'Scienze sociali ed economia', 'Bilanci, valore d''impresa e mercati finanziari.', 'umanistica'),
  ('PSY 110', 'Psicologia della vita quotidiana', 'Scienze sociali e diritto', 3, 100, 'INT', 'Scienze sociali ed economia', 'Stress, abitudini, relazioni: la psicologia di tutti i giorni.', 'umanistica'),
  ('PSY 210', 'Psicologia cognitiva', 'Scienze sociali e diritto', 3, 200, 'INT', 'Scienze sociali ed economia', 'Memoria, attenzione e decisioni.', 'umanistica'),
  ('PSY 330', 'Neuropsicologia', 'Scienze sociali e diritto', 3, 300, 'INT', 'Scienze sociali ed economia', 'Il cervello dietro i comportamenti.', 'umanistica'),
  ('LAW 110', 'Diritto e società', 'Scienze sociali e diritto', 3, 100, 'INT', 'Diritto e politica', 'Come le leggi entrano nella vita di ogni giorno.', 'umanistica'),
  ('LAW 210', 'Diritto civile', 'Scienze sociali e diritto', 3, 200, 'INT', 'Diritto e politica', 'Contratti, proprietà e responsabilità.', 'umanistica'),
  ('LAW 230', 'Criminologia', 'Scienze sociali e diritto', 3, 200, 'INT', 'Diritto e politica', 'Perché si commettono reati e come si indaga.', 'umanistica'),
  ('LAW 320', 'Diritto internazionale', 'Scienze sociali e diritto', 3, 300, 'INT', 'Diritto e politica', 'Trattati, diritti umani e corti internazionali.', 'umanistica'),
  ('POL 110', 'Governo americano', 'Scienze sociali e diritto', 3, 100, 'INT', 'Diritto e politica', 'Congresso, presidente, corti e stati.', 'umanistica'),
  ('POL 230', 'Politiche pubbliche', 'Scienze sociali e diritto', 3, 200, 'INT', 'Diritto e politica', 'Come nasce una legge e chi decide le priorità.', 'umanistica'),
  ('SOC 210', 'Sociologia urbana', 'Scienze sociali e diritto', 3, 200, 'INT', 'Scienze sociali ed economia', 'Le città, i quartieri e chi ci vive.', 'umanistica'),
  ('PHIL 101', 'Introduzione alla filosofia', 'Studi umanistici', 3, 100, 'INT', 'Lettere e filosofia', 'Le grandi domande, da Platone a oggi.', 'umanistica'),
  ('ENG 110', 'Grandi romanzi americani', 'Studi umanistici', 3, 100, 'INT', 'Lettere e filosofia', 'Da Twain a Morrison: leggere e discutere.', 'umanistica'),
  ('ENG 230', 'Poesia', 'Studi umanistici', 3, 200, 'INT', 'Scrittura e giornalismo', 'Leggere e scrivere poesia.', 'umanistica'),
  ('HIST 310', 'Storia della California', 'Studi umanistici', 3, 300, 'INT', 'Lettere e filosofia', 'Missioni, corsa all''oro, Hollywood e Silicon Valley.', 'umanistica'),
  ('LIT 320', 'Letteratura comparata', 'Studi umanistici', 3, 300, 'INT', 'Lettere e filosofia', 'Romanzi di paesi diversi a confronto.', 'umanistica'),
  ('JOUR 110', 'Introduzione al giornalismo', 'Studi umanistici', 3, 100, 'INT', 'Scrittura e giornalismo', 'Notizie, fonti e deontologia.', 'umanistica'),
  ('JOUR 310', 'Giornalismo d''inchiesta', 'Studi umanistici', 3, 300, 'INT', 'Scrittura e giornalismo', 'Trovare la storia che nessuno vuole raccontare.', 'umanistica'),
  ('COMM 310', 'Social media e comunicazione', 'Studi umanistici', 3, 300, 'CAR', 'Stile e immagine', 'Contenuti, pubblico e reputazione online.', 'umanistica'),
  ('ART 110', 'Storia dell''arte', 'Arti', 3, 100, 'INT', 'Lettere e filosofia', 'Dall''arte antica alla street art.', 'umanistica'),
  ('ART 230', 'Grafica digitale', 'Arti', 3, 200, 'EMP', 'Arti visive', 'Illustrazione e impaginazione al computer.', 'umanistica'),
  ('ART 320', 'Scultura', 'Arti', 3, 300, 'EMP', 'Arti visive', 'Argilla, legno e materiali di recupero.', 'umanistica'),
  ('THEA 110', 'Dizione e voce', 'Arti', 3, 100, 'EMP', 'Recitazione', 'Respiro, voce e pronuncia per il palco.', 'umanistica'),
  ('THEA 220', 'Scenografia', 'Arti', 3, 200, 'EMP', 'Arti visive', 'Progettare e costruire una scena.', 'umanistica'),
  ('THEA 320', 'Regia', 'Arti', 3, 300, 'EMP', 'Recitazione', 'Dirigere attori e mettere in scena un testo.', 'umanistica'),
  ('MUS 110', 'Storia della musica', 'Arti', 3, 100, 'INT', 'Lettere e filosofia', 'Dal barocco al rock, fino all''hip hop.', 'umanistica'),
  ('MUS 220', 'Composizione', 'Arti', 3, 200, 'RIF', 'Strumenti musicali', 'Scrivere musica: melodia, armonia, arrangiamento.', 'umanistica'),
  ('MUS 310', 'Produzione musicale', 'Arti', 3, 300, 'RIF', 'Strumenti musicali', 'Registrare, mixare e pubblicare un brano.', 'umanistica')
) as v (code, name, dept, credits, level, attr, skill, descr, area)
join public.attributes a on a.code = case when v.attr = 'CAR' then coalesce((select code from public.attributes where code = 'CAR'), 'PRE') else v.attr end
left join public.skills s on s.name = v.skill
on conflict (code) do nothing;

-- 2. ISCRIZIONE: i controlli in una funzione interna, usata dal giocatore e dall'iscrizione automatica
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
revoke execute on function public.academic_enroll_core(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.academic_enroll(p_term uuid, p_character uuid, p_course uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.owns_character(p_character) then raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501'; end if;
  perform public.academic_enroll_core(p_term, p_character, p_course);
end;
$$;
revoke execute on function public.academic_enroll(uuid, uuid, uuid) from public, anon;
grant execute on function public.academic_enroll(uuid, uuid, uuid) to authenticated;

-- iscrive ai corsi del Major fino ai crediti minimi; restituisce i crediti aggiunti
create or replace function public.academic_auto_enroll(p_character uuid, p_term uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_min int := coalesce(public.uni_n('uni_crediti_min'), 12)::int;
  v_major uuid := (select study_track_id from public.characters where id = p_character and status = 'approvata');
  v_have int;
  v_added int := 0;
  c record;
begin
  if v_major is null or not public.character_is_student(p_character) then return 0; end if;
  if (select status from public.academic_terms where id = p_term) is distinct from 'registration_open' then return 0; end if;
  for c in
    with req as (
      select co.id, co.code from public.major_required_courses m join public.courses co on co.id = m.course_id where m.major_id = v_major
    ), pre as (
      select distinct split_part(code, ' ', 1) as prefix from req
    ), dept as (
      select distinct co.department from req r join public.courses co on co.id = r.id
    )
    select co.id, co.credits,
      case when co.id in (select id from req) then 0
           when split_part(co.code, ' ', 1) in (select prefix from pre) then 1 else 2 end as prio
    from public.courses co
    where co.active and (co.id in (select id from req) or co.department in (select department from dept))
    order by prio, co.level, co.code
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

-- pulsante «Iscrivimi ai corsi del Major»
create or replace function public.academic_auto_enroll_me(p_character uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_term uuid := (select id from public.academic_terms where status = 'registration_open' limit 1);
begin
  if not public.owns_character(p_character) then raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501'; end if;
  if v_term is null then raise exception 'Le iscrizioni non sono aperte.' using errcode = 'P0001'; end if;
  if (select study_track_id from public.characters where id = p_character) is null then
    raise exception 'Prima scegli il Major nella scheda.' using errcode = 'P0001';
  end if;
  return public.academic_auto_enroll(p_character, v_term);
end;
$$;
revoke execute on function public.academic_auto_enroll_me(uuid) from public, anon;
grant execute on function public.academic_auto_enroll_me(uuid) to authenticated;

-- iscrizioni aperte → tutti gli studenti senza corsi in quel semestre
create or replace function public.academic_terms_auto_enroll()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  if new.status = 'registration_open' and (tg_op = 'INSERT' or old.status is distinct from 'registration_open') then
    for r in
      select c.id from public.characters c
      where c.status = 'approvata' and c.study_track_id is not null
        and not exists (select 1 from public.enrollments e where e.character_id = c.id and e.term_id = new.id)
    loop
      perform public.academic_auto_enroll(r.id, new.id);
    end loop;
  end if;
  return null;
end;
$$;
revoke execute on function public.academic_terms_auto_enroll() from public, anon, authenticated;
drop trigger if exists academic_terms_auto_enroll on public.academic_terms;
create trigger academic_terms_auto_enroll after insert or update of status on public.academic_terms
  for each row execute function public.academic_terms_auto_enroll();

-- personaggio approvato, o Major cambiato, a iscrizioni aperte
create or replace function public.characters_auto_enroll()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_term uuid := (select id from public.academic_terms where status = 'registration_open' limit 1);
begin
  if v_term is not null and new.status = 'approvata' and new.study_track_id is not null
     and (old.status is distinct from 'approvata' or old.study_track_id is distinct from new.study_track_id)
     and not exists (select 1 from public.enrollments where character_id = new.id and term_id = v_term) then
    perform public.academic_auto_enroll(new.id, v_term);
  end if;
  return null;
end;
$$;
revoke execute on function public.characters_auto_enroll() from public, anon, authenticated;
drop trigger if exists characters_auto_enroll on public.characters;
create trigger characters_auto_enroll after update of status, study_track_id on public.characters
  for each row execute function public.characters_auto_enroll();

-- una volta: chi ha già il Major e nessun corso nel semestre con le iscrizioni aperte
do $$
declare
  v_term uuid := (select id from public.academic_terms where status = 'registration_open' limit 1);
  r record;
begin
  if v_term is null then return; end if;
  for r in
    select c.id from public.characters c
    where c.status = 'approvata' and c.study_track_id is not null
      and not exists (select 1 from public.enrollments e where e.character_id = c.id and e.term_id = v_term)
  loop
    perform public.academic_auto_enroll(r.id, v_term);
  end loop;
end;
$$;

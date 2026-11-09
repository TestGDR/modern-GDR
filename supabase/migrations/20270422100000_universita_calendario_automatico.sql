-- =====================================================================
-- UNIVERSITÀ: CALENDARIO AUTOMATICO (come un college americano)
-- Ogni semestre ha le sue date (ora italiana, rome_today()):
--   Fall   (anno Y):   iscrizioni dal 1/8, lezioni dal 25/8, esami 8–14/12, risultati il 20/12
--   Spring (anno Y+1): iscrizioni dal 21/12, lezioni dal 12/1, esami 4–10/5, risultati il 16/5
--   D'estate nessun semestre: il Fall dopo apre le iscrizioni il 1/8.
-- Ogni notte academic_calendar_tick (pg_cron «universita-calendario») fa da
-- solo il passaggio dovuto: apre il semestre successivo, inizia le lezioni
-- (chiude le iscrizioni), apre la settimana degli esami (chiude i ritiri),
-- simula gli esami a fine settimana e pubblica i risultati. Gli avvisi di
-- SISTEMA sono quelli di sempre. Lo staff sposta le date da Gestione →
-- Università e può sempre fare un passaggio a mano prima del tempo.
-- Spento con uni_calendario_auto = 0 (torna tutto a mano).
-- Fall 2026: lezioni da domani, poi le date di dicembre.
-- =====================================================================

insert into public.game_settings (key, value, kind, label, description, sort_order) values
  ('uni_calendario_auto', '1', 'number', 'Università · Calendario automatico (1 = sì, 0 = no)',
   'Con 1 i semestri si aprono, iniziano, fanno gli esami e pubblicano i risultati da soli alle loro date.', 225)
on conflict (key) do nothing;

-- 1. DATE DEL SEMESTRE
alter table public.academic_terms
  add column if not exists registration_date date,
  add column if not exists classes_start date,
  add column if not exists exams_start date,
  add column if not exists exams_end date,
  add column if not exists results_date date,
  add column if not exists exams_notified boolean not null default false;

-- Le date del calendario americano per un semestre (anno accademico «2026-27»)
create or replace function public.uni_term_dates(p_year text, p_semester text,
  out registration_date date, out classes_start date, out exams_start date, out exams_end date, out results_date date)
language plpgsql
immutable
set search_path = ''
as $$
declare
  y int := left(p_year, 4)::int;
begin
  if p_semester = 'fall' then
    registration_date := make_date(y, 8, 1);
    classes_start := make_date(y, 8, 25);
    exams_start := make_date(y, 12, 8);
    exams_end := make_date(y, 12, 14);
    results_date := make_date(y, 12, 20);
  else
    registration_date := make_date(y, 12, 21);
    classes_start := make_date(y + 1, 1, 12);
    exams_start := make_date(y + 1, 5, 4);
    exams_end := make_date(y + 1, 5, 10);
    results_date := make_date(y + 1, 5, 16);
  end if;
end;
$$;
revoke execute on function public.uni_term_dates(text, text) from public, anon;
grant execute on function public.uni_term_dates(text, text) to authenticated;

-- un semestre nuovo prende da solo le sue date
create or replace function public.academic_terms_dates()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  d record;
begin
  select * into d from public.uni_term_dates(new.academic_year, new.semester);
  new.registration_date := coalesce(new.registration_date, d.registration_date);
  new.classes_start := coalesce(new.classes_start, d.classes_start);
  new.exams_start := coalesce(new.exams_start, d.exams_start);
  new.exams_end := coalesce(new.exams_end, d.exams_end);
  new.results_date := coalesce(new.results_date, d.results_date);
  return new;
end;
$$;
revoke execute on function public.academic_terms_dates() from public, anon, authenticated;
drop trigger if exists academic_terms_dates on public.academic_terms;
create trigger academic_terms_dates before insert on public.academic_terms
  for each row execute function public.academic_terms_dates();

-- semestri già esistenti: date del calendario
update public.academic_terms t
set registration_date = coalesce(t.registration_date, d.registration_date),
    classes_start = coalesce(t.classes_start, d.classes_start),
    exams_start = coalesce(t.exams_start, d.exams_start),
    exams_end = coalesce(t.exams_end, d.exams_end),
    results_date = coalesce(t.results_date, d.results_date)
from public.academic_terms x cross join lateral public.uni_term_dates(x.academic_year, x.semester) d
where x.id = t.id;

-- il semestre ancora aperto alle iscrizioni (Fall 2026): lezioni da domani
update public.academic_terms
set classes_start = public.rome_today() + 1
where status = 'registration_open' and classes_start <= public.rome_today();

-- 2. I PASSAGGI SI POSSONO FARE ANCHE IN AUTOMATICO
create or replace function public.uni_require_staff()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- il calendario automatico (pg_cron) lavora senza un utente collegato
  if current_setting('app.uni_auto', true) = 'on' then
    return;
  end if;
  if not public.has_permission('universita.gestire') then
    raise exception 'Non hai il permesso di gestire l''università.' using errcode = '42501';
  end if;
end;
$$;
revoke execute on function public.uni_require_staff() from public, anon, authenticated;

-- lo staff sposta le date del semestre
create or replace function public.academic_term_set_dates(p_term uuid, p_registration date, p_classes date,
  p_exams_start date, p_exams_end date, p_results date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.uni_require_staff();
  if not (p_registration <= p_classes and p_classes < p_exams_start and p_exams_start <= p_exams_end and p_exams_end <= p_results) then
    raise exception 'Le date vanno in ordine: iscrizioni, lezioni, inizio e fine degli esami, risultati.' using errcode = 'P0001';
  end if;
  update public.academic_terms
  set registration_date = p_registration, classes_start = p_classes, exams_start = p_exams_start,
      exams_end = p_exams_end, results_date = p_results
  where id = p_term and status <> 'published';
  if not found then raise exception 'Semestre non modificabile.' using errcode = 'P0001'; end if;
end;
$$;
revoke execute on function public.academic_term_set_dates(uuid, date, date, date, date, date) from public, anon;
grant execute on function public.academic_term_set_dates(uuid, date, date, date, date, date) to authenticated;

-- 3. OGNI NOTTE: IL PASSAGGIO DOVUTO
create or replace function public.academic_calendar_tick()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := public.rome_today();
  t public.academic_terms;
  v_last public.academic_terms;
  v_year text;
  v_sem text;
  d record;
  v_done text := '';
  u record;
begin
  if coalesce(public.setting_int('uni_calendario_auto'), 1) <> 1 then
    return 'spento';
  end if;
  perform set_config('app.uni_auto', 'on', true);
  -- più passaggi di fila se qualche notte è saltata
  for i in 1..5 loop
    select * into t from public.academic_terms where status <> 'published' order by created_at desc limit 1;
    if t.id is null then
      -- nessun semestre aperto: il prossimo apre le iscrizioni alla sua data
      select * into v_last from public.academic_terms order by created_at desc limit 1;
      exit when v_last.id is null;
      if v_last.semester = 'fall' then
        v_year := v_last.academic_year;
        v_sem := 'spring';
      else
        v_year := (left(v_last.academic_year, 4)::int + 1)::text || '-' || lpad(((left(v_last.academic_year, 4)::int + 2) % 100)::text, 2, '0');
        v_sem := 'fall';
      end if;
      select * into d from public.uni_term_dates(v_year, v_sem);
      exit when v_today < d.registration_date;
      perform public.academic_term_create(v_year, v_sem);
      v_done := v_done || 'aperto ' || v_year || ' ' || v_sem || '; ';
    elsif t.status = 'registration_open' and v_today >= t.classes_start then
      perform public.academic_term_set_status(t.id, 'in_progress');
      for u in select distinct c.owner_id from public.enrollments e join public.characters c on c.id = e.character_id
               where e.term_id = t.id and e.status = 'enrolled' loop
        perform public.send_system_message(u.owner_id,
          '🎓 Iniziano le lezioni di ' || public.uni_term_label(t.academic_year, t.semester)
          || ': le iscrizioni sono chiuse. Esami dal ' || to_char(t.exams_start, 'DD/MM') || ' al ' || to_char(t.exams_end, 'DD/MM')
          || ', risultati il ' || to_char(t.results_date, 'DD/MM') || '.');
      end loop;
      v_done := v_done || 'lezioni; ';
    elsif t.status = 'in_progress' and v_today >= t.exams_start and not t.exams_notified then
      update public.academic_terms set withdraw_open = false, exams_notified = true where id = t.id;
      for u in select distinct c.owner_id from public.enrollments e join public.characters c on c.id = e.character_id
               where e.term_id = t.id and e.status = 'enrolled' loop
        perform public.send_system_message(u.owner_id,
          '📝 Settimana degli esami di ' || public.uni_term_label(t.academic_year, t.semester)
          || ' (fino al ' || to_char(t.exams_end, 'DD/MM') || '): i ritiri sono chiusi. Risultati il ' || to_char(t.results_date, 'DD/MM') || '.');
      end loop;
      v_done := v_done || 'settimana esami; ';
    elsif t.status = 'in_progress' and v_today > t.exams_end then
      perform public.academic_simulate(t.id);
      v_done := v_done || 'esami; ';
    elsif t.status = 'simulated' and v_today >= t.results_date then
      perform public.academic_publish(t.id);
      v_done := v_done || 'risultati; ';
    else
      exit;
    end if;
  end loop;
  perform set_config('app.uni_auto', 'off', true);
  return nullif(v_done, '');
end;
$$;
revoke execute on function public.academic_calendar_tick() from public, anon, authenticated;

-- ogni notte (00:15 ora italiana d'inverno, 01:15 d'estate); il vecchio promemoria non serve più
do $$
begin
  perform cron.schedule('universita-calendario', '15 23 * * *', 'select public.academic_calendar_tick()');
  perform cron.unschedule('universita-promemoria');
exception when others then
  raise notice 'pg_cron: %', sqlerrm;
end;
$$;

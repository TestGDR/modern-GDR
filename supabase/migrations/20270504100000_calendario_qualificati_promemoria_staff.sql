-- =====================================================================
-- CALENDARIO: CONFERENCE E NATIONALS (QUALIFICATA / NON QUALIFICATA)
-- E PROMEMORIA ALLO STAFF
-- 1. Date indicative, calcolate e non salvate, per ogni stagione sportiva
--    avviata e non chiusa: torneo di Conference la settimana dopo l'ultima
--    gara regolare (3 giorni), Nationals due settimane dopo (4 giorni).
--    Nel titolo lo stato della nostra università: in corsa (posizione),
--    qualificata, non qualificata. Spariscono quando lo staff crea il
--    tabellone vero (da lì ci sono le partite con il loro orario).
-- 2. Ogni mattina staff_reminders_tick() manda un messaggio di SISTEMA a
--    chi deve agire (permesso sport.gestire o universita.gestire) quando
--    c'è da avviare qualcosa: stagione da avviare, gare passate da simulare
--    o pubblicare, Conference da creare, Nationals da creare, stagione da
--    chiudere; per l'università (se il calendario automatico è spento)
--    lezioni da avviare, esami da simulare, risultati da pubblicare.
--    Ogni avviso parte una volta sola (staff_reminders).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. DATE INDICATIVE CON LO STATO DELLA QUALIFICAZIONE
-- ---------------------------------------------------------------------
drop function if exists public.sport_calendar_previews(date, date);
create or replace function public.sport_calendar_previews(p_from date, p_to date)
returns table (key text, sport_id uuid, title text, description text, phase text, day date, end_day date)
language plpgsql
security definer
set search_path = ''
as $$
declare
  x record;
  v_school uuid := (select id from public.sport_teams where is_player_school limit 1);
  v_name text := coalesce((select name from public.sport_teams where is_player_school limit 1), 'La nostra università');
  v_last date;
  v_regular_done boolean;
  v_rank int;
  v_k int;
  v_q text;
  v_ind int;
  v_status text;
begin
  for x in
    select se.id, se.phase as season_phase, s.id as sport, s.icon, s.name,
      (select max(e.starts_at) from public.sport_events e
       where e.season_id = se.id and e.phase = 'regular' and e.status <> 'cancelled') as last_regular
    from public.sport_seasons se join public.sports s on s.id = se.sport_id
    where se.status not in ('planning', 'closed')
  loop
    continue when x.last_regular is null;
    v_last := (x.last_regular at time zone 'Europe/Rome')::date;
    continue when v_last + 7 >= p_to or v_last + 24 < p_from;
    v_regular_done := not exists (select 1 from public.sport_events e where e.season_id = x.id and e.phase = 'regular'
                                  and e.status in ('scheduled', 'postponed', 'simulated'));

    -- torneo di Conference
    if x.season_phase in ('preseason', 'regular')
       and not exists (select 1 from public.sport_events e where e.season_id = x.id and e.phase = 'conference' and e.status <> 'cancelled')
       and not exists (select 1 from public.sport_bracket_matches b where b.season_id = x.id and b.phase = 'conference')
       and v_last + 9 >= p_from and v_last + 7 < p_to then
      v_k := coalesce((select r.conference_teams from public.sport_season_rules r where r.season_id = x.id), 4);
      select (t ->> 'rank')::int into v_rank from jsonb_array_elements(public.sport_table(x.id)) t
      where (t ->> 'team_id')::uuid = v_school;
      v_status := case
        when v_rank is null then ''
        when v_regular_done and (v_k = 0 or v_rank <= v_k) then ' — ' || v_name || ' qualificata ✅'
        when v_regular_done then ' — ' || v_name || ' non qualificata ❌'
        when v_k = 0 then ' — ' || v_name || ' in corsa (' || v_rank || 'ª, passano tutte)'
        else ' — ' || v_name || ' in corsa (' || v_rank || 'ª, passano le prime ' || v_k || ')' end;
      key := 'conf-' || x.id; sport_id := x.sport; phase := 'conference';
      title := x.icon || ' ' || x.name || ' · Torneo di Conference (date indicative)' || v_status;
      description := 'Date indicative: al torneo di Conference vanno le migliori della classifica della stagione regolare'
        || case when v_k > 0 then ' (le prime ' || v_k || ')' else '' end
        || '. Il tabellone vero lo crea lo staff a fine stagione: allora qui compaiono le partite della nostra università con il loro orario.';
      day := v_last + 7; end_day := v_last + 9;
      return next;
    end if;

    -- Nationals
    if x.season_phase in ('preseason', 'regular', 'conference')
       and not exists (select 1 from public.sport_events e where e.season_id = x.id and e.phase = 'national' and e.status <> 'cancelled')
       and not exists (select 1 from public.sport_bracket_matches b where b.season_id = x.id and b.phase = 'nationals')
       and v_last + 24 >= p_from and v_last + 21 < p_to then
      select q.status into v_q from public.sport_qualifications q
      where q.season_id = x.id and q.kind = 'team' and q.team_id = v_school
      order by q.created_at desc limit 1;
      select count(*) into v_ind from public.sport_qualifications q
      where q.season_id = x.id and q.kind = 'individual' and q.status = 'qualificato';
      v_status := case
        when v_q = 'qualificato' then ' — ' || v_name || ' qualificata ✅'
        when v_q = 'escluso' then ' — ' || v_name || ' non qualificata ❌'
        else ' — qualificazione da decidere' end
        || case when v_ind > 0 then ' · ' || v_ind || case when v_ind = 1 then ' atleta qualificato' else ' atleti qualificati' end else '' end;
      key := 'naz-' || x.id; sport_id := x.sport; phase := 'national';
      title := x.icon || ' ' || x.name || ' · Nationals (date indicative)' || v_status;
      description := 'Date indicative: ai Nationals vanno le squadre qualificate (lo staff le calcola e le conferma dopo la Conference) e, negli sport individuali, gli atleti qualificati con i loro voti. Il tabellone vero lo crea lo staff: allora qui compaiono le partite della nostra università con il loro orario. Chi non è qualificato non può essere convocato.';
      day := v_last + 21; end_day := v_last + 24;
      return next;
    end if;
  end loop;
end;
$$;
revoke execute on function public.sport_calendar_previews(date, date) from public, anon, authenticated;

create or replace function public.calendar_range(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(x order by x ->> 'starts_at'), '[]'::jsonb) from (
    select jsonb_build_object('id', e.id, 'source', 'evento', 'title', e.title, 'description', e.description, 'category', e.category,
      'starts_at', e.starts_at, 'ends_at', e.ends_at, 'location', e.location, 'room_id', e.room_id) as x
    from public.calendar_events e
    where e.starts_at < p_to and coalesce(e.ends_at, e.starts_at) >= p_from
    union all
    select jsonb_build_object('id', e.id, 'source', 'sport', 'title', s.icon || ' ' || s.name || coalesce(' · ' || (
        select string_agg(t.name, ' vs ' order by t.is_player_school desc, t.name) from public.sport_event_teams et
        join public.sport_teams t on t.id = et.team_id where et.event_id = e.id), ''),
      'description', e.notes, 'category', 'sport', 'starts_at', e.starts_at, 'ends_at', null,
      'location', case e.venue when 'home' then 'In casa' when 'away' then 'In trasferta' else 'Campo neutro' end,
      'room_id', e.room_id, 'status', e.status, 'phase', e.phase, 'sport_id', s.id, 'recap', case when e.status = 'published' then e.recap_text end)
    from public.sport_events e join public.sports s on s.id = e.sport_id join public.sport_seasons se on se.id = e.season_id
    where se.status <> 'planning' and e.starts_at >= p_from and e.starts_at < p_to
    union all
    -- date indicative di Conference e Nationals (tutto il giorno, più giorni)
    select jsonb_build_object('id', p.key, 'source', 'sport', 'title', p.title, 'description', p.description,
      'category', 'sport', 'starts_at', p.day::timestamp at time zone 'Europe/Rome',
      'ends_at', (p.end_day::timestamp + interval '23 hours 59 minutes') at time zone 'Europe/Rome',
      'location', 'Sede da definire', 'room_id', null, 'phase', p.phase, 'sport_id', p.sport_id, 'all_day', true)
    from public.sport_calendar_previews((p_from at time zone 'Europe/Rome')::date, (p_to at time zone 'Europe/Rome')::date) p
    where auth.uid() is not null
    union all
    select jsonb_build_object('id', e.id, 'source', 'social', 'title', e.title, 'description', e.description, 'category', 'festa',
      'starts_at', e.starts_at, 'ends_at', e.ends_at, 'location', coalesce(r.name, nullif(e.place, ''), ''), 'room_id', e.room_id,
      'organizer', public.first_name(c.name))
    from public.social_events e join public.characters c on c.id = e.character_id left join public.rooms r on r.id = e.room_id
    where e.visibility = 'pubblico' and e.starts_at < p_to and coalesce(e.ends_at, e.starts_at) >= p_from
    union all
    -- università (tutto il giorno; la settimana degli esami e le pause durano più giorni)
    select jsonb_build_object('id', 'uni-' || a.key, 'source', 'universita', 'title', a.title, 'description', a.description,
      'category', 'universita', 'starts_at', a.day::timestamp at time zone 'Europe/Rome',
      'ends_at', case when a.end_day is not null then (a.end_day::timestamp + interval '23 hours 59 minutes') at time zone 'Europe/Rome' end,
      'location', 'UCSD', 'room_id', null, 'all_day', true)
    from public.academic_calendar_items((p_from at time zone 'Europe/Rome')::date, (p_to at time zone 'Europe/Rome')::date) a
    where auth.uid() is not null
    union all
    -- festività americane
    select jsonb_build_object('id', 'fest-' || h.day, 'source', 'festivita', 'title', h.title, 'description', h.description,
      'category', 'festivita', 'starts_at', h.day::timestamp at time zone 'Europe/Rome', 'ends_at', null,
      'location', '', 'room_id', null, 'all_day', true)
    from generate_series(extract(year from p_from at time zone 'Europe/Rome')::int, extract(year from p_to at time zone 'Europe/Rome')::int) yy
    cross join lateral public.us_holidays(yy) h
    where h.day >= (p_from at time zone 'Europe/Rome')::date and h.day < (p_to at time zone 'Europe/Rome')::date
      and auth.uid() is not null
  ) y (x)
$$;
revoke execute on function public.calendar_range(timestamptz, timestamptz) from public, anon;
grant execute on function public.calendar_range(timestamptz, timestamptz) to authenticated;

-- ---------------------------------------------------------------------
-- 2. PROMEMORIA ALLO STAFF (una volta per cosa da fare)
-- ---------------------------------------------------------------------
create table if not exists public.staff_reminders (
  key text primary key check (char_length(key) between 1 and 200),
  permission text not null,
  body text not null,
  sent_at timestamptz not null default now()
);
alter table public.staff_reminders enable row level security;
revoke all on public.staff_reminders from anon, authenticated;
grant select on public.staff_reminders to authenticated;
-- solo lettura per lo staff del pannello; le scrive solo staff_notify
drop policy if exists "Promemoria staff: lettura" on public.staff_reminders;
create policy "Promemoria staff: lettura" on public.staff_reminders for select to authenticated
  using ((select public.has_permission('admin.accedere')));

-- manda il messaggio di SISTEMA a chi ha il permesso (e all'Amministratore), una volta per chiave
create or replace function public.staff_notify(p_key text, p_permission text, p_text text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  u record;
begin
  insert into public.staff_reminders (key, permission, body) values (p_key, p_permission, p_text)
  on conflict (key) do nothing;
  if not found then return false; end if;
  for u in
    select p.id from public.profiles p join public.user_levels l on l.id = p.level_id
    where (l.is_admin or p_permission = any (l.permissions))
      and (p.banned_until is null or p.banned_until < now())
  loop
    perform public.send_system_message(u.id, p_text);
  end loop;
  return true;
end;
$$;
revoke execute on function public.staff_notify(text, text, text) from public, anon, authenticated;

create or replace function public.staff_reminders_tick()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Europe/Rome')::date;
  v_n int := 0;
  x record;
  t public.academic_terms;
  v_first timestamptz;
  v_list text;
  v_sport text;
begin
  -- SPORT
  for x in
    select se.id, se.label, se.status, se.phase, s.icon || ' ' || s.name as sport
    from public.sport_seasons se join public.sports s on s.id = se.sport_id
    where se.status <> 'closed' and s.status = 'active'
  loop
    v_sport := x.sport || ' (' || x.label || ')';

    -- stagione ancora in preparazione e prima gara entro 14 giorni
    if x.status = 'planning' then
      select min(e.starts_at) into v_first from public.sport_events e
      where e.season_id = x.id and e.status in ('scheduled', 'postponed');
      if v_first is not null and v_first < now() + interval '14 days' then
        if public.staff_notify('sport-avvia-' || x.id, 'sport.gestire',
          '🏁 ' || v_sport || ': la stagione è ancora in preparazione e la prima gara è il '
          || to_char(v_first at time zone 'Europe/Rome', 'DD/MM') || '. Avviala da Gestione → Sport: finché non è avviata le gare non compaiono nel calendario e gli atleti non vengono avvisati.')
        then v_n := v_n + 1; end if;
      end if;
      continue;
    end if;

    -- stagione regolare finita: torneo di Conference da creare
    if x.phase in ('preseason', 'regular')
       and exists (select 1 from public.sport_events e where e.season_id = x.id and e.phase = 'regular' and e.status = 'published')
       and not exists (select 1 from public.sport_events e where e.season_id = x.id and e.phase = 'regular'
                       and e.status in ('scheduled', 'postponed', 'simulated'))
       and not exists (select 1 from public.sport_bracket_matches b where b.season_id = x.id and b.phase = 'conference')
       and not exists (select 1 from public.sport_events e where e.season_id = x.id and e.phase = 'conference' and e.status <> 'cancelled') then
      if public.staff_notify('sport-conference-' || x.id, 'sport.gestire',
        '🏟️ ' || v_sport || ': la stagione regolare è finita. Crea il torneo di Conference da Gestione → Sport → Campionato (le squadre si prendono dalla classifica).')
      then v_n := v_n + 1; end if;
    end if;

    -- Conference finita: qualificati e Nationals da creare
    if x.phase = 'conference'
       and (exists (select 1 from public.sport_bracket_matches b where b.season_id = x.id and b.phase = 'conference')
            or exists (select 1 from public.sport_events e where e.season_id = x.id and e.phase = 'conference' and e.status <> 'cancelled'))
       and not exists (select 1 from public.sport_bracket_matches b where b.season_id = x.id and b.phase = 'conference' and b.status <> 'done')
       and not exists (select 1 from public.sport_events e where e.season_id = x.id and e.phase = 'conference'
                       and e.status in ('scheduled', 'postponed', 'simulated'))
       and not exists (select 1 from public.sport_bracket_matches b where b.season_id = x.id and b.phase = 'nationals')
       and not exists (select 1 from public.sport_events e where e.season_id = x.id and e.phase = 'national' and e.status <> 'cancelled') then
      if public.staff_notify('sport-nationals-' || x.id, 'sport.gestire',
        '🏆 ' || v_sport || ': la Conference è finita. Da Gestione → Sport → Campionato calcola e conferma i qualificati, poi crea i Nationals.')
      then v_n := v_n + 1; end if;
    end if;

    -- Nationals finiti: stagione da chiudere
    if x.phase = 'nationals'
       and (exists (select 1 from public.sport_bracket_matches b where b.season_id = x.id and b.phase = 'nationals')
            or exists (select 1 from public.sport_events e where e.season_id = x.id and e.phase = 'national' and e.status <> 'cancelled'))
       and not exists (select 1 from public.sport_bracket_matches b where b.season_id = x.id and b.phase = 'nationals' and b.status <> 'done')
       and not exists (select 1 from public.sport_events e where e.season_id = x.id and e.phase = 'national'
                       and e.status in ('scheduled', 'postponed', 'simulated')) then
      if public.staff_notify('sport-chiudi-' || x.id, 'sport.gestire',
        '🎉 ' || v_sport || ': i Nationals sono finiti. Chiudi la stagione da Gestione → Sport: i premi si assegnano da soli.')
      then v_n := v_n + 1; end if;
    end if;
  end loop;

  -- gare già passate ma non ancora simulate o pubblicate (un elenco al giorno)
  select string_agg('· ' || public.sport_event_label(e.id) || ' — ' || case e.status when 'simulated' then 'da pubblicare' else 'da simulare' end,
                    E'\n' order by e.starts_at)
  into v_list
  from public.sport_events e join public.sport_seasons se on se.id = e.season_id and se.status = 'active'
  where e.status in ('scheduled', 'simulated') and e.starts_at < (v_today::timestamp at time zone 'Europe/Rome');
  if v_list is not null then
    if public.staff_notify('sport-arretrate-' || v_today, 'sport.gestire',
      '⏰ Gare già passate ancora da chiudere:' || E'\n' || v_list || E'\n' || 'Simulale e pubblicale da Gestione → Sport, altrimenti classifica e calendario restano fermi.')
    then v_n := v_n + 1; end if;
  end if;

  -- UNIVERSITÀ (solo con il calendario automatico spento: altrimenti fa tutto da sé)
  if coalesce(public.setting_int('uni_calendario_auto'), 1) <> 1 then
    select * into t from public.academic_terms where status <> 'published' order by created_at desc limit 1;
    if t.id is null then
      if public.staff_notify('uni-nessuno-' || to_char(v_today, 'YYYY-MM'), 'universita.gestire',
        '🎓 Non c''è nessun semestre aperto e il calendario automatico è spento: crea il prossimo semestre da Gestione → Università.')
      then v_n := v_n + 1; end if;
    elsif t.status = 'registration_open' and t.classes_start is not null and v_today >= t.classes_start then
      if public.staff_notify('uni-lezioni-' || t.id, 'universita.gestire',
        '🎓 ' || public.uni_term_label(t.academic_year, t.semester) || ': dal ' || to_char(t.classes_start, 'DD/MM')
        || ' dovrebbero iniziare le lezioni. Avvia il semestre da Gestione → Università.')
      then v_n := v_n + 1; end if;
    elsif t.status = 'in_progress' and t.exams_end is not null and v_today > t.exams_end then
      if public.staff_notify('uni-simula-' || t.id, 'universita.gestire',
        '📝 ' || public.uni_term_label(t.academic_year, t.semester) || ': la settimana degli esami è finita il '
        || to_char(t.exams_end, 'DD/MM') || '. Simula gli esami da Gestione → Università.')
      then v_n := v_n + 1; end if;
    elsif t.status = 'simulated' and t.results_date is not null and v_today >= t.results_date then
      if public.staff_notify('uni-pubblica-' || t.id, 'universita.gestire',
        '📢 ' || public.uni_term_label(t.academic_year, t.semester) || ': oggi (' || to_char(t.results_date, 'DD/MM')
        || ') escono i risultati. Pubblicali da Gestione → Università.')
      then v_n := v_n + 1; end if;
    end if;
  end if;

  -- si tengono 6 mesi
  delete from public.staff_reminders where sent_at < now() - interval '6 months';
  return v_n;
end;
$$;
revoke execute on function public.staff_reminders_tick() from public, anon, authenticated;

-- ogni mattina (pg_cron è in UTC: le 8:10 sono le 9:10 italiane d'inverno)
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('promemoria-staff', '10 8 * * *', 'select public.staff_reminders_tick()');
exception when others then
  raise notice 'pg_cron non disponibile: %', sqlerrm;
end $$;

-- un primo giro subito
select public.staff_reminders_tick() as promemoria_mandati;

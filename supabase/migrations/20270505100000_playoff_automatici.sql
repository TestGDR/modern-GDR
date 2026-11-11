-- =====================================================================
-- SPORT: CONFERENCE E NATIONALS AUTOMATICI
-- Ogni mattina sport_playoffs_tick(), per ogni stagione avviata:
-- 1. finita la stagione regolare (tutte le gare regolari pubblicate o
--    annullate) crea da sé il torneo di Conference (la settimana dopo
--    l'ultima gara regolare; se quella data è passata, fra due giorni);
-- 2. fa avanzare i turni una settimana dopo l'altra: le partite della
--    nostra università sono gare vere (convocazioni, «Gareggia»,
--    simulazione e pubblicazione come le altre) e il turno si chiude
--    quando sono pubblicate; le altre si decidono da sole;
-- 3. con il campione di Conference conferma i qualificati e crea i
--    Nationals (due settimane dopo la fine della Conference), che
--    avanzano allo stesso modo.
-- Chiudere la stagione (premi) resta allo staff, con il promemoria.
-- Nel Calendario Conference e Nationals ci sono sempre, con le loro date:
-- se la nostra università non è qualificata la voce è grigia (locked).
-- =====================================================================

-- date delle due fasi, salvate quando la fase nasce
alter table public.sport_seasons add column if not exists conference_start date;
alter table public.sport_seasons add column if not exists nationals_start date;

-- ---------------------------------------------------------------------
-- 1. QUANTI TURNI E QUALI DATE
-- ---------------------------------------------------------------------
create or replace function public.sport_phase_rounds(p_season uuid, p_phase text)
returns int
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  sp public.sports := (select s from public.sports s join public.sport_seasons se on se.sport_id = s.id where se.id = p_season);
  v_first int;
  v_n int;
  v_k int;
begin
  if sp.format in ('team_race', 'individual_race') then return 1; end if;
  -- tabellone già creato: i turni dalla grandezza del primo turno
  select count(*) into v_first from public.sport_bracket_matches where season_id = p_season and phase = p_phase and round = 1;
  if v_first > 0 then return greatest(1, ceil(log(2, (v_first * 2)::numeric))::int); end if;
  if p_phase = 'conference' then
    v_k := coalesce((select conference_teams from public.sport_season_rules where season_id = p_season), 4);
    select count(*) into v_n from public.sport_teams tm
    where tm.is_player_school or (tm.conference and tm.active
      and exists (select 1 from public.sport_team_ratings r where r.team_id = tm.id and r.sport_id = sp.id));
    if v_k > 0 then v_n := least(v_n, v_k); end if;
  else
    v_n := coalesce((select nationals_slots from public.sport_season_rules where season_id = p_season), 8);
  end if;
  return greatest(1, ceil(log(2, greatest(v_n, 2)::numeric))::int);
end;
$$;
revoke execute on function public.sport_phase_rounds(uuid, text) from public, anon, authenticated;

-- primo e ultimo giorno di Conference e Nationals (un turno a settimana)
create or replace function public.sport_phase_dates(p_season uuid)
returns table (conf_start date, conf_end date, naz_start date, naz_end date)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  se public.sport_seasons := (select s from public.sport_seasons s where s.id = p_season);
  v_today date := (now() at time zone 'Europe/Rome')::date;
  v_last date;
begin
  select (max(e.starts_at) at time zone 'Europe/Rome')::date into v_last
  from public.sport_events e where e.season_id = p_season and e.phase = 'regular' and e.status <> 'cancelled';
  if v_last is null then return; end if;
  conf_start := coalesce(se.conference_start, greatest(v_last + 7, v_today + 2));
  conf_end := conf_start + 7 * (public.sport_phase_rounds(p_season, 'conference') - 1);
  naz_start := coalesce(se.nationals_start, greatest(conf_end + 14, v_today + 2));
  naz_end := naz_start + 7 * (public.sport_phase_rounds(p_season, 'nationals') - 1);
  return next;
end;
$$;
revoke execute on function public.sport_phase_dates(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. IL GIRO AUTOMATICO
-- ---------------------------------------------------------------------
-- un turno del tabellone: si chiude il giorno dopo la sua data, con le nostre partite pubblicate
create or replace function public.sport_playoff_round_step(p_season uuid, p_phase text, p_start date)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_round int;
  v_today date := (now() at time zone 'Europe/Rome')::date;
begin
  select max(round) into v_round from public.sport_bracket_matches where season_id = p_season and phase = p_phase;
  if v_round is null then return false; end if;
  if not exists (select 1 from public.sport_bracket_matches where season_id = p_season and phase = p_phase and round = v_round and status = 'pending') then
    return false;
  end if;
  if v_today <= p_start + 7 * (v_round - 1) then return false; end if;
  if exists (select 1 from public.sport_bracket_matches b join public.sport_events e on e.id = b.event_id
             where b.season_id = p_season and b.phase = p_phase and b.round = v_round and b.status = 'pending'
               and e.status <> 'published') then
    return false;
  end if;
  perform public.sport_bracket_advance(p_season, p_phase, ((p_start + 7 * v_round)::timestamp + time '19:00') at time zone 'Europe/Rome', 7);
  return true;
end;
$$;
revoke execute on function public.sport_playoff_round_step(uuid, text, date) from public, anon, authenticated;

-- gara unica (sport a gare) senza la nostra università: niente gara, il campione per forza
create or replace function public.sport_playoff_race_without_us(p_season uuid, p_phase text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  sp public.sports := (select s from public.sports s join public.sport_seasons se on se.sport_id = s.id where se.id = p_season);
  v_school uuid := (select id from public.sport_teams where is_player_school limit 1);
  v_ev public.sport_events;
  v_champion uuid;
begin
  select e.* into v_ev from public.sport_events e
  where e.season_id = p_season and e.phase = case when p_phase = 'nationals' then 'national' else 'conference' end and e.status <> 'cancelled'
  order by e.starts_at desc limit 1;
  if v_ev.id is null or exists (select 1 from public.sport_event_teams where event_id = v_ev.id and team_id = v_school) then return; end if;
  select et.team_id into v_champion from public.sport_event_teams et
  order by coalesce((select rating from public.sport_team_ratings r where r.team_id = et.team_id and r.sport_id = sp.id), 12) + public.academic_die() desc
  limit 1;
  delete from public.sport_events where id = v_ev.id;
  if p_phase = 'conference' then
    update public.sport_seasons set conference_champion_id = v_champion where id = p_season;
  else
    update public.sport_seasons set national_champion_id = v_champion where id = p_season;
  end if;
  perform public.sport_log(p_season, 'gara senza la nostra università', jsonb_build_object('fase', p_phase,
    'campione', (select name from public.sport_teams where id = v_champion)));
end;
$$;
revoke execute on function public.sport_playoff_race_without_us(uuid, text) from public, anon, authenticated;

create or replace function public.sport_playoffs_tick()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := (select p.id from public.profiles p join public.user_levels l on l.id = p.level_id
                   where l.is_admin order by p.created_at limit 1);
  v_today date := (now() at time zone 'Europe/Rome')::date;
  v_school uuid := (select id from public.sport_teams where is_player_school limit 1);
  x record;
  se public.sport_seasons;
  d record;
  v_n int := 0;
  v_step text;
begin
  if v_admin is null then return 0; end if;
  -- le funzioni del campionato chiedono il permesso: si agisce come l'Amministratore
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  for x in
    select se2.id, s.icon || ' ' || s.name || ' (' || se2.label || ')' as label, s.format
    from public.sport_seasons se2 join public.sports s on s.id = se2.sport_id
    where se2.status = 'active' and s.status = 'active' and se2.phase <> 'concluded'
  loop
    v_step := null;
    begin
      select * into se from public.sport_seasons where id = x.id;
      select * into d from public.sport_phase_dates(x.id);
      continue when d.conf_start is null;

      -- 1. stagione regolare finita → torneo di Conference
      if se.phase in ('preseason', 'regular')
         and exists (select 1 from public.sport_events e where e.season_id = x.id and e.phase = 'regular' and e.status = 'published')
         and not exists (select 1 from public.sport_events e where e.season_id = x.id and e.phase = 'regular'
                         and e.status in ('scheduled', 'postponed', 'simulated'))
         and not exists (select 1 from public.sport_bracket_matches b where b.season_id = x.id and b.phase = 'conference')
         and not exists (select 1 from public.sport_events e where e.season_id = x.id and e.phase = 'conference' and e.status <> 'cancelled') then
        v_step := 'creare il torneo di Conference';
        update public.sport_seasons set conference_start = d.conf_start where id = x.id;
        perform public.sport_conference_generate(x.id, (d.conf_start::timestamp + time '19:00') at time zone 'Europe/Rome');
        perform public.staff_notify('sport-auto-conference-' || x.id, 'sport.gestire',
          '🏟️ ' || x.label || ': stagione regolare finita, ho creato da solo il torneo di Conference (dal '
          || to_char(d.conf_start, 'DD/MM') || '). Convoca gli atleti per le partite della nostra università da Gestione → Sport → Convoca.');
        v_n := v_n + 1;
        continue;
      end if;

      -- 2. Conference in corso: turni e campione
      if se.phase = 'conference' and se.conference_champion_id is null then
        v_step := 'far avanzare la Conference';
        if x.format in ('team_race', 'individual_race') then
          if v_today > se.conference_start then
            perform public.sport_playoff_race_without_us(x.id, 'conference');
            if exists (select 1 from public.sport_events e where e.season_id = x.id and e.phase = 'conference' and e.status = 'published')
               and (select conference_champion_id from public.sport_seasons where id = x.id) is null then
              perform public.sport_bracket_advance(x.id, 'conference');
            end if;
          end if;
        elsif public.sport_playoff_round_step(x.id, 'conference', coalesce(se.conference_start, d.conf_start)) then
          v_n := v_n + 1;
        end if;
        select * into se from public.sport_seasons where id = x.id;
      end if;

      -- 3. campione di Conference → qualificati e Nationals
      if se.phase = 'conference' and se.conference_champion_id is not null
         and not exists (select 1 from public.sport_bracket_matches b where b.season_id = x.id and b.phase = 'nationals')
         and not exists (select 1 from public.sport_events e where e.season_id = x.id and e.phase = 'national' and e.status <> 'cancelled') then
        v_step := 'confermare i qualificati e creare i Nationals';
        if se.qualified_confirmed_at is null then
          perform public.sport_qualification_confirm(x.id);
        end if;
        select * into d from public.sport_phase_dates(x.id);
        update public.sport_seasons set nationals_start = d.naz_start where id = x.id;
        perform public.sport_nationals_generate(x.id, (d.naz_start::timestamp + time '19:00') at time zone 'Europe/Rome');
        perform public.staff_notify('sport-auto-nationals-' || x.id, 'sport.gestire',
          '🏆 ' || x.label || ': Conference finita, ho confermato i qualificati e creato i Nationals (dal '
          || to_char(d.naz_start, 'DD/MM') || '). '
          || case when public.sport_can_play_nationals(x.id, v_school) then 'La nostra università è qualificata: convoca gli atleti da Gestione → Sport → Convoca.'
                  else 'La nostra università non è qualificata.' end);
        v_n := v_n + 1;
        continue;
      end if;

      -- 4. Nationals in corso: turni e campione
      if se.phase = 'nationals' and se.national_champion_id is null then
        v_step := 'far avanzare i Nationals';
        if x.format in ('team_race', 'individual_race') then
          if v_today > se.nationals_start then
            perform public.sport_playoff_race_without_us(x.id, 'nationals');
            if exists (select 1 from public.sport_events e where e.season_id = x.id and e.phase = 'national' and e.status = 'published')
               and (select national_champion_id from public.sport_seasons where id = x.id) is null then
              perform public.sport_bracket_advance(x.id, 'nationals');
            end if;
          end if;
        elsif public.sport_playoff_round_step(x.id, 'nationals', coalesce(se.nationals_start, d.naz_start)) then
          v_n := v_n + 1;
        end if;
      end if;
    exception when others then
      perform public.staff_notify('sport-auto-errore-' || x.id || '-' || coalesce(v_step, 'campionato'), 'sport.gestire',
        '⚠️ ' || x.label || ': non sono riuscito a ' || coalesce(v_step, 'aggiornare il campionato') || ' da solo ('
        || sqlerrm || '). Fallo da Gestione → Sport → Campionato.');
    end;
  end loop;
  return v_n;
end;
$$;
revoke execute on function public.sport_playoffs_tick() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. PROMEMORIA ALLO STAFF: Conference e Nationals ora nascono da soli
-- ---------------------------------------------------------------------
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
    select se.id, se.label, se.status, se.phase, se.national_champion_id, s.icon || ' ' || s.name as sport
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

    -- Nationals finiti: stagione da chiudere (premi)
    if x.phase = 'nationals' and x.national_champion_id is not null then
      if public.staff_notify('sport-chiudi-' || x.id, 'sport.gestire',
        '🎉 ' || v_sport || ': i Nationals sono finiti. Chiudi la stagione da Gestione → Sport: i premi si assegnano da soli.')
      then v_n := v_n + 1; end if;
    end if;
  end loop;

  -- gare già passate ma non ancora simulate o pubblicate (un elenco al giorno):
  -- finché non sono pubblicate anche Conference e Nationals restano fermi
  select string_agg('· ' || public.sport_event_label(e.id) || ' — ' || case e.status when 'simulated' then 'da pubblicare' else 'da simulare' end,
                    E'\n' order by e.starts_at)
  into v_list
  from public.sport_events e join public.sport_seasons se on se.id = e.season_id and se.status = 'active'
  where e.status in ('scheduled', 'simulated') and e.starts_at < (v_today::timestamp at time zone 'Europe/Rome');
  if v_list is not null then
    if public.staff_notify('sport-arretrate-' || v_today, 'sport.gestire',
      '⏰ Gare già passate ancora da chiudere:' || E'\n' || v_list || E'\n'
      || 'Simulale e pubblicale da Gestione → Sport: finché non sono pubblicate classifica, Conference e Nationals restano fermi.')
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

  delete from public.staff_reminders where sent_at < now() - interval '6 months';
  return v_n;
end;
$$;
revoke execute on function public.staff_reminders_tick() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. CALENDARIO: Conference e Nationals sempre presenti, grigi se non qualificati
-- ---------------------------------------------------------------------
drop function if exists public.sport_calendar_previews(date, date);
create or replace function public.sport_calendar_previews(p_from date, p_to date)
returns table (key text, sport_id uuid, title text, description text, phase text, day date, end_day date, locked boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  x record;
  d record;
  v_school uuid := (select id from public.sport_teams where is_player_school limit 1);
  v_name text := coalesce((select name from public.sport_teams where is_player_school limit 1), 'La nostra università');
  v_regular_done boolean;
  v_generated boolean;
  v_rank int;
  v_k int;
  v_ind int;
begin
  for x in
    select se.id, se.phase as season_phase, se.qualified_confirmed_at, s.id as sport, s.icon, s.name
    from public.sport_seasons se join public.sports s on s.id = se.sport_id
    where se.status = 'active' and s.status = 'active'
  loop
    select * into d from public.sport_phase_dates(x.id);
    continue when d.conf_start is null;
    continue when d.conf_start > p_to and d.naz_start > p_to;
    continue when d.conf_end < p_from and d.naz_end < p_from;

    -- TORNEO DI CONFERENCE (se la nostra università ci gioca ci sono le sue partite vere)
    if d.conf_start < p_to and d.conf_end >= p_from
       and not exists (select 1 from public.sport_events e join public.sport_event_teams et on et.event_id = e.id and et.team_id = v_school
                       where e.season_id = x.id and e.phase = 'conference' and e.status <> 'cancelled')
       and not exists (select 1 from public.sport_bracket_matches b where b.season_id = x.id and b.phase = 'conference'
                       and v_school in (b.team_a, b.team_b)) then
      v_generated := exists (select 1 from public.sport_bracket_matches b where b.season_id = x.id and b.phase = 'conference')
        or exists (select 1 from public.sport_events e where e.season_id = x.id and e.phase = 'conference')
        or x.season_phase in ('conference', 'nationals');
      key := 'conf-' || x.id; sport_id := x.sport; phase := 'conference';
      day := d.conf_start; end_day := d.conf_end;
      if v_generated then
        locked := true;
        title := x.icon || ' ' || x.name || ' · Torneo di Conference — ' || v_name || ' non qualificata';
        description := 'La nostra università non è entrata nel torneo di Conference: niente gare né convocazioni. Il tabellone completo è nella pagina Sport.';
      else
        v_regular_done := not exists (select 1 from public.sport_events e where e.season_id = x.id and e.phase = 'regular'
                                      and e.status in ('scheduled', 'postponed', 'simulated'));
        v_k := coalesce((select r.conference_teams from public.sport_season_rules r where r.season_id = x.id), 4);
        v_rank := null;
        select (t ->> 'rank')::int into v_rank from jsonb_array_elements(public.sport_table(x.id)) t
        where (t ->> 'team_id')::uuid = v_school;
        locked := v_regular_done and v_k > 0 and v_rank is not null and v_rank > v_k;
        title := x.icon || ' ' || x.name || ' · Torneo di Conference — ' || v_name || case
          when v_rank is null then ' in attesa'
          when locked then ' non qualificata'
          when v_regular_done then ' qualificata'
          when v_k = 0 then ' in corsa (' || v_rank || 'ª, passano tutte)'
          else ' in corsa (' || v_rank || 'ª, passano le prime ' || v_k || ')' end;
        description := 'Al torneo di Conference vanno le migliori della classifica della stagione regolare'
          || case when v_k > 0 then ' (le prime ' || v_k || ')' else '' end
          || '. Si crea da solo a fine stagione regolare: se la nostra università è qualificata qui compaiono le sue partite, con convocazioni e tiri come le altre gare.';
      end if;
      return next;
    end if;

    -- NATIONALS
    if d.naz_start < p_to and d.naz_end >= p_from
       and not exists (select 1 from public.sport_events e join public.sport_event_teams et on et.event_id = e.id and et.team_id = v_school
                       where e.season_id = x.id and e.phase = 'national' and e.status <> 'cancelled')
       and not exists (select 1 from public.sport_bracket_matches b where b.season_id = x.id and b.phase = 'nationals'
                       and v_school in (b.team_a, b.team_b)) then
      v_generated := exists (select 1 from public.sport_bracket_matches b where b.season_id = x.id and b.phase = 'nationals')
        or exists (select 1 from public.sport_events e where e.season_id = x.id and e.phase = 'national')
        or x.season_phase = 'nationals';
      select count(*) into v_ind from public.sport_qualifications q
      where q.season_id = x.id and q.kind = 'individual' and q.status = 'qualificato';
      key := 'naz-' || x.id; sport_id := x.sport; phase := 'national';
      day := d.naz_start; end_day := d.naz_end;
      if v_generated or (x.qualified_confirmed_at is not null and not public.sport_can_play_nationals(x.id, v_school)) then
        locked := true;
        title := x.icon || ' ' || x.name || ' · Nationals — ' || v_name || ' non qualificata';
        description := 'La nostra università non si è qualificata ai Nationals: niente gare né convocazioni. Il tabellone completo è nella pagina Sport.';
      else
        locked := false;
        title := x.icon || ' ' || x.name || ' · Nationals — ' || case
          when x.qualified_confirmed_at is not null then v_name || ' qualificata'
          else 'qualificazione da decidere' end
          || case when v_ind > 0 then ' · ' || v_ind || case when v_ind = 1 then ' atleta qualificato' else ' atleti qualificati' end else '' end;
        description := 'Ai Nationals vanno le squadre qualificate (si confermano da sole alla fine della Conference) e, negli sport individuali, gli atleti qualificati con i loro voti. Se la nostra università è qualificata qui compaiono le sue partite, con convocazioni e tiri come le altre gare. Chi non è qualificato non può essere convocato.';
      end if;
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
    -- Conference e Nationals senza partite della nostra università (in corsa o non qualificata)
    select jsonb_build_object('id', p.key, 'source', 'sport', 'title', p.title, 'description', p.description,
      'category', 'sport', 'starts_at', p.day::timestamp at time zone 'Europe/Rome',
      'ends_at', (p.end_day::timestamp + interval '23 hours 59 minutes') at time zone 'Europe/Rome',
      'location', case when p.locked then 'Senza la nostra università' else 'Sede da definire' end, 'room_id', null, 'phase', p.phase, 'sport_id', p.sport_id, 'all_day', true, 'locked', p.locked)
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
-- 5. OGNI MATTINA (prima dei promemoria) e un primo giro subito
-- ---------------------------------------------------------------------
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('sport-playoff', '50 7 * * *', 'select public.sport_playoffs_tick()');
exception when others then
  raise notice 'pg_cron non disponibile: %', sqlerrm;
end $$;

select public.sport_playoffs_tick() as passi_del_campionato, public.staff_reminders_tick() as promemoria_mandati;

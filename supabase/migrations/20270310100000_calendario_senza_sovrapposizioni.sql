-- =====================================================================
-- SPORT: CALENDARIO SENZA SOVRAPPOSIZIONI
-- - Al massimo 2 gare al giorno (tutti gli sport insieme), mai due dello
--   stesso sport nello stesso giorno, e mai alla stessa ora: le due gare
--   di un giorno sono alle 19:00 e alle 21:30 (ora italiana).
--   sport_free_slot(da, sport) dà il primo posto libero da quella data.
-- - Una volta: le gare future non ancora giocate si ricollocano in ordine
--   (mai prima della loro data, e ogni sport mantiene la sua sequenza);
--   casa e trasferta si alternano gara dopo gara in ogni stagione.
-- - Il calendario automatico, i tabelloni e le finali usano gli stessi
--   posti liberi e alternano casa e trasferta.
-- =====================================================================

create or replace function public.sport_free_slot(p_from timestamptz, p_sport uuid, p_exclude uuid default null)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_day date := (p_from at time zone 'Europe/Rome')::date;
  v_slots time[] := array['19:00'::time, '21:30'::time];
  v_d date;
  v_t timestamptz;
  s time;
begin
  for k in 0..400 loop
    v_d := v_day + k;
    -- niente due gare dello stesso sport nello stesso giorno
    continue when exists (select 1 from public.sport_events e
                          where e.sport_id = p_sport and e.status <> 'cancelled' and e.id is distinct from p_exclude
                            and (e.starts_at at time zone 'Europe/Rome')::date = v_d);
    -- al massimo due gare al giorno
    continue when (select count(*) from public.sport_events e
                   where e.status <> 'cancelled' and e.id is distinct from p_exclude
                     and (e.starts_at at time zone 'Europe/Rome')::date = v_d) >= 2;
    foreach s in array v_slots loop
      v_t := (v_d::timestamp + s) at time zone 'Europe/Rome';
      -- mai prima dell'ora richiesta nello stesso giorno, e mai alla stessa ora di un'altra gara
      continue when v_t < p_from - interval '6 hours';
      continue when exists (select 1 from public.sport_events e
                            where e.status <> 'cancelled' and e.id is distinct from p_exclude and e.starts_at = v_t);
      return v_t;
    end loop;
  end loop;
  return p_from;
end;
$$;
revoke execute on function public.sport_free_slot(timestamptz, uuid, uuid) from public, anon, authenticated;

-- una volta: le gare future si ricollocano senza sovrapposizioni
-- (niente un avviso per gara: alla fine uno solo per sport)
alter table public.sport_events disable trigger sport_events_notify;

do $$
declare
  e record;
  v_from timestamptz;
  v_new timestamptz;
  v_moved int := 0;
begin
  create temp table sport_todo on commit drop as
    select id, sport_id, season_id, starts_at as old_at, null::timestamptz as new_at
    from public.sport_events
    where status in ('scheduled', 'postponed') and starts_at > now();
  -- si tolgono di mezzo, poi si rimettono una alla volta nell'ordine di prima
  update public.sport_events ev set starts_at = timestamptz '2100-01-01 00:00 UTC' + make_interval(mins => t.n)
  from (select id, row_number() over (order by old_at, id)::int as n from sport_todo) t where ev.id = t.id;
  for e in select * from sport_todo order by old_at, id loop
    v_from := greatest(e.old_at,
      coalesce((select max(new_at) from sport_todo x where x.sport_id = e.sport_id and x.new_at is not null) + interval '1 day', '-infinity'));
    v_new := public.sport_free_slot(v_from, e.sport_id, e.id);
    update public.sport_events set starts_at = v_new,
      reminded_at = case when v_new is distinct from e.old_at then null else reminded_at end
    where id = e.id;
    update sport_todo set new_at = v_new where id = e.id;
    if v_new is distinct from e.old_at then v_moved := v_moved + 1; end if;
  end loop;
  raise notice 'Gare ricollocate: % su %', v_moved, (select count(*) from sport_todo);
end $$;

-- una volta: casa e trasferta alternate gara dopo gara (quelle giocate restano come sono)
do $$
declare
  s record;
  e record;
  v_prev text;
  v_venue text;
  v_changed int := 0;
begin
  for s in select distinct season_id from public.sport_events loop
    v_prev := null;
    for e in
      select id, venue, status, starts_at from public.sport_events
      where season_id = s.season_id and status <> 'cancelled' and phase in ('friendly', 'regular') and venue in ('home', 'away')
      order by starts_at, id
    loop
      if e.status in ('scheduled', 'postponed') and e.starts_at > now() then
        v_venue := case when v_prev = 'home' then 'away' else 'home' end;
        if v_venue <> e.venue then
          update public.sport_events set venue = v_venue where id = e.id;
          v_changed := v_changed + 1;
        end if;
        v_prev := v_venue;
      else
        v_prev := e.venue;
      end if;
    end loop;
  end loop;
  raise notice 'Casa/trasferta cambiate: %', v_changed;
end $$;

alter table public.sport_events enable trigger sport_events_notify;

do $$
declare
  sp record;
begin
  for sp in
    select distinct s.id, s.name from public.sports s join public.sport_events e on e.sport_id = s.id
    join public.sport_seasons se on se.id = e.season_id
    where se.status = 'active' and e.status in ('scheduled', 'postponed') and e.starts_at > now()
  loop
    perform public.sport_notify_athletes(sp.id, '📅 ' || sp.name || ': il calendario è stato riorganizzato (al massimo due gare al giorno, casa e trasferta alternate). Controlla date e orari nella pagina Sport.');
  end loop;
end $$;

-- calendario automatico, tabelloni e finali: posti liberi e casa/trasferta alternate
create or replace function public.sport_season_generate(p_season uuid, p_start timestamptz, p_days int default 7)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  se public.sport_seasons;
  sp public.sports;
  ru public.sport_season_rules;
  v_school uuid;
  v_rivals uuid[];
  v_others uuid[];
  v_n int := 0;
  v_ev uuid;
  v_at timestamptz;
  v_prev timestamptz;
begin
  if not public.has_permission('sport.gestire') then raise exception 'Non hai il permesso di gestire lo sport.' using errcode = '42501'; end if;
  select * into se from public.sport_seasons where id = p_season;
  if se.id is null or se.status = 'closed' then raise exception 'Stagione non modificabile.' using errcode = 'P0001'; end if;
  select * into sp from public.sports where id = se.sport_id;
  ru := public.sport_rules(p_season);
  select id into v_school from public.sport_teams where is_player_school;
  if sp.format in ('team_match', 'individual_match') then
    select array_agg(tm.id order by random()) into v_rivals
    from public.sport_teams tm join public.sport_team_ratings r on r.team_id = tm.id and r.sport_id = sp.id
    where tm.conference and tm.active and not tm.is_player_school;
    select array_agg(tm.id order by r.rating desc, random()) into v_others
    from public.sport_teams tm join public.sport_team_ratings r on r.team_id = tm.id and r.sport_id = sp.id
    where tm.is_national and tm.active;
    -- prima le partite fuori Conference, contro le grandi università
    if coalesce(array_length(v_others, 1), 0) > 0 then
      for i in 1..ru.nonconf_games loop
        v_at := public.sport_free_slot(greatest(p_start + make_interval(days => v_n * greatest(1, p_days)), coalesce(v_prev + interval '1 day', '-infinity')), sp.id);
        v_prev := v_at;
        insert into public.sport_events (season_id, sport_id, kind, phase, starts_at, venue, notes)
        values (p_season, sp.id, case when sp.format = 'team_match' then 'partita' else 'incontro' end, 'regular',
          v_at, case when v_n % 2 = 0 then 'home' else 'away' end, 'Fuori Conference')
        returning id into v_ev;
        insert into public.sport_event_teams (event_id, team_id) values (v_ev, v_school), (v_ev, v_others[1 + (i - 1) % array_length(v_others, 1)]);
        v_n := v_n + 1;
      end loop;
    end if;
    for k in 1..ru.regular_rounds loop
      for i in 1..coalesce(array_length(v_rivals, 1), 0) loop
        v_at := public.sport_free_slot(greatest(p_start + make_interval(days => v_n * greatest(1, p_days)), coalesce(v_prev + interval '1 day', '-infinity')), sp.id);
        v_prev := v_at;
        insert into public.sport_events (season_id, sport_id, kind, phase, starts_at, venue)
        values (p_season, sp.id, case when sp.format = 'team_match' then 'partita' else 'incontro' end, 'regular',
          v_at,
          -- casa e trasferta si alternano gara dopo gara
          case when v_n % 2 = 0 then 'home' else 'away' end)
        returning id into v_ev;
        insert into public.sport_event_teams (event_id, team_id) values (v_ev, v_school), (v_ev, v_rivals[i]);
        v_n := v_n + 1;
      end loop;
    end loop;
  else
    -- gare: un meeting con tutta la Conference ogni periodo
    for i in 0..greatest(1, ru.race_meets) - 1 loop
      v_at := public.sport_free_slot(greatest(p_start + make_interval(days => i * greatest(1, p_days)), coalesce(v_prev + interval '1 day', '-infinity')), sp.id);
      v_prev := v_at;
      insert into public.sport_events (season_id, sport_id, kind, phase, starts_at, venue)
      values (p_season, sp.id, case when sp.format = 'team_race' then 'regata' else 'meeting' end, 'regular',
        v_at, case when i % 2 = 0 then 'home' else 'away' end)
      returning id into v_ev;
      insert into public.sport_event_teams (event_id, team_id)
      select v_ev, tm.id from public.sport_teams tm
      where tm.is_player_school or (tm.conference and tm.active and exists (select 1 from public.sport_team_ratings r where r.team_id = tm.id and r.sport_id = sp.id));
      v_n := v_n + 1;
    end loop;
  end if;
  perform public.sport_log(p_season, 'calendario generato', jsonb_build_object('gare', v_n));
  return v_n;
end;
$$;
revoke execute on function public.sport_season_generate(uuid, timestamptz, int) from public, anon;
grant execute on function public.sport_season_generate(uuid, timestamptz, int) to authenticated;

create or replace function public.sport_bracket_add(p_season uuid, p_phase text, p_round int, p_slot int, p_a uuid, p_b uuid, p_start timestamptz, p_matches int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  sp public.sports := (select s from public.sports s join public.sport_seasons se on se.sport_id = s.id where se.id = p_season);
  v_school uuid := (select id from public.sport_teams where is_player_school);
  v_ev uuid;
begin
  if p_a is null or p_b is null then
    -- turno libero: passa chi c'è
    insert into public.sport_bracket_matches (season_id, phase, round, slot, team_a, team_b, winner_id, status)
    values (p_season, p_phase, p_round, p_slot, p_a, p_b, coalesce(p_a, p_b), 'done');
    return;
  end if;
  if v_school in (p_a, p_b) then
    insert into public.sport_events (season_id, sport_id, kind, phase, starts_at, venue, notes)
    values (p_season, sp.id, case when sp.format = 'team_match' then 'partita' else 'incontro' end,
      case when p_phase = 'nationals' then 'national' else 'conference' end, public.sport_free_slot(p_start, sp.id), 'neutral',
      case when p_phase = 'nationals' then 'Nationals' else 'Conference' end || ' · ' || public.sport_round_name(p_matches))
    returning id into v_ev;
    insert into public.sport_event_teams (event_id, team_id) values (v_ev, p_a), (v_ev, p_b);
  end if;
  insert into public.sport_bracket_matches (season_id, phase, round, slot, team_a, team_b, event_id)
  values (p_season, p_phase, p_round, p_slot, p_a, p_b, v_ev);
end;
$$;
revoke execute on function public.sport_bracket_add(uuid, text, int, int, uuid, uuid, timestamptz, int) from public, anon, authenticated;

create or replace function public.sport_final_event(p_season uuid, p_phase text, p_teams uuid[], p_start timestamptz)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  sp public.sports := (select s from public.sports s join public.sport_seasons se on se.sport_id = s.id where se.id = p_season);
  v_ev uuid;
begin
  insert into public.sport_events (season_id, sport_id, kind, phase, starts_at, venue, notes)
  values (p_season, sp.id, case when sp.format = 'team_race' then 'regata' else 'meeting' end,
    case when p_phase = 'nationals' then 'national' else 'conference' end, public.sport_free_slot(p_start, sp.id), 'neutral',
    case when p_phase = 'nationals' then 'Nationals · Finale' else 'Conference Championship' end)
  returning id into v_ev;
  insert into public.sport_event_teams (event_id, team_id) select v_ev, t from unnest(p_teams) t on conflict do nothing;
  return v_ev;
end;
$$;
revoke execute on function public.sport_final_event(uuid, text, uuid[], timestamptz) from public, anon, authenticated;

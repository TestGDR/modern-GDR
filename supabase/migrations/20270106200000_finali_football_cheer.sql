-- =====================================================================
-- FINALI DI STAGIONE 2026-27 (eseguito dall'SQL Editor)
-- Football: 14/11 in casa e 21/11 in trasferta contro le due rivali più
-- forti, Conference Championship il 5/12, Bowl contro una nazionale il 19/12.
-- Cheerleading: Conference Championship il 6/2 e Nationals il 10/4.
-- =====================================================================
do $$
declare
  v_season uuid;
  v_sport uuid;
  v_school uuid := (select id from public.sport_teams where is_player_school);
  v_rivals uuid[];
  v_national uuid;
  v_ev uuid;
begin
  select se.id, se.sport_id into v_season, v_sport
  from public.sport_seasons se join public.sports s on s.id = se.sport_id
  where s.name ilike 'football%' and se.status = 'active' limit 1;
  if v_season is null then raise exception 'Nessuna stagione di Football attiva.'; end if;

  select array_agg(t.id order by r.rating desc) into v_rivals
  from public.sport_teams t join public.sport_team_ratings r on r.team_id = t.id and r.sport_id = v_sport
  where t.conference and t.active and not t.is_player_school;
  select t.id into v_national
  from public.sport_teams t join public.sport_team_ratings r on r.team_id = t.id and r.sport_id = v_sport
  where t.is_national and t.active order by random() limit 1;

  insert into public.sport_events (season_id, sport_id, kind, phase, starts_at, venue)
  values (v_season, v_sport, 'partita', 'regular', timestamptz '2026-11-14 19:00 Europe/Rome', 'home') returning id into v_ev;
  insert into public.sport_event_teams (event_id, team_id) values (v_ev, v_school), (v_ev, v_rivals[1]);

  insert into public.sport_events (season_id, sport_id, kind, phase, starts_at, venue)
  values (v_season, v_sport, 'partita', 'regular', timestamptz '2026-11-21 19:00 Europe/Rome', 'away') returning id into v_ev;
  insert into public.sport_event_teams (event_id, team_id) values (v_ev, v_school), (v_ev, coalesce(v_rivals[2], v_rivals[1]));

  insert into public.sport_events (season_id, sport_id, kind, phase, starts_at, venue, notes)
  values (v_season, v_sport, 'partita', 'conference', timestamptz '2026-12-05 19:00 Europe/Rome', 'neutral', 'Conference Championship') returning id into v_ev;
  insert into public.sport_event_teams (event_id, team_id) values (v_ev, v_school), (v_ev, v_rivals[1]);

  if v_national is not null then
    insert into public.sport_events (season_id, sport_id, kind, phase, starts_at, venue, notes)
    values (v_season, v_sport, 'partita', 'national', timestamptz '2026-12-19 19:00 Europe/Rome', 'neutral', 'Bowl') returning id into v_ev;
    insert into public.sport_event_teams (event_id, team_id) values (v_ev, v_school), (v_ev, v_national);
  end if;
end;
$$;

do $$
declare
  v_season uuid;
  v_sport uuid;
  v_ev uuid;
begin
  select se.id, se.sport_id into v_season, v_sport
  from public.sport_seasons se join public.sports s on s.id = se.sport_id
  where s.name ilike 'cheerleading%' and se.status = 'active' limit 1;
  if v_season is null then raise exception 'Nessuna stagione di Cheerleading attiva.'; end if;

  insert into public.sport_events (season_id, sport_id, kind, phase, starts_at, venue, notes)
  values (v_season, v_sport, 'gara', 'conference', timestamptz '2027-02-06 19:00 Europe/Rome', 'neutral', 'Conference Championship')
  returning id into v_ev;
  insert into public.sport_event_teams (event_id, team_id)
  select v_ev, t.id from public.sport_teams t
  where t.is_player_school or (t.conference and t.active and exists (select 1 from public.sport_team_ratings r where r.team_id = t.id and r.sport_id = v_sport));

  insert into public.sport_events (season_id, sport_id, kind, phase, starts_at, venue, notes)
  values (v_season, v_sport, 'gara', 'national', timestamptz '2027-04-10 19:00 Europe/Rome', 'neutral', 'Nationals')
  returning id into v_ev;
  insert into public.sport_event_teams (event_id, team_id)
  select v_ev, t.id from public.sport_teams t
  where t.is_player_school or (t.active and (t.conference or t.is_national)
        and exists (select 1 from public.sport_team_ratings r where r.team_id = t.id and r.sport_id = v_sport));
end;
$$;

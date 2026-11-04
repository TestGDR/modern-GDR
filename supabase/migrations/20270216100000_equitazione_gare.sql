-- =====================================================================
-- EQUITAZIONE: UNA GARA CONTRO OGNI RIVALE DELLA CONFERENCE
-- Tutte le università della Conference hanno l'equitazione; alla stagione
-- 2026-27 si aggiunge una gara a settimana (dopo l'ultima) contro ogni
-- rivale che ancora non ce l'ha, alternando casa e trasferta.
-- =====================================================================
do $$
declare
  v_sport uuid := (select id from public.sports where name = 'Equitazione');
  v_season uuid;
  v_school uuid := (select id from public.sport_teams where is_player_school);
  v_last timestamptz;
  v_n int;
  v_ev uuid;
  rv record;
begin
  select id into v_season from public.sport_seasons where sport_id = v_sport and label = '2026-27';
  if v_season is null then return; end if;

  insert into public.sport_team_ratings (team_id, sport_id, rating)
  select tm.id, v_sport, 8 + (abs(hashtext(tm.name || 'Equitazione')) % 9)
  from public.sport_teams tm where tm.conference and tm.active and not tm.is_player_school
  on conflict do nothing;

  select max(starts_at), count(*) into v_last, v_n from public.sport_events where season_id = v_season;
  for rv in
    select tm.id from public.sport_teams tm
    join public.sport_team_ratings r on r.team_id = tm.id and r.sport_id = v_sport
    where tm.conference and tm.active and not tm.is_player_school
      and not exists (select 1 from public.sport_event_teams et join public.sport_events e on e.id = et.event_id
                      where e.season_id = v_season and et.team_id = tm.id)
    order by tm.name
  loop
    v_last := v_last + interval '7 days';
    insert into public.sport_events (season_id, sport_id, kind, phase, starts_at, venue)
    values (v_season, v_sport, 'incontro', 'regular', v_last, case when v_n % 2 = 0 then 'home' else 'away' end)
    returning id into v_ev;
    insert into public.sport_event_teams (event_id, team_id) values (v_ev, v_school), (v_ev, rv.id);
    v_n := v_n + 1;
  end loop;
end;
$$;

-- =====================================================================
-- EQUITAZIONE ENGLISH E WESTERN: CALENDARIO COMPLETO
-- Per ogni stagione non chiusa di Equitazione English ed Equitazione
-- Western: un dual meet contro ogni università della Big West che non è
-- ancora in calendario (stagione regolare), uno a settimana dopo l'ultima
-- gara, alternando casa e trasferta. Senza gare si parte dal 13/02/2027.
-- =====================================================================
do $$
declare
  v_school uuid := (select id from public.sport_teams where is_player_school);
  sp record;
  v_season uuid;
  v_last timestamptz;
  v_n int;
  v_added int;
  v_ev uuid;
  rv record;
begin
  for sp in select id, name from public.sports where name in ('Equitazione English', 'Equitazione Western') loop
    select id into v_season from public.sport_seasons where sport_id = sp.id and status <> 'closed' order by created_at desc limit 1;
    if v_season is null then
      insert into public.sport_seasons (sport_id, label) values (sp.id, '2026-27')
      on conflict (sport_id, label) do nothing returning id into v_season;
      if v_season is null then
        raise notice '%: nessuna stagione aperta (la 2026-27 è chiusa)', sp.name;
        continue;
      end if;
    end if;

    select max(starts_at) into v_last from public.sport_events where season_id = v_season and status <> 'cancelled';
    v_last := coalesce(v_last, timestamptz '2027-02-06 19:00 Europe/Rome');
    select count(*) into v_n from public.sport_events where season_id = v_season and phase = 'regular' and status <> 'cancelled';
    v_added := 0;

    for rv in
      select t.id, t.name from public.sport_teams t join public.sport_team_ratings r on r.team_id = t.id and r.sport_id = sp.id
      where t.conference and t.active and not t.is_player_school
        and not exists (
          select 1 from public.sport_events e join public.sport_event_teams et on et.event_id = e.id
          where e.season_id = v_season and e.phase = 'regular' and e.status <> 'cancelled' and et.team_id = t.id)
      order by r.rating, t.name
    loop
      v_added := v_added + 1;
      insert into public.sport_events (season_id, sport_id, kind, phase, starts_at, venue)
      values (v_season, sp.id, 'incontro', 'regular', v_last + make_interval(days => 7 * v_added),
              case when (v_n + v_added) % 2 = 0 then 'away' else 'home' end)
      returning id into v_ev;
      insert into public.sport_event_teams (event_id, team_id) values (v_ev, v_school), (v_ev, rv.id);
    end loop;

    if v_added > 0 then
      perform public.sport_log(v_season, 'calendario completato', jsonb_build_object('gare', v_added));
    end if;
    raise notice '%: % gare aggiunte, % in tutto nella stagione regolare', sp.name, v_added, v_n + v_added;
  end loop;
end $$;

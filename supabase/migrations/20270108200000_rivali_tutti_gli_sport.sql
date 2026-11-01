-- =====================================================================
-- TUTTE LE RIVALI DELLA CONFERENCE IN TUTTI GLI SPORT (eseguito dall'SQL Editor)
-- Forza (8-16) alle rivali che non l'avevano; nelle stagioni aperte una
-- partita in più contro di loro (sport a partite) o l'ingresso nelle gare
-- ancora da giocare (sport a gare).
-- =====================================================================
do $$
declare
  t record;
  se record;
  v_school uuid := (select id from public.sport_teams where is_player_school);
  v_ev uuid;
  v_when timestamptz;
begin
  for t in
    select tm.id as team_id, tm.name as team_name, s.id as sport_id, s.format
    from public.sport_teams tm cross join public.sports s
    where tm.conference and tm.active and not tm.is_player_school and s.status = 'active'
      and not exists (select 1 from public.sport_team_ratings r where r.team_id = tm.id and r.sport_id = s.id)
  loop
    insert into public.sport_team_ratings (team_id, sport_id, rating)
    values (t.team_id, t.sport_id, 8 + (abs(hashtext(t.team_name || t.sport_id::text)) % 9))
    on conflict do nothing;

    for se in select id from public.sport_seasons where sport_id = t.sport_id and status in ('planning', 'active') loop
      if t.format in ('team_match', 'individual_match') then
        select greatest(coalesce(max(e.starts_at), now()), now()) + interval '7 days' into v_when
        from public.sport_events e where e.season_id = se.id;
        insert into public.sport_events (season_id, sport_id, kind, phase, starts_at, venue)
        values (se.id, t.sport_id, case when t.format = 'team_match' then 'partita' else 'incontro' end, 'regular',
                (date_trunc('day', v_when at time zone 'Europe/Rome') + interval '19 hours') at time zone 'Europe/Rome', 'home')
        returning id into v_ev;
        insert into public.sport_event_teams (event_id, team_id) values (v_ev, v_school), (v_ev, t.team_id);
      else
        insert into public.sport_event_teams (event_id, team_id)
        select e.id, t.team_id from public.sport_events e
        where e.season_id = se.id and e.status = 'scheduled' and e.starts_at > now()
        on conflict do nothing;
      end if;
    end loop;
  end loop;
end;
$$;

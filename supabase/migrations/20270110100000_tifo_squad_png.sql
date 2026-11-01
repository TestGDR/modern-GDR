-- =====================================================================
-- TIFO A BORDO CAMPO CON LO SQUAD PNG
-- Lo squad di cheerleading c'è sempre (come le squadre PNG nelle gare):
-- d10 + forza dell'università nella cheerleading → +1 (6 o più) o +2 (10
-- o più) alla squadra di football. Le cheerleader personaggi convocate si
-- sommano (media dei contributi, se positiva). Massimo sport_tifo_max (2).
-- =====================================================================

create or replace function public.sport_event_simulate(p_event uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev public.sport_events;
  sp public.sports;
  v_school uuid;
  v_school_rating int;
  v_cd int := coalesce(public.setting_int('sport_cd'), 12);
  v_cap int := coalesce(public.setting_int('sport_contributo_max'), 6);
  v_off int := coalesce(public.setting_int('sport_offset_individuale'), 3);
  v_int numeric[] := public.uni_list('sport_intensita');
  v_dur numeric[] := public.uni_list('sport_infortunio_durate');
  v_pts numeric[] := public.uni_list('sport_punti_piazzamento');
  v_phase text;
  ro record;
  m jsonb;
  v_attr int; v_skill int; v_d int; v_extra int; v_crit text; v_dval int; v_mods int; v_total int; v_margin int;
  v_grade int; v_contrib int; v_items jsonb; v_inj jsonb; v_thr int; v_shift int; v_tier int; v_len int;
  v_master jsonb; v_returning int; v_style int;
  v_sum int := 0; v_leader int := 0;
  v_injured bigint[] := '{}'; v_suspended bigint[] := '{}'; v_ejected bigint[] := '{}';
  v_comp boolean;
  v_opp uuid; v_opp_rating int; v_opp_total int; v_our int; v_their int; v_score int[];
  v_won int := 0; v_lost int := 0; v_bouts int; v_draw boolean := false; v_ot boolean := false;
  v_lines text := '';
  v_name text;
  v_result text;
  r record;
  v_place int;
  v_detail text;
  v_callups boolean;
  rr jsonb;
  v_side_sum int := 0; v_side_n int := 0; v_side_bonus int := 0; v_side_text text := '';
  v_side_sport uuid; v_side_name text; v_npc_roll int; v_npc_bonus int := 0;
begin
  if not public.has_permission('sport.gestire') then raise exception 'Non hai il permesso di gestire lo sport.' using errcode = '42501'; end if;
  select * into ev from public.sport_events where id = p_event for update;
  if ev.id is null then raise exception 'Evento non trovato.' using errcode = 'P0001'; end if;
  if ev.status in ('simulated', 'published') then return jsonb_build_object('gia_simulato', true); end if;
  if ev.status = 'cancelled' then raise exception 'L''evento è annullato.' using errcode = 'P0001'; end if;
  if ev.mode <> 'simulated' then raise exception 'Questo evento si gioca in chat: inserisci il risultato a mano.' using errcode = 'P0001'; end if;
  select * into sp from public.sports where id = ev.sport_id;
  select id into v_school from public.sport_teams where is_player_school;
  if v_school is null then raise exception 'Manca l''università dei personaggi tra le squadre.' using errcode = 'P0001'; end if;
  insert into public.sport_event_teams (event_id, team_id) values (p_event, v_school) on conflict do nothing;
  if (select count(*) from public.sport_event_teams where event_id = p_event) < 2 then
    raise exception 'Aggiungi almeno un avversario all''evento.' using errcode = 'P0001';
  end if;
  v_school_rating := coalesce((select rating from public.sport_team_ratings where team_id = v_school and sport_id = sp.id), 12);
  v_phase := case when ev.phase in ('conference', 'national') then 'playoff' else 'regular' end;

  -- 1. prestazione dei PG: i convocati (tiro fatto da loro con «Gareggia», oppure simulato
  --    se non l'hanno fatto); senza convocati gareggia il roster come prima
  create temporary table if not exists pg_temp.sport_sim (character_id uuid, roster_id bigint, position_id uuid, total int, contribution int,
    grade int, team_bonus boolean, crit text) on commit drop;
  truncate pg_temp.sport_sim;
  -- convocati della squadra (quelli a bordo campo non contano qui)
  v_callups := exists (select 1 from public.sport_callups cu join public.sport_roster x on x.character_id = cu.character_id and x.left_at is null and x.sport_id = sp.id
                       where cu.event_id = p_event);
  for ro in
    select x.*, p.team_bonus,
      (public.sport_eligibility(x.character_id, x.sport_id) ->> 'eligible')::boolean as eligible,
      cu.roll as callup_roll
    from public.sport_roster x left join public.sport_positions p on p.id = x.position_id
    left join public.sport_callups cu on cu.event_id = p_event and cu.character_id = x.character_id
    where x.sport_id = sp.id and x.left_at is null and x.squad_status <> 'redshirt'
      and (not v_callups or cu.character_id is not null)
    order by case x.squad_status when 'captain' then 0 when 'starter' then 1 else 2 end, x.id
  loop
    if ro.injury_events_left > 0 then v_injured := v_injured || ro.id; continue; end if;
    if ro.suspended_events > 0 then v_suspended := v_suspended || ro.id; continue; end if;
    if not ro.eligible then continue; end if;
    v_comp := true;
    if not v_callups and ro.squad_status = 'reserve' then
      -- senza convocati: la riserva gareggia nel 50% degli eventi o se manca un titolare del suo ruolo
      v_comp := public.academic_die() * 10 <= coalesce(public.setting_int('sport_riserve_percento'), 50)
        or exists (select 1 from public.sport_roster s2 where s2.sport_id = sp.id and s2.left_at is null and s2.position_id = ro.position_id
                     and s2.squad_status in ('starter', 'captain')
                     and (s2.injury_events_left > 0 or s2.suspended_events > 0 or not (public.sport_eligibility(s2.character_id, sp.id) ->> 'eligible')::boolean));
    end if;
    continue when not v_comp;

    rr := coalesce(ro.callup_roll, public.sport_athlete_roll(p_event, ro.id));
    insert into pg_temp.sport_sim values (ro.character_id, ro.id, (rr ->> 'position_id')::uuid, (rr ->> 'total')::int,
      (rr ->> 'contribution')::int, (rr ->> 'grade')::int, ro.team_bonus, rr ->> 'crit');
    -- Leader dello spogliatoio (titolare o capitano): +1 al rating di squadra
    if coalesce((rr ->> 'leader')::boolean, false) then v_leader := 1; end if;
    if coalesce((rr ->> 'ejected')::boolean, false) then v_ejected := v_ejected || ro.id; end if;
    insert into public.sport_event_rolls (event_id, character_id, position_id, d10, crit_type, extra_d10, modifiers, total, cd, margin, grade,
      contribution, highlight, injury)
    values (p_event, ro.character_id, (rr ->> 'position_id')::uuid, (rr ->> 'd10')::int, rr ->> 'crit', (rr ->> 'extra')::int,
      coalesce(rr -> 'modifiers', '{}'::jsonb) || jsonb_build_object('tiro', case when ro.callup_roll is not null then 'giocatore' else 'simulato' end),
      (rr ->> 'total')::int, (rr ->> 'cd')::int, (rr ->> 'margin')::int, (rr ->> 'grade')::int, (rr ->> 'contribution')::int,
      rr ->> 'crit' = 'success', nullif(rr -> 'injury', 'null'::jsonb));
  end loop;
  v_school_rating := v_school_rating + v_leader;

  -- tifo a bordo campo: i convocati degli sport che sostengono questo (es. cheerleading per il football)
  for ro in
    select x.*, p.name as position_name, cu.roll as callup_roll, c.name as character_name,
      (public.sport_eligibility(x.character_id, x.sport_id) ->> 'eligible')::boolean as eligible
    from public.sport_callups cu
    join public.sport_roster x on x.character_id = cu.character_id and x.left_at is null and x.sport_id <> sp.id
    join public.sports s2 on s2.id = x.sport_id and s2.supports_sport_id = sp.id
    join public.characters c on c.id = x.character_id
    left join public.sport_positions p on p.id = x.position_id
    where cu.event_id = p_event
  loop
    continue when ro.injury_events_left > 0 or ro.suspended_events > 0 or not ro.eligible;
    rr := coalesce(ro.callup_roll, public.sport_athlete_roll(p_event, ro.id));
    v_side_sum := v_side_sum + (rr ->> 'contribution')::int;
    v_side_n := v_side_n + 1;
    v_side_text := v_side_text || case when v_side_text = '' then '' else ', ' end
      || public.first_name(ro.character_name) || coalesce(' (' || ro.position_name || ')', '') || ' ' || (rr ->> 'grade');
  end loop;
  -- lo squad PNG dello sport che sostiene (sempre, anche senza personaggi): d10 + forza dell'università in quello sport
  select s2.id, s2.name into v_side_sport, v_side_name from public.sports s2
  where s2.supports_sport_id = sp.id and s2.status = 'active' order by s2.sort_order limit 1;
  if v_side_sport is not null then
    v_npc_roll := public.academic_die()
      + coalesce((select rating from public.sport_team_ratings where team_id = v_school and sport_id = v_side_sport), 12) - 12;
    v_npc_bonus := case when v_npc_roll >= 10 then 2 when v_npc_roll >= 6 then 1 else 0 end;
    -- i personaggi convocati a bordo campo si sommano (media dei contributi, se positiva)
    v_side_bonus := least(coalesce(public.setting_int('sport_tifo_max'), 2),
      v_npc_bonus + case when v_side_n > 0 then greatest(0, round(v_side_sum::numeric / v_side_n)::int) else 0 end);
    v_school_rating := v_school_rating + v_side_bonus;
  end if;
  select coalesce(sum(contribution * case when team_bonus then 2 else 1 end), 0) into v_sum from pg_temp.sport_sim;
  v_sum := greatest(-v_cap, least(v_cap, v_sum));

  -- 2. risultato secondo il formato
  if sp.format = 'team_match' then
    select team_id into v_opp from public.sport_event_teams where event_id = p_event and team_id <> v_school limit 1;
    v_opp_rating := coalesce((select rating from public.sport_team_ratings where team_id = v_opp and sport_id = sp.id), 12);
    v_our := v_school_rating + public.academic_die() + v_sum + case when ev.venue = 'home' then 1 else 0 end;
    v_their := v_opp_rating + public.academic_die() + case when ev.venue = 'away' then 1 else 0 end;
    if v_our = v_their then
      if sp.allows_draw and ev.phase in ('friendly', 'regular') then
        v_draw := true;
      else
        v_ot := true;
        loop
          v_our := v_our + public.academic_die();
          v_their := v_their + public.academic_die();
          exit when v_our <> v_their;
        end loop;
      end if;
    end if;
    v_score := public.sport_points(sp.score_profile, v_our - v_their, v_draw);
    update public.sport_event_teams set score = case when v_our >= v_their then v_score[1] else v_score[2] end,
      placement = case when v_draw then 1 when v_our > v_their then 1 else 2 end where event_id = p_event and team_id = v_school;
    update public.sport_event_teams set score = case when v_our >= v_their then v_score[2] else v_score[1] end,
      placement = case when v_draw then 1 when v_their > v_our then 1 else 2 end where event_id = p_event and team_id = v_opp;
    v_result := (select name from public.sport_teams where id = v_school) || ' ' || case when v_our >= v_their then v_score[1] else v_score[2] end
      || ' – ' || case when v_our >= v_their then v_score[2] else v_score[1] end || ' ' || (select name from public.sport_teams where id = v_opp)
      || case when v_ot then ' (supplementari)' else '' end;

  elsif sp.format = 'individual_match' then
    select team_id into v_opp from public.sport_event_teams where event_id = p_event and team_id <> v_school limit 1;
    v_opp_rating := coalesce((select rating from public.sport_team_ratings where team_id = v_opp and sport_id = sp.id), 12);
    v_bouts := coalesce((sp.score_profile ->> 'bouts')::int, 9);
    for r in select * from pg_temp.sport_sim loop
      v_opp_total := v_opp_rating + public.academic_die() - v_off;
      while v_opp_total = r.total loop v_opp_total := v_opp_total + (case when random() < 0.5 then 1 else -1 end); end loop;
      v_detail := public.sport_match_detail(sp.score_profile, r.total - v_opp_total, r.total > v_opp_total);
      if r.total > v_opp_total then v_won := v_won + 1; else v_lost := v_lost + 1; end if;
      update public.sport_event_rolls set opponent = (select name from public.sport_teams where id = v_opp),
        result_detail = jsonb_build_object('won', r.total > v_opp_total, 'score', v_detail)
      where event_id = p_event and character_id = r.character_id;
    end loop;
    -- gli incontri dei compagni PNG
    for i in 1..greatest(0, v_bouts - (select count(*) from pg_temp.sport_sim)::int) loop
      v_our := v_school_rating + public.academic_die();
      v_their := v_opp_rating + public.academic_die();
      if v_our > v_their or (v_our = v_their and random() < 0.5) then v_won := v_won + 1; else v_lost := v_lost + 1; end if;
    end loop;
    if v_won = v_lost then
      if sp.allows_draw and ev.phase in ('friendly', 'regular') then v_draw := true;
      elsif random() < 0.5 then v_won := v_won + 1; else v_lost := v_lost + 1; end if;
    end if;
    update public.sport_event_teams set score = v_won, placement = case when v_won >= v_lost then 1 else 2 end where event_id = p_event and team_id = v_school;
    update public.sport_event_teams set score = v_lost, placement = case when v_lost >= v_won then 1 else 2 end where event_id = p_event and team_id = v_opp;
    v_result := (select name from public.sport_teams where id = v_school) || ' ' || v_won || ' – ' || v_lost || ' ' || (select name from public.sport_teams where id = v_opp);

  elsif sp.format = 'team_race' then
    v_our := v_school_rating + public.academic_die() + v_sum;
    create temporary table if not exists pg_temp.sport_race (team_id uuid, total int) on commit drop;
    truncate pg_temp.sport_race;
    insert into pg_temp.sport_race values (v_school, v_our);
    insert into pg_temp.sport_race
    select et.team_id, coalesce((select rating from public.sport_team_ratings where team_id = et.team_id and sport_id = sp.id), 12) + public.academic_die()
    from public.sport_event_teams et where et.event_id = p_event and et.team_id <> v_school;
    v_place := 0;
    for r in select * from pg_temp.sport_race order by total desc, random() loop
      v_place := v_place + 1;
      update public.sport_event_teams set placement = v_place, score = r.total, time_or_measure = public.sport_time(sp.score_profile, r.total),
        points = coalesce(v_pts[v_place], 0)::int
      where event_id = p_event and team_id = r.team_id;
    end loop;
    v_result := 'Piazzamento: ' || (select placement from public.sport_event_teams where event_id = p_event and team_id = v_school) || '° su '
      || (select count(*) from public.sport_event_teams where event_id = p_event)
      || ' · tempo ' || (select time_or_measure from public.sport_event_teams where event_id = p_event and team_id = v_school);

  else -- individual_race
    create temporary table if not exists pg_temp.sport_race (team_id uuid, total int) on commit drop;
    create temporary table if not exists pg_temp.sport_runners (team_id uuid, character_id uuid, total int) on commit drop;
    truncate pg_temp.sport_runners;
    insert into pg_temp.sport_runners select v_school, character_id, total from pg_temp.sport_sim;
    -- un atleta PNG per ogni squadra (anche la nostra)
    insert into pg_temp.sport_runners
    select et.team_id, null, coalesce((select rating from public.sport_team_ratings where team_id = et.team_id and sport_id = sp.id), 12) + public.academic_die() - v_off
    from public.sport_event_teams et where et.event_id = p_event;
    v_place := 0;
    for r in select * from pg_temp.sport_runners order by total desc, random() loop
      v_place := v_place + 1;
      update public.sport_event_teams set points = points + coalesce(v_pts[v_place], 0)::int where event_id = p_event and team_id = r.team_id;
      if r.character_id is not null then
        update public.sport_event_rolls set result_detail = jsonb_build_object('placement', v_place, 'time', public.sport_time(sp.score_profile, r.total))
        where event_id = p_event and character_id = r.character_id;
      end if;
    end loop;
    v_place := 0;
    for r in select team_id, points from public.sport_event_teams where event_id = p_event order by points desc, random() loop
      v_place := v_place + 1;
      update public.sport_event_teams set placement = v_place, score = r.points where event_id = p_event and team_id = r.team_id;
    end loop;
    v_result := 'Classifica a squadre: ' || (select placement from public.sport_event_teams where event_id = p_event and team_id = v_school) || '° su '
      || (select count(*) from public.sport_event_teams where event_id = p_event) || ' con '
      || (select points from public.sport_event_teams where event_id = p_event and team_id = v_school) || ' punti';
  end if;

  -- 3. resoconto per la chat
  for r in
    select x.*, c.name, p.name as position_name from public.sport_event_rolls x join public.characters c on c.id = x.character_id
    left join public.sport_positions p on p.id = x.position_id where x.event_id = p_event order by x.grade desc
  loop
    v_name := public.first_name(r.name) || coalesce(' (' || r.position_name || ')', '');
    v_lines := v_lines || E'\n' || case when r.highlight then '⭐ ' else '· ' end || v_name || ': voto ' || r.grade
      || coalesce(case when r.result_detail ? 'won' then case when (r.result_detail ->> 'won')::boolean then ', vince ' else ', perde ' end || (r.result_detail ->> 'score') end, '')
      || coalesce(', ' || (r.result_detail ->> 'placement') || '° in ' || (r.result_detail ->> 'time'), '')
      || case when r.highlight then ' · giocata da highlight' else '' end
      || case when r.injury is not null then E'\n🩹 ' || public.first_name(r.name) || ': infortunio, fuori '
        || case when (r.injury ->> 'events')::int >= 999 then 'fino a fine stagione' when (r.injury ->> 'events')::int = 1 then '1 evento' else (r.injury ->> 'events') || ' eventi' end
        else '' end;
  end loop;
  if v_side_sport is not null then
    v_lines := v_lines || E'\n📣 A bordo campo: lo squad di ' || v_side_name || case when v_side_n > 0 then ' con ' || v_side_text else '' end
      || case when v_side_bonus > 0 then ' → +' || v_side_bonus || ' alla squadra' else ' → nessun bonus' end;
  end if;
  update public.sport_events
  set status = 'simulated', simulated_at = now(),
      recap_text = public.sport_event_label(p_event) || E'\n' || v_result || v_lines,
      sim_meta = jsonb_build_object('injured', to_jsonb(v_injured), 'suspended', to_jsonb(v_suspended), 'ejected', to_jsonb(v_ejected),
        'our', v_our, 'their', v_their, 'contributi', v_sum, 'leader', v_leader, 'tifo', v_side_bonus)
  where id = p_event;
  return jsonb_build_object('atleti', (select count(*) from pg_temp.sport_sim), 'risultato', v_result);
end;
$$;
revoke execute on function public.sport_event_simulate(uuid) from public, anon;
grant execute on function public.sport_event_simulate(uuid) to authenticated;

-- =====================================================================
-- FOOTBALL: RIGIOCARE LE PARTITE PASSATE (con UC Irvine e il tifo)
-- =====================================================================
do $$
declare
  v_admin uuid := (select p.id from public.profiles p join public.user_levels l on l.id = p.level_id
                   where l.is_admin order by p.created_at limit 1);
  v_season uuid;
  v_sport uuid;
  v_irvine uuid := (select id from public.sport_teams where name = 'UC Irvine');
  ev record;
begin
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  select se.id, se.sport_id into v_season, v_sport
  from public.sport_seasons se join public.sports s on s.id = se.sport_id
  where s.name ilike 'football%' and se.status = 'active' limit 1;
  if v_season is null then raise exception 'Nessuna stagione di Football attiva.'; end if;

  -- la partita contro UC Irvine (aggiunta dopo) va al 31/10
  update public.sport_events e set starts_at = timestamptz '2026-10-31 19:00 Europe/Rome'
  where e.season_id = v_season and e.status = 'scheduled' and e.phase = 'regular' and e.starts_at > now()
    and exists (select 1 from public.sport_event_teams et where et.event_id = e.id and et.team_id = v_irvine);

  -- 1. via i risultati delle partite già giocate
  for ev in select id from public.sport_events where season_id = v_season and status in ('simulated', 'published') loop
    update public.sport_events set status = 'simulated' where id = ev.id;
    perform public.sport_event_reset(ev.id);
  end loop;
  delete from public.sport_shadow_results where season_id = v_season;

  -- 2. le cheerleader personaggi a bordo campo nelle partite passate (senza messaggi)
  insert into public.sport_callups (event_id, character_id, called_by)
  select e.id, ro.character_id, v_admin
  from public.sport_events e
  cross join public.sport_roster ro
  join public.sports s2 on s2.id = ro.sport_id and s2.supports_sport_id = v_sport
  where e.season_id = v_season and e.status = 'scheduled' and e.starts_at < now() and ro.left_at is null
  on conflict do nothing;

  -- 3. rigiocate e pubblicate, dalla più vecchia
  for ev in select id from public.sport_events where season_id = v_season and status = 'scheduled' and starts_at < now() order by starts_at loop
    perform public.sport_event_simulate(ev.id);
    perform public.sport_event_publish(ev.id);
  end loop;
end;
$$;

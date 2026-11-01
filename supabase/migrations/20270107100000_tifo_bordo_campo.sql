-- =====================================================================
-- TIFO A BORDO CAMPO (cheerleading alle partite di football)
-- - sports.supports_sport_id: lo sport che questo sostiene a bordo campo
--   (Cheerleading → Football).
-- - Nella scheda Convoca di una partita compaiono anche gli atleti dello
--   sport che la sostiene; convocati, premono «Gareggia» con il loro ruolo.
-- - Non è una loro gara: i tiri non entrano nelle pagelle né nella
--   classifica. La media dei loro contributi, se positiva, dà un bonus
--   alla squadra (da +1 a sport_tifo_max, 2), scritto nel resoconto.
-- =====================================================================

alter table public.sports add column if not exists supports_sport_id uuid references public.sports (id) on delete set null;
create index if not exists sports_supports_idx on public.sports (supports_sport_id);

insert into public.game_settings (key, value, kind, label, description, sort_order) values
  ('sport_tifo_max', '2', 'number', 'Sport · Bonus massimo del tifo a bordo campo',
   'Bonus massimo alla forza della squadra dato dalle cheerleader convocate a bordo campo (media dei loro contributi, se positiva).', 311)
on conflict (key) do nothing;

update public.sports set supports_sport_id = (select id from public.sports where name ilike 'football%' order by sort_order limit 1)
where name ilike 'cheerleading%' and supports_sport_id is null;

create or replace function public.sport_callup_set(p_event uuid, p_characters uuid[])
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev public.sport_events;
  r record;
  v_n int := 0;
begin
  if not public.is_admin_user() then raise exception 'Le convocazioni le fa solo l''Amministratore.' using errcode = '42501'; end if;
  select * into ev from public.sport_events where id = p_event for update;
  if ev.id is null then raise exception 'Gara non trovata.' using errcode = 'P0001'; end if;
  if ev.status <> 'scheduled' then raise exception 'La gara è già stata simulata o annullata.' using errcode = 'P0001'; end if;

  delete from public.sport_callups where event_id = p_event and not (character_id = any (coalesce(p_characters, '{}')));
  for r in
    select distinct ro.character_id, c.owner_id, c.name, ro.sport_id <> ev.sport_id as sideline
    from public.sport_roster ro join public.characters c on c.id = ro.character_id
    where (ro.sport_id = ev.sport_id or ro.sport_id in (select s.id from public.sports s where s.supports_sport_id = ev.sport_id))
      and ro.left_at is null and ro.character_id = any (coalesce(p_characters, '{}'))
      and not exists (select 1 from public.sport_callups cu where cu.event_id = p_event and cu.character_id = ro.character_id)
  loop
    insert into public.sport_callups (event_id, character_id) values (p_event, r.character_id);
    perform public.send_system_message(r.owner_id,
      '📣 ' || public.first_name(r.name) || ' è stato convocato' || case when r.sideline then ' a bordo campo' else '' end || ': ' || public.sport_event_label(p_event) || E'.\n'
      || 'Entro il ' || to_char(public.sport_roll_deadline(p_event) - interval '1 minute', 'DD/MM') || ' apri la pagina Sport e premi «Gareggia» per fare il tuo tiro. '
      || 'Se non lo fai, la tua gara viene simulata.');
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke execute on function public.sport_callup_set(uuid, uuid[]) from public, anon;
grant execute on function public.sport_callup_set(uuid, uuid[]) to authenticated;

create or replace function public.sport_callup_roll(p_event uuid, p_character uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cu public.sport_callups;
  ev public.sport_events;
  ro public.sport_roster;
  v_roll jsonb;
begin
  if not public.owns_character(p_character) then raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501'; end if;
  select * into cu from public.sport_callups where event_id = p_event and character_id = p_character for update;
  if cu.event_id is null then raise exception 'Non sei convocato per questa gara.' using errcode = 'P0001'; end if;
  if cu.roll is not null then raise exception 'Hai già fatto il tuo tiro per questa gara.' using errcode = 'P0001'; end if;
  select * into ev from public.sport_events where id = p_event;
  if ev.status <> 'scheduled' then raise exception 'La gara non è più in programma.' using errcode = 'P0001'; end if;
  if now() >= public.sport_roll_deadline(p_event) then
    raise exception 'Il tempo per tirare è finito (entro il giorno prima della gara): la tua gara verrà simulata.' using errcode = 'P0001';
  end if;
  -- la squadra dell'evento, oppure uno sport che la sostiene a bordo campo
  select * into ro from public.sport_roster
  where character_id = p_character and left_at is null
    and (sport_id = ev.sport_id or sport_id in (select s.id from public.sports s where s.supports_sport_id = ev.sport_id))
  order by (sport_id = ev.sport_id) desc limit 1;
  if ro.id is null then raise exception 'Non sei più nella squadra.' using errcode = 'P0001'; end if;
  if ro.injury_events_left > 0 then raise exception 'Sei infortunato: per questa gara resti fuori.' using errcode = 'P0001'; end if;
  if ro.suspended_events > 0 then raise exception 'Sei squalificato: per questa gara resti fuori.' using errcode = 'P0001'; end if;
  if not (public.sport_eligibility(p_character, ro.sport_id) ->> 'eligible')::boolean then
    raise exception 'Non sei eleggibile (requisiti accademici): per ora non gareggi.' using errcode = 'P0001';
  end if;

  v_roll := public.sport_athlete_roll(p_event, ro.id);
  update public.sport_callups set roll = v_roll, rolled_at = now() where event_id = p_event and character_id = p_character;
  return jsonb_build_object('total', v_roll -> 'total', 'cd', v_roll -> 'cd', 'grade', v_roll -> 'grade', 'crit', v_roll -> 'crit',
    'd10', v_roll -> 'd10', 'extra', v_roll -> 'extra');
end;
$$;
revoke execute on function public.sport_callup_roll(uuid, uuid) from public, anon;
grant execute on function public.sport_callup_roll(uuid, uuid) to authenticated;

-- Simulazione con il tifo a bordo campo
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
  if v_side_n > 0 then
    v_side_bonus := greatest(0, least(coalesce(public.setting_int('sport_tifo_max'), 2), round(v_side_sum::numeric / v_side_n)::int));
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
  if v_side_n > 0 then
    v_lines := v_lines || E'\n📣 A bordo campo: ' || v_side_text
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

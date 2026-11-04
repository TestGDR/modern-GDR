-- =====================================================================
-- DISCORSO DEL CAPITANO (MORALE DELLA SQUADRA)
-- Prima di ogni gara il capitano convocato fa il «Discorso pre-partita»
-- (pagina Sport, entro lo stesso termine di «Gareggia»): CAR + Leadership
-- + d10 + voci contro sport_morale_cd (14). Se riesce, morale alto:
-- +sport_morale_bonus (1) ai tiri di tutti i personaggi della squadra in
-- quella gara e alla parte PNG della squadra. Critici senza effetti in più.
-- Il +1 si aggiunge alla simulazione, quindi vale anche per chi ha tirato
-- prima del discorso. Se il capitano gareggia e non l'ha fatto, il
-- discorso si tira da solo alla simulazione. Si somma con «Leader dello
-- spogliatoio».
-- =====================================================================

insert into public.game_settings (key, value, kind, label, description, sort_order) values
  ('sport_morale_cd', '14', 'number', 'Sport · CD del discorso del capitano',
   'Il capitano tira CAR + Leadership + d10 prima della gara: se arriva a questa CD la squadra ha il morale alto.', 340),
  ('sport_morale_bonus', '1', 'number', 'Sport · Bonus del morale alto',
   'Si somma ai tiri di tutti i personaggi della squadra e alla parte PNG della squadra in quella gara.', 341)
on conflict (key) do nothing;

create table if not exists public.sport_morale (
  event_id uuid primary key references public.sport_events (id) on delete cascade,
  character_id uuid references public.characters (id) on delete set null,
  d10 int not null,
  extra int,
  crit text not null default 'none',
  total int not null,
  cd int not null,
  success boolean not null,
  -- tirato da solo alla simulazione (il capitano non l'aveva fatto)
  auto boolean not null default false,
  modifiers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists sport_morale_character_idx on public.sport_morale (character_id);
alter table public.sport_morale enable row level security;
revoke all on public.sport_morale from anon;
drop policy if exists "Morale: lo leggono tutti" on public.sport_morale;
create policy "Morale: lo leggono tutti" on public.sport_morale for select to authenticated using (true);
drop policy if exists "Morale: solo dalle funzioni" on public.sport_morale;
create policy "Morale: solo dalle funzioni" on public.sport_morale for insert to authenticated with check (false);
drop policy if exists "Morale: non si modifica" on public.sport_morale;
create policy "Morale: non si modifica" on public.sport_morale for update to authenticated using (false);
drop policy if exists "Morale: non si cancella" on public.sport_morale;
create policy "Morale: non si cancella" on public.sport_morale for delete to authenticated using (false);

-- il tiro del discorso (senza controlli: li fa chi la chiama)
create or replace function public.sport_morale_roll(p_event uuid, p_character uuid, p_auto boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attr uuid := (select id from public.attributes where code in ('CAR', 'PRE') order by (code = 'CAR') desc limit 1);
  v_skill uuid := (select id from public.skills where lower(name) = 'leadership' limit 1);
  v_cd int := coalesce(public.setting_int('sport_morale_cd'), 14);
  v_part jsonb;
  v_row public.sport_morale;
begin
  v_part := public.sport_roll_part(p_character, v_attr, v_skill,
    jsonb_build_object('system', 'athletics', 'phase', 'speech'), 0);
  insert into public.sport_morale (event_id, character_id, d10, extra, crit, total, cd, success, auto, modifiers)
  values (p_event, p_character, (v_part ->> 'd10')::int, (v_part ->> 'extra')::int, v_part ->> 'crit',
    (v_part ->> 'totale')::int, v_cd, (v_part ->> 'totale')::int >= v_cd, p_auto, v_part)
  on conflict (event_id) do nothing
  returning * into v_row;
  if v_row.event_id is null then select * into v_row from public.sport_morale where event_id = p_event; end if;
  return to_jsonb(v_row);
end;
$$;
revoke execute on function public.sport_morale_roll(uuid, uuid, boolean) from public, anon, authenticated;

-- «Discorso pre-partita» del capitano
create or replace function public.sport_captain_speech(p_event uuid, p_character uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev public.sport_events;
  ro public.sport_roster;
begin
  if not public.owns_character(p_character) then raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501'; end if;
  select * into ev from public.sport_events where id = p_event;
  if ev.id is null or ev.status <> 'scheduled' then raise exception 'La gara non è più in programma.' using errcode = 'P0001'; end if;
  if now() >= public.sport_roll_deadline(p_event) then
    raise exception 'Il tempo per il discorso è finito (entro il giorno prima della gara): verrà tirato alla simulazione.' using errcode = 'P0001';
  end if;
  select * into ro from public.sport_roster where character_id = p_character and sport_id = ev.sport_id and left_at is null;
  if ro.id is null or ro.squad_status <> 'captain' then raise exception 'Il discorso lo fa solo il capitano della squadra.' using errcode = 'P0001'; end if;
  -- se ci sono convocazioni, il capitano deve essere tra i convocati
  if exists (select 1 from public.sport_callups cu join public.sport_roster x on x.character_id = cu.character_id and x.left_at is null and x.sport_id = ev.sport_id
             where cu.event_id = p_event)
     and not exists (select 1 from public.sport_callups where event_id = p_event and character_id = p_character) then
    raise exception 'Non sei convocato per questa gara: il discorso lo fa il capitano in campo.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.sport_morale where event_id = p_event) then
    raise exception 'Il discorso per questa gara è già stato fatto.' using errcode = 'P0001';
  end if;
  return public.sport_morale_roll(p_event, p_character, false);
end;
$$;
revoke execute on function public.sport_captain_speech(uuid, uuid) from public, anon;
grant execute on function public.sport_captain_speech(uuid, uuid) to authenticated;

-- simulazione: discorso del capitano e +1 del morale
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
  v_div numeric := greatest(1, coalesce(public.setting_int('sport_voto_scala'), 3));
  v_captain uuid; v_morale int := 0; v_mo record;
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

  -- discorso del capitano: fatto prima della gara, o tirato adesso se il capitano gareggia
  if not exists (select 1 from public.sport_morale where event_id = p_event) then
    select s.character_id into v_captain from pg_temp.sport_sim s join public.sport_roster x on x.id = s.roster_id
    where x.squad_status = 'captain' limit 1;
    if v_captain is not null then perform public.sport_morale_roll(p_event, v_captain, true); end if;
  end if;
  select mo.success, mo.auto, mo.total, mo.cd, c.name into v_mo
  from public.sport_morale mo left join public.characters c on c.id = mo.character_id where mo.event_id = p_event;
  if coalesce(v_mo.success, false) then
    v_morale := coalesce(public.setting_int('sport_morale_bonus'), 1);
    -- +1 a tutti i personaggi in gara, anche a chi aveva già tirato: totale, margine, voto e contributo
    update public.sport_event_rolls
    set total = total + v_morale, margin = margin + v_morale,
        grade = greatest(1, least(10, round(6 + (margin + v_morale) / v_div)::int)),
        contribution = greatest(-3, least(3, round((margin + v_morale) / v_div)::int)),
        modifiers = modifiers || jsonb_build_object('morale', v_morale)
    where event_id = p_event;
    update pg_temp.sport_sim s set total = r.total, grade = r.grade, contribution = r.contribution
    from public.sport_event_rolls r where r.event_id = p_event and r.character_id = s.character_id;
    -- e alla parte PNG della squadra
    v_school_rating := v_school_rating + v_morale;
  end if;

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
  if v_mo.total is not null then
    v_lines := v_lines || E'\n📢 Discorso del capitano' || coalesce(' ' || public.first_name(v_mo.name), '') || ': '
      || case when v_mo.success then 'morale alto, +' || v_morale || ' a tutta la squadra' else 'la squadra resta concentrata, niente bonus' end;
  end if;
  update public.sport_events
  set status = 'simulated', simulated_at = now(),
      recap_text = public.sport_event_label(p_event) || E'\n' || v_result || v_lines,
      sim_meta = jsonb_build_object('injured', to_jsonb(v_injured), 'suspended', to_jsonb(v_suspended), 'ejected', to_jsonb(v_ejected),
        'our', v_our, 'their', v_their, 'contributi', v_sum, 'leader', v_leader, 'tifo', v_side_bonus, 'morale', v_morale)
  where id = p_event;
  return jsonb_build_object('atleti', (select count(*) from pg_temp.sport_sim), 'risultato', v_result);
end;
$$;
revoke execute on function public.sport_event_simulate(uuid) from public, anon;
grant execute on function public.sport_event_simulate(uuid) to authenticated;

-- =====================================================================
-- SPORT RIBILANCIATO
-- 1. Infortuni e squalifiche scendono a ogni evento pubblicato della
--    squadra, anche per chi non è convocato e per le gare giocate in chat.
-- 2. CD della prestazione 14, più alta contro avversari forti:
--    + (rating avversario − 12) / sport_cd_scala. Voto e contributo
--    crescono di 1 ogni sport_voto_scala (3) punti di margine.
--    Contributo dei personaggi alla squadra al massimo ±4.
-- 3. Allenamento settimanale dalla pagina Sport: un tiro ogni 7 giorni;
--    riuscito = +1 di forma per 14 giorni. Forma + allenamenti in chat
--    del Master fino a sport_allenamento_max (2).
-- 4. Le altre università giocano lo stesso numero di partite: riposa
--    chi ne ha giocate di più.
-- 5. Pagina Sport: media della stagione, soglia della borsa, allenamento.
-- =====================================================================

-- ---------------------------------------------------------------------
-- IMPOSTAZIONI
-- ---------------------------------------------------------------------
update public.game_settings set value = '14' where key = 'sport_cd' and value = '12'::jsonb;
update public.game_settings set value = '4' where key = 'sport_contributo_max' and value = '6'::jsonb;
update public.game_settings set label = 'Sport · Bonus massimo degli allenamenti',
  description = 'Forma degli allenamenti settimanali + allenamenti in chat dati dal Master: insieme non superano questo valore.'
where key = 'sport_allenamento_max';
update public.game_settings set description = 'CD base del tiro di ogni atleta (caratteristica + abilità + d10 + modificatori); sale o scende con la forza dell''avversario.'
where key = 'sport_cd';

insert into public.game_settings (key, value, kind, label, description, sort_order) values
  ('sport_cd_scala', '2', 'number', 'Sport · CD e forza dell''avversario',
   'La CD cambia di 1 ogni questi punti di rating dell''avversario sopra o sotto 12 (0 = CD fissa).', 318),
  ('sport_voto_scala', '3', 'number', 'Sport · Margine per punto di voto',
   'Voto = 6 + margine diviso questo numero; anche il contributo alla squadra (massimo ±3 per atleta).', 319),
  ('sport_allenamento_giorni', '7', 'number', 'Sport · Giorni tra due allenamenti',
   'Ogni atleta può fare un allenamento dalla pagina Sport ogni questi giorni.', 320),
  ('sport_allenamento_durata', '14', 'number', 'Sport · Durata della forma (giorni)',
   'Un allenamento riuscito dà +1 di forma per questi giorni.', 321)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- ALLENAMENTI SETTIMANALI
-- ---------------------------------------------------------------------
create table if not exists public.sport_trainings (
  id bigint generated always as identity primary key,
  character_id uuid not null references public.characters (id) on delete cascade,
  sport_id uuid not null references public.sports (id) on delete cascade,
  d10 int not null,
  crit text not null default 'none' check (crit in ('none', 'success', 'failure')),
  extra int,
  total int not null,
  cd int not null,
  success boolean not null,
  modifiers jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists sport_trainings_character_idx on public.sport_trainings (character_id, sport_id, created_at desc);

alter table public.sport_trainings enable row level security;
drop policy if exists "sport_trainings_select" on public.sport_trainings;
create policy "sport_trainings_select" on public.sport_trainings for select to authenticated
  using ((select public.owns_character(character_id)) or (select public.has_permission('sport.gestire')));
-- si scrivono solo con sport_train(); lo staff può cancellarli
drop policy if exists "sport_trainings_delete" on public.sport_trainings;
create policy "sport_trainings_delete" on public.sport_trainings for delete to authenticated
  using ((select public.has_permission('sport.gestire')));
revoke insert, update on public.sport_trainings from anon, authenticated;

-- forma: allenamenti riusciti negli ultimi sport_allenamento_durata giorni
create or replace function public.sport_training_form(p_character uuid, p_sport uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.sport_trainings
  where character_id = p_character and sport_id = p_sport and success
    and created_at > now() - make_interval(days => coalesce(public.setting_int('sport_allenamento_durata'), 14))
$$;
revoke execute on function public.sport_training_form(uuid, uuid) from public, anon, authenticated;

create or replace function public.sport_train(p_character uuid, p_sport uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ro record;
  sp public.sports;
  m jsonb;
  v_last timestamptz;
  v_days int := greatest(1, coalesce(public.setting_int('sport_allenamento_giorni'), 7));
  v_cd int := coalesce(public.setting_int('sport_cd'), 14);
  v_int numeric[] := public.uni_list('sport_intensita');
  v_attr int; v_skill int; v_d int; v_extra int; v_crit text := 'none'; v_dval int; v_mods int; v_total int;
  v_success boolean;
  v_form int;
begin
  if not public.owns_character(p_character) then raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501'; end if;
  select x.*, p.attribute_id, p.skill_id, p.name as position_name into ro
  from public.sport_roster x left join public.sport_positions p on p.id = x.position_id
  where x.character_id = p_character and x.sport_id = p_sport and x.left_at is null
  for update of x;
  if ro.id is null then raise exception 'Non fai parte di questa squadra.' using errcode = 'P0001'; end if;
  if ro.position_id is null then raise exception 'Prima ti serve un ruolo in squadra.' using errcode = 'P0001'; end if;
  if ro.injury_events_left > 0 then raise exception 'Sei infortunato: niente allenamenti finché non rientri.' using errcode = 'P0001'; end if;
  select created_at into v_last from public.sport_trainings
  where character_id = p_character and sport_id = p_sport order by created_at desc limit 1;
  if v_last is not null and v_last > now() - make_interval(days => v_days) then
    raise exception 'Il prossimo allenamento si può fare dal %.',
      to_char((v_last + make_interval(days => v_days)) at time zone 'Europe/Rome', 'DD/MM "alle" HH24:MI') using errcode = 'P0001';
  end if;
  select * into sp from public.sports where id = p_sport;

  v_attr := coalesce((select value from public.character_attributes where character_id = p_character and attribute_id = ro.attribute_id), 0);
  v_skill := coalesce((select level from public.character_skills where character_id = p_character and skill_id = ro.skill_id), 0);
  m := public.trait_mods(p_character, jsonb_build_object('system', 'athletics', 'skill_id', ro.skill_id, 'phase', 'training',
    'venue', 'home', 'format', sp.format, 'attribute_id', ro.attribute_id));
  v_mods := (m ->> 'total')::int
    + coalesce(v_int[case ro.training_intensity when 'light' then 1 when 'normal' then 2 else 3 end], 0)::int;
  v_d := public.academic_die();
  v_dval := v_d;
  if v_d >= (m ->> 'success_min')::int then
    v_extra := public.academic_die(); v_crit := 'success'; v_dval := v_d + v_extra;
  elsif v_d <= (m ->> 'failure_max')::int then
    v_extra := public.academic_die(); v_crit := 'failure'; v_dval := v_d - v_extra;
  end if;
  v_total := v_attr + v_skill + v_dval + v_mods;
  v_success := v_total >= v_cd and v_crit <> 'failure';

  insert into public.sport_trainings (character_id, sport_id, d10, crit, extra, total, cd, success, modifiers)
  values (p_character, p_sport, v_d, v_crit, v_extra, v_total, v_cd, v_success,
    jsonb_build_object('caratteristica', v_attr, 'abilita', v_skill, 'voci', m -> 'items', 'intensita', ro.training_intensity, 'totale', v_mods, 'ruolo', ro.position_name));
  v_form := public.sport_training_form(p_character, p_sport);
  return jsonb_build_object('success', v_success, 'crit', v_crit, 'd10', v_d, 'extra', v_extra, 'total', v_total, 'cd', v_cd,
    'form', least(v_form + ro.training_bonus, coalesce(public.setting_int('sport_allenamento_max'), 2)));
end;
$$;
revoke execute on function public.sport_train(uuid, uuid) from public, anon;
grant execute on function public.sport_train(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- TIRO DELL'ATLETA: CD secondo l'avversario, voto più graduale, forma
-- ---------------------------------------------------------------------
create or replace function public.sport_athlete_roll(p_event uuid, p_roster bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev public.sport_events;
  sp public.sports;
  ro record;
  m jsonb;
  v_cd int := coalesce(public.setting_int('sport_cd'), 14);
  v_scale int := coalesce(public.setting_int('sport_cd_scala'), 2);
  v_div numeric := greatest(1, coalesce(public.setting_int('sport_voto_scala'), 3));
  v_opp numeric;
  v_int numeric[] := public.uni_list('sport_intensita');
  v_dur numeric[] := public.uni_list('sport_infortunio_durate');
  v_phase text;
  v_attr int; v_skill int; v_d int; v_extra int; v_crit text; v_dval int; v_mods int; v_total int; v_margin int;
  v_grade int; v_contrib int; v_inj jsonb; v_thr int; v_shift int; v_tier int; v_len int;
  v_master jsonb; v_returning int; v_style int; v_form int; v_train int;
  v_ejected boolean := false;
begin
  select * into ev from public.sport_events where id = p_event;
  select * into sp from public.sports where id = ev.sport_id;
  select x.*, p.attribute_id, p.skill_id, p.team_bonus, p.name as position_name into ro
  from public.sport_roster x left join public.sport_positions p on p.id = x.position_id
  where x.id = p_roster;
  v_phase := case when ev.phase in ('conference', 'national') then 'playoff' else 'regular' end;

  -- CD secondo la forza media degli avversari dell'evento
  select avg(coalesce(tr.rating, 12)) into v_opp
  from public.sport_event_teams et join public.sport_teams t on t.id = et.team_id and not t.is_player_school
  left join public.sport_team_ratings tr on tr.team_id = et.team_id and tr.sport_id = sp.id
  where et.event_id = p_event;
  if v_scale > 0 and v_opp is not null then
    v_cd := v_cd + round((v_opp - 12) / v_scale)::int;
  end if;

  v_attr := coalesce((select value from public.character_attributes where character_id = ro.character_id and attribute_id = ro.attribute_id), 0);
  v_skill := coalesce((select level from public.character_skills where character_id = ro.character_id and skill_id = ro.skill_id), 0);
  m := public.trait_mods(ro.character_id, jsonb_build_object('system', 'athletics', 'skill_id', ro.skill_id, 'phase', v_phase,
    'venue', ev.venue, 'format', sp.format));
  v_master := ev.master_mods -> ro.character_id::text;
  v_returning := case when ro.is_returning then case when public.trait_flag(ro.character_id, 'old_injury') then -2 else -1 end else 0 end;
  -- Vecchio infortunio: −1 al primo evento di ogni stagione
  if public.trait_flag(ro.character_id, 'old_injury') and not exists (
    select 1 from public.sport_event_rolls x join public.sport_events e2 on e2.id = x.event_id
    where x.character_id = ro.character_id and e2.season_id = ev.season_id) then
    v_returning := v_returning - 1;
  end if;
  -- Lupo solitario / Uomo squadra
  v_style := case
    when public.trait_flag(ro.character_id, 'lone_wolf') then case when sp.format like 'individual%' then 1 else -1 end
    when public.trait_flag(ro.character_id, 'team_player') then case when sp.format like 'team%' then 1 else -1 end
    else 0 end;
  -- allenamenti: forma settimanale + allenamenti in chat del Master, fino al massimo
  v_form := public.sport_training_form(ro.character_id, ro.sport_id);
  v_train := least(ro.training_bonus + v_form, coalesce(public.setting_int('sport_allenamento_max'), 2));
  v_mods := (m ->> 'total')::int
    + coalesce(v_int[case ro.training_intensity when 'light' then 1 when 'normal' then 2 else 3 end], 0)::int
    + v_train + v_returning + v_style + coalesce((v_master ->> 'value')::int, 0);

  v_d := public.academic_die();
  v_extra := null; v_crit := 'none'; v_dval := v_d;
  if v_d >= (m ->> 'success_min')::int then
    v_extra := public.academic_die(); v_crit := 'success'; v_dval := v_d + v_extra;
  elsif v_d <= (m ->> 'failure_max')::int then
    v_extra := public.academic_die(); v_crit := 'failure'; v_dval := v_d - v_extra;
  end if;
  v_total := v_attr + v_skill + v_dval + v_mods;
  v_margin := v_total - v_cd;
  v_grade := greatest(1, least(10, round(6 + v_margin / v_div)::int));
  v_contrib := greatest(-3, least(3, round(v_margin / v_div)::int));

  -- errore grave: infortunio se il d10 sottratto è alto (Fisico d'acciaio / Fragile cambiano soglia e durata)
  v_inj := null;
  if v_crit = 'failure' then
    v_thr := coalesce((public.trait_effect(ro.character_id, 'injury_threshold') ->> 'value')::int,
      coalesce(public.setting_int('sport_infortunio_soglia'), 8));
    if v_extra >= v_thr then
      v_shift := coalesce((public.trait_effect(ro.character_id, 'injury_band') ->> 'shift')::int, 0);
      v_len := public.academic_die();
      v_tier := case when v_len <= coalesce(v_dur[1], 5) then 0 when v_len <= coalesce(v_dur[2], 8) then 1 else 2 end;
      v_tier := greatest(0, least(2, v_tier + v_shift));
      v_inj := jsonb_build_object('d10', v_len, 'events', case v_tier when 0 then 1 when 1 then 3 else 999 end);
    end if;
    v_ejected := public.trait_flag(ro.character_id, 'ejection_on_fumble');
  end if;

  return jsonb_build_object(
    'position_id', ro.position_id, 'd10', v_d, 'crit', v_crit, 'extra', v_extra,
    'total', v_total, 'cd', v_cd, 'margin', v_margin, 'grade', v_grade, 'contribution', v_contrib,
    'injury', v_inj, 'ejected', v_ejected,
    'leader', ro.squad_status in ('starter', 'captain') and public.trait_effect(ro.character_id, 'team_rating_bonus') is not null,
    'modifiers', jsonb_build_object('voci', m -> 'items', 'intensita', ro.training_intensity, 'allenamenti', v_train, 'forma', v_form,
      'rientro', v_returning, 'stile', v_style, 'master', coalesce((v_master ->> 'value')::int, 0), 'nota_master', v_master ->> 'note', 'totale', v_mods,
      'caratteristica', v_attr, 'abilita', v_skill, 'ruolo', ro.position_name, 'avversario', round(v_opp, 1)));
end;
$$;
revoke execute on function public.sport_athlete_roll(uuid, bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- PUBBLICAZIONE: infortuni per tutti, partite delle rivali equilibrate
-- ---------------------------------------------------------------------
create or replace function public.sport_event_publish(p_event uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev public.sport_events;
  sp public.sports;
  r record;
  v_teams uuid[];
  v_a int; v_b int; v_score int[];
begin
  if not public.has_permission('sport.gestire') then raise exception 'Non hai il permesso di gestire lo sport.' using errcode = '42501'; end if;
  select * into ev from public.sport_events where id = p_event for update;
  if ev.status is distinct from 'simulated' then raise exception 'Prima simula l''evento o inserisci il risultato.' using errcode = 'P0001'; end if;
  select * into sp from public.sports where id = ev.sport_id;

  -- chi ha gareggiato torna normale
  update public.sport_roster set is_returning = false
  where sport_id = ev.sport_id and character_id in (select character_id from public.sport_event_rolls where event_id = p_event);
  -- chi era fuori (infortunato o squalificato) sconta un evento, convocato o no, simulato o giocato in chat
  update public.sport_roster set injury_events_left = case when injury_events_left >= 999 then 999 else injury_events_left - 1 end,
    is_returning = injury_events_left = 1
  where sport_id = ev.sport_id and left_at is null and injury_events_left > 0
    and character_id not in (select character_id from public.sport_event_rolls where event_id = p_event);
  update public.sport_roster set suspended_events = suspended_events - 1
  where sport_id = ev.sport_id and left_at is null and suspended_events > 0
    and character_id not in (select character_id from public.sport_event_rolls where event_id = p_event);
  -- nuovi infortuni e squalifiche (Testa calda)
  for r in select x.character_id, x.injury from public.sport_event_rolls x where x.event_id = p_event and x.injury is not null loop
    update public.sport_roster set injury_events_left = (r.injury ->> 'events')::int, is_returning = false,
      injury_note = 'Infortunio in gara (' || to_char(now() at time zone 'Europe/Rome', 'DD/MM') || ')'
    where sport_id = ev.sport_id and character_id = r.character_id and left_at is null;
  end loop;
  update public.sport_roster set suspended_events = suspended_events + 1
  where id in (select (x #>> '{}')::bigint from jsonb_array_elements(coalesce(ev.sim_meta -> 'ejected', '[]')) x);

  -- le altre università della Conference giocano tra loro (stagione regolare, sport a partite);
  -- se sono dispari riposa chi ha giocato di più, così alla fine tutte hanno lo stesso numero di partite
  if ev.phase = 'regular' and sp.format in ('team_match', 'individual_match') then
    select array_agg(t.id order by g.n desc, random()) into v_teams
    from public.sport_teams t join public.sport_team_ratings tr on tr.team_id = t.id and tr.sport_id = sp.id
    cross join lateral (
      select (select count(*) from public.sport_shadow_results s where s.season_id = ev.season_id and t.id in (s.team_a, s.team_b))
           + (select count(*) from public.sport_event_teams et join public.sport_events e2 on e2.id = et.event_id
              where e2.season_id = ev.season_id and e2.status = 'published' and e2.phase = 'regular' and et.team_id = t.id) as n
    ) g
    where t.conference and t.active and not t.is_player_school
      and t.id not in (select team_id from public.sport_event_teams where event_id = p_event);
    if coalesce(array_length(v_teams, 1), 0) % 2 = 1 then
      v_teams := v_teams[2:];
    end if;
    select array_agg(x order by random()) into v_teams from unnest(v_teams) x;
    for i in 1..coalesce(array_length(v_teams, 1), 0) / 2 loop
      v_a := (select rating from public.sport_team_ratings where team_id = v_teams[2 * i - 1] and sport_id = sp.id) + public.academic_die();
      v_b := (select rating from public.sport_team_ratings where team_id = v_teams[2 * i] and sport_id = sp.id) + public.academic_die();
      if v_a = v_b and not sp.allows_draw then v_a := v_a + case when random() < 0.5 then 1 else -1 end; end if;
      v_score := public.sport_points(sp.score_profile, v_a - v_b, v_a = v_b);
      insert into public.sport_shadow_results (season_id, event_id, team_a, team_b, score_a, score_b)
      values (ev.season_id, p_event, v_teams[2 * i - 1], v_teams[2 * i],
        case when v_a >= v_b then v_score[1] else v_score[2] end, case when v_a >= v_b then v_score[2] else v_score[1] end);
    end loop;
  end if;

  update public.sport_events set status = 'published', published_at = now() where id = p_event;
  perform public.sport_notify_athletes(ev.sport_id, '🏅 Risultato pubblicato' || E'\n' || coalesce(nullif(ev.recap_text, ''), public.sport_event_label(p_event)));
end;
$$;
revoke execute on function public.sport_event_publish(uuid) from public, anon;
grant execute on function public.sport_event_publish(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- PAGINA SPORT: stagione, soglia della borsa, allenamento
-- ---------------------------------------------------------------------
create or replace function public.sport_my(p_character uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'roster_id', ro.id, 'sport_id', ro.sport_id, 'sport', s.name, 'icon', s.icon, 'season', s.season, 'format', s.format,
    'position_id', ro.position_id, 'position', p.name, 'squad_status', ro.squad_status, 'scholarship', ro.scholarship,
    'training_intensity', ro.training_intensity, 'training_bonus', ro.training_bonus,
    'injury_events_left', ro.injury_events_left, 'injury_note', ro.injury_note, 'returning', ro.is_returning, 'suspended_events', ro.suspended_events,
    'pending_sport', (select name from public.sports where id = ro.pending_sport_id),
    'pending_position', (select name from public.sport_positions where id = ro.pending_position_id),
    'eligibility', public.sport_eligibility(ro.character_id, ro.sport_id),
    'seasons_used', coalesce(a.seasons_used, 0), 'redshirt_years', coalesce(a.redshirt_years, 0),
    'events', (select count(*) from public.sport_event_rolls x join public.sport_events e on e.id = x.event_id
               where x.character_id = ro.character_id and e.sport_id = ro.sport_id and e.status = 'published'),
    'avg_grade', (select round(avg(x.grade), 1) from public.sport_event_rolls x join public.sport_events e on e.id = x.event_id
               where x.character_id = ro.character_id and e.sport_id = ro.sport_id and e.status = 'published'),
    'highlights', (select count(*) from public.sport_event_rolls x join public.sport_events e on e.id = x.event_id
               where x.character_id = ro.character_id and e.sport_id = ro.sport_id and e.status = 'published' and x.highlight),
    'season_started', exists (select 1 from public.sport_events e join public.sport_seasons se on se.id = e.season_id
               where e.sport_id = ro.sport_id and se.status = 'active' and e.status in ('simulated', 'published')),
    -- stagione in corso (o l'ultima): eventi e media voto
    'season_label', cur.label,
    'season_events', (select count(*) from public.sport_event_rolls x join public.sport_events e on e.id = x.event_id
               where x.character_id = ro.character_id and e.season_id = cur.id and e.status = 'published'),
    'season_avg', (select round(avg(x.grade), 1) from public.sport_event_rolls x join public.sport_events e on e.id = x.event_id
               where x.character_id = ro.character_id and e.season_id = cur.id and e.status = 'published'),
    'athletic_scholarship', ro.scholarship or public.trait_flag(ro.character_id, 'athletic_scholarship'),
    'scholarship_min', coalesce(public.uni_n('sport_borsa_media_min'), 6),
    -- allenamento settimanale
    'form', public.sport_training_form(ro.character_id, ro.sport_id),
    'training_max', coalesce(public.setting_int('sport_allenamento_max'), 2),
    'last_training', (select jsonb_build_object('at', t.created_at, 'success', t.success, 'total', t.total, 'cd', t.cd, 'd10', t.d10, 'crit', t.crit)
               from public.sport_trainings t where t.character_id = ro.character_id and t.sport_id = ro.sport_id order by t.created_at desc limit 1),
    'next_training_at', (select max(t.created_at) + make_interval(days => greatest(1, coalesce(public.setting_int('sport_allenamento_giorni'), 7)))
               from public.sport_trainings t where t.character_id = ro.character_id and t.sport_id = ro.sport_id)
  ) order by s.name), '[]'::jsonb)
  from public.sport_roster ro join public.sports s on s.id = ro.sport_id
  left join public.sport_positions p on p.id = ro.position_id
  left join public.sport_athletes a on a.character_id = ro.character_id and a.sport_id = ro.sport_id
  left join lateral (
    select se.id, se.label from public.sport_seasons se
    where se.sport_id = ro.sport_id and se.status <> 'planning'
    order by (se.status = 'active') desc, se.created_at desc limit 1
  ) cur on true
  where ro.character_id = p_character and ro.left_at is null
$$;

-- ---------------------------------------------------------------------
-- UNA TANTUM: infortuni e squalifiche rimasti bloccati
-- Restano = durata dell'infortunio − eventi della squadra pubblicati dopo.
-- ---------------------------------------------------------------------
do $$
declare
  r record;
  v_after int;
begin
  for r in
    select ro.id, ro.sport_id, ro.character_id, ro.injury_events_left,
      (select (x.injury ->> 'events')::int from public.sport_event_rolls x join public.sport_events e on e.id = x.event_id
       where x.character_id = ro.character_id and e.sport_id = ro.sport_id and e.status = 'published' and x.injury is not null
       order by e.published_at desc limit 1) as injury_len,
      (select e.published_at from public.sport_event_rolls x join public.sport_events e on e.id = x.event_id
       where x.character_id = ro.character_id and e.sport_id = ro.sport_id and e.status = 'published' and x.injury is not null
       order by e.published_at desc limit 1) as injured_at
    from public.sport_roster ro
    where ro.left_at is null and ro.injury_events_left between 1 and 998
  loop
    continue when r.injured_at is null;
    select count(*) into v_after from public.sport_events e
    where e.sport_id = r.sport_id and e.status = 'published' and e.published_at > r.injured_at;
    if greatest(0, r.injury_len - v_after) < r.injury_events_left then
      update public.sport_roster set injury_events_left = greatest(0, r.injury_len - v_after),
        is_returning = greatest(0, r.injury_len - v_after) = 0
      where id = r.id;
    end if;
  end loop;

  -- squalificati: se la squadra ha già giocato dopo la loro ultima gara, la squalifica è scontata
  update public.sport_roster ro set suspended_events = 0
  where ro.left_at is null and ro.suspended_events > 0
    and exists (select 1 from public.sport_events e where e.sport_id = ro.sport_id and e.status = 'published'
      and e.published_at > coalesce((select max(e2.published_at) from public.sport_event_rolls x join public.sport_events e2 on e2.id = x.event_id
                                     where x.character_id = ro.character_id and e2.sport_id = ro.sport_id), '-infinity'::timestamptz));
end;
$$;

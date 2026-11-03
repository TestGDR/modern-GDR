-- =====================================================================
-- SPINTA DI GARA E ALLENAMENTO, INTENSITÀ LEGGERA CHE AIUTA LO STUDIO
-- 1. Intensità della stagione: leggera −1 allo sport ma +1 agli esami
--    (sport_leggero_esami); intensa +1 allo sport e −1 agli esami.
-- 2. Spinta del momento, scelta premendo «Gareggia» o «Allenati»:
--    prudente −1 e niente infortuni; normale; al massimo +1 ma
--    l'infortunio arriva più facilmente (soglia − sport_spinta_infortunio).
--    «Al massimo» si usa sport_spinta_max (3) volte a stagione tra gare e
--    allenamenti, mai in due gare di fila. Chi non preme «Gareggia» è
--    tirato con spinta normale. In allenamento, al massimo con un 1:
--    infortunio leggero (fuori una gara).
--    Intensità e spinta insieme vanno da −2 a +2.
-- =====================================================================

insert into public.game_settings (key, value, kind, label, description, sort_order) values
  ('sport_spinta_max', '3', 'number', 'Sport · «Al massimo» per stagione', 'Quante volte a stagione un atleta può andare al massimo (+1), tra gare e allenamenti.', 330),
  ('sport_spinta_infortunio', '2', 'number', 'Sport · Rischio della spinta al massimo', 'Al massimo, con un 1 sul d10 ci si infortuna se il secondo d10 supera la soglia meno questo numero.', 331),
  ('sport_leggero_esami', '1', 'number', 'Sport · Bonus agli esami con allenamento leggero', 'Si somma a esami e compiti del semestre per chi ha scelto l''intensità leggera.', 332)
on conflict (key) do nothing;
update public.game_settings set description = 'Leggera, normale, intensa: si somma ai tiri sportivi (la leggera dà anche +1 agli esami, l''intensa −1).'
where key = 'sport_intensita';

-- volte «al massimo» usate nella stagione in corso di uno sport (gare + allenamenti)
create or replace function public.sport_push_used(p_character uuid, p_sport uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  with se as (
    select coalesce((select coalesce(s.started_at, s.created_at) from public.sport_seasons s
                     where s.sport_id = p_sport and s.status = 'active' order by s.created_at desc limit 1),
                    now() - interval '120 days') as since
  )
  select (
    (select count(*) from public.sport_callups x join public.sport_events e on e.id = x.event_id, se
     where x.character_id = p_character and x.roll ->> 'push' = 'max'
       and (e.sport_id = p_sport or e.sport_id = (select supports_sport_id from public.sports where id = p_sport))
       and x.rolled_at >= se.since)
    + (select count(*) from public.sport_trainings t, se
       where t.character_id = p_character and t.sport_id = p_sport and t.modifiers ->> 'spinta' = 'max' and t.created_at >= se.since)
  )::int
$$;
revoke execute on function public.sport_push_used(uuid, uuid) from public, anon, authenticated;

create or replace function public.sport_push_left(p_character uuid, p_sport uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$ select greatest(0, coalesce(public.setting_int('sport_spinta_max'), 3) - public.sport_push_used(p_character, p_sport)) $$;
revoke execute on function public.sport_push_left(uuid, uuid) from public, anon, authenticated;

create or replace function public.sport_push_check(p_character uuid, p_sport uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.sport_push_left(p_character, p_sport) <= 0 then
    raise exception 'Hai già usato «Al massimo» % volte in questa stagione.', coalesce(public.setting_int('sport_spinta_max'), 3) using errcode = 'P0001';
  end if;
end;
$$;
revoke execute on function public.sport_push_check(uuid, uuid) from public, anon, authenticated;

-- TIRO DELL'ATLETA (sostituisce la versione con due parametri)
drop function if exists public.sport_athlete_roll(uuid, bigint);
create or replace function public.sport_athlete_roll(p_event uuid, p_roster bigint, p_push text default 'normal')
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
  v_push int := case p_push when 'prudent' then -1 when 'max' then 1 else 0 end;
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
    + v_train + v_returning + v_style + coalesce((v_master ->> 'value')::int, 0) + v_push;

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
  -- prudente: niente infortuni; al massimo: la soglia scende di sport_spinta_infortunio
  if v_crit = 'failure' and p_push <> 'prudent' then
    v_thr := coalesce((public.trait_effect(ro.character_id, 'injury_threshold') ->> 'value')::int,
      coalesce(public.setting_int('sport_infortunio_soglia'), 8));
    if p_push = 'max' then v_thr := greatest(2, v_thr - coalesce(public.setting_int('sport_spinta_infortunio'), 2)); end if;
    if v_extra >= v_thr then
      v_shift := coalesce((public.trait_effect(ro.character_id, 'injury_band') ->> 'shift')::int, 0);
      v_len := public.academic_die();
      v_tier := case when v_len <= coalesce(v_dur[1], 5) then 0 when v_len <= coalesce(v_dur[2], 8) then 1 else 2 end;
      v_tier := greatest(0, least(2, v_tier + v_shift));
      v_inj := jsonb_build_object('d10', v_len, 'events', case v_tier when 0 then 1 when 1 then 3 else 999 end);
    end if;
  end if;
  if v_crit = 'failure' then
    v_ejected := public.trait_flag(ro.character_id, 'ejection_on_fumble');
  end if;

  return jsonb_build_object(
    'position_id', ro.position_id, 'd10', v_d, 'crit', v_crit, 'extra', v_extra,
    'total', v_total, 'cd', v_cd, 'margin', v_margin, 'grade', v_grade, 'contribution', v_contrib,
    'injury', v_inj, 'ejected', v_ejected, 'push', p_push,
    'leader', ro.squad_status in ('starter', 'captain') and public.trait_effect(ro.character_id, 'team_rating_bonus') is not null,
    'modifiers', jsonb_build_object('voci', m -> 'items', 'intensita', ro.training_intensity, 'allenamenti', v_train, 'forma', v_form, 'spinta', p_push, 'spinta_valore', v_push,
      'rientro', v_returning, 'stile', v_style, 'master', coalesce((v_master ->> 'value')::int, 0), 'nota_master', v_master ->> 'note', 'totale', v_mods,
      'caratteristica', v_attr, 'abilita', v_skill, 'ruolo', ro.position_name, 'avversario', round(v_opp, 1)));
end;
$$;
revoke execute on function public.sport_athlete_roll(uuid, bigint, text) from public, anon, authenticated;

-- «GAREGGIA»
drop function if exists public.sport_callup_roll(uuid, uuid);
create or replace function public.sport_callup_roll(p_event uuid, p_character uuid, p_push text default 'normal')
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

  if p_push not in ('prudent', 'normal', 'max') then raise exception 'Spinta non valida.' using errcode = 'P0001'; end if;
  if p_push = 'max' then
    perform public.sport_push_check(p_character, ro.sport_id);
    -- mai al massimo in due gare di fila
    if (select x.roll ->> 'push' from public.sport_callups x join public.sport_events e2 on e2.id = x.event_id
        where x.character_id = p_character and x.roll is not null and e2.sport_id = ev.sport_id and e2.starts_at < ev.starts_at
        order by e2.starts_at desc limit 1) = 'max' then
      raise exception 'Nella gara precedente sei andato al massimo: in questa non puoi.' using errcode = 'P0001';
    end if;
  end if;
  v_roll := public.sport_athlete_roll(p_event, ro.id, p_push);
  update public.sport_callups set roll = v_roll, rolled_at = now() where event_id = p_event and character_id = p_character;
  return jsonb_build_object('total', v_roll -> 'total', 'cd', v_roll -> 'cd', 'grade', v_roll -> 'grade', 'crit', v_roll -> 'crit',
    'd10', v_roll -> 'd10', 'extra', v_roll -> 'extra', 'push', p_push, 'injury', v_roll -> 'injury');
end;
$$;
revoke execute on function public.sport_callup_roll(uuid, uuid, text) from public, anon;
grant execute on function public.sport_callup_roll(uuid, uuid, text) to authenticated;

-- ALLENAMENTO
drop function if exists public.sport_train(uuid, uuid);
create or replace function public.sport_train(p_character uuid, p_sport uuid, p_push text default 'normal')
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
  v_intensity int;
  v_cd_base int;
  v_trainer int := 0;
  v_code text;
  v_skill_name text;
  v_push int := case p_push when 'prudent' then -1 when 'max' then 1 else 0 end;
  v_injured boolean := false;
begin
  if p_push not in ('prudent', 'normal', 'max') then raise exception 'Spinta non valida.' using errcode = 'P0001'; end if;
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
  if p_push = 'max' then perform public.sport_push_check(p_character, p_sport); end if;

  v_attr := coalesce((select value from public.character_attributes where character_id = p_character and attribute_id = ro.attribute_id), 0);
  v_skill := coalesce((select level from public.character_skills where character_id = p_character and skill_id = ro.skill_id), 0);
  m := public.trait_mods(p_character, jsonb_build_object('system', 'athletics', 'skill_id', ro.skill_id, 'phase', 'training',
    'venue', 'home', 'format', sp.format, 'attribute_id', ro.attribute_id));
  v_intensity := coalesce(v_int[case ro.training_intensity when 'light' then 1 when 'normal' then 2 else 3 end], 0)::int;
  v_mods := (m ->> 'total')::int + v_intensity + v_push;
  select code into v_code from public.attributes where id = ro.attribute_id;
  select name into v_skill_name from public.skills where id = ro.skill_id;
  v_d := public.academic_die();
  v_dval := v_d;
  if v_d >= (m ->> 'success_min')::int then
    v_extra := public.academic_die(); v_crit := 'success'; v_dval := v_d + v_extra;
  elsif v_d <= (m ->> 'failure_max')::int then
    v_extra := public.academic_die(); v_crit := 'failure'; v_dval := v_d - v_extra;
  end if;
  v_total := v_attr + v_skill + v_dval + v_mods;
  -- personal trainer: allenamento più facile
  v_cd_base := v_cd;
  if ro.trainer_until is not null and ro.trainer_until > now() then
    v_trainer := coalesce(public.setting_int('servizio_trainer_cd'), 2);
    v_cd := v_cd - v_trainer;
  end if;
  v_success := v_total >= v_cd and v_crit <> 'failure';
  -- al massimo, con un 1: infortunio leggero (fuori una gara) se il secondo d10 supera la soglia abbassata
  if p_push = 'max' and v_crit = 'failure'
     and v_extra >= greatest(2, coalesce(public.setting_int('sport_infortunio_soglia'), 8) - coalesce(public.setting_int('sport_spinta_infortunio'), 2)) then
    v_injured := true;
    update public.sport_roster set injury_events_left = greatest(injury_events_left, 1), is_returning = false,
      injury_note = 'Infortunio in allenamento (' || to_char(now() at time zone 'Europe/Rome', 'DD/MM') || ')'
    where id = ro.id;
  end if;

  insert into public.sport_trainings (character_id, sport_id, d10, crit, extra, total, cd, success, modifiers)
  values (p_character, p_sport, v_d, v_crit, v_extra, v_total, v_cd, v_success,
    jsonb_build_object('caratteristica', v_attr, 'codice', v_code, 'abilita', v_skill, 'abilita_nome', v_skill_name,
      'voci', m -> 'items', 'voci_totale', (m ->> 'total')::int, 'intensita', ro.training_intensity, 'intensita_valore', v_intensity,
      'totale', v_mods, 'ruolo', ro.position_name, 'cd_base', v_cd_base, 'trainer', v_trainer,
      'spinta', p_push, 'spinta_valore', v_push, 'infortunio', v_injured));
  v_form := public.sport_training_form(p_character, p_sport);
  return jsonb_build_object('success', v_success, 'crit', v_crit, 'd10', v_d, 'extra', v_extra, 'total', v_total, 'cd', v_cd,
    'attr', v_attr, 'code', v_code, 'skill', v_skill, 'skill_name', v_skill_name, 'mods', v_mods, 'trainer', v_trainer, 'push', p_push, 'injured', v_injured,
    'form', least(v_form + ro.training_bonus, coalesce(public.setting_int('sport_allenamento_max'), 2)));
end;
$$;
revoke execute on function public.sport_train(uuid, uuid, text) from public, anon;
grant execute on function public.sport_train(uuid, uuid, text) to authenticated;

-- PAGINA SPORT
create or replace function public.sport_my(p_character uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'roster_id', ro.id, 'sport_id', ro.sport_id, 'sport', s.name, 'icon', s.icon, 'icon_url', s.icon_url, 'season', s.season, 'format', s.format,
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
    'push_left', public.sport_push_left(ro.character_id, ro.sport_id),
    'push_max', coalesce(public.setting_int('sport_spinta_max'), 3),
    'trainer_until', ro.trainer_until,
    'trainer_price', coalesce(public.setting_int('servizio_trainer'), 300),
    'physio_price', coalesce(public.setting_int('servizio_fisio'), 1500),
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


-- ESAMI: ALLENAMENTO LEGGERO +1
create or replace function public.trait_mods(p_character uuid, p_ctx jsonb, p_situational uuid[] default '{}')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cap int := coalesce(public.setting_int('tetto_modificatori'), 4);
  v_system text := coalesce(p_ctx ->> 'system', 'general');
  v_skill uuid := nullif(p_ctx ->> 'skill_id', '')::uuid;
  v_cats text[];
  r record;
  e jsonb;
  w jsonb;
  v_val int;
  v_sum int := 0;
  v_items jsonb := '[]'::jsonb;
  v_smin int := 10;
  v_fmax int := 1;
  v_override boolean := false;
  v_cd int := 0;
  v_attr_id uuid;
  v_alt int := 0;
  x jsonb;
  v_esys text;
  v_ok boolean;
begin
  -- categorie del tiro: quella indicata, oppure quelle dell'abilità
  if p_ctx ? 'category' and coalesce(p_ctx ->> 'category', '') <> '' then
    v_cats := array[p_ctx ->> 'category'];
  else
    select coalesce(array_agg(category), '{}') into v_cats from public.skill_categories where skill_id = v_skill;
  end if;

  for r in
    select o.id, o.name, o.roll_modifier, o.roll_skill_id, o.effects, co.level, co.choice_value
    from public.character_options co join public.creation_options o on o.id = co.option_id
    where co.character_id = p_character
  loop
    -- voci vecchie: modificatore all'abilità indicata (o a tutti i tiri)
    if r.roll_modifier is not null and (r.roll_skill_id is null or r.roll_skill_id = v_skill) then
      v_sum := v_sum + r.roll_modifier;
      v_items := v_items || jsonb_build_object('name', r.name, 'value', r.roll_modifier);
    end if;
    for e in select * from jsonb_array_elements(r.effects) loop
      w := coalesce(e -> 'when', '{}'::jsonb);
      v_esys := coalesce(w ->> 'system', e ->> 'system', 'general');
      -- sistema: general vale anche in combattimento; any vale ovunque
      v_ok := v_esys = 'any' or v_esys = v_system or (v_esys = 'general' and v_system = 'combat');
      if v_ok and w ? 'category' then
        v_ok := v_cats && array(select jsonb_array_elements_text(w -> 'category'));
      end if;
      if v_ok and w ? 'exam_type' then
        v_ok := (p_ctx ->> 'exam_type') = any (array(select jsonb_array_elements_text(w -> 'exam_type')));
      end if;
      if v_ok and w ? 'department' then
        v_ok := lower(coalesce(p_ctx ->> 'department', '')) = lower(case when w ->> 'department' = '$choice' then r.choice_value else w ->> 'department' end);
      end if;
      if v_ok and w ? 'area' then
        v_ok := coalesce(p_ctx ->> 'area', '') = (w ->> 'area');
      end if;
      if v_ok and w ? 'retake' then
        v_ok := coalesce((p_ctx ->> 'retake')::boolean, false);
      end if;
      if v_ok and w ? 'min_credits' then
        v_ok := coalesce((p_ctx ->> 'credits')::int, 0) > (w ->> 'min_credits')::int;
      end if;
      if v_ok and w ? 'phase' then
        v_ok := coalesce(p_ctx ->> 'phase', '') = any (array(select jsonb_array_elements_text(w -> 'phase')));
      end if;
      if v_ok and w ? 'venue' then
        v_ok := coalesce(p_ctx ->> 'venue', '') = (w ->> 'venue');
      end if;
      -- situazionali: solo se confermati
      if v_ok and coalesce((e ->> 'situational')::boolean, false) then
        v_ok := r.id = any (p_situational);
      end if;
      continue when not v_ok;

      if e ->> 'type' = 'roll_modifier' then
        v_val := case e ->> 'value' when '$level' then r.level when '-$level' then -r.level else (e ->> 'value')::int end;
        v_sum := v_sum + v_val;
        v_items := v_items || jsonb_build_object('name', r.name, 'value', v_val);
      elsif e ->> 'type' = 'cd_modifier' then
        v_cd := v_cd + (e ->> 'value')::int;
      elsif e ->> 'type' = 'crit_range' then
        if coalesce((e ->> 'override')::boolean, false) then
          v_override := true;
          v_smin := coalesce((e ->> 'success_min')::int, 10);
          v_fmax := coalesce((e ->> 'failure_max')::int, 1);
        elsif not v_override then
          v_smin := least(v_smin, coalesce((e ->> 'success_min')::int, 10));
          v_fmax := greatest(v_fmax, coalesce((e ->> 'failure_max')::int, 1));
        end if;
      end if;
    end loop;
  end loop;

  -- allenamento sportivo intenso (stagione in corso): malus agli esami
  if v_system = 'academic' and exists (
    select 1 from public.sport_roster ro join public.sport_seasons se on se.sport_id = ro.sport_id and se.status = 'active'
    where ro.character_id = p_character and ro.left_at is null and ro.training_intensity = 'intense'
  ) then
    v_val := -coalesce(public.setting_int('sport_intenso_esami'), 1);
    v_sum := v_sum + v_val;
    v_items := v_items || jsonb_build_object('name', 'Allenamento intenso', 'value', v_val);
  end if;
  -- allenamento sportivo leggero (stagione in corso): più tempo per studiare
  if v_system = 'academic' and exists (
    select 1 from public.sport_roster ro join public.sport_seasons se on se.sport_id = ro.sport_id and se.status = 'active'
    where ro.character_id = p_character and ro.left_at is null and ro.training_intensity = 'light'
  ) then
    v_val := coalesce(public.setting_int('sport_leggero_esami'), 1);
    v_sum := v_sum + v_val;
    v_items := v_items || jsonb_build_object('name', 'Allenamento leggero', 'value', v_val);
  end if;

  -- alcol, droghe e postumi: malus sulla caratteristica del tiro, oltre il tetto delle voci
  v_attr_id := coalesce(nullif(p_ctx ->> 'attribute_id', '')::uuid, (select attribute_id from public.skills where id = v_skill));
  if v_attr_id is not null then
    for x in select * from jsonb_array_elements(public.alteration_mods(p_character))
             where (value ->> 'code') = (select code from public.attributes where id = v_attr_id) loop
      v_alt := v_alt + (x ->> 'value')::int;
      v_items := v_items || jsonb_build_object('name', x ->> 'name', 'value', (x ->> 'value')::int);
    end loop;
  end if;

  -- notte in bianco (Insonne): malus a tutti i tiri di oggi
  if not coalesce((p_ctx ->> 'no_sleep')::boolean, false)
     and exists (select 1 from public.character_sleep where character_id = p_character and day = public.rome_today() and not slept) then
    v_val := -coalesce(public.setting_int('insonnia_malus'), 1);
    v_alt := v_alt + v_val;
    v_items := v_items || jsonb_build_object('name', 'Notte in bianco', 'value', v_val);
  end if;

  return jsonb_build_object('total', greatest(-v_cap, least(v_cap, v_sum)) + v_alt, 'raw', v_sum, 'alterazione', v_alt, 'items', v_items,
    'success_min', v_smin, 'failure_max', v_fmax, 'cd', v_cd);
end;
$$;


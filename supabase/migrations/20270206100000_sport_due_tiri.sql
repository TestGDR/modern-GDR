-- =====================================================================
-- SPORT: RUOLI CON DUE TIRI (CONTA LA MEDIA)
-- Le combinazioni di un ruolo hanno un «tiro»: 1 = alternative alla
-- combinazione del ruolo, 2 = secondo tiro. Se il ruolo ha combinazioni
-- del secondo tiro si tirano due dadi (per ciascun tiro la combinazione
-- migliore dell'atleta) e il risultato è la media dei due totali.
-- Critici: il 10 e l'1 valgono sul loro tiro; l'infortunio scatta se uno
-- dei due va male. Vale per gare, simulazioni e allenamenti.
-- Le combinazioni già inserite diventano tutte del secondo tiro.
-- =====================================================================

-- 1. TIRO DELLE COMBINAZIONI
alter table public.sport_position_combos add column if not exists slot smallint not null default 2;
alter table public.sport_position_combos drop constraint if exists sport_position_combos_slot_check;
alter table public.sport_position_combos add constraint sport_position_combos_slot_check check (slot in (1, 2));

-- la combinazione migliore per un tiro (1: quella del ruolo e le sue alternative, 2: secondo tiro)
drop function if exists public.sport_best_combo(uuid, uuid);
create or replace function public.sport_best_combo(p_character uuid, p_position uuid, p_slot int default 1)
returns table (attribute_id uuid, skill_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select c.attribute_id, c.skill_id
  from (
    select p.attribute_id, p.skill_id, 0 as ord from public.sport_positions p where p.id = p_position and p_slot = 1
    union all
    select x.attribute_id, x.skill_id, 1 + x.sort_order from public.sport_position_combos x
    where x.position_id = p_position and x.slot = p_slot
  ) c
  order by coalesce((select ca.value from public.character_attributes ca where ca.character_id = p_character and ca.attribute_id = c.attribute_id), 0)
         + coalesce((select cs.level from public.character_skills cs where cs.character_id = p_character and cs.skill_id = c.skill_id), 0) desc,
    c.ord
  limit 1
$$;
revoke execute on function public.sport_best_combo(uuid, uuid, int) from public, anon, authenticated;

-- 2. UN TIRO: caratteristica + abilità + d10 (10 → +d10, 1 → −d10) + voci + modificatori comuni
create or replace function public.sport_roll_part(p_character uuid, p_attr uuid, p_skill uuid, p_ctx jsonb, p_common int)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  m jsonb;
  v_attr int;
  v_skill int;
  v_vt int;
  v_d int;
  v_extra int;
  v_crit text := 'none';
  v_dval int;
begin
  v_attr := coalesce((select value from public.character_attributes where character_id = p_character and attribute_id = p_attr), 0);
  v_skill := coalesce((select level from public.character_skills where character_id = p_character and skill_id = p_skill), 0);
  m := public.trait_mods(p_character, p_ctx || jsonb_build_object('skill_id', p_skill, 'attribute_id', p_attr));
  v_vt := coalesce((m ->> 'total')::int, 0);
  v_d := public.academic_die();
  v_dval := v_d;
  if v_d >= (m ->> 'success_min')::int then
    v_extra := public.academic_die(); v_crit := 'success'; v_dval := v_d + v_extra;
  elsif v_d <= (m ->> 'failure_max')::int then
    v_extra := public.academic_die(); v_crit := 'failure'; v_dval := v_d - v_extra;
  end if;
  return jsonb_build_object(
    'codice', (select code from public.attributes where id = p_attr), 'abilita_nome', (select name from public.skills where id = p_skill),
    'caratteristica', v_attr, 'abilita', v_skill, 'd10', v_d, 'extra', v_extra, 'crit', v_crit,
    'voci', m -> 'items', 'voci_totale', v_vt, 'mods', v_vt + p_common, 'totale', v_attr + v_skill + v_dval + v_vt + p_common);
end;
$$;
revoke execute on function public.sport_roll_part(uuid, uuid, uuid, jsonb, int) from public, anon, authenticated;

-- 3. UNO O DUE TIRI → risultato (media arrotondata), critico e secondo d10 per gli infortuni
create or replace function public.sport_roll_merge(p1 jsonb, p2 jsonb, out d10 int, out crit text, out extra int, out total int)
language plpgsql
immutable
set search_path = ''
as $$
begin
  d10 := (p1 ->> 'd10')::int;
  if p2 is null then
    crit := p1 ->> 'crit';
    extra := (p1 ->> 'extra')::int;
    total := (p1 ->> 'totale')::int;
    return;
  end if;
  total := round(((p1 ->> 'totale')::int + (p2 ->> 'totale')::int) / 2.0)::int;
  if p1 ->> 'crit' = 'failure' or p2 ->> 'crit' = 'failure' then
    crit := 'failure';
    extra := greatest(case when p1 ->> 'crit' = 'failure' then (p1 ->> 'extra')::int end,
                      case when p2 ->> 'crit' = 'failure' then (p2 ->> 'extra')::int end);
  elsif p1 ->> 'crit' = 'success' or p2 ->> 'crit' = 'success' then
    crit := 'success';
    extra := greatest(case when p1 ->> 'crit' = 'success' then (p1 ->> 'extra')::int end,
                      case when p2 ->> 'crit' = 'success' then (p2 ->> 'extra')::int end);
  else
    crit := 'none';
    extra := null;
  end if;
end;
$$;
revoke execute on function public.sport_roll_merge(jsonb, jsonb) from public, anon, authenticated;

-- descrizione del ruolo nel gruppo: "RIF + Lanciare e VIG + Atletica / VIG + Agilità (due tiri, conta la media)"
create or replace function public.sport_position_text(p_position uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with c as (
    select 1 as slot, 0 as ord, a.code || coalesce(' + ' || s.name, '') as txt
    from public.sport_positions p join public.attributes a on a.id = p.attribute_id
    left join public.skills s on s.id = p.skill_id
    where p.id = p_position
    union all
    select x.slot, 1 + x.sort_order, a.code || ' + ' || s.name
    from public.sport_position_combos x join public.attributes a on a.id = x.attribute_id
    join public.skills s on s.id = x.skill_id
    where x.position_id = p_position
  ), t as (
    select slot, string_agg(txt, ' / ' order by ord) as txt from c group by slot
  )
  select string_agg(t.txt, ' e ' order by t.slot)
    || case when count(*) > 1 then ' (due tiri, conta la media)'
            when (select count(*) from c) > 1 then ' (si usa la migliore)' else '' end
    || case when (select team_bonus from public.sport_positions where id = p_position) then ' · conta doppio per la squadra' else '' end
  from t
$$;
revoke execute on function public.sport_position_text(uuid) from public, anon, authenticated;

-- 4. GARA E ALLENAMENTO CON UNO O DUE TIRI
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
  v_common int; v_ctx jsonb; v_p1 jsonb; v_p2 jsonb; v_a2 uuid; v_s2 uuid;
begin
  select * into ev from public.sport_events where id = p_event;
  select * into sp from public.sports where id = ev.sport_id;
  -- primo tiro: la combinazione migliore del ruolo (secondo tiro più sotto)
  select x.*, b.attribute_id, b.skill_id, p.team_bonus, p.name as position_name into ro
  from public.sport_roster x left join public.sport_positions p on p.id = x.position_id
  left join lateral public.sport_best_combo(x.character_id, x.position_id, 1) b on true
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
  -- modificatori comuni a tutti e due i tiri
  v_common := coalesce(v_int[case ro.training_intensity when 'light' then 1 when 'normal' then 2 else 3 end], 0)::int
    + v_train + v_returning + v_style + coalesce((v_master ->> 'value')::int, 0) + v_push;
  v_ctx := jsonb_build_object('system', 'athletics', 'phase', v_phase, 'venue', ev.venue, 'format', sp.format);
  v_p1 := public.sport_roll_part(ro.character_id, ro.attribute_id, ro.skill_id, v_ctx, v_common);
  -- secondo tiro (se il ruolo lo chiede): conta la media dei due
  select b.attribute_id, b.skill_id into v_a2, v_s2 from public.sport_best_combo(ro.character_id, ro.position_id, 2) b;
  if v_s2 is not null then
    v_p2 := public.sport_roll_part(ro.character_id, v_a2, v_s2, v_ctx, v_common);
  end if;
  select x.d10, x.crit, x.extra, x.total into v_d, v_crit, v_extra, v_total from public.sport_roll_merge(v_p1, v_p2) x;
  v_attr := (v_p1 ->> 'caratteristica')::int;
  v_skill := (v_p1 ->> 'abilita')::int;
  v_mods := (v_p1 ->> 'mods')::int;
  m := jsonb_build_object('items', v_p1 -> 'voci');
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
      'caratteristica', v_attr, 'abilita', v_skill, 'ruolo', ro.position_name, 'avversario', round(v_opp, 1),
      'codice', v_p1 ->> 'codice', 'abilita_nome', v_p1 ->> 'abilita_nome',
      'tiri', jsonb_build_array(v_p1) || case when v_p2 is null then '[]'::jsonb else jsonb_build_array(v_p2) end));
end;
$$;
revoke execute on function public.sport_athlete_roll(uuid, bigint, text) from public, anon, authenticated;

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
  v_ctx jsonb; v_p1 jsonb; v_p2 jsonb; v_a2 uuid; v_s2 uuid;
begin
  if p_push not in ('prudent', 'normal', 'max') then raise exception 'Spinta non valida.' using errcode = 'P0001'; end if;
  if not public.owns_character(p_character) then raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501'; end if;
  -- primo tiro: la combinazione migliore del ruolo (secondo tiro più sotto)
  select x.*, b.attribute_id, b.skill_id, p.name as position_name into ro
  from public.sport_roster x left join public.sport_positions p on p.id = x.position_id
  left join lateral public.sport_best_combo(x.character_id, x.position_id, 1) b on true
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

  v_intensity := coalesce(v_int[case ro.training_intensity when 'light' then 1 when 'normal' then 2 else 3 end], 0)::int;
  v_ctx := jsonb_build_object('system', 'athletics', 'phase', 'training', 'venue', 'home', 'format', sp.format);
  v_p1 := public.sport_roll_part(p_character, ro.attribute_id, ro.skill_id, v_ctx, v_intensity + v_push);
  -- secondo tiro (se il ruolo lo chiede): conta la media dei due
  select b.attribute_id, b.skill_id into v_a2, v_s2 from public.sport_best_combo(p_character, ro.position_id, 2) b;
  if v_s2 is not null then
    v_p2 := public.sport_roll_part(p_character, v_a2, v_s2, v_ctx, v_intensity + v_push);
  end if;
  select x.d10, x.crit, x.extra, x.total into v_d, v_crit, v_extra, v_total from public.sport_roll_merge(v_p1, v_p2) x;
  v_attr := (v_p1 ->> 'caratteristica')::int;
  v_skill := (v_p1 ->> 'abilita')::int;
  v_mods := (v_p1 ->> 'mods')::int;
  v_code := v_p1 ->> 'codice';
  v_skill_name := v_p1 ->> 'abilita_nome';
  m := jsonb_build_object('items', v_p1 -> 'voci', 'total', (v_p1 ->> 'voci_totale')::int);
  -- personal trainer: allenamento più facile
  v_cd_base := v_cd;
  if ro.trainer_until is not null and ro.trainer_until > now() then
    v_trainer := coalesce(public.setting_int('servizio_trainer_cd'), 2);
    v_cd := v_cd - v_trainer;
  end if;
  -- con un tiro solo l'1 è sempre un fallimento; con due conta la media
  v_success := v_total >= v_cd and (v_p2 is not null or v_crit <> 'failure');
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
      'spinta', p_push, 'spinta_valore', v_push, 'infortunio', v_injured,
      'tiri', jsonb_build_array(v_p1) || case when v_p2 is null then '[]'::jsonb else jsonb_build_array(v_p2) end));
  v_form := public.sport_training_form(p_character, p_sport);
  return jsonb_build_object('success', v_success, 'crit', v_crit, 'd10', v_d, 'extra', v_extra, 'total', v_total, 'cd', v_cd,
    'attr', v_attr, 'code', v_code, 'skill', v_skill, 'skill_name', v_skill_name, 'mods', v_mods, 'trainer', v_trainer, 'push', p_push, 'injured', v_injured,
    'tiri', jsonb_build_array(v_p1) || case when v_p2 is null then '[]'::jsonb else jsonb_build_array(v_p2) end,
    'form', least(v_form + ro.training_bonus, coalesce(public.setting_int('sport_allenamento_max'), 2)));
end;
$$;
revoke execute on function public.sport_train(uuid, uuid, text) from public, anon;
grant execute on function public.sport_train(uuid, uuid, text) to authenticated;

-- 5. DESCRIZIONI DEI RUOLI NEI GRUPPI
do $$
declare
  r record;
begin
  for r in select id from public.sport_positions loop
    perform public.sport_position_role_sync(r.id);
  end loop;
end;
$$;

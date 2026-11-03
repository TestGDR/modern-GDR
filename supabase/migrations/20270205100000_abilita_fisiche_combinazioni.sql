-- =====================================================================
-- ABILITÀ FISICHE E PIÙ COMBINAZIONI PER RUOLO SPORTIVO
-- 1. Abilità: «Sport di squadra» → Lanciare, «Ginnastica e acrobazie» →
--    Agilità, «Nuoto e sport acquatici» → Nuoto (stessi livelli);
--    «Sport di contatto» si unisce a Rissa (il livello più alto, senza
--    superare RIF); «Scherma» si toglie (i PX spesi tornano liberi).
--    La categoria «Sport» delle abilità diventa «Fisico».
-- 2. Ogni ruolo sportivo può avere più combinazioni caratteristica +
--    abilità (sport_position_combos, oltre a quella del ruolo): in gara e
--    in allenamento si usa da sola la migliore dell'atleta.
-- =====================================================================

-- 1. ABILITÀ
do $$
declare
  c text;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.skills'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%category%'
  loop
    execute format('alter table public.skills drop constraint %I', c);
  end loop;
end;
$$;

update public.skills set name = 'Lanciare',
  description = 'Lanciare, passare e prendere al volo: palla, frisbee, oggetti. Gli sport con la palla e non solo.'
where name = 'Sport di squadra';
update public.skills set name = 'Agilità',
  description = 'Equilibrio, acrobazie, ginnastica, cambi di direzione, parkour, tuffi e parate.'
where name = 'Ginnastica e acrobazie';
update public.skills set name = 'Nuoto',
  description = 'Nuoto, tuffi, surf, salvataggi in acqua.'
where name = 'Nuoto e sport acquatici';
update public.skills set description = 'Cavalli: monta inglese e western, la squadra equestre del college.'
where name = 'Equitazione';
update public.skills set description = 'Combattere a mani nude: pugni, calci, prese, lotta e placcaggi (anche negli sport di contatto).'
where name = 'Rissa';

-- Sport di contatto → Rissa; Scherma via
do $$
declare
  v_old uuid := (select id from public.skills where name = 'Sport di contatto');
  v_new uuid := (select id from public.skills where name = 'Rissa');
  v_attr uuid := (select attribute_id from public.skills where name = 'Rissa');
  v_max int := coalesce(public.setting_int('abilita_max'), 10);
  v_fen uuid := (select id from public.skills where name = 'Scherma');
begin
  if v_old is not null then
    if v_new is null then raise exception 'Abilità Rissa non trovata.'; end if;
    -- il livello più alto tra le due, senza superare la caratteristica di Rissa
    insert into public.character_skills (character_id, skill_id, level)
    select cs.character_id, v_new,
      least(cs.level, v_max, coalesce((select value from public.character_attributes ca where ca.character_id = cs.character_id and ca.attribute_id = v_attr), 0))
    from public.character_skills cs
    where cs.skill_id = v_old
      and least(cs.level, coalesce((select value from public.character_attributes ca where ca.character_id = cs.character_id and ca.attribute_id = v_attr), 0)) > 0
    on conflict (character_id, skill_id) do update set level = greatest(public.character_skills.level, excluded.level);
    delete from public.character_skills where skill_id = v_old;

    update public.creation_options set roll_skill_id = v_new where roll_skill_id = v_old;
    update public.creation_options set effects = replace(effects::text, v_old::text, v_new::text)::jsonb
    where effects::text like '%' || v_old::text || '%';
    update public.courses set skill_id = v_new where skill_id = v_old;
    update public.sport_positions set skill_id = v_new where skill_id = v_old;
    update public.business_types set skill_id = v_new where skill_id = v_old;
    update public.character_businesses set skill_id = v_new where skill_id = v_old;
    delete from public.skills where id = v_old;
  end if;

  if v_fen is not null then
    delete from public.character_skills where skill_id = v_fen;
    delete from public.skills where id = v_fen;
  end if;
end;
$$;

update public.skills set category = 'Fisico'
where name in ('Lanciare', 'Mira e precisione', 'Atletica', 'Nuoto', 'Forza', 'Agilità', 'Equitazione', 'Outdoor e sopravvivenza');
update public.skills set category = 'Pratico' where category = 'Sport';
alter table public.skills add constraint skills_category_check
  check (category in ('Studio', 'Fisico', 'Arti', 'Sociale', 'Pratico'));

-- 2. COMBINAZIONI DEI RUOLI
create table if not exists public.sport_position_combos (
  id uuid primary key default gen_random_uuid(),
  position_id uuid not null references public.sport_positions (id) on delete cascade,
  attribute_id uuid not null references public.attributes (id) on delete cascade,
  skill_id uuid not null references public.skills (id) on delete cascade,
  sort_order int not null default 0,
  unique (position_id, attribute_id, skill_id)
);
alter table public.sport_position_combos enable row level security;
revoke all on public.sport_position_combos from anon;
drop policy if exists "Combinazioni: le leggono tutti" on public.sport_position_combos;
create policy "Combinazioni: le leggono tutti" on public.sport_position_combos for select to authenticated using (true);
drop policy if exists "Combinazioni: lo staff aggiunge" on public.sport_position_combos;
create policy "Combinazioni: lo staff aggiunge" on public.sport_position_combos for insert to authenticated
  with check ((select public.has_permission('sport.gestire')));
drop policy if exists "Combinazioni: lo staff modifica" on public.sport_position_combos;
create policy "Combinazioni: lo staff modifica" on public.sport_position_combos for update to authenticated
  using ((select public.has_permission('sport.gestire'))) with check ((select public.has_permission('sport.gestire')));
drop policy if exists "Combinazioni: lo staff toglie" on public.sport_position_combos;
create policy "Combinazioni: lo staff toglie" on public.sport_position_combos for delete to authenticated
  using ((select public.has_permission('sport.gestire')));
drop trigger if exists sport_position_combos_log on public.sport_position_combos;
create trigger sport_position_combos_log after insert or update or delete on public.sport_position_combos
  for each row execute function public.log_admin_change();

-- 3. LA COMBINAZIONE MIGLIORE (caratteristica + abilità più alta; a parità quella del ruolo)
create or replace function public.sport_best_combo(p_character uuid, p_position uuid)
returns table (attribute_id uuid, skill_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select c.attribute_id, c.skill_id
  from (
    select p.attribute_id, p.skill_id, 0 as ord from public.sport_positions p where p.id = p_position
    union all
    select x.attribute_id, x.skill_id, 1 + x.sort_order from public.sport_position_combos x where x.position_id = p_position
  ) c
  order by coalesce((select ca.value from public.character_attributes ca where ca.character_id = p_character and ca.attribute_id = c.attribute_id), 0)
         + coalesce((select cs.level from public.character_skills cs where cs.character_id = p_character and cs.skill_id = c.skill_id), 0) desc,
    c.ord
  limit 1
$$;
revoke execute on function public.sport_best_combo(uuid, uuid) from public, anon, authenticated;

-- 4. DESCRIZIONE DEL RUOLO NEL GRUPPO: tutte le combinazioni
create or replace function public.sport_position_text(p_position uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select string_agg(c.txt, ' · ' order by c.ord)
    || case when count(*) > 1 then ' (si usa la migliore)' else '' end
    || case when (select team_bonus from public.sport_positions where id = p_position) then ' · conta doppio per la squadra' else '' end
  from (
    select 0 as ord, a.code || coalesce(' + ' || s.name, '') as txt
    from public.sport_positions p join public.attributes a on a.id = p.attribute_id
    left join public.skills s on s.id = p.skill_id
    where p.id = p_position
    union all
    select 1 + x.sort_order, a.code || ' + ' || s.name
    from public.sport_position_combos x join public.attributes a on a.id = x.attribute_id
    join public.skills s on s.id = x.skill_id
    where x.position_id = p_position
  ) c
$$;
revoke execute on function public.sport_position_text(uuid) from public, anon, authenticated;

create or replace function public.sport_position_combos_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.sport_position_role_sync(coalesce(new.position_id, old.position_id));
  return null;
end;
$$;
revoke execute on function public.sport_position_combos_sync() from public, anon, authenticated;
drop trigger if exists sport_position_combos_sync on public.sport_position_combos;
create trigger sport_position_combos_sync after insert or update or delete on public.sport_position_combos
  for each row execute function public.sport_position_combos_sync();

-- 5. GARA E ALLENAMENTO CON LA COMBINAZIONE MIGLIORE
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
  -- caratteristica e abilità: la combinazione migliore del ruolo per questo atleta
  select x.*, b.attribute_id, b.skill_id, p.team_bonus, p.name as position_name into ro
  from public.sport_roster x left join public.sport_positions p on p.id = x.position_id
  left join lateral public.sport_best_combo(x.character_id, x.position_id) b on true
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
    'venue', ev.venue, 'format', sp.format, 'attribute_id', ro.attribute_id));
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
      'caratteristica', v_attr, 'abilita', v_skill, 'ruolo', ro.position_name, 'avversario', round(v_opp, 1),
      'codice', (select code from public.attributes where id = ro.attribute_id), 'abilita_nome', (select name from public.skills where id = ro.skill_id)));
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
begin
  if p_push not in ('prudent', 'normal', 'max') then raise exception 'Spinta non valida.' using errcode = 'P0001'; end if;
  if not public.owns_character(p_character) then raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501'; end if;
  -- caratteristica e abilità: la combinazione migliore del ruolo per questo atleta
  select x.*, b.attribute_id, b.skill_id, p.name as position_name into ro
  from public.sport_roster x left join public.sport_positions p on p.id = x.position_id
  left join lateral public.sport_best_combo(x.character_id, x.position_id) b on true
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

-- 6. LE COMBINAZIONI DEI RUOLI (ord 0 = quella del ruolo, le altre in più)
do $$
declare
  r record;
  v_pos uuid;
  v_attr uuid;
  v_skill uuid;
begin
  for r in
    select * from (values
      ('Football', 'Quarterback', 'RIF', 'Lanciare', 0), ('Football', 'Quarterback', 'RIF', 'Mira e precisione', 1),
      ('Football', 'Running back', 'VIG', 'Atletica', 0), ('Football', 'Running back', 'VIG', 'Agilità', 1), ('Football', 'Running back', 'VIG', 'Rissa', 2),
      ('Football', 'Wide receiver', 'RIF', 'Lanciare', 0), ('Football', 'Wide receiver', 'VIG', 'Atletica', 1), ('Football', 'Wide receiver', 'VIG', 'Agilità', 2),
      ('Football', 'Linea', 'VIG', 'Forza', 0), ('Football', 'Linea', 'VIG', 'Rissa', 1),
      ('Football', 'Difesa', 'VIG', 'Rissa', 0), ('Football', 'Difesa', 'VIG', 'Atletica', 1),
      ('Football', 'Kicker', 'RIF', 'Mira e precisione', 0), ('Football', 'Kicker', 'VIG', 'Forza', 1),
      ('Volleyball', 'Palleggiatore', 'RIF', 'Lanciare', 0), ('Volleyball', 'Palleggiatore', 'RIF', 'Mira e precisione', 1),
      ('Volleyball', 'Schiacciatore', 'VIG', 'Agilità', 0), ('Volleyball', 'Schiacciatore', 'VIG', 'Forza', 1), ('Volleyball', 'Schiacciatore', 'VIG', 'Atletica', 2),
      ('Volleyball', 'Centrale', 'VIG', 'Atletica', 0), ('Volleyball', 'Centrale', 'RIF', 'Lanciare', 1),
      ('Volleyball', 'Libero', 'RIF', 'Agilità', 0), ('Volleyball', 'Libero', 'RIF', 'Lanciare', 1),
      ('Basketball', 'Playmaker', 'RIF', 'Lanciare', 0), ('Basketball', 'Playmaker', 'VIG', 'Agilità', 1),
      ('Basketball', 'Guardia tiratrice', 'RIF', 'Mira e precisione', 0), ('Basketball', 'Guardia tiratrice', 'RIF', 'Lanciare', 1),
      ('Basketball', 'Ala piccola', 'VIG', 'Atletica', 0), ('Basketball', 'Ala piccola', 'RIF', 'Mira e precisione', 1),
      ('Basketball', 'Ala grande', 'VIG', 'Forza', 0), ('Basketball', 'Ala grande', 'RIF', 'Lanciare', 1),
      ('Basketball', 'Centro', 'VIG', 'Forza', 0), ('Basketball', 'Centro', 'VIG', 'Rissa', 1),
      ('Ice hockey', 'Attaccante', 'RIF', 'Mira e precisione', 0), ('Ice hockey', 'Attaccante', 'VIG', 'Agilità', 1),
      ('Ice hockey', 'Difensore', 'VIG', 'Rissa', 0), ('Ice hockey', 'Difensore', 'VIG', 'Forza', 1),
      ('Ice hockey', 'Portiere', 'RIF', 'Agilità', 0),
      ('Nuoto', 'Stile libero', 'VIG', 'Nuoto', 0), ('Nuoto', 'Stile libero', 'VIG', 'Resistenza fisica', 1),
      ('Nuoto', 'Dorso', 'VIG', 'Nuoto', 0), ('Nuoto', 'Rana', 'VIG', 'Nuoto', 0), ('Nuoto', 'Farfalla', 'VIG', 'Nuoto', 0),
      ('Cheerleading', 'Flyer', 'VIG', 'Agilità', 0),
      ('Cheerleading', 'Base', 'VIG', 'Forza', 0),
      ('Cheerleading', 'Back spot', 'VIG', 'Forza', 0), ('Cheerleading', 'Back spot', 'RIF', 'Lanciare', 1),
      ('Cheerleading', 'Tumbler', 'VIG', 'Agilità', 0),
      ('Cheerleading', 'Dancer', 'RIF', 'Danza', 0), ('Cheerleading', 'Dancer', 'VIG', 'Agilità', 1),
      ('Equitazione', 'Salto ostacoli', 'RIF', 'Equitazione', 0), ('Equitazione', 'Salto ostacoli', 'VIG', 'Agilità', 1),
      ('Equitazione', 'Equitazione in piano', 'RIF', 'Equitazione', 0),
      ('Equitazione', 'Dressage', 'EMP', 'Equitazione', 0),
      ('Equitazione', 'Completo (cross country)', 'VIG', 'Equitazione', 0), ('Equitazione', 'Completo (cross country)', 'VIG', 'Resistenza fisica', 1),
      ('Equitazione', 'Reining (western)', 'RIF', 'Equitazione', 0),
      ('Equitazione', 'Horsemanship (western)', 'EMP', 'Equitazione', 0)
    ) as v (sport, pos, attr, skill, ord)
  loop
    select p.id into v_pos from public.sport_positions p join public.sports s on s.id = p.sport_id
    where s.name = r.sport and p.name = r.pos;
    v_attr := (select id from public.attributes where code = r.attr);
    v_skill := (select id from public.skills where name = r.skill);
    continue when v_pos is null or v_attr is null or v_skill is null;
    if r.ord = 0 then
      update public.sport_positions set attribute_id = v_attr, skill_id = v_skill where id = v_pos;
      delete from public.sport_position_combos where position_id = v_pos;
    else
      insert into public.sport_position_combos (position_id, attribute_id, skill_id, sort_order)
      values (v_pos, v_attr, v_skill, r.ord)
      on conflict (position_id, attribute_id, skill_id) do nothing;
    end if;
  end loop;

  -- descrizioni dei ruoli nei gruppi
  for r in select id from public.sport_positions loop
    perform public.sport_position_role_sync(r.id);
  end loop;
end;
$$;

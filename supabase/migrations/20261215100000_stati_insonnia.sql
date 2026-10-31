-- =====================================================================
-- STATI DEL PERSONAGGIO (icone accanto al ritratto) E INSONNIA
-- - Icone in scheda: alcol, droghe, insonnia. Attive = colorate e con la
--   descrizione; non attive = grigie ("Non attivo").
-- - Insonnia: tratto "Insonne". Ogni giorno (ora italiana) un tiro di
--   resistenza VIG + Resistenza fisica + d10 (10 → +d10, 1 → −d10) contro
--   la CD decide se il personaggio ha dormito. Se fallisce: notte in
--   bianco, −1 a TUTTI i tiri per quel giorno (numeri in impostazioni).
--   Il tiro lo fa pg_cron ogni mattina, e comunque la prima volta che
--   serve (apertura della scheda, un tiro).
-- - Gli stati in scheda li vedono tutti (si vedono anche in gioco);
--   il dettaglio delle alterazioni resta in Caratteristiche.
-- =====================================================================

insert into public.game_settings (key, value, kind, label, description, sort_order) values
  ('insonnia_cd', '12', 'number', 'Insonnia · CD per dormire', 'Ogni giorno chi è Insonne tira VIG + Resistenza fisica + d10 contro questa CD.', 330),
  ('insonnia_malus', '1', 'number', 'Insonnia · Malus della notte in bianco', 'Si toglie a tutti i tiri di quel giorno.', 331)
on conflict (key) do nothing;

-- il tratto (pro: sveglio quando gli altri dormono; contro: le notti in bianco)
insert into public.creation_options (kind, scope, subgroup, name, cost_px, description, effects, sort_order)
values ('tratto', 'generale', '', 'Insonne', 0,
  'Ogni giorno un tiro di resistenza (VIG + Resistenza fisica + d10) decide se hai dormito: se fallisce passi la notte in bianco e quel giorno hai −1 a tutti i tiri. In compenso sei lucido quando gli altri dormono: +1 ai tiri di percezione di notte.',
  '[{"type":"rule_flag","flag":"insomnia"},{"type":"roll_modifier","value":1,"situational":true,"label":"di notte, quando gli altri dormono","when":{"category":["percezione"]}}]',
  200)
on conflict (kind, name) do nothing;

create table public.character_sleep (
  character_id uuid not null references public.characters (id) on delete cascade,
  day date not null,
  slept boolean not null,
  total int not null,
  cd int not null,
  detail jsonb not null default '{}',
  rolled_at timestamptz not null default now(),
  primary key (character_id, day)
);
alter table public.character_sleep enable row level security;
revoke all on public.character_sleep from anon, authenticated;
grant select on public.character_sleep to authenticated;
create policy "Sonno: lo vedono tutti" on public.character_sleep for select to authenticated using (true);
create policy "Sonno: solo dalle funzioni" on public.character_sleep for insert to authenticated with check (false);
create policy "Sonno: non si modifica" on public.character_sleep for update to authenticated using (false);
create policy "Sonno: non si cancella" on public.character_sleep for delete to authenticated using (false);

create or replace function public.rome_today()
returns date
language sql
stable
set search_path = ''
as $$ select (now() at time zone 'Europe/Rome')::date $$;
revoke execute on function public.rome_today() from public, anon, authenticated;

-- Il tiro della notte (una volta al giorno; solo per chi è Insonne)
create or replace function public.sleep_roll(p_character uuid)
returns public.character_sleep
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.character_sleep;
  v_vig int; v_skill int; v_mods int; d int; v_extra int := 0; v_total int; v_cd int;
begin
  select * into s from public.character_sleep where character_id = p_character and day = public.rome_today();
  if s.character_id is not null then return s; end if;
  if not public.trait_flag(p_character, 'insomnia')
     or not exists (select 1 from public.characters where id = p_character and status = 'approvata') then
    return null;
  end if;
  v_vig := public.combat_attr(p_character, 'VIG');
  v_skill := public.combat_skill(p_character, 'Resistenza fisica');
  v_mods := (public.trait_mods(p_character, jsonb_build_object('system', 'general', 'category', 'resistenza', 'no_sleep', true)) ->> 'total')::int;
  d := public.combat_die(10);
  if d = 10 then v_extra := public.combat_die(10); elsif d = 1 then v_extra := -public.combat_die(10); end if;
  v_total := v_vig + v_skill + d + v_extra + v_mods;
  v_cd := coalesce(public.setting_int('insonnia_cd'), 12);
  insert into public.character_sleep (character_id, day, slept, total, cd, detail)
  values (p_character, public.rome_today(), v_total >= v_cd, v_total, v_cd,
    jsonb_build_object('vig', v_vig, 'abilita', v_skill, 'd10', d, 'extra', v_extra, 'voci', v_mods))
  on conflict do nothing
  returning * into s;
  if s.character_id is not null and not s.slept then
    perform public.send_system_message((select owner_id from public.characters where id = p_character),
      '🌙 ' || public.first_name((select name from public.characters where id = p_character))
      || ' ha passato la notte in bianco (resistenza ' || v_total || ' contro ' || v_cd || '): oggi −'
      || coalesce(public.setting_int('insonnia_malus'), 1) || ' a tutti i tiri.');
  end if;
  return coalesce(s, (select x from public.character_sleep x where x.character_id = p_character and x.day = public.rome_today()));
end;
$$;
revoke execute on function public.sleep_roll(uuid) from public, anon, authenticated;

create or replace function public.sleep_roll_all()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
begin
  for c in select id from public.characters where status = 'approvata' and public.trait_flag(id, 'insomnia') loop
    perform public.sleep_roll(c.id);
  end loop;
end;
$$;
revoke execute on function public.sleep_roll_all() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- I malus nei tiri: la notte in bianco vale per tutti i tiri
-- ---------------------------------------------------------------------
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

-- Prima di tirare in chat: il tiro della notte di oggi, se manca
create or replace function public.interlock_roll(p_character uuid, p_attribute uuid, p_skill uuid, p_situational uuid[] default '{}')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attr public.attributes;
  v_skill public.skills;
  v_attr_value int := 0;
  v_skill_level int := 0;
  m jsonb;
  v_mods int := 0;
  v_die int := 1 + floor(random() * 10)::int;
  v_extra int := 0;
  v_total int;
  v_label text := 'd10';
  v_text text;
  v_crit text := 'none';
  v_names text;
begin
  -- il tiro della notte di oggi (Insonne), se non è ancora stato fatto
  perform public.sleep_roll(p_character);
  if p_skill is not null then
    select * into v_skill from public.skills where id = p_skill and active;
    if not found then raise exception 'Abilità non valida.' using errcode = 'P0001'; end if;
    p_attribute := v_skill.attribute_id;
    select coalesce((select level from public.character_skills where character_id = p_character and skill_id = p_skill), 0)
      into v_skill_level;
  end if;
  if p_attribute is not null then
    select * into v_attr from public.attributes where id = p_attribute and active;
    if not found then raise exception 'Caratteristica non valida.' using errcode = 'P0001'; end if;
    select coalesce((select value from public.character_attributes where character_id = p_character and attribute_id = p_attribute), 0)
      into v_attr_value;
    v_label := coalesce(v_skill.name || ' (' || v_attr.code || ')', v_attr.name);
  end if;
  m := public.trait_mods(p_character, jsonb_build_object('system', 'general', 'skill_id', p_skill, 'attribute_id', p_attribute), coalesce(p_situational, '{}'));
  v_mods := (m ->> 'total')::int;

  -- critici: soglie cambiate dalle voci (Metodico, Imprevedibile, Goffo…)
  if v_die >= (m ->> 'success_min')::int then
    v_crit := 'success';
    v_extra := 1 + floor(random() * 10)::int;
  elsif v_die <= (m ->> 'failure_max')::int then
    v_crit := 'failure';
    v_extra := -(1 + floor(random() * 10)::int);
  end if;
  v_total := v_die + v_extra + v_attr_value + v_skill_level + v_mods;

  select string_agg(x ->> 'name' || ' ' || case when (x ->> 'value')::int > 0 then '+' else '−' end || abs((x ->> 'value')::int), ', ')
    into v_names from jsonb_array_elements(m -> 'items') x where (x ->> 'value')::int <> 0;

  -- nel messaggio l'esito e le voci applicate, senza i passaggi
  v_text := 'tira ' || v_label || ': '
    || case v_crit when 'success' then 'SUCCESSO CRITICO' when 'failure' then 'FALLIMENTO CRITICO' else 'risultato ' || v_total end
    || coalesce(' (' || v_names || ')', '');

  return jsonb_build_object(
    'die', v_die, 'extra', v_extra, 'crit', v_crit,
    'attribute', v_attr.code, 'attribute_value', case when v_attr.id is not null then v_attr_value end,
    'skill', v_skill.name, 'skill_level', case when v_skill.id is not null then v_skill_level end,
    'modifiers', v_mods, 'traits', m -> 'items', 'success_min', m -> 'success_min', 'failure_max', m -> 'failure_max',
    'situational', to_jsonb(coalesce(p_situational, '{}')), 'label', v_label,
    'total', v_total, 'text', v_text);
end;
$$;

-- ---------------------------------------------------------------------
-- Stati per la scheda (li vedono tutti)
-- ---------------------------------------------------------------------
create or replace function public.character_status_get(p_character uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.character_sleep;
  a jsonb;
  d jsonb;
begin
  s := public.sleep_roll(p_character);
  select public.alteration_now(x) || jsonb_build_object('source', x.source_name) into a
  from public.character_alterations x where x.character_id = p_character and x.kind = 'alcol';
  select public.alteration_now(x) || jsonb_build_object('source', x.source_name) into d
  from public.character_alterations x where x.character_id = p_character and x.kind = 'droga';
  return jsonb_build_object(
    'alcol', case when a ? 'name' then a end,
    'droga', case when d ? 'name' then d end,
    'insonnia', jsonb_build_object(
      'has_trait', public.trait_flag(p_character, 'insomnia'),
      'active', s.character_id is not null and not s.slept,
      'slept', s.slept,
      'total', s.total,
      'cd', s.cd,
      'malus', coalesce(public.setting_int('insonnia_malus'), 1),
      'until', (public.rome_today() + 1)::timestamp at time zone 'Europe/Rome'));
end;
$$;
revoke execute on function public.character_status_get(uuid) from public, anon;
grant execute on function public.character_status_get(uuid) to authenticated;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('insonnia-notte', '30 4 * * *', 'select public.sleep_roll_all()');
exception when others then
  raise notice 'pg_cron non disponibile: %', sqlerrm;
end $$;

-- =====================================================================
-- PX: PIÙ PUNTI, TETTO AGLI SVANTAGGI, AMBIENTAZIONE A METÀ, CRESCITA
-- 1. PX iniziali 1.300 (erano 1.060); +240 PX ai personaggi già approvati
--    o in attesa, con un messaggio di SISTEMA.
-- 2. Gli svantaggi restituiscono al massimo voci_svantaggi_px_max (160) PX
--    in tutto, in creazione e con le voci aggiunte dopo.
-- 3. Voci di ambientazione a metà prezzo (1 punto = 20 PX); a chi le aveva
--    già comprate tornano i PX di differenza.
-- 4. Crescita delle abilità: dalla scheda, +1 livello pagando i PX
--    (10 × il nuovo livello), mai oltre la caratteristica.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1-2. IMPOSTAZIONI
-- ---------------------------------------------------------------------
update public.game_settings set value = '1300' where key = 'px_iniziali' and value = '1060'::jsonb;
insert into public.game_settings (key, value, kind, label, description, sort_order) values
  ('voci_svantaggi_px_max', '160', 'number', 'Svantaggi: PX restituiti al massimo',
   'In tutto, gli svantaggi di un personaggio danno al massimo questi PX (si possono prenderne altri, ma oltre il tetto non danno PX).', 45)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- 1 e 3. PX AI PERSONAGGI GIÀ INVIATI (PRIMA DI CAMBIARE I PREZZI)
-- ---------------------------------------------------------------------
do $$
declare
  r record;
  v_bonus int := 240;
begin
  for r in
    select c.id, c.owner_id, c.name,
      coalesce((select sum((o.cost_px - round(o.cost_px / 2.0)::int) * co.level)
                from public.character_options co join public.creation_options o on o.id = co.option_id
                where co.character_id = c.id and co.source <> 'master'
                  and o.scope = 'ambientazione' and o.kind = 'vantaggio' and o.cost_px > 0), 0)::int as amb
    from public.characters c
    where c.status in ('approvata', 'in_attesa')
  loop
    perform set_config('app.invio_scheda', 'on', true);
    update public.characters set px = px + v_bonus + r.amb where id = r.id;
    perform set_config('app.invio_scheda', 'off', true);
    perform public.send_system_message(r.owner_id,
      '📈 I PX della creazione sono saliti a 1.300: ' || public.first_name(r.name) || ' riceve +' || v_bonus || ' PX'
      || case when r.amb > 0 then ' (e +' || r.amb || ' PX perché le voci di ambientazione ora costano la metà)' else '' end
      || '. Puoi spenderli in Scheda → Abilità (pulsante +) o con le voci nuove in Scheda → Tratti.');
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. AMBIENTAZIONE A METÀ PREZZO
-- ---------------------------------------------------------------------
update public.creation_options set cost_px = round(cost_px / 2.0)::int
where scope = 'ambientazione' and kind in ('vantaggio', 'svantaggio') and cost_px <> 0;

-- ---------------------------------------------------------------------
-- 2. TETTO AGLI SVANTAGGI: INVIO DELLA SCHEDA E VOCI AGGIUNTE DOPO
-- ---------------------------------------------------------------------

create or replace function public.submit_character(p_character uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.characters;
  v_count int;
  v_total int;
  v_options int;
  v_skills int;
  v_left int;
  v_maxes jsonb := (select value from public.game_settings where key = 'massimali_creazione');
  v_last_max int;
begin
  select * into c from public.characters where id = p_character and owner_id = (select auth.uid());
  if c.id is null then
    raise exception 'Scheda non trovata';
  end if;
  if c.status not in ('bozza', 'rifiutata') then
    raise exception 'La scheda è già stata inviata';
  end if;

  -- Dati anagrafici
  if c.sex is null or c.age is null or c.birth_date is null or coalesce(trim(c.nationality), '') = '' then
    raise exception 'Completa i dati anagrafici';
  end if;
  if c.age < public.setting_int('eta_min') or c.age > public.setting_int('eta_max') then
    raise exception 'L''età non rientra in quella consentita';
  end if;

  -- Caratteristiche: tutte impostate, punti spesi tutti, minimi e massimali rispettati
  select count(*), coalesce(sum(ca.value), 0) into v_count, v_total
  from public.character_attributes ca join public.attributes a on a.id = ca.attribute_id and a.active
  where ca.character_id = p_character;
  if v_count <> (select count(*) from public.attributes where active) then
    raise exception 'Imposta tutte le caratteristiche';
  end if;
  if v_total <> public.setting_int('punti_caratteristiche') then
    raise exception 'Devi spendere esattamente % punti caratteristica (ne hai usati %)', public.setting_int('punti_caratteristiche'), v_total;
  end if;
  if exists (
    select 1 from public.character_attributes ca join public.attributes a on a.id = ca.attribute_id and a.active
    where ca.character_id = p_character
      and (ca.value < public.setting_int('caratteristica_min_creazione') or ca.value > public.setting_int('caratteristica_max'))
  ) then
    raise exception 'Una caratteristica è fuori dai valori consentiti';
  end if;
  v_last_max := coalesce((v_maxes ->> (jsonb_array_length(v_maxes) - 1))::int, public.setting_int('caratteristica_max'));
  if exists (
    select 1
    from (
      select ca.value, row_number() over (order by ca.value desc) as pos
      from public.character_attributes ca join public.attributes a on a.id = ca.attribute_id and a.active
      where ca.character_id = p_character
    ) v
    where v.value > coalesce((v_maxes ->> (v.pos::int - 1))::int, v_last_max)
  ) then
    raise exception 'Le caratteristiche superano i massimali consentiti';
  end if;

  -- Abilità mai sopra la caratteristica collegata
  if exists (
    select 1
    from public.character_skills cs
    join public.skills s on s.id = cs.skill_id
    left join public.character_attributes ca on ca.attribute_id = s.attribute_id and ca.character_id = cs.character_id
    where cs.character_id = p_character and cs.level > coalesce(ca.value, 0)
  ) then
    raise exception 'Un''abilità supera la caratteristica collegata';
  end if;

  -- Tenore di vita: una sola scelta; niente voci incompatibili
  if (
    select count(*) from public.character_options co join public.creation_options o on o.id = co.option_id
    where co.character_id = p_character and o.kind = 'tenore'
  ) <> 1 then
    raise exception 'Scegli un tenore di vita';
  end if;
  if exists (
    select 1
    from public.character_options co1
    join public.creation_options o1 on o1.id = co1.option_id
    join public.character_options co2 on co2.character_id = co1.character_id and co2.option_id = any (o1.incompatible_ids)
    where co1.character_id = p_character
  ) then
    raise exception 'Hai scelto voci incompatibili tra loro';
  end if;
  -- voci nuove: massimi, livelli, scelte richieste
  perform public.check_character_options(p_character);

  -- PX: iniziali − vantaggi/tratti/tenore (× livello) + svantaggi − abilità (le voci date dal Master non costano)
  -- gli svantaggi restituiscono al massimo voci_svantaggi_px_max PX in tutto
  select coalesce(sum(o.cost_px * co.level) filter (where o.cost_px > 0), 0)
       + greatest(coalesce(sum(o.cost_px * co.level) filter (where o.cost_px < 0), 0), -coalesce(public.setting_int('voci_svantaggi_px_max'), 160))
    into v_options
  from public.character_options co join public.creation_options o on o.id = co.option_id
  where co.character_id = p_character and co.source = 'creazione';
  select coalesce(sum(public.setting_int('costo_px_livello') * cs.level * (cs.level + 1) / 2), 0) into v_skills
  from public.character_skills cs where cs.character_id = p_character;
  v_left := public.setting_int('px_iniziali') - v_options - v_skills;
  if v_left < 0 then
    raise exception 'Hai speso più PX di quelli disponibili (%)', v_left;
  end if;

  -- Background
  if c.study_track_id is null or c.year_id is null then
    raise exception 'Scegli indirizzo di studio e anno di corso';
  end if;

  perform set_config('app.invio_scheda', 'on', true);
  update public.characters
  set status = 'in_attesa', px = v_left, rejection_reason = null, creation_step = 6
  where id = p_character;
  perform set_config('app.invio_scheda', 'off', true);
end;
$$;


create or replace function public.option_request_check(p_character uuid, p_items jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  it jsonb;
  o public.creation_options;
  v_cost int := 0;
  v_neg int := 0;
  v_had int;
  v_lvl int;
  v_choice text;
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 10 then
    raise exception 'Scegli da 1 a 10 voci.' using errcode = 'P0001';
  end if;
  if (select count(distinct x ->> 'option_id') from jsonb_array_elements(p_items) x) <> jsonb_array_length(p_items) then
    raise exception 'Una voce è ripetuta.' using errcode = 'P0001';
  end if;
  for it in select * from jsonb_array_elements(p_items) loop
    select * into o from public.creation_options where id = (it ->> 'option_id')::uuid;
    if o.id is null or not o.active or not o.available or o.kind = 'tenore' then
      raise exception '"%" non si può scegliere.', coalesce(o.name, 'Voce') using errcode = 'P0001';
    end if;
    if exists (select 1 from public.character_options where character_id = p_character and option_id = o.id) then
      raise exception 'Hai già "%".', o.name using errcode = 'P0001';
    end if;
    v_lvl := coalesce((it ->> 'level')::int, 1);
    if v_lvl < 1 or v_lvl > o.max_level then raise exception '"%": livello non valido.', o.name using errcode = 'P0001'; end if;
    v_choice := btrim(coalesce(it ->> 'choice', ''));
    if o.requires_choice in ('testo', 'dipartimento', 'area', 'gruppo') and v_choice = '' then
      raise exception '"%": indica %.', o.name, coalesce(nullif(o.choice_hint, ''), 'la scelta richiesta') using errcode = 'P0001';
    end if;
    if o.cost_px < 0 then v_neg := v_neg + o.cost_px * v_lvl; else v_cost := v_cost + o.cost_px * v_lvl; end if;
  end loop;

  -- prova con le voci aggiunte: massimi, scelte, incompatibilità (poi si annulla)
  begin
    insert into public.character_options (character_id, option_id, level, choice_value)
    select p_character, (x ->> 'option_id')::uuid, coalesce((x ->> 'level')::int, 1), left(btrim(coalesce(x ->> 'choice', '')), 80)
    from jsonb_array_elements(p_items) x;
    perform public.check_character_options(p_character);
    if exists (
      select 1 from public.character_options co1 join public.creation_options o1 on o1.id = co1.option_id
      join public.character_options co2 on co2.character_id = co1.character_id and co2.option_id = any (o1.incompatible_ids)
      where co1.character_id = p_character
    ) then
      raise exception 'Una voce è incompatibile con quelle che hai già.' using errcode = 'P0001';
    end if;
    raise exception 'prova riuscita' using errcode = 'P0099';
  exception when sqlstate 'P0099' then
    null;
  end;
  -- gli svantaggi danno PX solo fino al tetto, contando quelli già presi
  select coalesce(-sum(o.cost_px * co.level), 0) into v_had
  from public.character_options co join public.creation_options o on o.id = co.option_id
  where co.character_id = p_character and co.source <> 'master' and o.cost_px < 0;
  v_cost := v_cost + greatest(v_neg, -greatest(0, coalesce(public.setting_int('voci_svantaggi_px_max'), 160) - v_had));
  return v_cost;
end;
$$;


-- ---------------------------------------------------------------------
-- 4. CRESCITA DELLE ABILITÀ
-- ---------------------------------------------------------------------
create table if not exists public.skill_upgrades (
  id bigint generated always as identity primary key,
  character_id uuid not null references public.characters (id) on delete cascade,
  skill_id uuid not null references public.skills (id) on delete cascade,
  from_level int not null,
  to_level int not null,
  cost int not null,
  created_at timestamptz not null default now()
);
create index if not exists skill_upgrades_character_idx on public.skill_upgrades (character_id, created_at desc);
alter table public.skill_upgrades enable row level security;
revoke insert, update, delete on public.skill_upgrades from anon, authenticated;
drop policy if exists "Crescita: proprietario e staff" on public.skill_upgrades;
create policy "Crescita: proprietario e staff" on public.skill_upgrades for select to authenticated
  using ((select public.owns_character(character_id)) or (select public.has_permission('personaggi.vedere_tutti')));

create or replace function public.skill_upgrade(p_character uuid, p_skill uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.characters;
  v_level int;
  v_attr int;
  v_cost int;
  v_name text;
begin
  if not public.owns_character(p_character) then raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501'; end if;
  select * into c from public.characters where id = p_character for update;
  select s.name, ca.value into v_name, v_attr
  from public.skills s left join public.character_attributes ca on ca.attribute_id = s.attribute_id and ca.character_id = p_character
  where s.id = p_skill and s.active;
  if v_name is null then raise exception 'Abilità non trovata.' using errcode = 'P0001'; end if;
  v_level := coalesce((select level from public.character_skills where character_id = p_character and skill_id = p_skill), 0);
  if v_level + 1 > coalesce(v_attr, 0) then
    raise exception '% non può superare la caratteristica collegata (%).', v_name, coalesce(v_attr, 0) using errcode = 'P0001';
  end if;
  if v_level + 1 > coalesce(public.setting_int('abilita_max'), 10) then
    raise exception '% è già al massimo.', v_name using errcode = 'P0001';
  end if;
  v_cost := coalesce(public.setting_int('costo_px_livello'), 10) * (v_level + 1);
  if c.px < v_cost then
    raise exception 'Servono % PX per portare % a %: ne hai %.', v_cost, v_name, v_level + 1, c.px using errcode = 'P0001';
  end if;
  insert into public.character_skills (character_id, skill_id, level) values (p_character, p_skill, v_level + 1)
  on conflict (character_id, skill_id) do update set level = excluded.level;
  perform set_config('app.invio_scheda', 'on', true);
  update public.characters set px = px - v_cost where id = p_character;
  perform set_config('app.invio_scheda', 'off', true);
  insert into public.skill_upgrades (character_id, skill_id, from_level, to_level, cost) values (p_character, p_skill, v_level, v_level + 1, v_cost);
  return jsonb_build_object('skill', v_name, 'level', v_level + 1, 'cost', v_cost, 'px', c.px - v_cost);
end;
$$;
revoke execute on function public.skill_upgrade(uuid, uuid) from public, anon;
grant execute on function public.skill_upgrade(uuid, uuid) to authenticated;

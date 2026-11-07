-- =====================================================================
-- INCIDENTI IN CHAT (fuori dal combattimento)
-- Pulsante «Incidente» tra i comandi della chat: chi è in giocata sceglie
-- un incidente (taglio, caduta in bici, incidente in moto…) e il database
-- tira il danno (dadi dell'incidente) e la resistenza (VIG + Resistenza
-- fisica + d10 contro la CD: se riesce il danno si dimezza; 10 = nessun
-- danno, 1 = danno pieno e ferita di un grado più grave).
-- - I PF scendono davvero; con un danno alto arriva una ferita (zona
--   scelta o a caso) che guarisce coi tempi del combattimento.
-- - Finché una ferita è aperta, fuori dal combattimento la sua penalità
--   vale su tutti i tiri (anche esami e sport) dentro trait_mods.
-- - Ferita grave o molto grave: infortunio in squadra (gare saltate in
--   incidente_infortunio_gare) e avviso di SISTEMA allo staff.
-- - Il Master (chat.narrazione / combattimento.gestire) lo usa anche sugli
--   altri presenti. Incidenti modificabili in Gestione → Incidenti.
-- =====================================================================

-- 1. catalogo degli incidenti
create table if not exists public.incident_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(btrim(name)) between 2 and 60),
  tier text not null check (tier in ('lieve', 'normale', 'medio', 'grave')),
  dice_count int not null default 1 check (dice_count between 1 and 6),
  dice_sides int not null default 6 check (dice_sides between 2 and 20),
  bonus int not null default 0 check (bonus between 0 and 30),
  cd int not null default 12 check (cd between 5 and 30),
  description text not null default '' check (char_length(description) <= 300),
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.incident_types enable row level security;
revoke all on public.incident_types from anon, authenticated;
grant select, insert, update, delete on public.incident_types to authenticated;
drop policy if exists "Incidenti: li leggono tutti" on public.incident_types;
create policy "Incidenti: li leggono tutti" on public.incident_types for select to authenticated using (true);
drop policy if exists "Incidenti: li crea lo staff" on public.incident_types;
create policy "Incidenti: li crea lo staff" on public.incident_types for insert to authenticated
  with check ((select public.has_permission('combattimento.gestire')));
drop policy if exists "Incidenti: li modifica lo staff" on public.incident_types;
create policy "Incidenti: li modifica lo staff" on public.incident_types for update to authenticated
  using ((select public.has_permission('combattimento.gestire'))) with check ((select public.has_permission('combattimento.gestire')));
drop policy if exists "Incidenti: li elimina lo staff" on public.incident_types;
create policy "Incidenti: li elimina lo staff" on public.incident_types for delete to authenticated
  using ((select public.has_permission('combattimento.gestire')));

insert into public.incident_types (name, tier, dice_count, dice_sides, bonus, cd, description, sort_order) values
  ('Puntura (ago, spina)', 'lieve', 1, 3, 0, 10, 'Un ago da cucito, una spina, una scheggia.', 10),
  ('Taglietto', 'lieve', 1, 3, 0, 10, 'Carta, un coccio, il bordo di una lattina.', 11),
  ('Piccola bruciatura', 'lieve', 1, 3, 0, 10, 'Una padella calda, il ferro da stiro sfiorato.', 12),
  ('Botta', 'lieve', 1, 3, 0, 10, 'Lo spigolo del tavolo, una porta in faccia.', 13),
  ('Inciampo, caduta da fermo', 'normale', 1, 6, 0, 12, 'Un gradino non visto, i lacci slacciati.', 20),
  ('Scivolone', 'normale', 1, 6, 0, 12, 'Pavimento bagnato, sabbia, foglie.', 21),
  ('Salto andato male', 'normale', 1, 6, 0, 12, 'Un muretto, una pozzanghera, un tuffo sbagliato.', 22),
  ('Taglio (coltello)', 'normale', 1, 6, 0, 12, 'In cucina, aprendo un pacco, con un attrezzo.', 23),
  ('Bruciatura (fornello)', 'normale', 1, 6, 0, 12, 'Fiamma, acqua bollente, olio.', 24),
  ('Caduta in corsa', 'medio', 2, 6, 0, 14, 'Correndo, durante un allenamento o una fuga.', 30),
  ('Caduta su ruote (bici, skate, pattini)', 'medio', 2, 6, 0, 14, 'Una buca, un marciapiede, una curva presa male.', 31),
  ('Caduta da 1–2 metri', 'medio', 2, 6, 0, 14, 'Da un muretto, da una scala, da un albero basso.', 32),
  ('Acrobazia andata male', 'medio', 2, 6, 0, 14, 'Parkour, ginnastica, una sfida tra amici.', 33),
  ('Ustione', 'medio', 2, 6, 0, 14, 'Un incendio piccolo, un falò, un barbecue.', 34),
  ('Caduta in moto o scooter', 'grave', 3, 6, 4, 16, 'Asfalto bagnato, un sorpasso, una frenata.', 40),
  ('Incidente in auto', 'grave', 3, 6, 4, 16, 'Un tamponamento, un''uscita di strada.', 41),
  ('Investito', 'grave', 3, 6, 4, 16, 'Da un''auto, una bici veloce, uno scooter.', 42),
  ('Caduta da 3–5 metri', 'grave', 3, 6, 2, 16, 'Da un albero, un balcone, un muro.', 43),
  ('Caduta da oltre 5 metri', 'grave', 4, 6, 4, 18, 'Un tetto, una scogliera, un ponte.', 44)
on conflict (name) do nothing;

-- gare saltate da un atleta per una ferita grave e molto grave
insert into public.game_settings (key, value, kind, label, description, sort_order) values
  ('incidente_infortunio_gare', '[2, 4]', 'numbers', 'Incidenti · Gare saltate per una ferita',
   'Ferita grave e ferita molto grave da incidente: gare che l''atleta salta in squadra.', 400)
on conflict (key) do nothing;

-- 2. messaggi «incidente» in chat
alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check
  check (kind in ('azione', 'fuori_gioco', 'master', 'dado', 'sistema', 'sussurro', 'combattimento', 'png', 'incidente'));

-- il limite dei caratteri non vale per i messaggi scritti dal database
create or replace function public.chat_message_length_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max int;
  r public.rooms;
begin
  if new.kind in ('dado', 'sistema', 'combattimento', 'incidente') then return new; end if;
  select max_length into v_max from public.chat_settings limit 1;
  if new.kind = 'azione' then
    select * into r from public.rooms where id = new.room_id;
    if r.master_max is not null then
      if char_length(new.content) > r.master_max then
        raise exception 'Modalità master: l''azione supera il limite di % caratteri.', r.master_max using errcode = 'P0001';
      end if;
      if char_length(new.content) < coalesce(r.master_min, 0) then
        raise exception 'Modalità master: l''azione deve avere almeno % caratteri.', r.master_min using errcode = 'P0001';
      end if;
      return new;
    end if;
  end if;
  if v_max is not null and char_length(new.content) > v_max then
    raise exception 'Il messaggio supera il limite di % caratteri.', v_max using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- malus delle ferite su tutti i tiri fuori dal combattimento
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

  -- ferite aperte (incidenti e combattimento): fuori dal combattimento la penalità della peggiore vale su tutti i tiri
  if v_system <> 'combat' then
    v_val := coalesce((select min(w.penalty) from public.character_wounds w
                       where w.character_id = p_character and w.healed_at is null and (w.heals_at is null or w.heals_at > now())), 0);
    if v_val < 0 then
      v_alt := v_alt + v_val;
      v_items := v_items || jsonb_build_object('name', 'Ferita', 'value', v_val);
    end if;
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

-- d con N facce (i test usano app.dadi_test come gli altri dadi)
create or replace function public.incident_die(p_sides int)
returns int
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_list text := nullif(current_setting('app.dadi_test', true), '');
  v_first text;
begin
  if v_list is not null then
    v_first := split_part(v_list, ',', 1);
    perform set_config('app.dadi_test', substr(v_list, char_length(v_first) + 2), true);
    return v_first::int;
  end if;
  return 1 + (('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 7))::bit(28)::int % greatest(1, p_sides));
end;
$$;
revoke execute on function public.incident_die(int) from public, anon, authenticated;

-- 3. l'incidente
create or replace function public.incident_roll(p_room uuid, p_character uuid, p_type uuid, p_zone text default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.incident_types;
  h public.character_health;
  v_master boolean := public.has_permission('chat.narrazione') or public.has_permission('combattimento.gestire');
  v_name text;
  v_owner uuid;
  v_vig int;
  v_res int;
  v_res_id uuid := (select id from public.skills where lower(name) = 'resistenza fisica' limit 1);
  v_mods int;
  v_d int;
  v_total int;
  v_dice int[] := '{}';
  v_raw int;
  v_dmg int;
  v_outcome text;
  v_sev text;
  v_rank int;
  v_zone text;
  v_z int;
  v_pen int;
  v_heal interval;
  v_games int;
  v_room_name text;
  v_text text;
  v_msg bigint;
  i int;
begin
  -- chi tira: il proprio personaggio in giocata, oppure il Master su un presente
  if not public.can_enter_room(p_room) then
    raise exception 'Non puoi usarlo in questa chat.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.chat_presence where room_id = p_room and character_id = p_character) then
    raise exception 'Il personaggio non è in giocata in questa chat.' using errcode = 'P0001';
  end if;
  if not public.owns_character(p_character) and not v_master then
    raise exception 'Puoi usarlo solo sul tuo personaggio.' using errcode = '42501';
  end if;
  select * into t from public.incident_types where id = p_type and active;
  if t.id is null then raise exception 'Incidente non disponibile.' using errcode = 'P0001'; end if;
  if p_zone is not null and p_zone not in ('testa', 'tronco', 'braccio', 'gamba') then
    raise exception 'Zona non valida.' using errcode = 'P0001';
  end if;
  select public.first_name(name), owner_id into v_name, v_owner from public.characters where id = p_character and status = 'approvata';
  if v_name is null then raise exception 'Serve un personaggio approvato.' using errcode = 'P0001'; end if;

  -- danno: i dadi dell'incidente
  for i in 1 .. t.dice_count loop
    v_dice := v_dice || public.incident_die(t.dice_sides);
  end loop;
  v_raw := (select sum(x) from unnest(v_dice) x) + t.bonus;

  -- resistenza: VIG + Resistenza fisica + d10 (+ voci, ferite, alcol…) contro la CD
  v_vig := greatest(0, public.combat_attr(p_character, 'VIG'));
  v_res := coalesce((select level from public.character_skills where character_id = p_character and skill_id = v_res_id), 0);
  v_mods := coalesce((public.trait_mods(p_character, jsonb_build_object('system', 'general', 'skill_id', v_res_id,
    'attribute_id', (select id from public.attributes where code = 'VIG'))) ->> 'total')::int, 0);
  v_d := public.academic_die();
  v_total := v_vig + v_res + v_d + v_mods;
  if v_d = 10 then
    v_outcome := 'illeso';
    v_dmg := 0;
  elsif v_d = 1 then
    v_outcome := 'critico';
    v_dmg := v_raw;
  elsif v_total >= t.cd then
    v_outcome := 'riesce';
    v_dmg := v_raw / 2;
  else
    v_outcome := 'fallisce';
    v_dmg := v_raw;
  end if;

  -- ferita: dal danno (lieve da 4, moderata da 9, grave da 16); il fallimento critico la peggiora di un grado
  v_rank := case when v_dmg >= 16 then 3 when v_dmg >= 9 then 2 when v_dmg >= 4 then 1 else 0 end;
  if v_outcome = 'critico' then v_rank := v_rank + 1; end if;
  -- gli incidenti lievi non vanno oltre la ferita lieve, la molto grave solo dagli incidenti gravi
  v_rank := least(v_rank, case t.tier when 'lieve' then 1 when 'grave' then 4 else 3 end);
  v_sev := case v_rank when 1 then 'lieve' when 2 then 'moderata' when 3 then 'grave' when 4 then 'molto_grave' end;

  -- salute
  h := public.health_refresh(p_character);
  if v_dmg > 0 then
    update public.character_health
    set hp = greatest(0, h.hp - v_dmg), last_wound_at = now(), recovered_until = null,
        status = case when h.hp - v_dmg <= 0 then 'fuori_combattimento' else status end, updated_at = now()
    where character_id = p_character;
  end if;
  if v_sev is not null then
    v_zone := p_zone;
    if v_zone is null then
      v_z := public.academic_die();
      v_zone := case when v_z <= 2 then 'testa' when v_z <= 5 then 'tronco' when v_z <= 8 then 'braccio' else 'gamba' end;
    end if;
    v_pen := case v_sev when 'moderata' then -1 when 'grave' then -2 when 'molto_grave' then -3 else 0 end;
    v_heal := case v_sev when 'lieve' then interval '2 days' when 'moderata' then interval '5 days' when 'grave' then interval '14 days' else null end;
    insert into public.character_wounds (character_id, zone, severity, penalty, heals_at)
    values (p_character, v_zone, v_sev, v_pen, now() + v_heal);
  end if;
  insert into public.health_log (character_id, actor_id, actor_name, change, reason)
  values (p_character, auth.uid(), coalesce((select username from public.profiles where id = auth.uid()), ''),
    '−' || v_dmg || ' PF' || coalesce(', ferita ' || replace(v_sev, '_', ' ') || ' (' || v_zone || ')', ''),
    'Incidente: ' || t.name);

  -- messaggio in chat
  v_text := '🩹 ' || v_name || ' · ' || t.name || ': danno ' || array_to_string(v_dice, '+') || case when t.bonus > 0 then '+' || t.bonus else '' end
    || ' = ' || v_raw || '. Resistenza VIG ' || v_vig || ' + Resistenza fisica ' || v_res || ' + d10 ' || v_d
    || case when v_mods <> 0 then ' ' || case when v_mods > 0 then '+' else '−' end || ' ' || abs(v_mods) else '' end
    || ' = ' || v_total || ' contro CD ' || t.cd || ' → '
    || case v_outcome when 'illeso' then 'se la cava senza un graffio!'
                      when 'critico' then 'fallimento critico: −' || v_dmg || ' PF'
                      when 'riesce' then 'attutisce il colpo: −' || v_dmg || ' PF'
                      else '−' || v_dmg || ' PF' end
    || case when v_sev is not null then ', ferita ' || replace(v_sev, '_', ' ') || ' '
         || case v_zone when 'testa' then 'alla testa' when 'tronco' then 'al tronco' when 'braccio' then 'a un braccio' else 'a una gamba' end
       else '' end
    || case when v_dmg > 0 and h.hp - v_dmg <= 0 then '. È a terra, non si regge in piedi.' else '.' end;
  insert into public.messages (room_id, character_id, kind, content)
  values (p_room, p_character, 'incidente', left(v_text, 3900))
  returning id into v_msg;

  -- ferita grave: infortunio in squadra e avviso allo staff
  if v_sev in ('grave', 'molto_grave') then
    v_games := coalesce((public.uni_list('incidente_infortunio_gare'))[case when v_sev = 'grave' then 1 else 2 end],
                        case when v_sev = 'grave' then 2 else 4 end)::int;
    if v_games > 0 then
      update public.sport_roster
      set injury_events_left = greatest(injury_events_left, v_games), injury_note = left('Incidente: ' || t.name, 200)
      where character_id = p_character and left_at is null;
      if found and v_owner is not null then
        insert into public.system_messages (user_id, body)
        values (v_owner, '🚑 ' || v_name || ' si è fatto male (' || t.name || ', ferita ' || replace(v_sev, '_', ' ')
          || '): salta le prossime ' || v_games || ' gare della squadra.');
      end if;
    end if;
    select name into v_room_name from public.rooms where id = p_room;
    insert into public.system_messages (user_id, body)
    select p.id, '🚑 Incidente in chat «' || coalesce(v_room_name, '?') || '»: ' || v_name || ' — ' || t.name
      || ', ferita ' || replace(v_sev, '_', ' ') || ' ('
      || case v_zone when 'testa' then 'testa' when 'tronco' then 'tronco' when 'braccio' then 'braccio' else 'gamba' end
      || '), −' || v_dmg || ' PF. Si può giocare il soccorso.'
    from public.profiles p join public.user_levels l on l.id = p.level_id
    where l.is_admin or 'combattimento.gestire' = any (l.permissions);
  end if;
  return v_msg;
end;
$$;
revoke execute on function public.incident_roll(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.incident_roll(uuid, uuid, uuid, text) to authenticated;

-- =====================================================================
-- MERCATO, INVENTARIO E ALTERAZIONI (alcol e droghe)
-- - Utility → Mercato: oggetti da comprare con i soldi della banca
--   (animali, veicoli, gioielli, elettronica, alcolici, sigarette…).
-- - Mercato nero (droghe): lo vede solo chi ha un personaggio in un gruppo
--   con il tag "malavita" (e lo staff del mercato).
-- - Consumabili: hanno cariche; si usano in chat (in giocata).
-- - Alcol e droghe: a ogni uso tiro di resistenza VIG + Resistenza fisica
--   + d10 (10 → +d10, 1 → −d10, una volta) + voci, contro la CD
--   dell'oggetto (+2 per ogni stadio già raggiunto). Se fallisce si sale di
--   uno stadio (massimo 3): ogni stadio ha nome, descrizione, malus alle
--   caratteristiche e durata. Finito lo stadio arrivano i postumi; poi
--   tutto sparisce da solo. Alcol e droghe si contano a parte.
-- - I malus valgono nei tiri della caratteristica colpita (chat, ticket,
--   combattimento, esami), oltre il tetto delle voci.
-- Permesso mercato.gestire (catalogo, oggetti dei PG, togliere alterazioni).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TAG DEI GRUPPI E PERMESSO
-- ---------------------------------------------------------------------
alter table public.game_groups add column if not exists tags text[] not null default '{}';

update public.user_levels
set permissions = array_append(permissions, 'mercato.gestire')
where name = 'Master' and not ('mercato.gestire' = any (permissions));

-- Il giocatore vede il mercato nero? (un suo personaggio in un gruppo "malavita", o lo staff)
create or replace function public.can_black_market()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_permission('mercato.gestire') or exists (
    select 1 from public.characters c
    join public.character_groups cg on cg.character_id = c.id
    join public.game_groups g on g.id = cg.group_id
    where c.owner_id = auth.uid() and c.status = 'approvata' and g.active and 'malavita' = any (g.tags))
$$;
revoke execute on function public.can_black_market() from public, anon;
grant execute on function public.can_black_market() to authenticated;

-- ---------------------------------------------------------------------
-- 2. CATALOGO
-- ---------------------------------------------------------------------
create table public.market_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 60),
  description text not null default '' check (char_length(description) <= 1000),
  category text not null check (category in ('animali', 'veicoli', 'gioielli', 'elettronica', 'abbigliamento', 'casa', 'alcolici', 'sigarette', 'droghe', 'altro')),
  price int not null check (price between 0 and 10000000),
  image_url text check (image_url is null or image_url ~ '^https://'),
  black_market boolean not null default false,
  -- null = oggetto che resta (non si consuma); altrimenti cariche per ogni acquisto
  charges int check (charges is null or charges between 1 and 100),
  -- come si usa in chat: "beve", "fuma", "accende"…
  use_text text not null default 'usa' check (char_length(use_text) between 2 and 40),
  -- alcol e droghe: {type: alcol|droga, cd, stages: [{name, hours, mods: {VIG: -1…}, text} ×3], aftermath: {name, hours, mods, text}}
  effect jsonb check (effect is null or (effect ->> 'type' in ('alcol', 'droga') and jsonb_array_length(effect -> 'stages') = 3)),
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index market_items_category_idx on public.market_items (category, sort_order);
alter table public.market_items enable row level security;
revoke all on public.market_items from anon;
create policy "Mercato: catalogo visibile" on public.market_items for select to authenticated
  using ((active or (select public.has_permission('mercato.gestire'))) and (not black_market or (select public.can_black_market())));
create policy "Mercato: lo staff aggiunge" on public.market_items for insert to authenticated with check ((select public.has_permission('mercato.gestire')));
create policy "Mercato: lo staff modifica" on public.market_items for update to authenticated
  using ((select public.has_permission('mercato.gestire'))) with check ((select public.has_permission('mercato.gestire')));
create policy "Mercato: lo staff toglie" on public.market_items for delete to authenticated using ((select public.has_permission('mercato.gestire')));
create trigger market_items_log after insert or update or delete on public.market_items
  for each row execute function public.log_admin_change();

-- ---------------------------------------------------------------------
-- 3. INVENTARIO DEI PERSONAGGI
-- ---------------------------------------------------------------------
create table public.character_items (
  id bigint generated always as identity primary key,
  character_id uuid not null references public.characters (id) on delete cascade,
  item_id uuid references public.market_items (id) on delete set null,
  -- copia dei dati al momento dell'acquisto (il catalogo può cambiare)
  name text not null,
  category text not null,
  image_url text,
  charges_left int,
  use_text text not null default 'usa',
  effect jsonb,
  black_market boolean not null default false,
  price_paid int not null default 0,
  acquired_at timestamptz not null default now()
);
create index character_items_character_idx on public.character_items (character_id, acquired_at desc);
create index character_items_item_idx on public.character_items (item_id);
alter table public.character_items enable row level security;
revoke all on public.character_items from anon, authenticated;
grant select, delete on public.character_items to authenticated;
create policy "Oggetti: proprietario e staff" on public.character_items for select to authenticated
  using (public.npc_mine(character_id) or (select public.has_permission('mercato.gestire')) or (select public.has_permission('personaggi.vedere_tutti')));
create policy "Oggetti: solo dalle funzioni" on public.character_items for insert to authenticated with check (false);
create policy "Oggetti: modificati dalle funzioni" on public.character_items for update to authenticated using (false);
create policy "Oggetti: il proprietario butta, lo staff toglie" on public.character_items for delete to authenticated
  using (public.npc_mine(character_id) or (select public.has_permission('mercato.gestire')));

-- ---------------------------------------------------------------------
-- 4. ALTERAZIONI (una per tipo: alcol, droga)
-- ---------------------------------------------------------------------
create table public.character_alterations (
  character_id uuid not null references public.characters (id) on delete cascade,
  kind text not null check (kind in ('alcol', 'droga')),
  source_name text not null default '',
  stage int not null check (stage between 1 and 3),
  stages jsonb not null,
  aftermath jsonb,
  stage_started_at timestamptz not null default now(),
  stage_expires_at timestamptz not null,
  aftermath_until timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (character_id, kind)
);
alter table public.character_alterations enable row level security;
revoke all on public.character_alterations from anon, authenticated;
grant select on public.character_alterations to authenticated;
create policy "Alterazioni: proprietario e staff" on public.character_alterations for select to authenticated
  using (public.npc_mine(character_id) or (select public.has_permission('chat.narrazione')) or (select public.has_permission('mercato.gestire'))
         or (select public.has_permission('personaggi.vedere_tutti')));
create policy "Alterazioni: solo dalle funzioni" on public.character_alterations for insert to authenticated with check (false);
create policy "Alterazioni: modificate dalle funzioni" on public.character_alterations for update to authenticated using (false);
create policy "Alterazioni: tolte dalle funzioni" on public.character_alterations for delete to authenticated using (false);

-- Stato attuale: stadio in corso, poi postumi, poi niente (tutto dal tempo, senza lavori notturni)
create or replace function public.alteration_now(a public.character_alterations)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select case
    when now() < a.stage_expires_at then (a.stages -> (a.stage - 1)) || jsonb_build_object('phase', 'stadio', 'stage', a.stage, 'until', a.stage_expires_at)
    when now() < a.aftermath_until and a.aftermath is not null then a.aftermath || jsonb_build_object('phase', 'postumi', 'until', a.aftermath_until)
    else null end
$$;
revoke execute on function public.alteration_now(public.character_alterations) from public, anon, authenticated;

-- Malus attivi del personaggio: [{name, code, value}]
create or replace function public.alteration_mods(p_character uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('name', s ->> 'name', 'code', m.key, 'value', m.value::int)), '[]'::jsonb)
  from public.character_alterations a
  cross join lateral (select public.alteration_now(a) as s) x (s)
  cross join lateral jsonb_each_text(coalesce(x.s -> 'mods', '{}'::jsonb)) m
  where a.character_id = p_character and x.s is not null
$$;
revoke execute on function public.alteration_mods(uuid) from public, anon, authenticated;

-- Per la scheda: alterazioni e postumi in corso (proprietario e staff)
create or replace function public.character_alterations_get(p_character uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('kind', a.kind, 'source', a.source_name) || public.alteration_now(a) order by a.kind), '[]'::jsonb)
  from public.character_alterations a
  where a.character_id = p_character and public.alteration_now(a) is not null
    and (public.npc_mine(p_character) or public.has_permission('chat.narrazione') or public.has_permission('mercato.gestire')
         or public.has_permission('personaggi.vedere_tutti'))
$$;
revoke execute on function public.character_alterations_get(uuid) from public, anon;
grant execute on function public.character_alterations_get(uuid) to authenticated;

-- Lo staff toglie un'alterazione (es. dopo una scena di soccorso)
create or replace function public.alteration_clear(p_character uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (public.has_permission('chat.narrazione') or public.has_permission('mercato.gestire')) then
    raise exception 'Solo il Master o lo staff del mercato tolgono le alterazioni.' using errcode = '42501';
  end if;
  delete from public.character_alterations where character_id = p_character and (p_kind is null or kind = p_kind);
end;
$$;
revoke execute on function public.alteration_clear(uuid, text) from public, anon;
grant execute on function public.alteration_clear(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 5. I MALUS NEI TIRI
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

  return jsonb_build_object('total', greatest(-v_cap, least(v_cap, v_sum)) + v_alt, 'raw', v_sum, 'alterazione', v_alt, 'items', v_items,
    'success_min', v_smin, 'failure_max', v_fmax, 'cd', v_cd);
end;
$$;

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
-- 6. ACQUISTO, USO, BUTTARE
-- ---------------------------------------------------------------------
alter table public.bank_transactions drop constraint if exists bank_transactions_kind_check;
alter table public.bank_transactions add constraint bank_transactions_kind_check
  check (kind in ('stipendio', 'bonifico', 'staff', 'mantenimento', 'iniziale', 'acquisto'));

create or replace function public.market_buy(p_character uuid, p_item uuid, p_qty int default 1)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  it public.market_items;
  v_total int;
  v_balance int;
begin
  if not public.owns_character(p_character) then raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501'; end if;
  select * into it from public.market_items where id = p_item and active;
  if it.id is null or (it.black_market and not public.can_black_market()) then
    raise exception 'Oggetto non disponibile.' using errcode = 'P0001';
  end if;
  if p_qty is null or p_qty < 1 or p_qty > 20 then raise exception 'Puoi comprarne da 1 a 20 per volta.' using errcode = 'P0001'; end if;
  v_total := it.price * p_qty;
  perform public.bank_open_account(p_character);
  update public.bank_accounts set balance = balance - v_total, updated_at = now()
  where character_id = p_character and balance >= v_total
  returning balance into v_balance;
  if not found then raise exception 'Sul conto non ci sono abbastanza dollari (servono % $).', v_total using errcode = 'P0001'; end if;
  if v_total > 0 then
    insert into public.bank_transactions (character_id, amount, kind, description, balance_after, author_id)
    values (p_character, -v_total, 'acquisto',
      case when it.black_market then 'Pagamento in contanti' else 'Mercato: ' || it.name || case when p_qty > 1 then ' ×' || p_qty else '' end end,
      v_balance, auth.uid());
  end if;
  insert into public.character_items (character_id, item_id, name, category, image_url, charges_left, use_text, effect, black_market, price_paid)
  select p_character, it.id, it.name, it.category, it.image_url, it.charges, it.use_text, it.effect, it.black_market, it.price
  from generate_series(1, p_qty);
end;
$$;
revoke execute on function public.market_buy(uuid, uuid, int) from public, anon;
grant execute on function public.market_buy(uuid, uuid, int) to authenticated;

-- Usa una carica in chat: per alcol e droghe tiro di resistenza e, se fallisce, uno stadio in più
create or replace function public.item_use(p_character uuid, p_item bigint, p_room uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  it public.character_items;
  a public.character_alterations;
  e jsonb;
  v_kind text;
  v_stage_now int := 0;
  v_vig int; v_skill int; v_mods int;
  d int; v_extra int := 0; v_total int; v_cd int; v_ok boolean;
  v_new int; st jsonb;
  v_name text;
  v_left int;
  v_text text;
begin
  if not public.owns_character(p_character) then raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501'; end if;
  if not public.can_enter_room(p_room) then raise exception 'Non puoi usarlo in questa chat.' using errcode = '42501'; end if;
  if not public.i_am_invisible()
     and not exists (select 1 from public.chat_presence where room_id = p_room and character_id = p_character) then
    raise exception 'Prima entra in giocata.' using errcode = 'P0001';
  end if;
  select * into it from public.character_items where id = p_item and character_id = p_character for update;
  if it.id is null then raise exception 'Oggetto non trovato.' using errcode = 'P0001'; end if;
  if it.charges_left is null then raise exception '% non si consuma: descrivilo nella tua azione.', it.name using errcode = 'P0001'; end if;
  select public.first_name(name) into v_name from public.characters where id = p_character;

  v_left := it.charges_left - 1;
  if v_left <= 0 then
    delete from public.character_items where id = it.id;
  else
    update public.character_items set charges_left = v_left where id = it.id;
  end if;
  v_text := it.use_text || ' ' || it.name || ' (' || case when v_left <= 0 then 'finito' when v_left = 1 then '1 carica rimasta' else v_left || ' cariche rimaste' end || ')';

  e := it.effect;
  if e is not null then
    v_kind := e ->> 'type';
    select * into a from public.character_alterations where character_id = p_character and kind = v_kind for update;
    if a.character_id is not null and now() < a.stage_expires_at then v_stage_now := a.stage; end if;
    -- resistenza: VIG + Resistenza fisica + d10 + voci di resistenza
    v_vig := public.combat_attr(p_character, 'VIG');
    v_skill := public.combat_skill(p_character, 'Resistenza fisica');
    v_mods := (public.trait_mods(p_character, jsonb_build_object('system', 'general', 'category', 'resistenza')) ->> 'total')::int;
    d := public.combat_die(10);
    if d = 10 then v_extra := public.combat_die(10); elsif d = 1 then v_extra := -public.combat_die(10); end if;
    v_total := v_vig + v_skill + d + v_extra + v_mods;
    v_cd := coalesce((e ->> 'cd')::int, 12) + 2 * v_stage_now;
    v_ok := v_total >= v_cd;
    if v_ok then
      v_text := v_text || '. Resistenza ' || v_total || ' contro ' || v_cd || ': regge.';
    else
      v_new := least(3, v_stage_now + 1);
      st := e -> 'stages' -> (v_new - 1);
      insert into public.character_alterations (character_id, kind, source_name, stage, stages, aftermath, stage_started_at, stage_expires_at, aftermath_until)
      values (p_character, v_kind, it.name, v_new, e -> 'stages', e -> 'aftermath', now(),
        now() + make_interval(mins => round(coalesce((st ->> 'hours')::numeric, 2) * 60)::int),
        now() + make_interval(mins => round((coalesce((st ->> 'hours')::numeric, 2) + coalesce((e #>> '{aftermath,hours}')::numeric, 0)) * 60)::int))
      on conflict (character_id, kind) do update set source_name = excluded.source_name, stage = excluded.stage, stages = excluded.stages,
        aftermath = excluded.aftermath, stage_started_at = excluded.stage_started_at, stage_expires_at = excluded.stage_expires_at,
        aftermath_until = excluded.aftermath_until, updated_at = now();
      v_text := v_text || '. Resistenza ' || v_total || ' contro ' || v_cd || ': non regge'
        || case when v_new = v_stage_now then ', resta ' else ', ora è ' end || lower(coalesce(st ->> 'name', 'alterato')) || '.';
    end if;
  else
    v_text := v_text || '.';
  end if;

  insert into public.messages (room_id, character_id, kind, content)
  values (p_room, p_character, 'sistema', v_text);
  return jsonb_build_object('ok', v_ok, 'total', v_total, 'cd', v_cd, 'left', greatest(v_left, 0));
end;
$$;
revoke execute on function public.item_use(uuid, bigint, uuid) from public, anon;
grant execute on function public.item_use(uuid, bigint, uuid) to authenticated;

-- Lo staff regala un oggetto del catalogo a un personaggio (senza pagare)
create or replace function public.market_give(p_character uuid, p_item uuid, p_qty int default 1)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  it public.market_items;
begin
  if not public.has_permission('mercato.gestire') then raise exception 'Non hai il permesso di gestire il mercato.' using errcode = '42501'; end if;
  select * into it from public.market_items where id = p_item;
  if it.id is null then raise exception 'Oggetto non trovato.' using errcode = 'P0001'; end if;
  insert into public.character_items (character_id, item_id, name, category, image_url, charges_left, use_text, effect, black_market, price_paid)
  select p_character, it.id, it.name, it.category, it.image_url, it.charges, it.use_text, it.effect, it.black_market, 0
  from generate_series(1, greatest(1, least(20, coalesce(p_qty, 1))));
end;
$$;
revoke execute on function public.market_give(uuid, uuid, int) from public, anon;
grant execute on function public.market_give(uuid, uuid, int) to authenticated;

-- Il reset della scheda toglie anche oggetti e alterazioni
create or replace function public.characters_reset_market()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'bozza' and old.status = 'approvata' and new.creation_step = 1 then
    delete from public.character_items where character_id = new.id;
    delete from public.character_alterations where character_id = new.id;
  end if;
  return null;
end;
$$;
revoke execute on function public.characters_reset_market() from public, anon, authenticated;
drop trigger if exists characters_reset_market on public.characters;
create trigger characters_reset_market after update of status on public.characters
  for each row execute function public.characters_reset_market();

-- ---------------------------------------------------------------------
-- 7. CATALOGO INIZIALE (modificabile da Gestione → Mercato)
-- ---------------------------------------------------------------------
insert into public.market_items (name, description, category, price, black_market, charges, use_text, effect, sort_order)
select v.name, v.descr, v.cat, v.price, v.black, v.charges, v.use_text, y.eff::jsonb, row_number() over ()
from (values
  ('Cucciolo di labrador', 'Affettuoso, instancabile, ti segue ovunque.', 'animali', 800, false, null::int, 'usa', null::text),
  ('Gatto', 'Indipendente e un po'' snob, come tutti i gatti di Miami.', 'animali', 300, false, null, 'usa', null),
  ('Pappagallo', 'Colorato e chiacchierone: impara le parolacce in un attimo.', 'animali', 450, false, null, 'usa', null),
  ('Scooter', 'Il modo più veloce per attraversare South Beach nel traffico.', 'veicoli', 2500, false, null, 'usa', null),
  ('Auto usata', 'Ha visto giorni migliori, ma parte (quasi) sempre.', 'veicoli', 9000, false, null, 'usa', null),
  ('Moto', 'Due ruote e il vento dell''oceano.', 'veicoli', 7000, false, null, 'usa', null),
  ('Auto sportiva', 'Decappottabile, color tramonto.', 'veicoli', 55000, false, null, 'usa', null),
  ('Orologio', 'Elegante, con cinturino in pelle.', 'gioielli', 1200, false, null, 'usa', null),
  ('Collana d''oro', 'Una catenina sottile che brilla al sole.', 'gioielli', 900, false, null, 'usa', null),
  ('Anello con diamante', 'Per una proposta o per farsi notare.', 'gioielli', 4000, false, null, 'usa', null),
  ('Smartphone', 'Ultimo modello, fotocamera da influencer.', 'elettronica', 900, false, null, 'usa', null),
  ('Laptop', 'Leggero, per lo studio (e le serie TV).', 'elettronica', 1400, false, null, 'usa', null),
  ('Cuffie wireless', 'Cancellazione del rumore: il mondo può aspettare.', 'elettronica', 250, false, null, 'usa', null),
  ('Birra', 'Una lattina ghiacciata.', 'alcolici', 5, false, 1, 'beve', 'alcol10'),
  ('Cocktail', 'Colorato, con l''ombrellino.', 'alcolici', 15, false, 1, 'beve', 'alcol11'),
  ('Bottiglia di vino', 'Rosso o bianco: quattro bicchieri.', 'alcolici', 25, false, 4, 'beve un bicchiere di', 'alcol11'),
  ('Bottiglia di rum', 'Caraibico, da otto bicchierini.', 'alcolici', 30, false, 8, 'beve un sorso di', 'alcol13'),
  ('Bottiglia di tequila', 'Sale e lime non inclusi.', 'alcolici', 35, false, 8, 'beve uno shot di', 'alcol14'),
  ('Pacchetto di sigarette', 'Venti sigarette.', 'sigarette', 10, false, 20, 'accende una sigaretta dal', null),
  ('Sigaro', 'Cubano, da occasione speciale.', 'sigarette', 20, false, 1, 'accende un', null),
  ('Sigaretta elettronica', 'Gusto mango, trenta tiri.', 'sigarette', 25, false, 30, 'fa un tiro di', null),
  ('Erba', 'Cinque canne già rollate.', 'droghe', 40, true, 5, 'fuma un po'' di', 'erba'),
  ('Pasticca', 'Una sola, colorata. Meglio non chiedere cosa c''è dentro.', 'droghe', 30, true, 1, 'prende una', 'pasticca'),
  ('Polvere bianca', 'Una bustina da tre dosi.', 'droghe', 120, true, 3, 'tira una dose di', 'polvere')
) as v (name, descr, cat, price, black, charges, use_text, eff)
cross join lateral (select case
  when v.eff like 'alcol%' then jsonb_build_object('type', 'alcol', 'cd', substr(v.eff, 6)::int,
    'stages', '[{"name":"Brillo/a","hours":2,"mods":{"RIF":-1},"text":"Allegro/a e chiacchierone/a, i riflessi rallentano."},{"name":"Ubriaco/a","hours":3,"mods":{"RIF":-2,"INT":-1},"text":"Voce alta, passo incerto, giudizio annebbiato."},{"name":"Sbronzo/a","hours":4,"mods":{"RIF":-3,"INT":-2,"PRE":-1},"text":"Fatica a stare in piedi e a mettere insieme le frasi."}]'::jsonb,
    'aftermath', '{"name":"Postumi della sbornia","hours":8,"mods":{"INT":-1,"RIF":-1},"text":"Mal di testa, nausea, la luce dà fastidio."}'::jsonb)::text
  when v.eff = 'erba' then '{"type":"droga","cd":12,"stages":[{"name":"Rilassato/a","hours":2,"mods":{"RIF":-1},"text":"Ride per niente, tutto sembra lento."},{"name":"Fatto/a","hours":3,"mods":{"RIF":-1,"INT":-2},"text":"Pensieri che si perdono a metà frase."},{"name":"Completamente fuori","hours":4,"mods":{"RIF":-2,"INT":-3,"EMP":-1},"text":"Sguardo perso, difficile seguire una conversazione."}],"aftermath":{"name":"Fame chimica e stanchezza","hours":6,"mods":{"INT":-1},"text":"Svuoterebbe il frigo, poi dormirebbe per ore."}}'
  when v.eff = 'pasticca' then '{"type":"droga","cd":14,"stages":[{"name":"Euforico/a","hours":2,"mods":{"INT":-1},"text":"Ama tutti e balla senza fermarsi."},{"name":"Su di giri","hours":3,"mods":{"INT":-2,"RIF":-1},"text":"Mascella serrata, parla a raffica."},{"name":"Fuori controllo","hours":4,"mods":{"INT":-3,"RIF":-2,"EMP":-1},"text":"Suda, ha il cuore a mille, non riconosce le facce."}],"aftermath":{"name":"Down","hours":12,"mods":{"PRE":-1,"EMP":-1},"text":"Tristezza e spossatezza senza motivo."}}'
  when v.eff = 'polvere' then '{"type":"droga","cd":15,"stages":[{"name":"Carico/a","hours":1,"mods":{"EMP":-1},"text":"Sicuro/a di sé, non sta fermo/a un attimo."},{"name":"Iperattivo/a","hours":2,"mods":{"INT":-1,"EMP":-2},"text":"Aggressivo/a, interrompe tutti."},{"name":"Paranoia","hours":3,"mods":{"INT":-2,"EMP":-2,"RIF":-1},"text":"Convinto/a che tutti ce l''abbiano con lui/lei."}],"aftermath":{"name":"Crollo","hours":12,"mods":{"VIG":-1,"PRE":-1},"text":"Svuotato/a, irritabile, non riesce a dormire."}}'
  end as e) x (eff_json)
cross join lateral (select x.eff_json as eff) y
where not exists (select 1 from public.market_items m where m.name = v.name);

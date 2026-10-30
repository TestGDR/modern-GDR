-- =====================================================================
-- VANTAGGI, SVANTAGGI E TRATTI: CATALOGO NUOVO (prima tappa)
-- Dal documento "Vantaggi, Svantaggi e Tratti del Personaggio".
-- Decisioni con l'utente (30/10/2026):
-- - si tiene il sistema vecchio (creation_options, in PX) e si aggiungono
--   le voci nuove nella stessa tabella: 1 punto del documento = 40 PX;
-- - massimi del documento (5 vantaggi di cui 2 accademici e 2 sportivi,
--   5 svantaggi, 3 tratti + 1 provenienza; ambientazione: 4 vantaggi di cui
--   2 interpretativi e 4 svantaggi), tutti in impostazioni;
-- - effetti come dati (jsonb), validati: tipi sconosciuti = errore;
-- - categorie di tiro legate alle abilità (skill_categories, modificabile);
-- - tetto dei modificatori ±4 per tutti i tiri (chat, combattimento, esami);
-- - effetti situazionali: li spunta chi tira, prima del tiro;
-- - "periodo" degli usi limitati = 7 giorni reali;
-- - voci accademiche e sportive nel catalogo ma non ancora selezionabili
--   (available = false) finché non sono collegate ai loro sistemi.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. IMPOSTAZIONI
-- ---------------------------------------------------------------------
update public.game_settings set value = '4' where key = 'tetto_modificatori';

insert into public.game_settings (key, value, kind, label, description, sort_order) values
  ('voci_px_per_punto', '40', 'number', 'Voci · PX per punto', 'Le voci del catalogo nuovo costano (o danno) questi PX per ogni punto.', 120),
  ('voci_max_vantaggi', '5', 'number', 'Voci · Vantaggi massimi', 'Generali, accademici e sportivi insieme (l''ambientazione è a parte).', 121),
  ('voci_max_vantaggi_accademici', '2', 'number', 'Voci · di cui accademici', 'Vantaggi accademici massimi.', 122),
  ('voci_max_vantaggi_sportivi', '2', 'number', 'Voci · di cui sportivi', 'Vantaggi sportivi massimi.', 123),
  ('voci_max_svantaggi', '5', 'number', 'Voci · Svantaggi massimi', 'Generali, accademici e sportivi insieme.', 124),
  ('voci_max_tratti', '3', 'number', 'Voci · Tratti massimi', 'Più una provenienza.', 125),
  ('voci_max_amb_vantaggi', '4', 'number', 'Voci · Vantaggi di ambientazione', 'Massimo, di cui interpretativi: vedi sotto.', 126),
  ('voci_max_amb_interpretativi', '2', 'number', 'Voci · di cui interpretativi', 'Vantaggi interpretativi massimi.', 127),
  ('voci_max_amb_svantaggi', '4', 'number', 'Voci · Svantaggi di ambientazione', 'Massimo.', 128),
  ('voci_periodo_giorni', '7', 'number', 'Voci · Durata del periodo (giorni)', 'Per gli usi limitati (Fortunato, Flashback…). "Una volta per giocata" vale un giorno.', 129)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- 2. CATALOGO: COLONNE NUOVE
-- ---------------------------------------------------------------------
alter table public.creation_options
  add column if not exists scope text not null default 'generale' check (scope in ('generale', 'ambientazione', 'accademica', 'sportiva')),
  add column if not exists subgroup text not null default '' check (char_length(subgroup) <= 30),
  add column if not exists max_level int not null default 1 check (max_level between 1 and 5),
  add column if not exists requires_choice text check (requires_choice in ('testo', 'dipartimento', 'area', 'gruppo', 'master')),
  add column if not exists choice_hint text not null default '' check (char_length(choice_hint) <= 80),
  add column if not exists effects jsonb not null default '[]' check (jsonb_typeof(effects) = 'array'),
  add column if not exists is_origin boolean not null default false,
  add column if not exists secret_default boolean not null default false,
  add column if not exists available boolean not null default true,
  add column if not exists same_choice_incompatible_ids uuid[] not null default '{}';

alter table public.character_options
  add column if not exists level int not null default 1 check (level between 1 and 5),
  add column if not exists choice_value text not null default '' check (char_length(choice_value) <= 80),
  add column if not exists secret boolean not null default false,
  add column if not exists source text not null default 'creazione' check (source in ('creazione', 'master', 'evento')),
  add column if not exists note text not null default '' check (char_length(note) <= 300),
  add column if not exists npc_id uuid references public.npcs (id) on delete set null,
  add column if not exists created_at timestamptz not null default now();
create index if not exists character_options_npc_idx on public.character_options (npc_id);

-- Solo lo staff segna una voce come data dal Master (non costa PX) o collega un PNG
create or replace function public.character_options_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or public.has_permission('personaggi.modificare_tutti') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.source := 'creazione';
    new.npc_id := null;
    new.note := '';
  else
    new.source := old.source;
    new.npc_id := old.npc_id;
    new.note := old.note;
  end if;
  return new;
end;
$$;
revoke execute on function public.character_options_guard() from public, anon, authenticated;
drop trigger if exists character_options_guard on public.character_options;
create trigger character_options_guard before insert or update on public.character_options
  for each row execute function public.character_options_guard();

-- Effetti: solo tipi conosciuti (errore chiaro, mai ignorati in silenzio)
create or replace function public.creation_options_check_effects()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  e jsonb;
  v_types text[] := array['roll_modifier', 'crit_range', 'reroll', 'forced_reroll', 'cd_modifier', 'credit_limit', 'no_heavy_load',
    'start_credits', 'grade_bump', 'rule_flag', 'narrative', 'narrative_privilege', 'access', 'linked_npc',
    'injury_threshold', 'injury_band', 'team_rating_bonus', 'roster', 'extra_sport'];
begin
  for e in select * from jsonb_array_elements(new.effects) loop
    if jsonb_typeof(e) <> 'object' or not ((e ->> 'type') = any (v_types)) then
      raise exception 'Effetto sconosciuto in "%": %', new.name, coalesce(e ->> 'type', e::text) using errcode = 'P0001';
    end if;
  end loop;
  return new;
end;
$$;
drop trigger if exists creation_options_check_effects on public.creation_options;
create trigger creation_options_check_effects before insert or update of effects on public.creation_options
  for each row execute function public.creation_options_check_effects();

-- ---------------------------------------------------------------------
-- 3. CATEGORIE DI TIRO (abilità → categoria, modificabile dallo staff)
-- ---------------------------------------------------------------------
create table public.skill_categories (
  skill_id uuid not null references public.skills (id) on delete cascade,
  category text not null check (category in ('sociale', 'inganno', 'percezione', 'intuizione', 'volonta', 'resistenza',
    'fisico', 'riflessi', 'manualita', 'furtivita', 'conoscenza', 'arte')),
  primary key (skill_id, category)
);
alter table public.skill_categories enable row level security;
revoke all on public.skill_categories from anon, authenticated;
grant select, insert, delete on public.skill_categories to authenticated;
create policy "Categorie: le leggono tutti" on public.skill_categories for select to authenticated using (true);
create policy "Categorie: le aggiunge lo staff" on public.skill_categories for insert to authenticated with check ((select public.has_permission('regole.gestire')));
create policy "Categorie: le toglie lo staff" on public.skill_categories for delete to authenticated using ((select public.has_permission('regole.gestire')));
create trigger skill_categories_log after insert or delete on public.skill_categories
  for each row execute function public.log_admin_change();

insert into public.skill_categories (skill_id, category)
select s.id, v.cat
from (values
  ('Persuasione e dibattito', 'sociale'), ('Oratoria', 'sociale'), ('Leadership', 'sociale'), ('Seduzione e fascino', 'sociale'),
  ('Vita sociale', 'sociale'), ('Stile e immagine', 'sociale'), ('Intrattenere', 'sociale'), ('Intimidazione', 'sociale'),
  ('Inganno e bluff', 'inganno'), ('Recitazione', 'inganno'),
  ('Leggere le persone', 'intuizione'), ('Ascolto e supporto', 'intuizione'),
  ('Osservazione e indagine', 'percezione'),
  ('Autocontrollo', 'volonta'),
  ('Resistenza fisica', 'resistenza'),
  ('Atletica', 'fisico'), ('Forza', 'fisico'), ('Nuoto e sport acquatici', 'fisico'), ('Ginnastica e acrobazie', 'fisico'),
  ('Sport di contatto', 'fisico'), ('Equitazione', 'fisico'), ('Outdoor e sopravvivenza', 'fisico'), ('Sport di squadra', 'fisico'),
  ('Rissa', 'fisico'), ('Autodifesa e arti marziali', 'fisico'),
  ('Schivare', 'riflessi'), ('Parare', 'riflessi'), ('Mira e precisione', 'riflessi'), ('Guida', 'riflessi'),
  ('Videogiochi e e-sport', 'riflessi'), ('Armi da taglio', 'riflessi'), ('Armi da fuoco', 'riflessi'),
  ('Meccanica e fai da te', 'manualita'), ('Informatica e tecnologia', 'manualita'), ('Ingegneria e progettazione', 'manualita'), ('Cucina', 'manualita'),
  ('Furtività', 'furtivita'),
  ('Scienze naturali', 'conoscenza'), ('Matematica e statistica', 'conoscenza'), ('Informatica e tecnologia', 'conoscenza'),
  ('Lettere e filosofia', 'conoscenza'), ('Scienze sociali ed economia', 'conoscenza'), ('Diritto e politica', 'conoscenza'),
  ('Medicina e primo soccorso', 'conoscenza'), ('Lingue straniere', 'conoscenza'), ('Scrittura e giornalismo', 'conoscenza'),
  ('Studio e ricerca', 'conoscenza'), ('Ingegneria e progettazione', 'conoscenza'),
  ('Recitazione', 'arte'), ('Canto', 'arte'), ('Danza', 'arte'), ('Strumenti musicali', 'arte'), ('Arti visive', 'arte'),
  ('Fotografia e video', 'arte'), ('Scrittura e giornalismo', 'arte')
) as v (skill, cat)
join public.skills s on lower(s.name) = lower(v.skill)
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 4. USI LIMITATI (Fortunato, Sfortunato, privilegi narrativi…)
-- ---------------------------------------------------------------------
create table public.trait_uses (
  id bigint generated always as identity primary key,
  character_id uuid not null references public.characters (id) on delete cascade,
  option_id uuid not null references public.creation_options (id) on delete cascade,
  used_by uuid references public.profiles (id) on delete set null default auth.uid(),
  context jsonb not null default '{}',
  used_at timestamptz not null default now()
);
create index trait_uses_character_idx on public.trait_uses (character_id, option_id, used_at desc);
create index trait_uses_option_idx on public.trait_uses (option_id);
create index trait_uses_used_by_idx on public.trait_uses (used_by);
alter table public.trait_uses enable row level security;
revoke all on public.trait_uses from anon, authenticated;
grant select on public.trait_uses to authenticated;
create policy "Usi: proprietario e staff" on public.trait_uses for select to authenticated
  using (public.npc_mine(character_id) or (select public.has_permission('chat.narrazione')) or (select public.has_permission('personaggi.vedere_tutti')));
create policy "Usi: solo dalle funzioni" on public.trait_uses for insert to authenticated with check (false);
create policy "Usi: non si modificano" on public.trait_uses for update to authenticated using (false);
create policy "Usi: non si cancellano" on public.trait_uses for delete to authenticated using (false);

-- Usi rimasti nel periodo: 'period' = giorni in impostazioni, 'session' = 1 giorno, 'semester' = semestre aperto
create or replace function public.trait_uses_left(p_character uuid, p_option uuid, p_per text)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_per = 'always' then 1 else greatest(0, 1 - (
    select count(*)::int from public.trait_uses u
    where u.character_id = p_character and u.option_id = p_option
      and u.used_at > case p_per
        when 'session' then now() - interval '1 day'
        when 'semester' then coalesce((select t.created_at from public.academic_terms t where t.status <> 'published' limit 1), now() - interval '183 days')
        else now() - make_interval(days => coalesce(public.setting_int('voci_periodo_giorni'), 7)) end)) end
$$;
revoke execute on function public.trait_uses_left(uuid, uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. MOTORE DEGLI EFFETTI
-- ---------------------------------------------------------------------
-- p_ctx: { system: general|academic|combat, skill_id, category, exam_type, department, area, retake }
-- p_situational: le voci situazionali confermate da chi tira
-- Restituisce { total, items:[{name,value}], success_min, failure_max }
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
      -- situazionali: solo se confermati
      if v_ok and coalesce((e ->> 'situational')::boolean, false) then
        v_ok := r.id = any (p_situational);
      end if;
      continue when not v_ok;

      if e ->> 'type' = 'roll_modifier' then
        v_val := case e ->> 'value' when '$level' then r.level when '-$level' then -r.level else (e ->> 'value')::int end;
        v_sum := v_sum + v_val;
        v_items := v_items || jsonb_build_object('name', r.name, 'value', v_val);
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

  return jsonb_build_object('total', greatest(-v_cap, least(v_cap, v_sum)), 'raw', v_sum, 'items', v_items,
    'success_min', v_smin, 'failure_max', v_fmax);
end;
$$;
revoke execute on function public.trait_mods(uuid, jsonb, uuid[]) from public, anon, authenticated;

-- Voci situazionali che un personaggio può spuntare in un tiro (per il pannello dei dadi)
create or replace function public.my_situational_traits(p_character uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(distinct jsonb_build_object('id', o.id, 'name', o.name, 'choice', co.choice_value,
    'when', (select string_agg(coalesce(e ->> 'label', ''), ' / ') from jsonb_array_elements(o.effects) e where coalesce((e ->> 'situational')::boolean, false)),
    'value', (select string_agg(case e ->> 'value' when '$level' then '+' || co.level when '-$level' then '−' || co.level
                else case when (e ->> 'value')::int > 0 then '+' else '' end || (e ->> 'value') end, ' / ')
              from jsonb_array_elements(o.effects) e where coalesce((e ->> 'situational')::boolean, false)))), '[]'::jsonb)
  from public.character_options co join public.creation_options o on o.id = co.option_id
  where co.character_id = p_character
    and exists (select 1 from public.characters c where c.id = p_character and c.owner_id = auth.uid())
    and exists (select 1 from jsonb_array_elements(o.effects) e where coalesce((e ->> 'situational')::boolean, false)
                  and coalesce(e #>> '{when,system}', 'general') in ('general', 'any'))
$$;
revoke execute on function public.my_situational_traits(uuid) from public, anon;
grant execute on function public.my_situational_traits(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 6. TIRO IN CHAT CON LE VOCI
-- ---------------------------------------------------------------------
drop function if exists public.interlock_roll(uuid, uuid, uuid);
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
  m := public.trait_mods(p_character, jsonb_build_object('system', 'general', 'skill_id', p_skill), coalesce(p_situational, '{}'));
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
revoke execute on function public.interlock_roll(uuid, uuid, uuid, uuid[]) from public, anon, authenticated;

drop function if exists public.roll_dice(uuid, uuid, uuid, uuid);
create or replace function public.roll_dice(p_room uuid, p_character uuid, p_attribute uuid, p_skill uuid default null, p_situational uuid[] default '{}')
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_roll jsonb;
  v_id bigint;
begin
  if not public.owns_character(p_character) then
    raise exception 'Serve un personaggio approvato per tirare.' using errcode = '42501';
  end if;
  if not public.has_permission('dadi.tirare') then
    raise exception 'Il tuo livello non permette di tirare i dadi.' using errcode = '42501';
  end if;
  if not public.can_enter_room(p_room) then
    raise exception 'Non puoi tirare in questa chat.' using errcode = '42501';
  end if;
  if not public.i_am_invisible()
     and not exists (select 1 from public.chat_presence where room_id = p_room and character_id = p_character) then
    raise exception 'Prima entra in giocata.' using errcode = 'P0001';
  end if;
  if p_attribute is null and p_skill is null then
    raise exception 'Scegli una caratteristica o un''abilità.' using errcode = 'P0001';
  end if;
  v_roll := public.interlock_roll(p_character, p_attribute, p_skill, p_situational);
  insert into public.messages (room_id, character_id, kind, content, roll_data)
  values (p_room, p_character, 'dado', v_roll ->> 'text', v_roll - 'text')
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.roll_dice(uuid, uuid, uuid, uuid, uuid[]) from public, anon;
grant execute on function public.roll_dice(uuid, uuid, uuid, uuid, uuid[]) to authenticated;

-- Ritiro del d10 di un tiro in chat: Fortunato (chi tira, tiene il migliore)
-- o Sfortunato (il Master, tiene il peggiore). Una volta per periodo.
create or replace function public.roll_reroll(p_message bigint, p_kind text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.messages;
  d jsonb;
  v_opt uuid;
  v_name text;
  v_die int := 1 + floor(random() * 10)::int;
  v_extra int := 0;
  v_crit text := 'none';
  v_base int;
  v_new int;
  v_keep int;
  v_text text;
begin
  select * into m from public.messages where id = p_message and kind = 'dado' for update;
  if m.id is null or m.roll_data is null then raise exception 'Tiro non trovato.' using errcode = 'P0001'; end if;
  d := m.roll_data;
  if d ? 'reroll' then raise exception 'Questo tiro è già stato ritirato.' using errcode = 'P0001'; end if;
  if m.created_at < now() - interval '15 minutes' then raise exception 'Si ritira solo un tiro appena fatto.' using errcode = 'P0001'; end if;
  if p_kind = 'fortunato' then
    if not public.owns_character(m.character_id) then raise exception 'Solo chi ha tirato può usare Fortunato.' using errcode = '42501'; end if;
  elsif p_kind = 'sfortunato' then
    if not public.has_permission('chat.narrazione') then raise exception 'Solo il Master usa Sfortunato.' using errcode = '42501'; end if;
  else
    raise exception 'Ritiro non valido.' using errcode = 'P0001';
  end if;
  select o.id, o.name into v_opt, v_name
  from public.character_options co join public.creation_options o on o.id = co.option_id
  where co.character_id = m.character_id
    and exists (select 1 from jsonb_array_elements(o.effects) e
                where e ->> 'type' = case p_kind when 'fortunato' then 'reroll' else 'forced_reroll' end
                  and coalesce(e ->> 'system', 'any') in ('any', 'general'))
  limit 1;
  if v_opt is null then raise exception 'Il personaggio non ha questa voce.' using errcode = 'P0001'; end if;
  if public.trait_uses_left(m.character_id, v_opt, 'period') < 1 then
    raise exception '% è già stato usato in questo periodo.', v_name using errcode = 'P0001';
  end if;

  if v_die >= coalesce((d ->> 'success_min')::int, 10) then
    v_crit := 'success'; v_extra := 1 + floor(random() * 10)::int;
  elsif v_die <= coalesce((d ->> 'failure_max')::int, 1) then
    v_crit := 'failure'; v_extra := -(1 + floor(random() * 10)::int);
  end if;
  v_base := (d ->> 'total')::int - (d ->> 'die')::int - coalesce((d ->> 'extra')::int, 0);
  v_new := v_base + v_die + v_extra;
  -- Fortunato tiene il migliore, Sfortunato il peggiore
  if (p_kind = 'fortunato' and v_new > (d ->> 'total')::int) or (p_kind = 'sfortunato' and v_new < (d ->> 'total')::int) then
    v_keep := v_new;
    d := d || jsonb_build_object('die', v_die, 'extra', v_extra, 'crit', v_crit, 'total', v_new);
  else
    v_keep := (d ->> 'total')::int;
  end if;
  d := d || jsonb_build_object('reroll', jsonb_build_object('kind', p_kind, 'die', v_die, 'extra', v_extra, 'total', v_new, 'kept', v_keep));
  v_text := 'tira ' || coalesce(d ->> 'label', 'd10') || ': '
    || case when v_keep = v_new and v_crit = 'success' then 'SUCCESSO CRITICO'
            when v_keep = v_new and v_crit = 'failure' then 'FALLIMENTO CRITICO'
            else 'risultato ' || v_keep end
    || ' · ' || v_name || ': ritira il d10 e tiene il ' || case p_kind when 'fortunato' then 'migliore' else 'peggiore' end;
  update public.messages set roll_data = d, content = v_text where id = p_message;
  insert into public.trait_uses (character_id, option_id, context) values (m.character_id, v_opt, jsonb_build_object('message', p_message));
end;
$$;
revoke execute on function public.roll_reroll(bigint, text) from public, anon;
grant execute on function public.roll_reroll(bigint, text) to authenticated;

-- Privilegi narrativi ("Usa"): il giocatore (o il Master per quelli del Master)
-- registra l'uso; se indica una chat in cui è in giocata, compare un avviso lì
create or replace function public.trait_use(p_character uuid, p_option uuid, p_room uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.creation_options;
  e jsonb;
  v_holder text;
  v_per text;
  v_name text;
begin
  select o2.* into o from public.creation_options o2 join public.character_options co on co.option_id = o2.id
  where o2.id = p_option and co.character_id = p_character;
  if o.id is null then raise exception 'Il personaggio non ha questa voce.' using errcode = 'P0001'; end if;
  select x into e from jsonb_array_elements(o.effects) x where x ->> 'type' = 'narrative_privilege' limit 1;
  if e is null then raise exception '% non si usa così.', o.name using errcode = 'P0001'; end if;
  v_holder := coalesce(e ->> 'holder', 'player');
  v_per := coalesce(e ->> 'uses_per', 'period');
  if v_holder = 'player' and not public.owns_character(p_character) then
    raise exception 'Solo il giocatore usa %.', o.name using errcode = '42501';
  end if;
  if v_holder = 'master' and not public.has_permission('chat.narrazione') then
    raise exception '% lo attiva il Master.', o.name using errcode = '42501';
  end if;
  if public.trait_uses_left(p_character, p_option, v_per) < 1 then
    raise exception '% è già stato usato: torna disponibile più avanti.', o.name using errcode = 'P0001';
  end if;
  insert into public.trait_uses (character_id, option_id, context) values (p_character, p_option, jsonb_build_object('room', p_room));
  if p_room is not null and public.can_enter_room(p_room) then
    select name into v_name from public.characters where id = p_character;
    insert into public.messages (room_id, character_id, kind, content)
    values (p_room, p_character, 'sistema',
      case v_holder when 'player' then 'usa ' || o.name || '.' else '· il Master attiva ' || o.name || '.' end);
  end if;
end;
$$;
revoke execute on function public.trait_use(uuid, uuid, uuid) from public, anon;
grant execute on function public.trait_use(uuid, uuid, uuid) to authenticated;

-- Usi rimasti delle voci a uso limitato (per scheda e pannello dei dadi)
create or replace function public.my_trait_uses(p_character uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'type', e ->> 'type', 'holder', coalesce(e ->> 'holder', 'player'),
    'per', coalesce(e ->> 'uses_per', 'period'), 'left', public.trait_uses_left(p_character, o.id, coalesce(e ->> 'uses_per', 'period'))) order by o.name), '[]'::jsonb)
  from public.character_options co join public.creation_options o on o.id = co.option_id
  cross join lateral jsonb_array_elements(o.effects) e
  where co.character_id = p_character
    and e ->> 'type' in ('narrative_privilege', 'reroll', 'forced_reroll')
    and coalesce(e ->> 'system', 'any') in ('any', 'general')
    and (public.npc_mine(p_character) or public.has_permission('chat.narrazione'))
$$;
revoke execute on function public.my_trait_uses(uuid) from public, anon;
grant execute on function public.my_trait_uses(uuid) to authenticated;

-- In combattimento valgono solo i modificatori (stesso tetto)
create or replace function public.combat_traits(p_character uuid, p_skill_name text)
returns int
language sql
stable
set search_path = ''
as $$
  select (public.trait_mods(p_character,
    jsonb_build_object('system', 'combat', 'skill_id', (select s.id from public.skills s where lower(s.name) = lower(p_skill_name) limit 1))) ->> 'total')::int
$$;
revoke execute on function public.combat_traits(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 7. INVIO DELLA SCHEDA: PX CON I LIVELLI, MASSIMI, SCELTE, INCOMPATIBILITÀ
-- ---------------------------------------------------------------------
create or replace function public.check_character_options(p_character uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v record;
begin
  -- voci non selezionabili, livelli, scelte richieste
  select o.name into v from public.character_options co join public.creation_options o on o.id = co.option_id
  where co.character_id = p_character and co.source = 'creazione' and (not o.available or not o.active) limit 1;
  if found then raise exception '"%" non si può scegliere.', v.name using errcode = 'P0001'; end if;
  select o.name into v from public.character_options co join public.creation_options o on o.id = co.option_id
  where co.character_id = p_character and co.level > o.max_level limit 1;
  if found then raise exception '"%": livello non valido.', v.name using errcode = 'P0001'; end if;
  select o.name, o.choice_hint into v from public.character_options co join public.creation_options o on o.id = co.option_id
  where co.character_id = p_character and o.requires_choice in ('testo', 'dipartimento', 'area', 'gruppo') and btrim(co.choice_value) = '' limit 1;
  if found then raise exception '"%": indica %.', v.name, coalesce(nullif(v.choice_hint, ''), 'la scelta richiesta') using errcode = 'P0001'; end if;

  -- incompatibilità sulla stessa scelta (Talento naturale / Lacune di base nello stesso dipartimento…)
  if exists (
    select 1 from public.character_options co1 join public.creation_options o1 on o1.id = co1.option_id
    join public.character_options co2 on co2.character_id = co1.character_id and co2.option_id = any (o1.same_choice_incompatible_ids)
    where co1.character_id = p_character and lower(btrim(co1.choice_value)) = lower(btrim(co2.choice_value))
  ) then
    raise exception 'Hai scelto voci incompatibili sulla stessa scelta.' using errcode = 'P0001';
  end if;

  -- massimi (le voci date dal Master non contano)
  select
    count(*) filter (where o.kind = 'vantaggio' and o.scope <> 'ambientazione') as vant,
    count(*) filter (where o.kind = 'vantaggio' and o.scope = 'accademica') as vant_acc,
    count(*) filter (where o.kind = 'vantaggio' and o.scope = 'sportiva') as vant_sport,
    count(*) filter (where o.kind = 'svantaggio' and o.scope <> 'ambientazione') as svant,
    count(*) filter (where o.kind = 'tratto' and not o.is_origin) as tratti,
    count(*) filter (where o.is_origin) as origini,
    count(*) filter (where o.kind = 'vantaggio' and o.scope = 'ambientazione') as amb_vant,
    count(*) filter (where o.kind = 'vantaggio' and o.scope = 'ambientazione' and o.subgroup = 'interpretativo') as amb_int,
    count(*) filter (where o.kind = 'svantaggio' and o.scope = 'ambientazione') as amb_svant
    into v
  from public.character_options co join public.creation_options o on o.id = co.option_id
  where co.character_id = p_character and co.source = 'creazione';
  if v.vant > public.setting_int('voci_max_vantaggi') then raise exception 'Massimo % vantaggi.', public.setting_int('voci_max_vantaggi') using errcode = 'P0001'; end if;
  if v.vant_acc > public.setting_int('voci_max_vantaggi_accademici') then raise exception 'Massimo % vantaggi accademici.', public.setting_int('voci_max_vantaggi_accademici') using errcode = 'P0001'; end if;
  if v.vant_sport > public.setting_int('voci_max_vantaggi_sportivi') then raise exception 'Massimo % vantaggi sportivi.', public.setting_int('voci_max_vantaggi_sportivi') using errcode = 'P0001'; end if;
  if v.svant > public.setting_int('voci_max_svantaggi') then raise exception 'Massimo % svantaggi.', public.setting_int('voci_max_svantaggi') using errcode = 'P0001'; end if;
  if v.tratti > public.setting_int('voci_max_tratti') then raise exception 'Massimo % tratti.', public.setting_int('voci_max_tratti') using errcode = 'P0001'; end if;
  if v.origini > 1 then raise exception 'Una sola provenienza.' using errcode = 'P0001'; end if;
  if v.amb_vant > public.setting_int('voci_max_amb_vantaggi') then raise exception 'Massimo % vantaggi di ambientazione.', public.setting_int('voci_max_amb_vantaggi') using errcode = 'P0001'; end if;
  if v.amb_int > public.setting_int('voci_max_amb_interpretativi') then raise exception 'Massimo % vantaggi interpretativi.', public.setting_int('voci_max_amb_interpretativi') using errcode = 'P0001'; end if;
  if v.amb_svant > public.setting_int('voci_max_amb_svantaggi') then raise exception 'Massimo % svantaggi di ambientazione.', public.setting_int('voci_max_amb_svantaggi') using errcode = 'P0001'; end if;
end;
$$;
revoke execute on function public.check_character_options(uuid) from public, anon, authenticated;

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
  select coalesce(sum(o.cost_px * co.level), 0) into v_options
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

-- Modifica completa dell'Amministratore: le voci già presenti restano con
-- livello, scelta, segreto e PNG collegato; si tolgono solo quelle deselezionate
create or replace function public.admin_set_build(p_character uuid, p_attributes jsonb, p_skills jsonb, p_options uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin_user() then
    raise exception 'Solo l''Amministratore può modificare così una scheda.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.characters where id = p_character) then
    raise exception 'Scheda non trovata.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.creation_options where id = any (coalesce(p_options, '{}')) and kind = 'tenore') > 1 then
    raise exception 'Si sceglie un solo patrimonio.' using errcode = 'P0001';
  end if;

  delete from public.character_skills where character_id = p_character;
  delete from public.character_attributes where character_id = p_character;
  insert into public.character_attributes (character_id, attribute_id, value)
  select p_character, a.id, (p_attributes ->> a.id::text)::int
  from public.attributes a
  where p_attributes ? a.id::text and (p_attributes ->> a.id::text)::int between 1 and 10;
  insert into public.character_skills (character_id, skill_id, level)
  select p_character, s.id, (p_skills ->> s.id::text)::int
  from public.skills s
  where p_skills ? s.id::text and (p_skills ->> s.id::text)::int > 0;

  delete from public.character_options where character_id = p_character and not (option_id = any (coalesce(p_options, '{}')));
  insert into public.character_options (character_id, option_id)
  select p_character, o.id from public.creation_options o where o.id = any (coalesce(p_options, '{}'))
  on conflict do nothing;
end;
$$;

-- ---------------------------------------------------------------------
-- 8. IL CATALOGO NUOVO
-- ---------------------------------------------------------------------
-- (kind, scope, subgroup, name, punti, max_level, scelta, suggerimento, segreto, provenienza, disponibile, descrizione, effetti)
insert into public.creation_options (kind, scope, subgroup, name, cost_px, max_level, requires_choice, choice_hint, secret_default, is_origin, available, description, effects, sort_order)
select v.kind, v.scope, v.sub, v.name,
       case v.kind when 'vantaggio' then v.pts when 'svantaggio' then -v.pts else 0 end * coalesce(public.setting_int('voci_px_per_punto'), 40),
       v.maxl, nullif(v.choice, ''), v.hint, v.secret, v.origin, v.avail, v.descr, v.eff::jsonb, 100 + row_number() over ()
from (values
  -- ===== Vantaggi generali =====
  ('vantaggio', 'generale', '', 'Carisma magnetico', 2, 1, '', '', false, false, true, '+2 ai tiri sociali.', '[{"type":"roll_modifier","value":2,"when":{"category":["sociale"]}}]'),
  ('vantaggio', 'generale', '', 'Empatia', 2, 1, '', '', false, false, true, '+2 ai tiri di intuizione.', '[{"type":"roll_modifier","value":2,"when":{"category":["intuizione"]}}]'),
  ('vantaggio', 'generale', '', 'Sensi acuti', 2, 1, '', '', false, false, true, '+2 ai tiri di percezione.', '[{"type":"roll_modifier","value":2,"when":{"category":["percezione"]}}]'),
  ('vantaggio', 'generale', '', 'Riflessi pronti', 2, 1, '', '', false, false, true, '+2 ai tiri di riflessi.', '[{"type":"roll_modifier","value":2,"when":{"category":["riflessi"]}}]'),
  ('vantaggio', 'generale', '', 'Volontà di ferro', 2, 1, '', '', false, false, true, '+2 ai tiri di volontà.', '[{"type":"roll_modifier","value":2,"when":{"category":["volonta"]}}]'),
  ('vantaggio', 'generale', '', 'Tempra robusta', 2, 1, '', '', false, false, true, '+2 ai tiri di resistenza.', '[{"type":"roll_modifier","value":2,"when":{"category":["resistenza"]}}]'),
  ('vantaggio', 'generale', '', 'Mani d''oro', 2, 1, '', '', false, false, true, '+2 ai tiri di manualità.', '[{"type":"roll_modifier","value":2,"when":{"category":["manualita"]}}]'),
  ('vantaggio', 'generale', '', 'Ombra', 2, 1, '', '', false, false, true, '+2 ai tiri di furtività.', '[{"type":"roll_modifier","value":2,"when":{"category":["furtivita"]}}]'),
  ('vantaggio', 'generale', '', 'Talento artistico', 2, 1, 'testo', 'la disciplina artistica', false, false, true, '+2 ai tiri artistici in quella disciplina.', '[{"type":"roll_modifier","value":2,"situational":true,"label":"nella tua disciplina artistica","when":{"category":["arte"]}}]'),
  ('vantaggio', 'generale', '', 'Cultura enciclopedica', 2, 1, '', '', false, false, true, '+2 ai tiri di conoscenza.', '[{"type":"roll_modifier","value":2,"when":{"category":["conoscenza"]}}]'),
  ('vantaggio', 'generale', '', 'Fortunato', 3, 1, '', '', false, false, true, 'Una volta per periodo puoi ritirare un d10 e tenere il risultato migliore.', '[{"type":"reroll","keep":"best","uses_per":"period","system":"any"}]'),
  ('vantaggio', 'generale', '', 'Contatti', 1, 3, 'testo', 'l''ambiente (es. confraternite, polizia, mondo della notte)', false, false, true, 'Conosci persone utili in un ambiente: +1/+2/+3 ai tiri per ottenere informazioni o favori lì.', '[{"type":"roll_modifier","value":"$level","situational":true,"label":"per informazioni o favori nel tuo ambiente"}]'),
  ('vantaggio', 'generale', '', 'Famiglia benestante', 2, 1, '', '', false, false, true, 'Risorse economiche oltre la media: il master ne tiene conto in gioco.', '[{"type":"narrative","text":"Il master tiene conto delle risorse economiche in gioco."}]'),
  ('vantaggio', 'generale', '', 'Poliglotta', 1, 1, 'testo', 'le due lingue', false, false, true, 'Parli due lingue in più a tua scelta.', '[{"type":"narrative"}]'),
  ('vantaggio', 'generale', '', 'Senso dell''orientamento', 1, 1, '', '', false, false, true, 'Non ti perdi mai; +2 ai tiri per orientarti.', '[{"type":"roll_modifier","value":2,"situational":true,"label":"per orientarti"}]'),
  ('vantaggio', 'generale', '', 'Sonno leggero', 1, 1, '', '', false, false, true, 'Non puoi essere colto di sorpresa mentre dormi.', '[{"type":"narrative"}]'),
  ('vantaggio', 'generale', '', 'Bell''aspetto', 1, 1, '', '', false, false, true, '+1 ai tiri sociali quando l''aspetto conta.', '[{"type":"roll_modifier","value":1,"situational":true,"label":"quando l''aspetto conta","when":{"category":["sociale"]}}]'),
  -- ===== Svantaggi generali =====
  ('svantaggio', 'generale', '', 'Fobia', 1, 2, 'testo', 'l''oggetto della fobia', false, false, true, 'In presenza dell''oggetto: −1 (lieve) o −2 (grave) a tutti i tiri.', '[{"type":"roll_modifier","value":"-$level","situational":true,"label":"in presenza della fobia","system":"any"}]'),
  ('svantaggio', 'generale', '', 'Sfortunato', 2, 1, '', '', false, false, true, 'Una volta per periodo il master può farti ritirare un d10 e tenere il risultato peggiore.', '[{"type":"forced_reroll","keep":"worst","uses_per":"period","triggered_by":"master"}]'),
  ('svantaggio', 'generale', '', 'Timido', 1, 1, '', '', false, false, true, '−2 ai tiri sociali con sconosciuti o davanti a un pubblico.', '[{"type":"roll_modifier","value":-2,"situational":true,"label":"con sconosciuti o davanti a un pubblico","when":{"category":["sociale"]}}]'),
  ('svantaggio', 'generale', '', 'Pessimo bugiardo', 1, 1, '', '', false, false, true, '−2 ai tiri di inganno.', '[{"type":"roll_modifier","value":-2,"when":{"category":["inganno"]}}]'),
  ('svantaggio', 'generale', '', 'Impulsivo', 1, 1, '', '', false, false, true, '−2 ai tiri di volontà per trattenerti.', '[{"type":"roll_modifier","value":-2,"situational":true,"label":"per trattenerti","when":{"category":["volonta"]}}]'),
  ('svantaggio', 'generale', '', 'Goffo', 1, 1, '', '', false, false, true, 'Nei tiri di manualità e riflessi il fallimento critico scatta anche con un 2.', '[{"type":"crit_range","failure_max":2,"when":{"category":["manualita","riflessi"]}}]'),
  ('svantaggio', 'generale', '', 'Miope', 1, 1, '', '', false, false, true, '−2 ai tiri di percezione visiva senza occhiali o lenti.', '[{"type":"roll_modifier","value":-2,"situational":true,"label":"senza occhiali o lenti","when":{"category":["percezione"]}}]'),
  ('svantaggio', 'generale', '', 'Pessimo senso dell''orientamento', 1, 1, '', '', false, false, true, '−2 ai tiri per orientarti; ti perdi facilmente.', '[{"type":"roll_modifier","value":-2,"situational":true,"label":"per orientarti"}]'),
  ('svantaggio', 'generale', '', 'Senza un soldo', 1, 1, '', '', false, false, true, 'Hai meno risorse della media: il master ne tiene conto in gioco.', '[{"type":"narrative"}]'),
  ('svantaggio', 'generale', '', 'Vizio', 1, 1, 'testo', 'il vizio (caffè, fumo, gioco, social…)', false, false, true, 'Se passi un periodo senza soddisfarlo, −1 a tutti i tiri finché non lo fai (gestito dal master).', '[{"type":"roll_modifier","value":-1,"situational":true,"label":"astinenza dal vizio","system":"any"}]'),
  ('svantaggio', 'generale', '', 'Codice d''onore', 1, 1, 'testo', 'la regola', false, false, true, 'Una regola che non infrangi mai. Se la violi, −1 a tutti i tiri fino alla fine della giocata.', '[{"type":"roll_modifier","value":-1,"situational":true,"label":"hai violato il codice","system":"any"}]'),
  ('svantaggio', 'generale', '', 'Cattiva reputazione', 1, 2, '', '', false, false, true, 'Una voce gira su di te: −1 o −2 ai tiri sociali con chi la conosce.', '[{"type":"roll_modifier","value":"-$level","situational":true,"label":"con chi conosce la voce","when":{"category":["sociale"]}}]'),
  ('svantaggio', 'generale', '', 'Nemico', 1, 2, 'master', 'lo decide il master', true, false, true, 'Un PNG ostile: un rivale (1) o qualcuno di potente o pericoloso (2).', '[{"type":"linked_npc","role":"Nemico"}]'),
  ('svantaggio', 'generale', '', 'Segreto', 1, 2, 'testo', 'il segreto (lo vedete solo tu e lo staff)', true, false, true, 'Un segreto con conseguenze serie (1) o devastanti (2) se scoperto.', '[{"type":"narrative"}]'),
  ('svantaggio', 'generale', '', 'Sonno pesante', 1, 1, '', '', false, false, true, 'Quasi impossibile svegliarti; −2 ai tiri di percezione mentre dormi.', '[{"type":"roll_modifier","value":-2,"situational":true,"label":"mentre dormi","when":{"category":["percezione"]}}]'),
  -- ===== Tratti generali =====
  ('tratto', 'generale', '', 'Coraggioso', 0, 1, '', '', false, false, true, '+1 alla volontà contro la paura; −1 alla percezione per notare pericoli.', '[{"type":"roll_modifier","value":1,"situational":true,"label":"contro la paura","when":{"category":["volonta"]}},{"type":"roll_modifier","value":-1,"situational":true,"label":"per notare pericoli","when":{"category":["percezione"]}}]'),
  ('tratto', 'generale', '', 'Prudente', 0, 1, '', '', false, false, true, '+1 alla percezione per notare pericoli; −1 alla volontà contro la paura.', '[{"type":"roll_modifier","value":1,"situational":true,"label":"per notare pericoli","when":{"category":["percezione"]}},{"type":"roll_modifier","value":-1,"situational":true,"label":"contro la paura","when":{"category":["volonta"]}}]'),
  ('tratto', 'generale', '', 'Estroverso', 0, 1, '', '', false, false, true, '+1 ai tiri sociali in gruppo; −1 alla concentrazione quando sei solo.', '[{"type":"roll_modifier","value":1,"situational":true,"label":"in gruppo","when":{"category":["sociale"]}},{"type":"roll_modifier","value":-1,"situational":true,"label":"concentrazione da solo","when":{"category":["conoscenza"]}}]'),
  ('tratto', 'generale', '', 'Introverso', 0, 1, '', '', false, false, true, '+1 a concentrazione e conoscenza; −1 ai tiri sociali in gruppo.', '[{"type":"roll_modifier","value":1,"when":{"category":["conoscenza"]}},{"type":"roll_modifier","value":-1,"situational":true,"label":"in gruppo","when":{"category":["sociale"]}}]'),
  ('tratto', 'generale', '', 'Ottimista', 0, 1, '', '', false, false, true, '+1 alla volontà per non abbatterti; −1 all''intuizione per scoprire inganni.', '[{"type":"roll_modifier","value":1,"situational":true,"label":"per non abbatterti","when":{"category":["volonta"]}},{"type":"roll_modifier","value":-1,"situational":true,"label":"per scoprire inganni","when":{"category":["intuizione"]}}]'),
  ('tratto', 'generale', '', 'Cinico', 0, 1, '', '', false, false, true, '+1 all''intuizione per scoprire inganni; −1 ai tiri sociali per ispirare o rassicurare.', '[{"type":"roll_modifier","value":1,"situational":true,"label":"per scoprire inganni","when":{"category":["intuizione"]}},{"type":"roll_modifier","value":-1,"situational":true,"label":"per ispirare o rassicurare","when":{"category":["sociale"]}}]'),
  ('tratto', 'generale', '', 'Testardo', 0, 1, '', '', false, false, true, '+1 alla volontà contro la persuasione; −1 ai tiri sociali per far cambiare idea.', '[{"type":"roll_modifier","value":1,"situational":true,"label":"contro la persuasione","when":{"category":["volonta"]}},{"type":"roll_modifier","value":-1,"situational":true,"label":"per far cambiare idea","when":{"category":["sociale"]}}]'),
  ('tratto', 'generale', '', 'Curioso', 0, 1, '', '', false, false, true, '+1 a percezione e conoscenza quando indaghi; il master può chiederti un tiro di volontà per non ficcanasare.', '[{"type":"roll_modifier","value":1,"situational":true,"label":"quando indaghi","when":{"category":["percezione","conoscenza"]}}]'),
  ('tratto', 'generale', '', 'Sarcastico', 0, 1, '', '', false, false, true, '+1 ai tiri sociali per provocare; −1 per fare buona impressione.', '[{"type":"roll_modifier","value":1,"situational":true,"label":"per provocare","when":{"category":["sociale"]}},{"type":"roll_modifier","value":-1,"situational":true,"label":"per fare buona impressione","when":{"category":["sociale"]}}]'),
  ('tratto', 'generale', '', 'Leale', 0, 1, '', '', false, false, true, '+1 quando agisci per proteggere o aiutare un amico; −1 ai tiri contro un amico.', '[{"type":"roll_modifier","value":1,"situational":true,"label":"per aiutare un amico"},{"type":"roll_modifier","value":-1,"situational":true,"label":"contro un amico"}]'),
  ('tratto', 'generale', '', 'Animale notturno', 0, 1, '', '', false, false, true, '+1 a tutti i tiri di notte; −1 al mattino presto.', '[{"type":"roll_modifier","value":1,"situational":true,"label":"di notte","system":"any"},{"type":"roll_modifier","value":-1,"situational":true,"label":"al mattino presto","system":"any"}]'),
  ('tratto', 'generale', '', 'Metodico', 0, 1, '', '', false, false, true, 'In tutti i tiri l''1 non è un fallimento critico e il 10 non è un successo critico.', '[{"type":"crit_range","override":true,"success_min":11,"failure_max":0,"system":"any"}]'),
  ('tratto', 'generale', '', 'Imprevedibile', 0, 1, '', '', false, false, true, 'In tutti i tiri successo critico con 9 o 10, fallimento critico con 1 o 2.', '[{"type":"crit_range","success_min":9,"failure_max":2,"system":"any"}]'),
  -- ===== Ambientazione: legami =====
  ('vantaggio', 'ambientazione', 'legami', 'Mentore', 2, 1, 'testo', 'il professore o il dipartimento', false, false, true, 'Un docente ti segue: consigli, lettere di raccomandazione, accesso alle sue ricerche.', '[{"type":"linked_npc","role":"Mentore"}]'),
  ('vantaggio', 'ambientazione', 'legami', 'Coinquilino fidato', 1, 1, '', '', false, false, true, 'Il tuo coinquilino (PNG) ti copre, ti presta cose e mantiene i tuoi segreti.', '[{"type":"linked_npc","role":"Coinquilino"}]'),
  ('vantaggio', 'ambientazione', 'legami', 'Amico in alto', 2, 1, 'testo', 'dove (rettorato, polizia del campus, ospedale…)', false, false, true, 'Qualcuno in una posizione utile ti deve un favore e ti risponde al telefono.', '[{"type":"linked_npc","role":"Amico in alto"}]'),
  ('vantaggio', 'ambientazione', 'legami', 'Amico d''infanzia', 1, 1, '', '', false, false, true, 'Il tuo migliore amico di sempre (PNG) studia qui: ti difende e ti dice la verità.', '[{"type":"linked_npc","role":"Amico d''infanzia"}]'),
  ('vantaggio', 'ambientazione', 'legami', 'Fratello maggiore laureato', 1, 1, '', '', false, false, true, 'Un fratello o una sorella laureati qui: sanno quali professori evitare e quali feste contano.', '[{"type":"linked_npc","role":"Fratello o sorella"}]'),
  ('vantaggio', 'ambientazione', 'legami', 'Il custode', 1, 1, '', '', false, false, true, 'Sei in confidenza con un custode, un barista o un addetto che vede tutto e con te parla.', '[{"type":"linked_npc","role":"Custode"}]'),
  ('vantaggio', 'ambientazione', 'legami', 'Ex rimasto amico', 1, 1, '', '', false, false, true, 'Una tua ex fiamma (PNG) è ancora dalla tua parte.', '[{"type":"linked_npc","role":"Ex"}]'),
  ('vantaggio', 'ambientazione', 'legami', 'Rete degli appunti', 1, 1, '', '', false, false, true, 'Un giro di studenti che si scambia appunti e dritte: per te c''è sempre una copia di tutto.', '[{"type":"narrative"}]'),
  ('vantaggio', 'ambientazione', 'legami', 'Compagno a quattro zampe', 1, 1, '', '', false, false, true, 'Un animale con permesso speciale: rompe il ghiaccio con chiunque.', '[{"type":"narrative"}]'),
  ('vantaggio', 'ambientazione', 'legami', 'Padrino', 2, 1, 'testo', 'il ruolo (avvocato, imprenditore, giudice, medico…)', false, false, true, 'Un adulto influente in città ti considera di famiglia e interviene quando sei nei guai.', '[{"type":"linked_npc","role":"Padrino"}]'),
  -- ===== Ambientazione: risorse e luoghi =====
  ('vantaggio', 'ambientazione', 'risorse', 'Lavoro nel campus', 1, 1, 'testo', 'il luogo (biblioteca, bar, palestra, segreteria…)', false, false, true, 'Hai le chiavi di un luogo fuori orario e senti tutte le voci che girano lì.', '[{"type":"access","access":"$choice"}]'),
  ('vantaggio', 'ambientazione', 'risorse', 'Alloggio privilegiato', 1, 1, '', '', false, false, true, 'Stanza singola nel dormitorio migliore o appartamento fuori campus.', '[{"type":"narrative"}]'),
  ('vantaggio', 'ambientazione', 'risorse', 'Auto propria', 1, 1, '', '', false, false, true, 'Ti muovi quando vuoi, fuori città compresa.', '[{"type":"narrative"}]'),
  ('vantaggio', 'ambientazione', 'risorse', 'Gente del posto', 1, 1, '', '', false, false, true, 'Sei cresciuto in questa città: locali, scorciatoie e chi lavora alla stazione di polizia.', '[{"type":"narrative"}]'),
  ('vantaggio', 'ambientazione', 'risorse', 'Rifugio segreto', 1, 1, '', '', false, false, true, 'Un posto nel campus che nessuno frequenta: è tuo, finché non lo racconti.', '[{"type":"narrative"}]'),
  ('vantaggio', 'ambientazione', 'risorse', 'Casa al lago', 2, 1, '', '', false, false, true, 'La tua famiglia ha una casa fuori città per i weekend.', '[{"type":"narrative"}]'),
  ('vantaggio', 'ambientazione', 'risorse', 'Atelier o laboratorio', 1, 1, 'testo', 'il tipo (musica, arte, garage, laboratorio)', false, false, true, 'Uno spazio tutto tuo per creare o aggiustare cose.', '[{"type":"narrative"}]'),
  ('vantaggio', 'ambientazione', 'risorse', 'Ingresso VIP', 1, 1, 'testo', 'il locale', false, false, true, 'Al locale più frequentato entri sempre, anche con la fila.', '[{"type":"access","access":"$choice"}]'),
  ('vantaggio', 'ambientazione', 'risorse', 'Chiave che non dovresti avere', 1, 1, '', '', true, false, true, 'La copia di una chiave che apre più porte del dovuto. Se ti scoprono, è un problema serio.', '[{"type":"narrative"}]'),
  ('vantaggio', 'ambientazione', 'risorse', 'Gruzzolo nascosto', 1, 1, '', '', true, false, true, 'Una piccola somma da parte che nessuno conosce.', '[{"type":"narrative"}]'),
  ('vantaggio', 'ambientazione', 'risorse', 'Tessera stampa', 1, 1, '', '', false, false, true, 'Un accredito: entri a conferenze, partite ed eventi pubblici.', '[{"type":"narrative"}]'),
  -- ===== Ambientazione: ruoli e reputazione =====
  ('vantaggio', 'ambientazione', 'ruoli', 'Legacy', 2, 1, '', '', false, false, true, 'La tua famiglia ha studiato qui da generazioni: occhio di riguardo dall''amministrazione.', '[{"type":"narrative"}]'),
  ('vantaggio', 'ambientazione', 'ruoli', 'Greek life', 1, 1, 'testo', 'la confraternita o sorority', false, false, true, 'Membro a pieno titolo: stanza nella casa, fratelli o sorelle, feste e rete degli ex.', '[{"type":"narrative"}]'),
  ('vantaggio', 'ambientazione', 'ruoli', 'Student government', 2, 1, '', '', false, false, true, 'Eletto nel governo studentesco: riunioni con l''amministrazione e fondi per i club.', '[{"type":"narrative"}]'),
  ('vantaggio', 'ambientazione', 'ruoli', 'Giornale o radio del campus', 1, 1, '', '', false, false, true, 'In redazione: puoi pubblicare, intervistare, accedere agli archivi.', '[{"type":"narrative"}]'),
  ('vantaggio', 'ambientazione', 'ruoli', 'Celebrità del campus', 1, 1, '', '', false, false, true, 'Tutti sanno chi sei: le porte si aprono, ma è difficile passare inosservati.', '[{"type":"narrative"}]'),
  ('vantaggio', 'ambientazione', 'ruoli', 'Resident Assistant', 2, 1, '', '', false, false, true, 'Responsabile di un piano del dormitorio: passe-partout e autorità, ma quando succede qualcosa tocca a te.', '[{"type":"access","access":"dormitorio"}]'),
  ('vantaggio', 'ambientazione', 'ruoli', 'Teaching Assistant', 1, 1, 'testo', 'il corso', false, false, true, 'Assisti un professore: correggi esercitazioni e conosci gli studenti meglio di chiunque.', '[{"type":"narrative"}]'),
  ('vantaggio', 'ambientazione', 'ruoli', 'Capo di un club', 1, 1, 'testo', 'il club', false, false, true, 'Guidi un club studentesco: sede, piccolo budget e un gruppo che ti segue.', '[{"type":"narrative"}]'),
  ('vantaggio', 'ambientazione', 'ruoli', 'Marching band o cheerleading', 1, 1, '', '', false, false, true, 'In prima fila a ogni partita ed evento: tutti ti vedono, e tu vedi tutto.', '[{"type":"narrative"}]'),
  ('vantaggio', 'ambientazione', 'ruoli', 'Re o regina delle feste', 1, 1, '', '', false, false, true, 'Le feste migliori le organizzi tu.', '[{"type":"narrative"}]'),
  ('vantaggio', 'ambientazione', 'ruoli', 'Soccorritore volontario', 1, 1, '', '', false, false, true, 'Nel primo soccorso studentesco: radio, kit, e la sicurezza del campus ti conosce.', '[{"type":"narrative"}]'),
  ('vantaggio', 'ambientazione', 'ruoli', 'Reputazione impeccabile', 2, 1, '', '', false, false, true, 'Fama di persona onesta: professori e autorità tendono a crederti sulla parola.', '[{"type":"narrative"}]'),
  -- ===== Vantaggi interpretativi =====
  ('vantaggio', 'ambientazione', 'interpretativo', 'Al posto giusto', 2, 1, '', '', false, false, true, 'Una volta per periodo dichiari che il tuo PG è già presente in una scena in corso.', '[{"type":"narrative_privilege","holder":"player","uses_per":"period"}]'),
  ('vantaggio', 'ambientazione', 'interpretativo', 'Conosco un tipo', 2, 1, '', '', false, false, true, 'Una volta per periodo dichiari di conoscere qualcuno utile alla situazione.', '[{"type":"narrative_privilege","holder":"player","uses_per":"period"}]'),
  ('vantaggio', 'ambientazione', 'interpretativo', 'Flashback', 2, 1, '', '', false, false, true, 'Una volta per periodo giochi un flashback per aver già preparato qualcosa.', '[{"type":"narrative_privilege","holder":"player","uses_per":"period"}]'),
  ('vantaggio', 'ambientazione', 'interpretativo', 'Orecchie dappertutto', 1, 1, '', '', false, false, true, 'Una volta per periodo chiedi al master un pettegolezzo vero.', '[{"type":"narrative_privilege","holder":"player","uses_per":"period"}]'),
  ('vantaggio', 'ambientazione', 'interpretativo', 'Fiuto per i guai', 1, 1, '', '', false, false, true, 'Il master ti avverte quando una situazione sta per mettersi male, una volta per giocata.', '[{"type":"narrative_privilege","holder":"master","uses_per":"session"}]'),
  ('vantaggio', 'ambientazione', 'interpretativo', 'Confidente naturale', 1, 1, '', '', false, false, true, 'Le persone ti raccontano cose che non dovrebbero.', '[{"type":"narrative"}]'),
  ('vantaggio', 'ambientazione', 'interpretativo', 'Faccia d''angelo', 1, 1, '', '', false, false, true, 'La prima volta per periodo che vieni sorpreso dove non dovresti, te la cavi con un avvertimento.', '[{"type":"narrative_privilege","holder":"player","uses_per":"period"}]'),
  ('vantaggio', 'ambientazione', 'interpretativo', 'Memoria per i volti', 1, 1, '', '', false, false, true, 'Non dimentichi mai un nome o una faccia.', '[{"type":"narrative"}]'),
  ('vantaggio', 'ambientazione', 'interpretativo', 'Rompighiaccio', 1, 1, '', '', false, false, true, 'Una volta per giocata stemperi una scena tesa con una battuta.', '[{"type":"narrative_privilege","holder":"player","uses_per":"session"}]'),
  ('vantaggio', 'ambientazione', 'interpretativo', 'Sempre preparato', 1, 1, '', '', false, false, true, 'Una volta per giocata tiri fuori dalla borsa un oggetto piccolo che ti serve.', '[{"type":"narrative_privilege","holder":"player","uses_per":"session"}]'),
  ('vantaggio', 'ambientazione', 'interpretativo', 'Custode delle leggende', 1, 1, '', '', false, false, true, 'Una volta per periodo chiedi al master una leggenda del luogo in cui ti trovi.', '[{"type":"narrative_privilege","holder":"player","uses_per":"period"}]'),
  ('vantaggio', 'ambientazione', 'interpretativo', 'Impressione indelebile', 1, 1, '', '', false, false, true, 'Una volta per periodo un PNG appena conosciuto si ricorderà di te: tornerà nella storia.', '[{"type":"narrative_privilege","holder":"player","uses_per":"period"}]'),
  ('vantaggio', 'ambientazione', 'interpretativo', 'Occhio per i dettagli fuori posto', 1, 1, '', '', false, false, true, 'Una volta per giocata il master ti indica un dettaglio che non torna.', '[{"type":"narrative_privilege","holder":"player","uses_per":"session"}]'),
  ('vantaggio', 'ambientazione', 'interpretativo', 'Il cuore della compagnia', 2, 1, '', '', false, false, true, 'Una volta per periodo convochi una scena di gruppo e arriva almeno un PNG utile.', '[{"type":"narrative_privilege","holder":"player","uses_per":"period"}]'),
  -- ===== Svantaggi di ambientazione =====
  ('svantaggio', 'ambientazione', '', 'Pledge', 1, 1, 'testo', 'la confraternita o sorority', false, false, true, 'Sei in prova: devi obbedire ai membri anziani ed essere sempre disponibile.', '[{"type":"narrative"}]'),
  ('svantaggio', 'ambientazione', '', 'Debiti studenteschi', 1, 1, '', '', false, false, true, 'Un prestito enorme da ripagare: ogni scelta costosa pesa.', '[{"type":"narrative"}]'),
  ('svantaggio', 'ambientazione', '', 'Debito con le persone sbagliate', 2, 1, '', '', false, false, true, 'Devi soldi o un favore a qualcuno di pericoloso.', '[{"type":"linked_npc","role":"Creditore"}]'),
  ('svantaggio', 'ambientazione', '', 'Famiglia esigente', 1, 1, '', '', false, false, true, 'I tuoi genitori controllano voti, frequentazioni e spese.', '[{"type":"narrative"}]'),
  ('svantaggio', 'ambientazione', '', 'All''ombra di un fratello', 1, 1, '', '', false, false, true, 'Un fratello o una sorella è stato una stella di questo college: ti paragonano di continuo.', '[{"type":"narrative"}]'),
  ('svantaggio', 'ambientazione', '', 'Precedente disciplinare', 2, 1, '', '', false, false, true, 'Disciplinary probation: un altro richiamo e rischi l''espulsione.', '[{"type":"narrative"}]'),
  ('svantaggio', 'ambientazione', '', 'Coinquilino infernale', 1, 1, '', '', false, false, true, 'Il tuo coinquilino (PNG) è rumoroso, ficcanaso o peggio.', '[{"type":"linked_npc","role":"Coinquilino"}]'),
  ('svantaggio', 'ambientazione', '', 'Ospite indesiderato', 1, 1, '', '', false, false, true, 'Un parente o vecchio amico (PNG) dorme sul tuo divano da settimane.', '[{"type":"linked_npc","role":"Ospite"}]'),
  ('svantaggio', 'ambientazione', '', 'Ex nel campus', 1, 1, '', '', false, false, true, 'Una tua ex fiamma (PNG) frequenta la tua cerchia e non ti rende le cose facili.', '[{"type":"linked_npc","role":"Ex"}]'),
  ('svantaggio', 'ambientazione', '', 'Ammiratore insistente', 1, 1, '', '', false, false, true, 'Qualcuno (PNG) è fin troppo interessato a te.', '[{"type":"linked_npc","role":"Ammiratore"}]'),
  ('svantaggio', 'ambientazione', '', 'Pendolare', 1, 1, '', '', false, false, true, 'Vivi lontano dal campus e perdi molto di quello che succede la sera.', '[{"type":"narrative"}]'),
  ('svantaggio', 'ambientazione', '', 'Senza patente', 1, 1, '', '', false, false, true, 'Non puoi guidare: dipendi dagli altri e dai mezzi.', '[{"type":"narrative"}]'),
  ('svantaggio', 'ambientazione', '', 'Visto studentesco', 1, 1, '', '', false, false, true, 'Studente internazionale: devi restare full-time e in regola.', '[{"type":"rule_flag","flag":"must_stay_full_time"}]'),
  ('svantaggio', 'ambientazione', '', 'Lavoro notturno', 1, 1, '', '', false, false, true, 'Turni serali o notturni fuori campus: sei spesso stanco e irraggiungibile.', '[{"type":"narrative"}]'),
  ('svantaggio', 'ambientazione', '', 'Doppia vita', 2, 1, '', '', true, false, true, 'Fai qualcosa che nessuno al campus deve sapere.', '[{"type":"narrative"}]'),
  ('svantaggio', 'ambientazione', '', 'Ricattato', 2, 1, '', '', true, false, true, 'Qualcuno ha in mano qualcosa su di te e ogni tanto ti chiede di fare cose.', '[{"type":"linked_npc","role":"Ricattatore"}]'),
  ('svantaggio', 'ambientazione', '', 'Ammesso con l''inganno', 2, 1, '', '', true, false, true, 'Sei entrato con un documento, una lettera o un voto falsi.', '[{"type":"narrative"}]'),
  ('svantaggio', 'ambientazione', '', 'Fratello o sorella da tenere d''occhio', 1, 1, '', '', false, false, true, 'Un familiare più giovane (PNG) studia qui e i genitori contano su di te.', '[{"type":"linked_npc","role":"Fratello o sorella"}]'),
  ('svantaggio', 'ambientazione', '', 'Scandalo', 2, 1, '', '', false, false, true, 'Una storia imbarazzante su di te è diventata pubblica.', '[{"type":"narrative"}]'),
  ('svantaggio', 'ambientazione', '', 'Cognome ingombrante', 1, 1, '', '', false, false, true, 'Il tuo cognome è legato a qualcosa di famoso o famigerato in città.', '[{"type":"narrative"}]'),
  ('svantaggio', 'ambientazione', '', 'Rivalità di gruppo', 1, 1, 'testo', 'il gruppo rivale', false, false, true, 'Il tuo gruppo è in guerra aperta con un altro.', '[{"type":"narrative"}]'),
  ('svantaggio', 'ambientazione', '', 'Sotto osservazione', 1, 1, '', '', false, false, true, 'Un tuo genitore è una figura nota in città: quello che fai si viene a sapere.', '[{"type":"narrative"}]'),
  ('svantaggio', 'ambientazione', '', 'Promessa', 1, 1, 'testo', 'a chi', false, false, true, 'Hai fatto una promessa importante a qualcuno e intendi mantenerla.', '[{"type":"narrative"}]'),
  -- ===== Svantaggi interpretativi =====
  ('svantaggio', 'ambientazione', 'interpretativo', 'Calamita per i guai', 2, 1, '', '', false, false, true, 'Una volta per periodo il master coinvolge il tuo PG in una situazione problematica.', '[{"type":"narrative_privilege","holder":"master","uses_per":"period"}]'),
  ('svantaggio', 'ambientazione', 'interpretativo', 'Non sa dire di no', 1, 1, '', '', false, false, true, 'Il master può usare i PNG per chiederti un favore a periodo.', '[{"type":"narrative_privilege","holder":"master","uses_per":"period"}]'),
  ('svantaggio', 'ambientazione', 'interpretativo', 'Lingua lunga', 1, 1, '', '', false, false, true, 'Sotto pressione il master può chiederti di lasciarti sfuggire un dettaglio.', '[{"type":"narrative_privilege","holder":"master","uses_per":"always"}]'),
  ('svantaggio', 'ambientazione', 'interpretativo', 'Nel posto sbagliato', 1, 1, '', '', false, false, true, 'Una volta per periodo il master dichiara che eri presente quando è successo qualcosa.', '[{"type":"narrative_privilege","holder":"master","uses_per":"period"}]'),
  ('svantaggio', 'ambientazione', 'interpretativo', 'Volto dimenticabile', 1, 1, '', '', false, false, true, 'La gente non si ricorda di te.', '[{"type":"narrative"}]'),
  ('svantaggio', 'ambientazione', 'interpretativo', 'Passato che ritorna', 2, 1, '', '', false, false, true, 'Qualcuno del tuo passato (PNG) ricompare nel campus con vecchie questioni.', '[{"type":"linked_npc","role":"Passato"}]'),
  -- ===== Provenienze (tratti di ambientazione) =====
  ('tratto', 'ambientazione', 'provenienza', 'Prima generazione al college', 0, 1, '', '', false, true, true, 'Pro: determinazione. Contro: regole e codici del college vanno imparati da zero.', '[{"type":"narrative"}]'),
  ('tratto', 'ambientazione', 'provenienza', 'Figlio di papà', 0, 1, '', '', false, true, true, 'Pro: a tuo agio con chi conta. Contro: gli altri ti giudicano prima di conoscerti.', '[{"type":"narrative"}]'),
  ('tratto', 'ambientazione', 'provenienza', 'Ragazzo di provincia', 0, 1, '', '', false, true, true, 'Pro: vita all''aperto e gente semplice. Contro: la grande città ti spiazza.', '[{"type":"narrative"}]'),
  ('tratto', 'ambientazione', 'provenienza', 'Cresciuto in una metropoli', 0, 1, '', '', false, true, true, 'Pro: sai muoverti tra mezzi e quartieri. Contro: i ritmi lenti ti stanno stretti.', '[{"type":"narrative"}]'),
  ('tratto', 'ambientazione', 'provenienza', 'Figlio di militari', 0, 1, '', '', false, true, true, 'Pro: ti adatti in fretta. Contro: mai avuto amicizie lunghe né una casa.', '[{"type":"narrative"}]'),
  ('tratto', 'ambientazione', 'provenienza', 'Ex scuola privata', 0, 1, '', '', false, true, true, 'Pro: preparazione solida. Contro: etichettato come privilegiato.', '[{"type":"narrative"}]'),
  ('tratto', 'ambientazione', 'provenienza', 'Istruito a casa', 0, 1, '', '', false, true, true, 'Pro: grande autonomia nello studio. Contro: la vita di gruppo è territorio sconosciuto.', '[{"type":"narrative"}]'),
  ('tratto', 'ambientazione', 'provenienza', 'Studente internazionale', 0, 1, 'testo', 'il paese', false, true, true, 'Pro: lingua, cultura e contatti nel tuo paese. Contro: differenze culturali e famiglia lontana.', '[{"type":"narrative"}]'),
  ('tratto', 'ambientazione', 'provenienza', 'Studente adulto', 0, 1, '', '', false, true, true, 'Pro: esperienza di vita e lavoro. Contro: non sempre ti senti parte del gruppo.', '[{"type":"narrative"}]'),
  ('tratto', 'ambientazione', 'provenienza', 'Transfer student', 0, 1, '', '', false, true, true, 'Pro: hai visto un altro college. Contro: arrivi quando i gruppi sono già formati.', '[{"type":"narrative"}]'),
  ('tratto', 'ambientazione', 'provenienza', 'Veterano', 0, 1, '', '', false, true, true, 'Pro: disciplina e sangue freddo. Contro: i drammi del campus ti sembrano piccoli; il passato ritorna.', '[{"type":"narrative"}]'),
  ('tratto', 'ambientazione', 'provenienza', 'Cresciuto in affido', 0, 1, '', '', false, true, true, 'Pro: sai leggere le persone. Contro: fai fatica a fidarti.', '[{"type":"narrative"}]'),
  ('tratto', 'ambientazione', 'provenienza', 'Figlio di immigrati', 0, 1, 'testo', 'l''origine', false, true, true, 'Pro: due lingue e due culture. Contro: il peso delle aspettative familiari.', '[{"type":"narrative"}]'),
  ('tratto', 'ambientazione', 'provenienza', 'Cresciuto in una comunità religiosa', 0, 1, '', '', false, true, true, 'Pro: valori saldi. Contro: la libertà del campus ti mette alla prova.', '[{"type":"narrative"}]'),
  ('tratto', 'ambientazione', 'provenienza', 'Famiglia di artisti girovaghi', 0, 1, '', '', false, true, true, 'Pro: talento per lo spettacolo. Contro: senza regole fisse né scuola tradizionale.', '[{"type":"narrative"}]'),
  ('tratto', 'ambientazione', 'provenienza', 'Ex bambino prodigio', 0, 1, 'testo', 'il campo', false, true, true, 'Pro: un talento riconosciuto da piccolo. Contro: tutti si aspettano grandi cose.', '[{"type":"narrative"}]'),
  -- ===== Accademiche (collegate al sistema accademico nella prossima tappa) =====
  ('vantaggio', 'accademica', '', 'Mente brillante', 3, 1, '', '', false, false, false, '+1 a tutti i tiri d''esame.', '[{"type":"roll_modifier","value":1,"when":{"system":"academic"}}]'),
  ('vantaggio', 'accademica', '', 'Talento naturale', 2, 1, 'dipartimento', 'il dipartimento', false, false, false, '+2 ai tiri nei corsi di quel dipartimento.', '[{"type":"roll_modifier","value":2,"when":{"system":"academic","department":"$choice"}}]'),
  ('vantaggio', 'accademica', '', 'Memoria fotografica', 2, 1, '', '', false, false, false, '+2 ai Final exam.', '[{"type":"roll_modifier","value":2,"when":{"system":"academic","exam_type":["final"]}}]'),
  ('vantaggio', 'accademica', '', 'Studente modello', 1, 1, '', '', false, false, false, '+2 al Coursework.', '[{"type":"roll_modifier","value":2,"when":{"system":"academic","exam_type":["coursework"]}}]'),
  ('vantaggio', 'accademica', '', 'Sangue freddo', 2, 1, '', '', false, false, false, 'Una volta per semestre ritiri il d10 di una prova d''esame e tieni il secondo risultato.', '[{"type":"reroll","keep":"second","uses_per":"semester","system":"academic"}]'),
  ('vantaggio', 'accademica', '', 'Instancabile', 2, 1, '', '', false, false, false, 'Nessun malus per carico pesante; fino a 21 crediti.', '[{"type":"no_heavy_load"},{"type":"credit_limit","max":21}]'),
  ('vantaggio', 'accademica', '', 'Advanced Placement', 2, 1, '', '', false, false, false, 'Entri con 15 crediti già riconosciuti.', '[{"type":"start_credits","value":15}]'),
  ('vantaggio', 'accademica', '', 'Pupillo dei professori', 1, 1, '', '', false, false, false, 'Una volta per semestre, a 1 punto dalla soglia del voto superiore, sali a quel voto.', '[{"type":"grade_bump","max_gap":1,"uses_per":"semester"}]'),
  ('vantaggio', 'accademica', '', 'Tutor privato', 1, 1, '', '', false, false, false, '+1 ai tiri nei corsi che stai ripetendo.', '[{"type":"roll_modifier","value":1,"when":{"system":"academic","retake":true}}]'),
  ('svantaggio', 'accademica', '', 'Ansia da esame', 2, 1, '', '', false, false, false, '−2 a Midterm e Final.', '[{"type":"roll_modifier","value":-2,"when":{"system":"academic","exam_type":["midterm","final"]}}]'),
  ('svantaggio', 'accademica', '', 'Procrastinatore', 1, 1, '', '', false, false, false, '−2 al Coursework.', '[{"type":"roll_modifier","value":-2,"when":{"system":"academic","exam_type":["coursework"]}}]'),
  ('svantaggio', 'accademica', '', 'Lacune di base', 2, 1, 'dipartimento', 'il dipartimento', false, false, false, '−2 ai tiri nei corsi di quel dipartimento.', '[{"type":"roll_modifier","value":-2,"when":{"system":"academic","department":"$choice"}}]'),
  ('svantaggio', 'accademica', '', 'Distratto', 1, 1, '', '', false, false, false, 'Negli esami il fallimento critico scatta anche con un 2.', '[{"type":"crit_range","failure_max":2,"when":{"system":"academic"}}]'),
  ('svantaggio', 'accademica', '', 'Studente lavoratore', 2, 1, '', '', false, false, false, 'Massimo 15 crediti; −1 a tutti gli esami se sei iscritto a più di 12 crediti.', '[{"type":"credit_limit","max":15},{"type":"roll_modifier","value":-1,"when":{"system":"academic","min_credits":12}}]'),
  ('svantaggio', 'accademica', '', 'Vita sociale intensa', 1, 1, '', '', false, false, false, 'Non puoi scegliere l''impegno Intenso.', '[{"type":"rule_flag","flag":"no_intense_effort"}]'),
  ('svantaggio', 'accademica', '', 'Nella lista nera', 1, 1, 'master', 'il dipartimento (lo decide il master)', false, false, false, 'CD +2 nei corsi di quel dipartimento.', '[{"type":"cd_modifier","value":2,"when":{"system":"academic","department":"$choice"}}]'),
  ('svantaggio', 'accademica', '', 'Borsa a rischio', 1, 1, '', '', false, false, false, 'Sotto 2.5 di GPA semestrale perdi la borsa di merito.', '[{"type":"rule_flag","flag":"merit_scholarship"}]'),
  ('tratto', 'accademica', '', 'Secchione', 0, 1, '', '', false, false, false, '+1 a tutti i tiri d''esame; −1 a tutti i tiri sportivi.', '[{"type":"roll_modifier","value":1,"when":{"system":"academic"}},{"type":"roll_modifier","value":-1,"when":{"system":"athletics"}}]'),
  ('tratto', 'accademica', '', 'Perfezionista', 0, 1, '', '', false, false, false, '+1 al Coursework; −1 al Final.', '[{"type":"roll_modifier","value":1,"when":{"system":"academic","exam_type":["coursework"]}},{"type":"roll_modifier","value":-1,"when":{"system":"academic","exam_type":["final"]}}]'),
  ('tratto', 'accademica', '', 'Studente dell''ultimo minuto', 0, 1, '', '', false, false, false, '+1 al Final; −1 al Coursework.', '[{"type":"roll_modifier","value":1,"when":{"system":"academic","exam_type":["final"]}},{"type":"roll_modifier","value":-1,"when":{"system":"academic","exam_type":["coursework"]}}]'),
  ('tratto', 'accademica', '', 'Mente scientifica', 0, 1, '', '', false, false, false, '+1 nei corsi STEM; −1 in quelli umanistici.', '[{"type":"roll_modifier","value":1,"when":{"system":"academic","area":"stem"}},{"type":"roll_modifier","value":-1,"when":{"system":"academic","area":"umanistica"}}]'),
  ('tratto', 'accademica', '', 'Mente umanistica', 0, 1, '', '', false, false, false, '+1 nei corsi umanistici; −1 in quelli STEM.', '[{"type":"roll_modifier","value":1,"when":{"system":"academic","area":"umanistica"}},{"type":"roll_modifier","value":-1,"when":{"system":"academic","area":"stem"}}]'),
  -- ===== Sportive (collegate al sistema sportivo quando esisterà) =====
  ('vantaggio', 'sportiva', '', 'Atleta nato', 3, 1, '', '', false, false, false, '+1 a tutti i tiri sportivi.', '[{"type":"roll_modifier","value":1,"when":{"system":"athletics"}}]'),
  ('vantaggio', 'sportiva', '', 'Recruited', 2, 1, '', '', false, false, false, 'Entri in squadra con la borsa di studio atletica e come titolare.', '[{"type":"roster","status":"starter","scholarship":true}]'),
  ('vantaggio', 'sportiva', '', 'Fisico d''acciaio', 2, 1, '', '', false, false, false, 'Ti infortuni solo se il d10 sottratto è 10; infortuni più brevi.', '[{"type":"injury_threshold","value":10},{"type":"injury_band","shift":-1}]'),
  ('vantaggio', 'sportiva', '', 'Clutch', 2, 1, '', '', false, false, false, '+2 nelle partite di playoff e nei supplementari.', '[{"type":"roll_modifier","value":2,"when":{"system":"athletics","phase":["playoff"]}}]'),
  ('vantaggio', 'sportiva', '', 'Leader dello spogliatoio', 2, 1, '', '', false, false, false, 'Se sei titolare o capitano, la squadra ha +1 al rating in ogni evento.', '[{"type":"team_rating_bonus","value":1}]'),
  ('vantaggio', 'sportiva', '', 'Doppio sport', 1, 1, '', '', false, false, false, 'Puoi far parte di due sport di stagioni diverse.', '[{"type":"extra_sport"}]'),
  ('vantaggio', 'sportiva', '', 'Beniamino del pubblico', 1, 1, '', '', false, false, false, '+1 ai tuoi tiri nelle partite in casa.', '[{"type":"roll_modifier","value":1,"when":{"system":"athletics","venue":"home"}}]'),
  ('svantaggio', 'sportiva', '', 'Fragile', 2, 1, '', '', false, false, false, 'Ti infortuni se il d10 sottratto è almeno 6; infortuni più lunghi.', '[{"type":"injury_threshold","value":6},{"type":"injury_band","shift":1}]'),
  ('svantaggio', 'sportiva', '', 'Testa calda', 1, 1, '', '', false, false, false, 'Con un fallimento critico in gara vieni espulso e salti l''evento successivo.', '[{"type":"rule_flag","flag":"ejection_on_fumble"}]'),
  ('svantaggio', 'sportiva', '', 'Soffre la pressione', 2, 1, '', '', false, false, false, '−2 nelle partite di playoff e nei supplementari.', '[{"type":"roll_modifier","value":-2,"when":{"system":"athletics","phase":["playoff"]}}]'),
  ('svantaggio', 'sportiva', '', 'Vecchio infortunio', 1, 1, '', '', false, false, false, '−1 nel primo evento di ogni stagione; rientro da infortunio −2.', '[{"type":"rule_flag","flag":"old_injury"}]'),
  ('svantaggio', 'sportiva', '', 'Walk-on', 1, 1, '', '', false, false, false, 'Parti come riserva e niente borsa atletica al primo anno.', '[{"type":"roster","status":"reserve","scholarship":false}]'),
  ('tratto', 'sportiva', '', 'Sportivo prima di tutto', 0, 1, '', '', false, false, false, '+1 a tutti i tiri sportivi; −1 a tutti i tiri d''esame.', '[{"type":"roll_modifier","value":1,"when":{"system":"athletics"}},{"type":"roll_modifier","value":-1,"when":{"system":"academic"}}]'),
  ('tratto', 'sportiva', '', 'Lupo solitario', 0, 1, '', '', false, false, false, '+1 negli sport individuali; −1 in quelli di squadra.', '[{"type":"rule_flag","flag":"lone_wolf"}]'),
  ('tratto', 'sportiva', '', 'Uomo squadra', 0, 1, '', '', false, false, false, '+1 negli sport di squadra; −1 in quelli individuali.', '[{"type":"rule_flag","flag":"team_player"}]'),
  ('tratto', 'sportiva', '', 'Competitivo', 0, 1, '', '', false, false, false, '+1 nei playoff; −1 al Coursework.', '[{"type":"roll_modifier","value":1,"when":{"system":"athletics","phase":["playoff"]}},{"type":"roll_modifier","value":-1,"when":{"system":"academic","exam_type":["coursework"]}}]')
) as v (kind, scope, sub, name, pts, maxl, choice, hint, secret, origin, avail, descr, eff)
on conflict (kind, name) do update
  set scope = excluded.scope, subgroup = excluded.subgroup, max_level = excluded.max_level,
      requires_choice = excluded.requires_choice, choice_hint = excluded.choice_hint,
      secret_default = excluded.secret_default, is_origin = excluded.is_origin,
      available = excluded.available, effects = excluded.effects;
-- (per le voci vecchie con lo stesso nome restano costo e descrizione)

-- Incompatibilità (in tutte e due le direzioni)
create or replace function public.set_option_incompatible(p_a text, p_b text, p_same_choice boolean default false)
returns void
language plpgsql
set search_path = ''
as $$
declare
  a uuid := (select id from public.creation_options where name = p_a and kind <> 'tenore' limit 1);
  b uuid := (select id from public.creation_options where name = p_b and kind <> 'tenore' limit 1);
begin
  if a is null or b is null then return; end if;
  if p_same_choice then
    update public.creation_options set same_choice_incompatible_ids = array(select distinct unnest(same_choice_incompatible_ids || b)) where id = a;
    update public.creation_options set same_choice_incompatible_ids = array(select distinct unnest(same_choice_incompatible_ids || a)) where id = b;
  else
    update public.creation_options set incompatible_ids = array(select distinct unnest(incompatible_ids || b)) where id = a;
    update public.creation_options set incompatible_ids = array(select distinct unnest(incompatible_ids || a)) where id = b;
  end if;
end;
$$;
revoke execute on function public.set_option_incompatible(text, text, boolean) from public, anon, authenticated;

select public.set_option_incompatible(a, b, s) from (values
  ('Fortunato', 'Sfortunato', false), ('Famiglia benestante', 'Senza un soldo', false),
  ('Senso dell''orientamento', 'Pessimo senso dell''orientamento', false), ('Sonno leggero', 'Sonno pesante', false),
  ('Coraggioso', 'Prudente', false), ('Estroverso', 'Introverso', false), ('Ottimista', 'Cinico', false), ('Metodico', 'Imprevedibile', false),
  ('Reputazione impeccabile', 'Scandalo', false), ('Reputazione impeccabile', 'Cattiva reputazione', false),
  ('Pendolare', 'Alloggio privilegiato', false), ('Senza patente', 'Auto propria', false),
  ('Volto dimenticabile', 'Celebrità del campus', false), ('Volto dimenticabile', 'Impressione indelebile', false),
  ('Instancabile', 'Studente lavoratore', false), ('Secchione', 'Sportivo prima di tutto', false),
  ('Perfezionista', 'Studente dell''ultimo minuto', false), ('Mente scientifica', 'Mente umanistica', false),
  ('Recruited', 'Walk-on', false), ('Fisico d''acciaio', 'Fragile', false), ('Clutch', 'Soffre la pressione', false),
  ('Lupo solitario', 'Uomo squadra', false),
  ('Talento naturale', 'Lacune di base', true), ('Greek life', 'Pledge', true)
) as v (a, b, s);

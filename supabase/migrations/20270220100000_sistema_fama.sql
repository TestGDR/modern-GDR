-- =====================================================================
-- SISTEMA DI FAMA (documento «Sistema di Fama del Personaggio»)
-- Tutto configurabile da Gestione → Fama (permesso fama.gestire):
-- impostazioni fama_* in game_settings, cataloghi, rarità, livelli.
--
-- Fama di Background: in creazione il giocatore spende i Punti Fama
-- (fama_pf_iniziali) sulle voci del catalogo o propone voci sue (lo staff
-- le approva dando il costo). All'approvazione della scheda i PF non
-- spesi diventano PX (fama_tasso_px), una volta sola e per sempre.
-- Fama Acquisita: voci libere dello staff (anche negative, pubbliche o
-- solo staff) e badge da catalogo (rarità, unici o cumulabili).
-- Infamia separata (fama_infamia_attiva): voci e badge di tipo infamia
-- vanno nel secondo contatore, con i suoi livelli.
-- Totali in cache (character_fame), livello e barra con fame_level_info,
-- notifiche di SISTEMA, icona nei presenti, classifica pubblica.
-- Ogni assegnazione, modifica, cancellazione e conversione va in fame_log.
-- «Celebrità del campus» diventa una voce di background: chi l'aveva
-- riceve indietro i PX (se approvato) e la voce di fama.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. IMPOSTAZIONI
-- ---------------------------------------------------------------------
insert into public.game_settings (key, value, kind, label, description, sort_order) values
  ('fama_pf_iniziali', '10', 'number', 'Fama · Punti Fama iniziali', 'I Punti Fama che ogni personaggio nuovo può spendere in creazione sulle voci di background.', 400),
  ('fama_tasso_px', '5', 'number', 'Fama · PX per ogni Punto Fama non speso', 'All''approvazione della scheda i PF non spesi diventano PX, una volta sola.', 401),
  ('fama_max_pf_voce', '0', 'number', 'Fama · Massimo PF per una voce', 'Le voci che costano di più non si possono scegliere. 0 = nessun limite.', 402),
  ('fama_max_pf_categoria', '0', 'number', 'Fama · Massimo PF per categoria', 'Quanti PF si possono spendere al massimo in una stessa categoria. 0 = nessun limite.', 403),
  ('fama_voci_personalizzate', '1', 'number', 'Fama · Voci di background proposte dai giocatori', '1 = il giocatore può proporre voci sue (lo staff le approva dando il costo); 0 = solo il catalogo.', 404),
  ('fama_infamia_attiva', '1', 'number', 'Fama · Infamia separata', '1 = voci e badge di infamia hanno il loro contatore e i loro livelli; 0 = c''è solo la fama.', 405),
  ('fama_icona_presenti', '1', 'number', 'Fama · Icona del livello nei presenti', '1 = l''icona del livello di fama (e di infamia) compare accanto al nome negli online.', 406),
  ('fama_notifiche', '1', 'number', 'Fama · Notifiche ai giocatori', '1 = messaggio di SISTEMA per voci pubbliche, badge e cambi di livello.', 407),
  ('fama_classifica_n', '20', 'number', 'Fama · Personaggi in classifica', 'Quanti personaggi mostra la classifica pubblica (Utility → Fama). 0 = classifica spenta.', 408)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- 2. CATALOGHI (li gestisce lo staff con fama.gestire)
-- ---------------------------------------------------------------------
create table if not exists public.fame_bg_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  description text not null default '' check (char_length(description) <= 500),
  category text not null default 'Altro' check (char_length(btrim(category)) between 2 and 40),
  cost_pf int not null default 1 check (cost_pf between 0 and 100),
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists fame_bg_items_name_key on public.fame_bg_items (lower(name));

create table if not exists public.fame_rarities (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 30),
  color text not null default '#b8a8e4' check (color ~ '^#[0-9a-fA-F]{6}$'),
  sort_order int not null default 0
);
create unique index if not exists fame_rarities_name_key on public.fame_rarities (lower(name));

create table if not exists public.fame_badges (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 60),
  description text not null default '' check (char_length(description) <= 500),
  -- emoji, oppure link https a un'immagine
  icon text not null default '🏅' check (char_length(icon) <= 500),
  points int not null default 1 check (points between -1000 and 1000),
  kind text not null default 'fama' check (kind in ('fama', 'infamia')),
  rarity_id uuid references public.fame_rarities (id) on delete set null,
  is_unique boolean not null default true,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists fame_badges_name_key on public.fame_badges (lower(name));
create index if not exists fame_badges_rarity_idx on public.fame_badges (rarity_id);

create table if not exists public.fame_levels (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'fama' check (kind in ('fama', 'infamia')),
  name text not null check (char_length(btrim(name)) between 2 and 40),
  min_points int not null default 0,
  sort_order int not null default 0,
  -- emoji o link https; vuota = nessuna icona nei presenti
  icon text not null default '' check (char_length(icon) <= 500),
  color text not null default '#f2b39c' check (color ~ '^#[0-9a-fA-F]{6}$'),
  unique (kind, min_points)
);

-- ---------------------------------------------------------------------
-- 3. DATI DEI PERSONAGGI
-- ---------------------------------------------------------------------
create table if not exists public.character_fame (
  character_id uuid primary key references public.characters (id) on delete cascade,
  pf_pool int not null default 0 check (pf_pool >= 0),
  converted boolean not null default false,
  converted_at timestamptz,
  pf_converted int not null default 0,
  px_from_conversion int not null default 0,
  fame_cache int not null default 0,
  infamy_cache int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.character_fame_bg (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters (id) on delete cascade,
  item_id uuid references public.fame_bg_items (id) on delete set null,
  -- voci proposte dal giocatore (senza item_id)
  custom_name text check (custom_name is null or char_length(btrim(custom_name)) between 2 and 80),
  custom_description text not null default '' check (char_length(custom_description) <= 500),
  category text not null default 'Altro',
  cost_pf int check (cost_pf is null or cost_pf between 0 and 100),
  status text not null default 'approvata' check (status in ('approvata', 'in_attesa', 'rifiutata')),
  review_note text not null default '' check (char_length(review_note) <= 300),
  created_at timestamptz not null default now(),
  check (item_id is not null or custom_name is not null)
);
create unique index if not exists character_fame_bg_item_key on public.character_fame_bg (character_id, item_id) where item_id is not null;
create index if not exists character_fame_bg_character_idx on public.character_fame_bg (character_id);
create index if not exists character_fame_bg_item_idx on public.character_fame_bg (item_id);

create table if not exists public.fame_entries (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 2 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  points int not null check (points between -1000 and 1000),
  kind text not null default 'fama' check (kind in ('fama', 'infamia')),
  is_public boolean not null default true,
  author_id uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists fame_entries_character_idx on public.fame_entries (character_id, created_at desc);
create index if not exists fame_entries_author_idx on public.fame_entries (author_id);

create table if not exists public.character_badges (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters (id) on delete cascade,
  badge_id uuid not null references public.fame_badges (id) on delete cascade,
  reason text not null default '' check (char_length(reason) <= 500),
  author_id uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists character_badges_character_idx on public.character_badges (character_id);
create index if not exists character_badges_badge_idx on public.character_badges (badge_id);
create index if not exists character_badges_author_idx on public.character_badges (author_id);

create table if not exists public.fame_log (
  id bigint generated always as identity primary key,
  character_id uuid references public.characters (id) on delete cascade,
  action text not null,
  detail text not null default '',
  points int,
  user_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists fame_log_character_idx on public.fame_log (character_id, created_at desc);
create index if not exists fame_log_user_idx on public.fame_log (user_id);

-- ---------------------------------------------------------------------
-- 4. ACCESSI (RLS)
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  -- cataloghi: li leggono tutti i collegati, li scrive lo staff della fama
  foreach t in array array['fame_bg_items', 'fame_rarities', 'fame_badges', 'fame_levels'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('drop policy if exists "Fama: catalogo letto da tutti" on public.%I', t);
    execute format('create policy "Fama: catalogo letto da tutti" on public.%I for select to authenticated using (true)', t);
    execute format('drop policy if exists "Fama: lo staff aggiunge" on public.%I', t);
    execute format('create policy "Fama: lo staff aggiunge" on public.%I for insert to authenticated with check ((select public.has_permission(''fama.gestire'')))', t);
    execute format('drop policy if exists "Fama: lo staff modifica" on public.%I', t);
    execute format('create policy "Fama: lo staff modifica" on public.%I for update to authenticated using ((select public.has_permission(''fama.gestire''))) with check ((select public.has_permission(''fama.gestire'')))', t);
    execute format('drop policy if exists "Fama: lo staff toglie" on public.%I', t);
    execute format('create policy "Fama: lo staff toglie" on public.%I for delete to authenticated using ((select public.has_permission(''fama.gestire'')))', t);
    execute format('drop trigger if exists %I on public.%I', t || '_log', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.log_admin_change()', t || '_log', t);
  end loop;
end;
$$;

-- totali e livelli: pubblici (classifica, presenti); si scrivono solo dalle funzioni
alter table public.character_fame enable row level security;
revoke all on public.character_fame from anon;
drop policy if exists "Fama: totali letti da tutti" on public.character_fame;
create policy "Fama: totali letti da tutti" on public.character_fame for select to authenticated using (true);
drop policy if exists "Fama: totali dalle funzioni" on public.character_fame;
create policy "Fama: totali dalle funzioni" on public.character_fame for insert to authenticated with check (false);
drop policy if exists "Fama: totali non si modificano" on public.character_fame;
create policy "Fama: totali non si modificano" on public.character_fame for update to authenticated using (false);
drop policy if exists "Fama: totali non si cancellano" on public.character_fame;
create policy "Fama: totali non si cancellano" on public.character_fame for delete to authenticated using (false);

-- background: le voci approvate le vedono tutti, le altre il proprietario e lo staff;
-- il giocatore scrive con le funzioni fame_bg_*, lo staff anche direttamente
alter table public.character_fame_bg enable row level security;
revoke all on public.character_fame_bg from anon;
drop policy if exists "Fama: background visibile" on public.character_fame_bg;
create policy "Fama: background visibile" on public.character_fame_bg for select to authenticated
  using (status = 'approvata'
         or exists (select 1 from public.characters c where c.id = character_id and c.owner_id = (select auth.uid()))
         or (select public.has_permission('fama.gestire')));
drop policy if exists "Fama: background dello staff" on public.character_fame_bg;
create policy "Fama: background dello staff" on public.character_fame_bg for insert to authenticated
  with check ((select public.has_permission('fama.gestire')));
drop policy if exists "Fama: background modificato dallo staff" on public.character_fame_bg;
create policy "Fama: background modificato dallo staff" on public.character_fame_bg for update to authenticated
  using ((select public.has_permission('fama.gestire'))) with check ((select public.has_permission('fama.gestire')));
drop policy if exists "Fama: background tolto dallo staff" on public.character_fame_bg;
create policy "Fama: background tolto dallo staff" on public.character_fame_bg for delete to authenticated
  using ((select public.has_permission('fama.gestire')));

-- voci libere: le pubbliche le vedono tutti, quelle solo staff lo staff
alter table public.fame_entries enable row level security;
revoke all on public.fame_entries from anon;
drop policy if exists "Fama: voci visibili" on public.fame_entries;
create policy "Fama: voci visibili" on public.fame_entries for select to authenticated
  using (is_public or (select public.has_permission('fama.gestire')));
drop policy if exists "Fama: voci dello staff" on public.fame_entries;
create policy "Fama: voci dello staff" on public.fame_entries for insert to authenticated
  with check ((select public.has_permission('fama.gestire')));
drop policy if exists "Fama: voci modificate dallo staff" on public.fame_entries;
create policy "Fama: voci modificate dallo staff" on public.fame_entries for update to authenticated
  using ((select public.has_permission('fama.gestire'))) with check ((select public.has_permission('fama.gestire')));
drop policy if exists "Fama: voci tolte dallo staff" on public.fame_entries;
create policy "Fama: voci tolte dallo staff" on public.fame_entries for delete to authenticated
  using ((select public.has_permission('fama.gestire')));

-- badge assegnati: li vedono tutti, li dà e li toglie lo staff
alter table public.character_badges enable row level security;
revoke all on public.character_badges from anon;
drop policy if exists "Fama: badge visibili" on public.character_badges;
create policy "Fama: badge visibili" on public.character_badges for select to authenticated using (true);
drop policy if exists "Fama: badge dati dallo staff" on public.character_badges;
create policy "Fama: badge dati dallo staff" on public.character_badges for insert to authenticated
  with check ((select public.has_permission('fama.gestire')));
drop policy if exists "Fama: badge modificati dallo staff" on public.character_badges;
create policy "Fama: badge modificati dallo staff" on public.character_badges for update to authenticated
  using ((select public.has_permission('fama.gestire'))) with check ((select public.has_permission('fama.gestire')));
drop policy if exists "Fama: badge tolti dallo staff" on public.character_badges;
create policy "Fama: badge tolti dallo staff" on public.character_badges for delete to authenticated
  using ((select public.has_permission('fama.gestire')));

-- registro: solo lo staff lo legge; lo scrivono le funzioni
alter table public.fame_log enable row level security;
revoke all on public.fame_log from anon;
drop policy if exists "Fama: registro dello staff" on public.fame_log;
create policy "Fama: registro dello staff" on public.fame_log for select to authenticated
  using ((select public.has_permission('fama.gestire')));
drop policy if exists "Fama: registro dalle funzioni" on public.fame_log;
create policy "Fama: registro dalle funzioni" on public.fame_log for insert to authenticated with check (false);
drop policy if exists "Fama: registro non si modifica" on public.fame_log;
create policy "Fama: registro non si modifica" on public.fame_log for update to authenticated using (false);
drop policy if exists "Fama: registro non si cancella" on public.fame_log;
create policy "Fama: registro non si cancella" on public.fame_log for delete to authenticated using (false);

-- ---------------------------------------------------------------------
-- 5. CALCOLI
-- ---------------------------------------------------------------------
create or replace function public.fame_log_add(p_character uuid, p_action text, p_detail text, p_points int)
returns void
language sql
security definer
set search_path = ''
as $$
  -- niente registro per un personaggio che si sta cancellando
  insert into public.fame_log (character_id, action, detail, points, user_id)
  select p_character, p_action, left(coalesce(p_detail, ''), 1000), p_points, auth.uid()
  where exists (select 1 from public.characters where id = p_character)
$$;

-- avviso allo staff della fama (e agli Amministratori)
create or replace function public.fame_notify_staff(p_text text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  u record;
begin
  for u in
    select p.id from public.profiles p join public.user_levels l on l.id = p.level_id
    where (l.is_admin or 'fama.gestire' = any (l.permissions)) and p.id is distinct from auth.uid()
  loop
    perform public.send_system_message(u.id, p_text);
  end loop;
end;
$$;
revoke execute on function public.fame_notify_staff(text) from public, anon, authenticated;
revoke execute on function public.fame_log_add(uuid, text, text, int) from public, anon, authenticated;

-- riga della fama (creata se manca: i nuovi con i PF iniziali, gli approvati già convertiti)
create or replace function public.fame_row(p_character uuid)
returns public.character_fame
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.character_fame;
begin
  select * into v from public.character_fame where character_id = p_character;
  if v.character_id is null then
    insert into public.character_fame (character_id, pf_pool, converted)
    select c.id,
      case when c.status = 'approvata' then 0 else coalesce(public.setting_int('fama_pf_iniziali'), 10) end,
      c.status = 'approvata'
    from public.characters c where c.id = p_character
    on conflict (character_id) do nothing;
    select * into v from public.character_fame where character_id = p_character;
  end if;
  return v;
end;
$$;
revoke execute on function public.fame_row(uuid) from public, anon, authenticated;

-- livello e barra per un punteggio
create or replace function public.fame_level_info(p_points int, p_kind text default 'fama')
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with cur as (
    select * from public.fame_levels where kind = p_kind and min_points <= greatest(p_points, 0)
    order by min_points desc limit 1
  ), low as (
    select * from public.fame_levels where kind = p_kind order by min_points limit 1
  ), lv as (
    select * from cur union all select * from low where not exists (select 1 from cur)
  ), nxt as (
    select * from public.fame_levels where kind = p_kind and min_points > (select min_points from lv)
    order by min_points limit 1
  )
  select case when not exists (select 1 from lv) then null else jsonb_build_object(
    'points', p_points,
    'id', (select id from lv), 'name', (select name from lv), 'icon', (select icon from lv), 'color', (select color from lv),
    'min', (select min_points from lv),
    'next_name', (select name from nxt), 'next_min', (select min_points from nxt),
    'missing', case when exists (select 1 from nxt) then (select min_points from nxt) - p_points end,
    'pct', case when p_points < 0 then 0
                when not exists (select 1 from nxt) then 100
                else least(100, greatest(0, round(100.0 * (p_points - (select min_points from lv))
                       / nullif((select min_points from nxt) - (select min_points from lv), 0))))::int end) end
$$;
revoke execute on function public.fame_level_info(int, text) from public, anon;
grant execute on function public.fame_level_info(int, text) to authenticated;

-- totali in cache; avvisa il giocatore quando cambia il livello
create or replace function public.fame_recalc(p_character uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.character_fame;
  v_fame int;
  v_infamy int;
  v_infamy_on boolean := coalesce(public.setting_int('fama_infamia_attiva'), 1) = 1;
  v_before jsonb; v_after jsonb;
  c public.characters;
begin
  select * into c from public.characters where id = p_character;
  if c.id is null then return; end if;
  v_old := public.fame_row(p_character);
  v_fame := coalesce((select sum(coalesce(b.cost_pf, 0)) from public.character_fame_bg b where b.character_id = p_character and b.status = 'approvata'), 0)
    + coalesce((select sum(points) from public.fame_entries where character_id = p_character and (kind = 'fama' or not v_infamy_on)), 0)
    + coalesce((select sum(fb.points) from public.character_badges cb join public.fame_badges fb on fb.id = cb.badge_id
                where cb.character_id = p_character and (fb.kind = 'fama' or not v_infamy_on)), 0);
  v_infamy := case when v_infamy_on then
      coalesce((select sum(points) from public.fame_entries where character_id = p_character and kind = 'infamia'), 0)
    + coalesce((select sum(fb.points) from public.character_badges cb join public.fame_badges fb on fb.id = cb.badge_id
                where cb.character_id = p_character and fb.kind = 'infamia'), 0)
    else 0 end;
  update public.character_fame set fame_cache = v_fame, infamy_cache = v_infamy, updated_at = now() where character_id = p_character;

  if c.status = 'approvata' and coalesce(public.setting_int('fama_notifiche'), 1) = 1 then
    v_before := public.fame_level_info(v_old.fame_cache, 'fama');
    v_after := public.fame_level_info(v_fame, 'fama');
    if v_before ->> 'id' is distinct from v_after ->> 'id' and v_after is not null then
      perform public.send_system_message(c.owner_id, '⭐ La fama di ' || public.first_name(c.name) || ' cambia: ora è «' || (v_after ->> 'name') || '».');
      perform public.fame_log_add(p_character, 'livello', 'Fama: ' || coalesce(v_before ->> 'name', '—') || ' → ' || (v_after ->> 'name'), v_fame);
    end if;
    if v_infamy_on then
      v_before := public.fame_level_info(v_old.infamy_cache, 'infamia');
      v_after := public.fame_level_info(v_infamy, 'infamia');
      if v_before ->> 'id' is distinct from v_after ->> 'id' and v_after is not null then
        perform public.send_system_message(c.owner_id, '🌶️ L''infamia di ' || public.first_name(c.name) || ' cambia: ora è «' || (v_after ->> 'name') || '».');
        perform public.fame_log_add(p_character, 'livello', 'Infamia: ' || coalesce(v_before ->> 'name', '—') || ' → ' || (v_after ->> 'name'), v_infamy);
      end if;
    end if;
  end if;
end;
$$;
revoke execute on function public.fame_recalc(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. REGISTRO, RICALCOLO E NOTIFICHE SU OGNI MODIFICA
-- ---------------------------------------------------------------------
create or replace function public.fame_entries_after()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.fame_entries := case when tg_op = 'DELETE' then old else new end;
  c public.characters;
begin
  perform public.fame_log_add(r.character_id,
    case tg_op when 'INSERT' then 'voce aggiunta' when 'UPDATE' then 'voce modificata' else 'voce tolta' end,
    r.title || ' (' || r.kind || case when r.is_public then '' else ', solo staff' end || ')', r.points);
  if tg_op = 'INSERT' and r.is_public and coalesce(public.setting_int('fama_notifiche'), 1) = 1 then
    select * into c from public.characters where id = r.character_id;
    if c.status = 'approvata' then
      perform public.send_system_message(c.owner_id,
        case when r.kind = 'infamia' then '🌶️ Infamia' else '⭐ Fama' end || ' per ' || public.first_name(c.name) || ': «' || r.title || '» ('
        || case when r.points > 0 then '+' else '' end || r.points || '). La trovi in scheda → Fama.');
    end if;
  end if;
  perform public.fame_recalc(r.character_id);
  return null;
end;
$$;
revoke execute on function public.fame_entries_after() from public, anon, authenticated;
drop trigger if exists fame_entries_after on public.fame_entries;
create trigger fame_entries_after after insert or update or delete on public.fame_entries
  for each row execute function public.fame_entries_after();

create or replace function public.fame_entries_before()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then new.author_id := coalesce(new.author_id, auth.uid()); end if;
  return new;
end;
$$;
drop trigger if exists fame_entries_before on public.fame_entries;
create trigger fame_entries_before before insert or update on public.fame_entries
  for each row execute function public.fame_entries_before();

-- badge: unici una volta sola, solo badge attivi
create or replace function public.character_badges_before()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.fame_badges;
begin
  select * into b from public.fame_badges where id = new.badge_id;
  if b.id is null or not b.active then raise exception 'Badge non disponibile.' using errcode = 'P0001'; end if;
  if b.is_unique and exists (select 1 from public.character_badges where character_id = new.character_id and badge_id = new.badge_id
                             and id is distinct from new.id) then
    raise exception 'Il personaggio ha già il badge «%» (si dà una volta sola).', b.name using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' then new.author_id := coalesce(new.author_id, auth.uid()); end if;
  return new;
end;
$$;
revoke execute on function public.character_badges_before() from public, anon, authenticated;
drop trigger if exists character_badges_before on public.character_badges;
create trigger character_badges_before before insert or update on public.character_badges
  for each row execute function public.character_badges_before();

create or replace function public.character_badges_after()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.character_badges := case when tg_op = 'DELETE' then old else new end;
  b public.fame_badges;
  c public.characters;
begin
  select * into b from public.fame_badges where id = r.badge_id;
  perform public.fame_log_add(r.character_id,
    case tg_op when 'INSERT' then 'badge dato' when 'UPDATE' then 'badge modificato' else 'badge tolto' end,
    coalesce(b.name, 'badge') || case when r.reason <> '' then ': ' || r.reason else '' end, b.points);
  if tg_op = 'INSERT' and coalesce(public.setting_int('fama_notifiche'), 1) = 1 then
    select * into c from public.characters where id = r.character_id;
    if c.status = 'approvata' then
      perform public.send_system_message(c.owner_id,
        '🏅 ' || public.first_name(c.name) || ' riceve il badge «' || b.name || '»'
        || case when r.reason <> '' then ': ' || r.reason else '' end || '. Lo trovi in scheda → Fama.');
    end if;
  end if;
  perform public.fame_recalc(r.character_id);
  return null;
end;
$$;
revoke execute on function public.character_badges_after() from public, anon, authenticated;
drop trigger if exists character_badges_after on public.character_badges;
create trigger character_badges_after after insert or update or delete on public.character_badges
  for each row execute function public.character_badges_after();

create or replace function public.character_fame_bg_after()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.character_fame_bg := case when tg_op = 'DELETE' then old else new end;
  v_name text;
begin
  v_name := coalesce(r.custom_name, (select name from public.fame_bg_items where id = r.item_id), 'voce');
  perform public.fame_log_add(r.character_id,
    case tg_op when 'INSERT' then 'background scelto' when 'UPDATE' then 'background: ' || r.status else 'background tolto' end,
    v_name, r.cost_pf);
  perform public.fame_recalc(r.character_id);
  return null;
end;
$$;
revoke execute on function public.character_fame_bg_after() from public, anon, authenticated;
drop trigger if exists character_fame_bg_after on public.character_fame_bg;
create trigger character_fame_bg_after after insert or update or delete on public.character_fame_bg
  for each row execute function public.character_fame_bg_after();

-- badge o livelli del catalogo cambiati: si ricalcola chi li ha
create or replace function public.fame_badges_after()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  if tg_op = 'UPDATE' and (new.points is distinct from old.points or new.kind is distinct from old.kind) then
    for r in select distinct character_id from public.character_badges where badge_id = new.id loop
      perform public.fame_recalc(r.character_id);
    end loop;
  end if;
  return null;
end;
$$;
revoke execute on function public.fame_badges_after() from public, anon, authenticated;
drop trigger if exists fame_badges_after on public.fame_badges;
create trigger fame_badges_after after update on public.fame_badges
  for each row execute function public.fame_badges_after();

-- ---------------------------------------------------------------------
-- 7. FAMA DI BACKGROUND IN CREAZIONE
-- ---------------------------------------------------------------------
create or replace function public.fame_creation_check(p_character uuid)
returns public.characters
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.characters;
begin
  select * into c from public.characters where id = p_character and owner_id = auth.uid();
  if c.id is null then raise exception 'Non è un tuo personaggio.' using errcode = '42501'; end if;
  if c.status not in ('bozza', 'rifiutata') or (public.fame_row(p_character)).converted then
    raise exception 'Il background di fama si sceglie solo in creazione: dopo l''approvazione lo cambia lo staff.' using errcode = 'P0001';
  end if;
  return c;
end;
$$;
revoke execute on function public.fame_creation_check(uuid) from public, anon, authenticated;

-- stato per la creazione: PF, regole, catalogo, voci scelte
create or replace function public.fame_creation_state(p_character uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.character_fame;
begin
  if not exists (select 1 from public.characters where id = p_character and owner_id = auth.uid())
     and not public.has_permission('fama.gestire') then
    raise exception 'Non hai i permessi necessari.' using errcode = '42501';
  end if;
  f := public.fame_row(p_character);
  return jsonb_build_object(
    'pool', f.pf_pool,
    'spent', coalesce((select sum(coalesce(cost_pf, 0)) from public.character_fame_bg where character_id = p_character and status = 'approvata'), 0),
    'converted', f.converted, 'px_from_conversion', f.px_from_conversion,
    'rate', coalesce(public.setting_int('fama_tasso_px'), 5),
    'max_item', coalesce(public.setting_int('fama_max_pf_voce'), 0),
    'max_category', coalesce(public.setting_int('fama_max_pf_categoria'), 0),
    'custom', coalesce(public.setting_int('fama_voci_personalizzate'), 1) = 1,
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'description', description, 'category', category, 'cost', cost_pf)
                       order by category, sort_order, name) from public.fame_bg_items where active), '[]'::jsonb),
    'mine', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'item_id', b.item_id,
                        'name', coalesce(b.custom_name, i.name), 'description', coalesce(nullif(b.custom_description, ''), i.description, ''),
                        'category', coalesce(i.category, b.category), 'cost', b.cost_pf, 'status', b.status, 'note', b.review_note,
                        'custom', b.item_id is null) order by b.created_at)
                      from public.character_fame_bg b left join public.fame_bg_items i on i.id = b.item_id
                      where b.character_id = p_character), '[]'::jsonb));
end;
$$;
revoke execute on function public.fame_creation_state(uuid) from public, anon;
grant execute on function public.fame_creation_state(uuid) to authenticated;

-- sceglie o toglie una voce del catalogo (controlli sul server)
create or replace function public.fame_bg_toggle(p_character uuid, p_item uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.fame_bg_items;
  f public.character_fame;
  v_spent int;
  v_cat int;
  v_max_item int := coalesce(public.setting_int('fama_max_pf_voce'), 0);
  v_max_cat int := coalesce(public.setting_int('fama_max_pf_categoria'), 0);
begin
  perform public.fame_creation_check(p_character);
  if not p_on then
    delete from public.character_fame_bg where character_id = p_character and item_id = p_item;
    return;
  end if;
  select * into i from public.fame_bg_items where id = p_item and active;
  if i.id is null then raise exception 'Voce non disponibile.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.character_fame_bg where character_id = p_character and item_id = p_item) then return; end if;
  if v_max_item > 0 and i.cost_pf > v_max_item then
    raise exception 'Questa voce costa % PF: il massimo per una voce è %.', i.cost_pf, v_max_item using errcode = 'P0001';
  end if;
  f := public.fame_row(p_character);
  select coalesce(sum(coalesce(cost_pf, 0)), 0) into v_spent from public.character_fame_bg where character_id = p_character and status = 'approvata';
  if v_spent + i.cost_pf > f.pf_pool then
    raise exception 'Ti restano % PF: questa voce ne costa %.', f.pf_pool - v_spent, i.cost_pf using errcode = 'P0001';
  end if;
  if v_max_cat > 0 then
    select coalesce(sum(coalesce(b.cost_pf, 0)), 0) into v_cat from public.character_fame_bg b
    left join public.fame_bg_items x on x.id = b.item_id
    where b.character_id = p_character and b.status = 'approvata' and coalesce(x.category, b.category) = i.category;
    if v_cat + i.cost_pf > v_max_cat then
      raise exception 'Nella categoria «%» puoi spendere al massimo % PF.', i.category, v_max_cat using errcode = 'P0001';
    end if;
  end if;
  insert into public.character_fame_bg (character_id, item_id, category, cost_pf, status)
  values (p_character, i.id, i.category, i.cost_pf, 'approvata');
end;
$$;
revoke execute on function public.fame_bg_toggle(uuid, uuid, boolean) from public, anon;
grant execute on function public.fame_bg_toggle(uuid, uuid, boolean) to authenticated;

-- propone una voce sua (la approva lo staff dando il costo)
create or replace function public.fame_bg_propose(p_character uuid, p_name text, p_description text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.characters;
begin
  c := public.fame_creation_check(p_character);
  if coalesce(public.setting_int('fama_voci_personalizzate'), 1) <> 1 then
    raise exception 'Le voci proposte dai giocatori non sono attive.' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) < 2 then raise exception 'Scrivi il nome della voce.' using errcode = 'P0001'; end if;
  if (select count(*) from public.character_fame_bg where character_id = p_character and item_id is null and status = 'in_attesa') >= 3 then
    raise exception 'Hai già 3 voci in attesa: aspetta che lo staff le guardi.' using errcode = 'P0001';
  end if;
  insert into public.character_fame_bg (character_id, custom_name, custom_description, category, cost_pf, status)
  values (p_character, left(btrim(p_name), 80), left(btrim(coalesce(p_description, '')), 500), 'Proposta', null, 'in_attesa');
  perform public.fame_notify_staff('⭐ ' || public.first_name(c.name) || ' propone una voce di fama: «' || left(btrim(p_name), 80) || '». La trovi in Gestione → Fama → Proposte.');
end;
$$;
revoke execute on function public.fame_bg_propose(uuid, text, text) from public, anon;
grant execute on function public.fame_bg_propose(uuid, text, text) to authenticated;

-- toglie una sua voce proposta (prima dell'approvazione della scheda)
create or replace function public.fame_bg_withdraw(p_character uuid, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.fame_creation_check(p_character);
  delete from public.character_fame_bg where id = p_id and character_id = p_character and item_id is null;
end;
$$;
revoke execute on function public.fame_bg_withdraw(uuid, uuid) from public, anon;
grant execute on function public.fame_bg_withdraw(uuid, uuid) to authenticated;

-- lo staff approva (con il costo) o rifiuta una voce proposta
create or replace function public.fame_bg_review(p_id uuid, p_approve boolean, p_cost int, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.character_fame_bg;
  c public.characters;
begin
  if not public.has_permission('fama.gestire') then raise exception 'Non hai il permesso di gestire la fama.' using errcode = '42501'; end if;
  select * into b from public.character_fame_bg where id = p_id for update;
  if b.id is null or b.status <> 'in_attesa' then raise exception 'Proposta non trovata o già decisa.' using errcode = 'P0001'; end if;
  if p_approve and (p_cost is null or p_cost < 0 or p_cost > 100) then raise exception 'Dai un costo tra 0 e 100 PF.' using errcode = 'P0001'; end if;
  update public.character_fame_bg
  set status = case when p_approve then 'approvata' else 'rifiutata' end,
      cost_pf = case when p_approve then p_cost else null end,
      review_note = left(coalesce(btrim(p_note), ''), 300)
  where id = p_id;
  select * into c from public.characters where id = b.character_id;
  perform public.send_system_message(c.owner_id,
    '⭐ La voce di fama «' || b.custom_name || '» di ' || public.first_name(c.name) || ' è stata '
    || case when p_approve then 'approvata: costa ' || p_cost || ' PF' else 'rifiutata' end
    || coalesce(nullif(': ' || btrim(p_note), ': '), '') || '.');
end;
$$;
revoke execute on function public.fame_bg_review(uuid, boolean, int, text) from public, anon;
grant execute on function public.fame_bg_review(uuid, boolean, int, text) to authenticated;

-- lo staff cambia i PF iniziali di un personaggio (es. per quelli già esistenti)
create or replace function public.fame_set_pool(p_character uuid, p_pool int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_permission('fama.gestire') then raise exception 'Non hai il permesso di gestire la fama.' using errcode = '42501'; end if;
  if p_pool < 0 or p_pool > 1000 then raise exception 'PF non validi.' using errcode = 'P0001'; end if;
  perform public.fame_row(p_character);
  update public.character_fame set pf_pool = p_pool, updated_at = now() where character_id = p_character;
  perform public.fame_log_add(p_character, 'PF iniziali', 'PF iniziali impostati a ' || p_pool, p_pool);
end;
$$;
revoke execute on function public.fame_set_pool(uuid, int) from public, anon;
grant execute on function public.fame_set_pool(uuid, int) to authenticated;

-- ---------------------------------------------------------------------
-- 8. CONVERSIONE ALL'APPROVAZIONE (una volta sola) E RESET DELLA SCHEDA
-- ---------------------------------------------------------------------
create or replace function public.characters_fame_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.character_fame;
  v_spent int;
  v_left int;
  v_px int;
begin
  -- reset della scheda (Amministrazione): la fama riparte da zero
  if new.status = 'bozza' and old.status = 'approvata' and new.creation_step = 1 then
    delete from public.character_fame_bg where character_id = new.id;
    delete from public.fame_entries where character_id = new.id;
    delete from public.character_badges where character_id = new.id;
    delete from public.character_fame where character_id = new.id;
    perform public.fame_row(new.id);
    perform public.fame_log_add(new.id, 'reset', 'Scheda resettata: fama azzerata', 0);
    return null;
  end if;

  if new.status = 'approvata' and old.status is distinct from 'approvata' then
    f := public.fame_row(new.id);
    if f.converted then return null; end if;
    -- le voci proposte ancora in attesa non entrano
    update public.character_fame_bg set status = 'rifiutata', review_note = 'Non decisa prima dell''approvazione della scheda'
    where character_id = new.id and status = 'in_attesa';
    select coalesce(sum(coalesce(cost_pf, 0)), 0) into v_spent from public.character_fame_bg where character_id = new.id and status = 'approvata';
    v_left := greatest(0, f.pf_pool - v_spent);
    v_px := v_left * coalesce(public.setting_int('fama_tasso_px'), 5);
    update public.character_fame set converted = true, converted_at = now(), pf_converted = v_left, px_from_conversion = v_px, updated_at = now()
    where character_id = new.id and not converted;
    if found and v_px > 0 then
      perform set_config('app.invio_scheda', 'on', true);
      update public.characters set px = px + v_px where id = new.id;
      perform set_config('app.invio_scheda', 'off', true);
      perform public.send_system_message(new.owner_id,
        '⭐ I ' || v_left || ' Punti Fama non spesi di ' || public.first_name(new.name) || ' sono diventati ' || v_px || ' PX.');
    end if;
    perform public.fame_log_add(new.id, 'conversione', v_left || ' PF non spesi → ' || v_px || ' PX (spesi ' || v_spent || ' PF)', v_px);
    perform public.fame_recalc(new.id);
  end if;
  return null;
end;
$$;
revoke execute on function public.characters_fame_status() from public, anon, authenticated;
drop trigger if exists characters_fame_status on public.characters;
create trigger characters_fame_status after update of status on public.characters
  for each row execute function public.characters_fame_status();

-- ---------------------------------------------------------------------
-- 9. LETTURE: SCHEDA, CLASSIFICA, PRESENTI
-- ---------------------------------------------------------------------
create or replace function public.fame_overview(p_character uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.character_fame;
  v_staff boolean := public.has_permission('fama.gestire');
  v_owner boolean := exists (select 1 from public.characters where id = p_character and owner_id = auth.uid());
  v_infamy_on boolean := coalesce(public.setting_int('fama_infamia_attiva'), 1) = 1;
begin
  if auth.uid() is null then raise exception 'Serve l''accesso.' using errcode = '42501'; end if;
  f := public.fame_row(p_character);
  return jsonb_build_object(
    'fame', public.fame_level_info(f.fame_cache, 'fama'),
    'infamy', case when v_infamy_on then public.fame_level_info(f.infamy_cache, 'infamia') end,
    'converted', f.converted, 'pf_pool', f.pf_pool, 'pf_converted', f.pf_converted, 'px_from_conversion', f.px_from_conversion,
    'is_staff', v_staff, 'is_owner', v_owner,
    'background', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'name', coalesce(b.custom_name, i.name),
                     'description', coalesce(nullif(b.custom_description, ''), i.description, ''), 'category', coalesce(i.category, b.category),
                     'cost', b.cost_pf, 'status', b.status) order by b.created_at)
                   from public.character_fame_bg b left join public.fame_bg_items i on i.id = b.item_id
                   where b.character_id = p_character and (b.status = 'approvata' or v_staff or v_owner)), '[]'::jsonb),
    'badges', coalesce((select jsonb_agg(jsonb_build_object('id', cb.id, 'badge_id', fb.id, 'name', fb.name, 'description', fb.description,
                     'icon', fb.icon, 'points', fb.points, 'kind', fb.kind, 'reason', cb.reason, 'date', cb.created_at,
                     'rarity', r.name, 'color', coalesce(r.color, '#b8a8e4')) order by cb.created_at desc)
                   from public.character_badges cb join public.fame_badges fb on fb.id = cb.badge_id
                   left join public.fame_rarities r on r.id = fb.rarity_id
                   where cb.character_id = p_character and (v_infamy_on or fb.kind = 'fama')), '[]'::jsonb),
    'entries', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'title', e.title, 'description', e.description, 'points', e.points,
                     'kind', e.kind, 'public', e.is_public, 'date', e.created_at) order by e.created_at desc)
                   from public.fame_entries e
                   where e.character_id = p_character and (e.is_public or v_staff) and (v_infamy_on or e.kind = 'fama')), '[]'::jsonb));
end;
$$;
revoke execute on function public.fame_overview(uuid) from public, anon;
grant execute on function public.fame_overview(uuid) to authenticated;

create or replace function public.fame_ranking()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(x order by (x ->> 'fame')::int desc, x ->> 'name'), '[]'::jsonb)
  from (
    select jsonb_build_object('id', c.id, 'name', c.name, 'avatar_url', c.avatar_url, 'fame', f.fame_cache,
      'infamy', case when coalesce(public.setting_int('fama_infamia_attiva'), 1) = 1 then f.infamy_cache end,
      'level', public.fame_level_info(f.fame_cache, 'fama')) as x
    from public.character_fame f join public.characters c on c.id = f.character_id
    where c.status = 'approvata' and auth.uid() is not null
    order by f.fame_cache desc, c.name
    limit greatest(0, coalesce(public.setting_int('fama_classifica_n'), 20))
  ) t
$$;
revoke execute on function public.fame_ranking() from public, anon;
grant execute on function public.fame_ranking() to authenticated;

-- icone dei livelli per i presenti
create or replace function public.fame_icons(p_characters uuid[])
returns table (character_id uuid, fame_name text, fame_icon text, infamy_name text, infamy_icon text)
language sql
stable
security definer
set search_path = ''
as $$
  select f.character_id,
    public.fame_level_info(f.fame_cache, 'fama') ->> 'name',
    public.fame_level_info(f.fame_cache, 'fama') ->> 'icon',
    case when coalesce(public.setting_int('fama_infamia_attiva'), 1) = 1 then public.fame_level_info(f.infamy_cache, 'infamia') ->> 'name' end,
    case when coalesce(public.setting_int('fama_infamia_attiva'), 1) = 1 then public.fame_level_info(f.infamy_cache, 'infamia') ->> 'icon' end
  from public.character_fame f
  where f.character_id = any (p_characters) and auth.uid() is not null
    and coalesce(public.setting_int('fama_icona_presenti'), 1) = 1
$$;
revoke execute on function public.fame_icons(uuid[]) from public, anon;
grant execute on function public.fame_icons(uuid[]) to authenticated;

-- livello di fama da usare in altre parti del sito (effetti in gioco)
create or replace function public.character_fame_level(p_character uuid, p_kind text default 'fama')
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.fame_level_info(case when p_kind = 'infamia' then f.infamy_cache else f.fame_cache end, p_kind)
  from public.character_fame f where f.character_id = p_character
$$;
revoke execute on function public.character_fame_level(uuid, text) from public, anon;
grant execute on function public.character_fame_level(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 10. CATALOGO DI PARTENZA (tutto modificabile da Gestione → Fama)
-- ---------------------------------------------------------------------
insert into public.fame_rarities (name, color, sort_order) values
  ('Comune', '#b8a8e4', 1), ('Raro', '#93d4cf', 2), ('Unico', '#f2b39c', 3)
on conflict do nothing;

insert into public.fame_levels (kind, name, min_points, sort_order, icon, color) values
  ('fama', 'Sconosciuto', 0, 1, '', '#b8a8e4'),
  ('fama', 'Noto nel campus', 10, 2, '⭐', '#f3d5b3'),
  ('fama', 'Popolare', 25, 3, '🌟', '#f2b39c'),
  ('fama', 'Celebre', 50, 4, '✨', '#ec8cb8'),
  ('fama', 'Leggenda di San Diego', 100, 5, '👑', '#ec8cb8'),
  ('infamia', 'Pulito', 0, 1, '', '#b8a8e4'),
  ('infamia', 'Chiacchierato', 10, 2, '💬', '#c391cc'),
  ('infamia', 'Malfamato', 25, 3, '🌶️', '#ec8cb8'),
  ('infamia', 'Famigerato', 50, 4, '💀', '#ec8cb8')
on conflict do nothing;

insert into public.fame_bg_items (name, description, category, cost_pf, sort_order) values
  ('Figlio di una star di Hollywood', 'Un genitore famoso nel cinema o in TV: i paparazzi conoscono il tuo nome da prima che tu lo sapessi scrivere.', 'Famiglia', 4, 1),
  ('Famiglia in politica', 'Un genitore sindaco, senatore o deputato della California: il tuo cognome si legge sui giornali.', 'Famiglia', 3, 2),
  ('Cognome su un edificio del campus', 'La tua famiglia ha donato al college: c''è il vostro nome su una biblioteca o un laboratorio.', 'Famiglia', 3, 3),
  ('Influencer con 50.000 follower', 'Hai un pubblico vero sui social: ti riconoscono per strada e i marchi ti scrivono.', 'Social', 3, 4),
  ('Video virale', 'Un tuo video ha fatto il giro del paese: per molti sei ancora «quello del video».', 'Social', 1, 5),
  ('Canale seguito', 'Un canale di video o un podcast con una comunità affezionata.', 'Social', 2, 6),
  ('Campione statale al liceo', 'Hai vinto il titolo dello stato nel tuo sport: gli allenatori del college ti conoscono.', 'Sport', 2, 7),
  ('Medaglia ai campionati nazionali giovanili', 'Un podio nazionale da ragazzo: il tuo nome è nelle classifiche.', 'Sport', 3, 8),
  ('Attore bambino in una serie TV', 'Da piccolo eri in una serie che tutti guardavano: c''è chi ti chiede ancora la battuta famosa.', 'Spettacolo', 3, 9),
  ('Un singolo passato in radio', 'Una tua canzone è passata nelle radio locali: qualcuno la canticchia senza sapere che è tua.', 'Spettacolo', 2, 10),
  ('Modello per un marchio noto', 'La tua faccia è stata su cartelloni e pubblicità.', 'Spettacolo', 2, 11),
  ('Vincitore di un concorso scientifico nazionale', 'Hai vinto una gara nazionale di scienze o matematica: i professori sanno chi sei.', 'Studio', 2, 12),
  ('Articolo su una rivista', 'Un tuo articolo o una tua ricerca è stato pubblicato e citato.', 'Studio', 1, 13),
  ('Celebrità del campus', 'Tutti sanno chi sei: le porte si aprono, ma è difficile passare inosservati.', 'Campus', 3, 14),
  ('Re o regina del ballo del liceo', 'Una corona al ballo di fine anno: un titolo che ti segue.', 'Campus', 1, 15),
  ('Scandalo sui giornali', 'Il tuo nome è finito in una storia che ha fatto discutere: famoso, ma non per le ragioni giuste.', 'Scandali', 2, 16)
on conflict do nothing;

insert into public.fame_badges (name, description, icon, points, kind, rarity_id, is_unique, sort_order)
select v.name, v.descr, v.icon, v.points, v.kind, r.id, v.uniq, v.ord
from (values
  ('MVP della partita', 'Il migliore in campo in una gara della squadra.', '🏆', 2, 'fama', 'Comune', false, 1),
  ('Dean''s List', 'Un semestre tra i migliori studenti del college.', '🎓', 2, 'fama', 'Comune', false, 2),
  ('Post virale', 'Un contenuto che ha fatto il giro del campus.', '📱', 1, 'fama', 'Comune', false, 3),
  ('Campione di Conference', 'Ha vinto il titolo di Conference con la squadra.', '🥇', 5, 'fama', 'Raro', false, 4),
  ('Re o regina del ballo', 'Incoronato al ballo del college.', '👑', 4, 'fama', 'Raro', true, 5),
  ('Presidente del Comitato studentesco', 'Eletto alla guida degli studenti.', '🗳️', 5, 'fama', 'Raro', true, 6),
  ('Laurea con lode', 'Si è laureato con una lode.', '📜', 6, 'fama', 'Unico', true, 7),
  ('Cacciato da una festa', 'Messo alla porta davanti a tutti.', '🚪', 1, 'infamia', 'Comune', false, 8),
  ('Scandalo sul giornale del college', 'Il suo nome in prima pagina, per i motivi sbagliati.', '📰', 3, 'infamia', 'Raro', false, 9),
  ('Arrestato', 'Una notte in centrale che tutti conoscono.', '🚔', 4, 'infamia', 'Raro', false, 10)
) as v (name, descr, icon, points, kind, rarity, uniq, ord)
left join public.fame_rarities r on r.name = v.rarity
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 11. PERSONAGGI GIÀ ESISTENTI E «CELEBRITÀ DEL CAMPUS»
-- ---------------------------------------------------------------------
-- gli approvati partono già convertiti (PF 0: lo staff può darne con fame_set_pool),
-- le bozze con i PF iniziali
insert into public.character_fame (character_id, pf_pool, converted)
select c.id,
  case when c.status = 'approvata' then 0 else coalesce(public.setting_int('fama_pf_iniziali'), 10) end,
  c.status = 'approvata'
from public.characters c
on conflict (character_id) do nothing;

do $$
declare
  v_opt uuid := (select id from public.creation_options where name = 'Celebrità del campus' limit 1);
  v_item uuid := (select id from public.fame_bg_items where name = 'Celebrità del campus');
  r record;
  v_refund int;
begin
  if v_opt is null then return; end if;
  perform set_config('app.invio_scheda', 'on', true);
  for r in
    select co.character_id, co.level, c.status, c.owner_id, c.name, o.cost_px
    from public.character_options co join public.characters c on c.id = co.character_id
    join public.creation_options o on o.id = co.option_id
    where co.option_id = v_opt
  loop
    v_refund := greatest(0, r.cost_px * coalesce(r.level, 1));
    if r.status = 'approvata' and v_refund > 0 then
      update public.characters set px = px + v_refund where id = r.character_id;
    end if;
    insert into public.character_fame_bg (character_id, item_id, category, cost_pf, status)
    values (r.character_id, v_item, 'Campus', 3, 'approvata')
    on conflict do nothing;
    if r.status = 'approvata' then
      perform public.send_system_message(r.owner_id,
        '⭐ «Celebrità del campus» ora fa parte della Fama: ' || public.first_name(r.name) || ' riceve indietro '
        || v_refund || ' PX e ha la voce di fama «Celebrità del campus» (scheda → Fama).');
    end if;
  end loop;
  delete from public.character_options where option_id = v_opt;
  update public.creation_options set active = false, available = false where id = v_opt;
  perform set_config('app.invio_scheda', 'off', true);
end;
$$;

-- totali di partenza
do $$
declare
  r record;
begin
  for r in select character_id from public.character_fame loop
    perform public.fame_recalc(r.character_id);
  end loop;
end;
$$;

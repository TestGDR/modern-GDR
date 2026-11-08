-- =====================================================================
-- CASSA COMUNE DELLE CHAT
-- Chi ha il permesso chat.cassa mette nella cassa di una chat degli oggetti
-- del catalogo del mercato (es. gli alcolici di una festa), con la quantità
-- e, se vuole, un massimo per personaggio. Chi è in giocata in quella chat
-- prende un oggetto alla volta dalla cassa: diventa suo, gratis e senza
-- spesa mensile. In chat compare chi mette e chi prende.
-- Si scrive solo con le funzioni room_stash_*.
-- =====================================================================

create table if not exists public.room_stash (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  item_id uuid not null references public.market_items (id) on delete cascade,
  quantity int not null check (quantity between 1 and 999),
  -- quanti ne può prendere ogni personaggio (null = senza limite)
  max_per_character int check (max_per_character is null or max_per_character between 1 and 99),
  added_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (room_id, item_id)
);
create index if not exists room_stash_room_idx on public.room_stash (room_id);

create table if not exists public.room_stash_takes (
  stash_id uuid not null references public.room_stash (id) on delete cascade,
  character_id uuid not null references public.characters (id) on delete cascade,
  taken int not null default 0,
  primary key (stash_id, character_id)
);
create index if not exists room_stash_takes_character_idx on public.room_stash_takes (character_id);

alter table public.room_stash enable row level security;
alter table public.room_stash_takes enable row level security;
revoke all on public.room_stash from anon, authenticated;
revoke all on public.room_stash_takes from anon, authenticated;
grant select on public.room_stash to authenticated;
grant select on public.room_stash_takes to authenticated;

drop policy if exists "Cassa: visibile a chi entra nella chat" on public.room_stash;
create policy "Cassa: visibile a chi entra nella chat" on public.room_stash for select to authenticated
  using ((select public.can_enter_room(room_id)) or (select public.has_permission('chat.log')));
drop policy if exists "Cassa: solo dalle funzioni (inserimento)" on public.room_stash;
create policy "Cassa: solo dalle funzioni (inserimento)" on public.room_stash for insert to authenticated with check (false);
drop policy if exists "Cassa: solo dalle funzioni (modifica)" on public.room_stash;
create policy "Cassa: solo dalle funzioni (modifica)" on public.room_stash for update to authenticated using (false);
drop policy if exists "Cassa: solo dalle funzioni (eliminazione)" on public.room_stash;
create policy "Cassa: solo dalle funzioni (eliminazione)" on public.room_stash for delete to authenticated using (false);

drop policy if exists "Cassa presi: i propri e lo staff" on public.room_stash_takes;
create policy "Cassa presi: i propri e lo staff" on public.room_stash_takes for select to authenticated
  using ((select public.owns_character(character_id)) or (select public.has_permission('chat.cassa')));
drop policy if exists "Cassa presi: solo dalle funzioni (inserimento)" on public.room_stash_takes;
create policy "Cassa presi: solo dalle funzioni (inserimento)" on public.room_stash_takes for insert to authenticated with check (false);
drop policy if exists "Cassa presi: solo dalle funzioni (modifica)" on public.room_stash_takes;
create policy "Cassa presi: solo dalle funzioni (modifica)" on public.room_stash_takes for update to authenticated using (false);
drop policy if exists "Cassa presi: solo dalle funzioni (eliminazione)" on public.room_stash_takes;
create policy "Cassa presi: solo dalle funzioni (eliminazione)" on public.room_stash_takes for delete to authenticated using (false);

-- Contenuto della cassa (con i dati dell'oggetto, anche se del mercato nero) e quanti ne ho già presi
create or replace function public.room_stash_list(p_room uuid, p_character uuid default null)
returns table (id uuid, item_id uuid, name text, category text, image_url text, charges int, use_text text,
               quantity int, max_per_character int, taken int)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, m.id, m.name, m.category, m.image_url, m.charges, m.use_text, s.quantity, s.max_per_character,
         coalesce((select t.taken from public.room_stash_takes t
                   where t.stash_id = s.id and t.character_id = p_character and public.owns_character(p_character)), 0)
  from public.room_stash s
  join public.market_items m on m.id = s.item_id
  where s.room_id = p_room and public.can_enter_room(p_room)
  order by m.category, m.name;
$$;

-- Lo staff mette degli oggetti nella cassa (se c'è già, si sommano)
create or replace function public.room_stash_add(p_room uuid, p_item uuid, p_qty int, p_max int default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  it public.market_items;
  v_char uuid;
begin
  if not public.has_permission('chat.cassa') then
    raise exception 'Non hai il permesso di gestire la cassa comune.' using errcode = '42501';
  end if;
  if not public.can_enter_room(p_room) then
    raise exception 'Non puoi entrare in questa chat.' using errcode = '42501';
  end if;
  if coalesce(p_qty, 0) not between 1 and 999 then
    raise exception 'La quantità va da 1 a 999.' using errcode = 'P0001';
  end if;
  select * into it from public.market_items where id = p_item;
  if it.id is null then
    raise exception 'Oggetto non trovato.' using errcode = 'P0001';
  end if;

  insert into public.room_stash (room_id, item_id, quantity, max_per_character)
  values (p_room, p_item, p_qty, p_max)
  on conflict (room_id, item_id) do update
    set quantity = least(999, public.room_stash.quantity + excluded.quantity),
        max_per_character = excluded.max_per_character;

  -- in chat, se chi la riempie è in giocata qui con un suo personaggio
  select p.character_id into v_char
  from public.chat_presence p join public.characters c on c.id = p.character_id
  where p.room_id = p_room and c.owner_id = auth.uid()
  limit 1;
  if v_char is not null then
    insert into public.messages (room_id, character_id, kind, content)
    values (p_room, v_char, 'sistema', 'mette nella cassa comune ' || p_qty || ' × ' || it.name || '.');
  end if;
end;
$$;

-- Lo staff cambia quantità e massimo (0 = toglie dalla cassa)
create or replace function public.room_stash_set(p_stash uuid, p_qty int, p_max int default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room uuid;
begin
  if not public.has_permission('chat.cassa') then
    raise exception 'Non hai il permesso di gestire la cassa comune.' using errcode = '42501';
  end if;
  select room_id into v_room from public.room_stash where id = p_stash;
  if v_room is null or not public.can_enter_room(v_room) then
    raise exception 'Oggetto della cassa non trovato.' using errcode = 'P0001';
  end if;
  if coalesce(p_qty, 0) <= 0 then
    delete from public.room_stash where id = p_stash;
  else
    update public.room_stash set quantity = least(999, p_qty), max_per_character = p_max where id = p_stash;
  end if;
end;
$$;

-- Un personaggio in giocata prende un oggetto dalla cassa
create or replace function public.room_stash_take(p_room uuid, p_character uuid, p_stash uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.room_stash;
  it public.market_items;
  v_taken int;
begin
  if not public.owns_character(p_character) then
    raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501';
  end if;
  if not public.can_enter_room(p_room) then
    raise exception 'Non puoi entrare in questa chat.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.chat_presence where room_id = p_room and character_id = p_character) then
    raise exception 'Prima entra in giocata.' using errcode = 'P0001';
  end if;
  select * into s from public.room_stash where id = p_stash and room_id = p_room for update;
  if s.id is null then
    raise exception 'Nella cassa non c''è più.' using errcode = 'P0001';
  end if;
  v_taken := coalesce((select t.taken from public.room_stash_takes t where t.stash_id = s.id and t.character_id = p_character), 0);
  if s.max_per_character is not null and v_taken >= s.max_per_character then
    raise exception 'Ne hai già presi % (il massimo per personaggio).', v_taken using errcode = 'P0001';
  end if;
  select * into it from public.market_items where id = s.item_id;

  insert into public.character_items (character_id, item_id, name, category, image_url, charges_left, use_text, effect, black_market, price_paid, upkeep)
  values (p_character, it.id, it.name, it.category, it.image_url, it.charges, it.use_text, it.effect, it.black_market, 0, 0);

  insert into public.room_stash_takes (stash_id, character_id, taken) values (s.id, p_character, 1)
  on conflict (stash_id, character_id) do update set taken = public.room_stash_takes.taken + 1;

  if s.quantity <= 1 then
    delete from public.room_stash where id = s.id;
  else
    update public.room_stash set quantity = quantity - 1 where id = s.id;
  end if;

  insert into public.messages (room_id, character_id, kind, content)
  values (p_room, p_character, 'sistema', 'prende ' || it.name || ' dalla cassa comune.');
end;
$$;

revoke execute on function public.room_stash_list(uuid, uuid) from public, anon;
revoke execute on function public.room_stash_add(uuid, uuid, int, int) from public, anon;
revoke execute on function public.room_stash_set(uuid, int, int) from public, anon;
revoke execute on function public.room_stash_take(uuid, uuid, uuid) from public, anon;
grant execute on function public.room_stash_list(uuid, uuid) to authenticated;
grant execute on function public.room_stash_add(uuid, uuid, int, int) to authenticated;
grant execute on function public.room_stash_set(uuid, int, int) to authenticated;
grant execute on function public.room_stash_take(uuid, uuid, uuid) to authenticated;

-- Tempo reale: il pulsante della cassa compare e si aggiorna da solo
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'room_stash') then
    alter publication supabase_realtime add table public.room_stash;
  end if;
end;
$$;

-- =====================================================================
-- CHAT PRIVATA CON PASSWORD (dalla mappa)
-- Sotto la mappa si scrive una password: se nessuna chat la usa, se ne
-- crea una nuova; se esiste già, ci si entra. Nessun altro la vede né ci
-- entra (neppure i moderatori) senza la stessa password, sulla stessa mappa.
-- Funziona come una chat normale. Quando non c'è più nessuno e l'ultimo
-- messaggio è più vecchio della durata dei messaggi (chat_ttl, 1 ora)
-- la chat "si autodistrugge": la password si libera e la stanza sparisce.
-- I messaggi restano nei log (Gestione → Log, permesso chat.log).
-- =====================================================================

alter table public.rooms drop constraint if exists rooms_access_check;
alter table public.rooms add constraint rooms_access_check check (access in ('pubblica', 'su_invito', 'password'));
alter table public.rooms add column if not exists destroyed_at timestamptz;

-- Impronta della password (mai la password in chiaro): nessuno la legge
create table public.room_secrets (
  room_id uuid primary key references public.rooms (id) on delete cascade,
  map_id uuid not null references public.maps (id) on delete cascade,
  secret_hash text not null,
  created_at timestamptz not null default now()
);
create unique index room_secrets_hash_key on public.room_secrets (map_id, secret_hash);
alter table public.room_secrets enable row level security;
revoke all on public.room_secrets from anon, authenticated;
create policy "Password delle chat: nessun accesso diretto" on public.room_secrets for select to authenticated using (false);

-- Chi ha inserito la password giusta (può vedere la chat ed entrarci)
create table public.room_keys (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index room_keys_user_idx on public.room_keys (user_id);
alter table public.room_keys enable row level security;
revoke all on public.room_keys from anon, authenticated;
grant select on public.room_keys to authenticated;
create policy "Chiavi delle chat: le proprie" on public.room_keys for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.has_room_key(r uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.room_keys k join public.rooms ro on ro.id = k.room_id
    where k.room_id = r and k.user_id = auth.uid() and ro.destroyed_at is null
  );
$$;
revoke execute on function public.has_room_key(uuid) from public, anon;
grant execute on function public.has_room_key(uuid) to authenticated;

-- Chi può entrare: le chat con password solo con la chiave (anche per i moderatori)
create or replace function public.can_enter_room(r uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (select 1 from public.rooms where id = r and access = 'password') then public.has_room_key(r)
    when public.has_permission('chat.moderare') then exists (select 1 from public.rooms where id = r)
    when not public.room_on_active_map(r) then false
    else coalesce((
      select case ro.access
        when 'pubblica' then true
        when 'su_invito' then public.room_controller(r) is not null or public.is_room_guest(r)
        else false
      end
      from public.rooms ro where ro.id = r), false)
  end;
$$;

-- Le chat con password le vede solo chi ha la chiave (e lo staff per gestione e log)
alter policy "Chat: visibili sulle mappe attive" on public.rooms
  using (
    (access <> 'password' and (select public.room_on_active_map(id)))
    or (access = 'password' and (select public.has_room_key(id)))
    or (select public.has_permission('mondo.gestire'))
    or (select public.has_permission('chat.log'))
  );

-- Autodistruzione: nessuno dentro e niente di nuovo da più della durata dei messaggi
create or replace function public.purge_secret_rooms()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select ro.id from public.rooms ro
    where ro.access = 'password' and ro.destroyed_at is null
      and not exists (
        select 1 from public.chat_presence p
        where p.room_id = ro.id and p.last_active_at > now() - public.chat_idle()
      )
      and coalesce((select max(m.created_at) from public.messages m where m.room_id = ro.id), ro.created_at) < now() - public.chat_ttl()
  loop
    delete from public.chat_presence where room_id = r.id;
    delete from public.room_keys where room_id = r.id;
    delete from public.room_secrets where room_id = r.id;
    update public.rooms set destroyed_at = now(), is_open = false where id = r.id;
  end loop;
end;
$$;
revoke execute on function public.purge_secret_rooms() from public, anon, authenticated;

-- Apre (o crea) la chat con questa password sulla mappa
create or replace function public.open_secret_room(p_map uuid, p_password text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pass text := btrim(coalesce(p_password, ''));
  v_hash text;
  v_room uuid;
  v_location uuid;
begin
  if auth.uid() is null then
    raise exception 'Devi essere collegato.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.characters where owner_id = auth.uid() and status = 'approvata'
  ) then
    raise exception 'Serve un personaggio approvato per giocare.' using errcode = '42501';
  end if;
  if char_length(v_pass) not between 4 and 64 then
    raise exception 'La password va da 4 a 64 caratteri.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.maps where id = p_map and active) then
    raise exception 'Mappa non valida.' using errcode = 'P0001';
  end if;
  perform public.purge_secret_rooms();
  v_hash := encode(sha256(convert_to(p_map::text || ':' || v_pass, 'UTF8')), 'hex');
  select room_id into v_room from public.room_secrets where map_id = p_map and secret_hash = v_hash;
  if v_room is null then
    -- la stanza sta nel primo quartiere della mappa (serve solo come collegamento)
    select id into v_location from public.locations where map_id = p_map order by sort_order, name limit 1;
    if v_location is null then
      raise exception 'Su questa mappa non ci sono quartieri.' using errcode = 'P0001';
    end if;
    insert into public.rooms (location_id, name, description, is_open, access, sort_order)
    values (v_location, 'Chat privata', 'Chat privata protetta da password.', true, 'password', 9999)
    returning id into v_room;
    insert into public.room_secrets (room_id, map_id, secret_hash) values (v_room, p_map, v_hash);
  end if;
  insert into public.room_keys (room_id, user_id) values (v_room, auth.uid()) on conflict do nothing;
  return v_room;
end;
$$;
revoke execute on function public.open_secret_room(uuid, text) from public, anon;
grant execute on function public.open_secret_room(uuid, text) to authenticated;

-- Pulizia automatica ogni 10 minuti (se pg_cron c'è; altrimenti la fa ogni nuova apertura)
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('chat-con-password', '*/10 * * * *', 'select public.purge_secret_rooms()');
exception when others then
  raise notice 'pg_cron non disponibile: %', sqlerrm;
end $$;

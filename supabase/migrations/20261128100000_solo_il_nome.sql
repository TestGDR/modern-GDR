-- =====================================================================
-- NOME E COGNOME: CONTA IL NOME
-- Il nome del personaggio è la prima parola (una parola sola: lettere,
-- apostrofo, punto o trattino, es. "Maria-Luisa"); il cognome è il resto.
-- - Il nome è unico in tutto il gioco (nessun altro PG può avere lo
--   stesso nome, anche con cognome diverso). I doppioni già esistenti
--   restano, ma non se ne creano di nuovi.
-- - Dove si cerca un PG per nome (messaggi OFF, inviti) basta il nome.
-- - Il sito mostra solo il nome ovunque tranne nella scheda.
-- =====================================================================

-- Il nome (prima parola) di un nome completo
create or replace function public.first_name(p_full text)
returns text
language sql
immutable
set search_path = ''
as $$
  select split_part(regexp_replace(btrim(coalesce(p_full, '')), '\s+', ' ', 'g'), ' ', 1)
$$;
grant execute on function public.first_name(text) to anon, authenticated;

create index if not exists profiles_first_name_idx on public.profiles (lower(public.first_name(username)));

-- Nome unico: alla registrazione e al cambio di nome
create or replace function public.check_unique_first_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and lower(public.first_name(new.username)) = lower(public.first_name(old.username)) then
    return new;
  end if;
  if exists (
    select 1 from public.profiles p
    where p.id <> new.id and lower(public.first_name(p.username)) = lower(public.first_name(new.username))
  ) then
    raise exception 'Esiste già un personaggio con il nome %: scegline un altro.', public.first_name(new.username) using errcode = '23505';
  end if;
  return new;
end;
$$;
revoke execute on function public.check_unique_first_name() from public, anon, authenticated;
drop trigger if exists profiles_unique_first_name on public.profiles;
create trigger profiles_unique_first_name before insert or update of username on public.profiles
  for each row execute function public.check_unique_first_name();

-- Cambio nome: il nome è una parola sola
create or replace function public.rename_character(p_first text, p_last text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_first text := btrim(coalesce(p_first, ''));
  v_last text := regexp_replace(btrim(coalesce(p_last, '')), '\s+', ' ', 'g');
  v_name text;
  v_profile public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Devi essere collegato.' using errcode = '42501';
  end if;
  select * into v_profile from public.profiles where id = auth.uid() for update;
  if not found then
    raise exception 'Profilo non trovato.' using errcode = 'P0001';
  end if;
  if v_profile.name_changed_at is not null then
    raise exception 'Hai già usato il cambio di nome: si può fare una volta sola.' using errcode = 'P0001';
  end if;
  if v_first = '' or v_last = '' then
    raise exception 'Scrivi sia il nome sia il cognome.' using errcode = 'P0001';
  end if;
  if v_first ~ '\s' then
    raise exception 'Il nome è una parola sola (per i nomi doppi usa il trattino, es. Maria-Luisa).' using errcode = 'P0001';
  end if;
  v_name := v_first || ' ' || v_last;
  if char_length(v_name) not between 3 and 40
     or v_name !~ '^[A-Za-zÀ-￿][A-Za-zÀ-￿ ''.-]*[A-Za-zÀ-￿]$' then
    raise exception 'Nome e cognome: da 3 a 40 caratteri in tutto, solo lettere, spazi, apostrofo, punto o trattino.' using errcode = 'P0001';
  end if;
  if v_name = v_profile.username then
    raise exception 'È uguale al nome attuale.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.profiles where lower(username) = lower(v_name) and id <> auth.uid())
     or exists (select 1 from public.characters where lower(name) = lower(v_name) and owner_id <> auth.uid()) then
    raise exception 'Esiste già un personaggio con questo nome.' using errcode = 'P0001';
  end if;

  update public.profiles set username = v_name, name_changed_at = now() where id = auth.uid();
  perform set_config('app.cambio_nome', 'on', true);
  update public.characters set name = v_name where owner_id = auth.uid();
  perform set_config('app.cambio_nome', 'off', true);
  return v_name;
end;
$$;
revoke execute on function public.rename_character(text, text) from public, anon;
grant execute on function public.rename_character(text, text) to authenticated;

-- Trova un giocatore: nome completo, oppure solo il nome (se è di una sola persona)
create or replace function public.find_player(p_name text)
returns table (user_id uuid, name text, avatar_url text, has_character boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with target as (
    select coalesce(
      (select p.id from public.profiles p where lower(p.username) = lower(btrim(p_name)) limit 1),
      (select min(p.id::text)::uuid from public.profiles p
        where lower(public.first_name(p.username)) = lower(btrim(p_name))
        having count(*) = 1)
    ) as id
  )
  select p.id, coalesce(c.name, p.username), c.avatar_url, c.id is not null
  from target t
  join public.profiles p on p.id = t.id
  left join public.characters c on c.owner_id = p.id and c.status = 'approvata'
  where auth.uid() is not null
  limit 1;
$$;

-- Invita in una chat su invito: basta il nome
create or replace function public.invite_to_room(p_room uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.room_controller(p_room);
  target uuid;
  n int;
begin
  if me is null and not public.has_permission('chat.moderare') then
    raise exception 'Non puoi invitare in questa chat.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.rooms where id = p_room and access = 'su_invito') then
    raise exception 'Questa chat è pubblica: non servono inviti.' using errcode = 'P0001';
  end if;
  select id into target from public.characters
  where lower(name) = lower(btrim(p_name)) and status = 'approvata' limit 1;
  if target is null then
    select count(*), min(id::text)::uuid into n, target from public.characters
    where lower(public.first_name(name)) = lower(btrim(p_name)) and status = 'approvata';
    if n > 1 then
      raise exception 'Più personaggi si chiamano così: scrivi anche il cognome.' using errcode = 'P0001';
    end if;
  end if;
  if target is null then
    raise exception 'Nessun personaggio approvato con questo nome.' using errcode = 'P0001';
  end if;
  insert into public.room_guests (room_id, character_id, invited_by)
  values (p_room, target, me)
  on conflict do nothing;
end;
$$;

-- Telefono: il nome mostrato di partenza è il nome del PG
create or replace function public.phone_create_number(p_character uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.characters;
  v_max int := greatest(1, coalesce(public.setting_int('max_numeri_telefono'), 3));
  v_digits text;
  v_id uuid;
  i int := 0;
begin
  select * into c from public.characters where id = p_character for update;
  if c.id is null or c.owner_id is distinct from auth.uid() or c.status <> 'approvata' then
    raise exception 'Il telefono si attiva solo con un tuo personaggio approvato.' using errcode = '42501';
  end if;
  if (select count(*) from public.phone_numbers where character_id = p_character) >= v_max then
    raise exception 'Hai già % numeri: è il massimo.', v_max using errcode = 'P0001';
  end if;
  loop
    i := i + 1;
    v_digits := '1' || (array['305', '786'])[1 + floor(random() * 2)::int]
                || (200 + floor(random() * 800))::int::text
                || lpad(floor(random() * 10000)::int::text, 4, '0');
    exit when not exists (select 1 from public.phone_numbers where digits = v_digits);
    if i > 50 then raise exception 'Riprova fra un attimo.' using errcode = 'P0001'; end if;
  end loop;
  insert into public.phone_numbers (character_id, digits, display_name, avatar_url)
  values (p_character, v_digits, left(public.first_name(c.name), 40), c.avatar_url)
  returning id into v_id;
  return v_id;
end;
$$;

-- I numeri che mostravano nome e cognome ora mostrano solo il nome
update public.phone_numbers n set display_name = left(public.first_name(c.name), 40)
from public.characters c
where c.id = n.character_id and n.display_name = c.name;

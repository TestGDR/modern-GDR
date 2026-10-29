-- =====================================================================
-- CAMBIO DI NOME E COGNOME (una sola volta)
-- Il nome del personaggio (profiles.username = characters.name) è anche
-- il nome di accesso. Il giocatore può cambiarlo una volta sola da
-- Utility → Cambio nome, con rename_character(). Nessun'altra strada.
-- =====================================================================

-- 1. Quando è stato usato il cambio (null = ancora disponibile)
alter table public.profiles add column if not exists name_changed_at timestamptz;

-- 2. Il nome non si scrive più direttamente
revoke update (username) on public.profiles from authenticated;

-- 3. Il nome della scheda resta uguale al nome di accesso
create or replace function public.protect_character_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- SQL Editor o chiave segreta: contesto fidato
  if (select auth.uid()) is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    -- la scheda nasce sempre con il nome scelto in registrazione
    select p.username into new.name from public.profiles p where p.id = new.owner_id;
    return new;
  end if;
  if new.name is distinct from old.name
     and current_setting('app.cambio_nome', true) is distinct from 'on' then
    raise exception 'Il nome si cambia solo da Utility → Cambio nome (una volta sola).' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.protect_character_name() from public, anon, authenticated;

drop trigger if exists characters_protect_name on public.characters;
create trigger characters_protect_name
  before insert or update of name on public.characters
  for each row execute function public.protect_character_name();

-- 4. Il cambio: nome e cognome, una volta sola
create or replace function public.rename_character(p_first text, p_last text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_first text := regexp_replace(btrim(coalesce(p_first, '')), '\s+', ' ', 'g');
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
  v_name := v_first || ' ' || v_last;
  -- stesse regole della registrazione: 3-40 caratteri, lettere (anche accentate), spazi, apostrofo, punto e trattino
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

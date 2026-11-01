-- =====================================================================
-- REGISTRAZIONE CON IL SOLO NOME, COGNOME IN CREAZIONE
-- - In registrazione si sceglie solo il nome del personaggio (una parola,
--   unico nel gioco): è il nome con cui si accede.
-- - Il cognome si scrive nella creazione del personaggio (passaggio 1,
--   Anagrafica) finché la scheda non è approvata: set_character_surname.
--   Il nome non cambia; non conta come "cambio di nome".
-- - Senza cognome la scheda non si può inviare.
-- =====================================================================

-- nomi di due lettere (es. "Al"): minimo 2 caratteri
alter table public.profiles drop constraint if exists profiles_username_check;
alter table public.profiles add constraint profiles_username_check check (char_length(username) between 2 and 40);
alter table public.characters drop constraint if exists characters_name_check;
alter table public.characters add constraint characters_name_check check (char_length(name) between 2 and 40);

-- Cognome del proprio personaggio, durante la creazione
create or replace function public.set_character_surname(p_character uuid, p_last text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.characters;
  v_first text;
  v_last text := regexp_replace(btrim(coalesce(p_last, '')), '\s+', ' ', 'g');
  v_name text;
begin
  select * into c from public.characters where id = p_character for update;
  if c.id is null or c.owner_id is distinct from auth.uid() then
    raise exception 'Scheda non trovata.' using errcode = '42501';
  end if;
  if c.status not in ('bozza', 'rifiutata') then
    raise exception 'Il cognome si sceglie durante la creazione: dopo l''invio si cambia solo da Utility → Cambio nome.' using errcode = 'P0001';
  end if;
  v_first := public.first_name(c.name);
  if v_last = '' then
    raise exception 'Scrivi il cognome.' using errcode = 'P0001';
  end if;
  v_name := v_first || ' ' || v_last;
  if char_length(v_name) > 40 or v_last !~ '^[A-Za-zÀ-￿][A-Za-zÀ-￿ ''.-]*$' then
    raise exception 'Cognome: solo lettere, spazi, apostrofo, punto o trattino (nome e cognome al massimo 40 caratteri).' using errcode = 'P0001';
  end if;
  if v_name = c.name then
    return v_name;
  end if;
  if exists (select 1 from public.profiles where lower(username) = lower(v_name) and id <> auth.uid())
     or exists (select 1 from public.characters where lower(name) = lower(v_name) and id <> c.id) then
    raise exception 'Esiste già un personaggio con questo nome e cognome.' using errcode = 'P0001';
  end if;

  update public.profiles set username = v_name where id = auth.uid();
  perform set_config('app.cambio_nome', 'on', true);
  update public.characters set name = v_name where id = c.id;
  perform set_config('app.cambio_nome', 'off', true);
  return v_name;
end;
$$;
revoke execute on function public.set_character_surname(uuid, text) from public, anon;
grant execute on function public.set_character_surname(uuid, text) to authenticated;

-- Senza cognome la scheda non parte
create or replace function public.characters_require_surname()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'in_attesa' and old.status is distinct from 'in_attesa'
     and position(' ' in btrim(new.name)) = 0 then
    raise exception 'Scrivi il cognome del personaggio (passaggio 1, Anagrafica).' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.characters_require_surname() from public, anon, authenticated;
drop trigger if exists characters_require_surname on public.characters;
create trigger characters_require_surname before update of status on public.characters
  for each row execute function public.characters_require_surname();

-- =====================================================================
-- PRESTATALENTO (come il prestavolto)
-- La persona reale che "presta il talento" al personaggio (es. la voce di
-- un cantante, il gioco di un atleta). Ognuno è unico in tutta la land:
-- il giocatore lo registra una volta sola; poi lo cambia o lo toglie
-- solo lo staff con "prestatalento.gestire".
-- =====================================================================

alter table public.characters
  add column if not exists talent_claim text check (char_length(talent_claim) between 2 and 80);
create unique index if not exists characters_talent_claim_lower_key
  on public.characters (lower(talent_claim)) where talent_claim is not null;

-- Una volta registrato, lo cambia solo lo staff
create or replace function public.lock_talent_claim()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then return new; end if; -- SQL Editor
  if current_setting('app.reset_scheda', true) = 'on' then return new; end if;
  if new.talent_claim is distinct from old.talent_claim
     and old.talent_claim is not null
     and not public.has_permission('prestatalento.gestire') then
    raise exception 'Il prestatalento, una volta registrato, lo cambia solo lo staff.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists characters_lock_talent_claim on public.characters;
create trigger characters_lock_talent_claim before update of talent_claim on public.characters
  for each row execute function public.lock_talent_claim();

-- Registra (giocatore, una volta) o cambia/toglie (staff) il prestatalento
create or replace function public.set_talent_claim(p_character uuid, p_talent_claim text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v text := nullif(regexp_replace(btrim(coalesce(p_talent_claim, '')), '\s+', ' ', 'g'), '');
  c public.characters;
  v_staff boolean := public.has_permission('prestatalento.gestire');
begin
  select * into c from public.characters where id = p_character for update;
  if not found then
    raise exception 'Personaggio non trovato.' using errcode = 'P0001';
  end if;
  if not v_staff then
    if c.owner_id is distinct from auth.uid() then
      raise exception 'Questo personaggio non è tuo.' using errcode = '42501';
    end if;
    if c.talent_claim is not null then
      raise exception 'Il prestatalento è già registrato: per cambiarlo scrivi alla gestione con un ticket.' using errcode = 'P0001';
    end if;
    if v is null then
      raise exception 'Scrivi il nome del prestatalento.' using errcode = 'P0001';
    end if;
  end if;
  if v is not null and char_length(v) not between 2 and 80 then
    raise exception 'Il prestatalento va da 2 a 80 caratteri.' using errcode = 'P0001';
  end if;
  if v is not null and exists (
    select 1 from public.characters where lower(talent_claim) = lower(v) and id <> p_character
  ) then
    raise exception 'Questo prestatalento è già registrato da un altro personaggio.' using errcode = 'P0001';
  end if;
  update public.characters set talent_claim = v where id = p_character;
end;
$$;
revoke execute on function public.set_talent_claim(uuid, text) from public, anon;
grant execute on function public.set_talent_claim(uuid, text) to authenticated;

-- Il reset dell'Amministratore cancella anche il prestatalento
create or replace function public.admin_reset_character(p_character uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.characters;
begin
  if not public.is_admin_user() then
    raise exception 'Solo l''Amministratore può resettare una scheda.' using errcode = '42501';
  end if;
  select * into c from public.characters where id = p_character for update;
  if c.id is null then raise exception 'Scheda non trovata.' using errcode = 'P0001'; end if;

  delete from public.character_skills where character_id = p_character;
  delete from public.character_attributes where character_id = p_character;
  delete from public.character_options where character_id = p_character;
  delete from public.bank_transactions where character_id = p_character;
  delete from public.bank_accounts where character_id = p_character;
  delete from public.phone_numbers where character_id = p_character;
  delete from public.character_jobs where character_id = p_character;
  delete from public.character_groups where character_id = p_character;
  perform public.admin_character_offline(p_character);

  perform set_config('app.reset_scheda', 'on', true);
  update public.characters
  set status = 'bozza', rejection_reason = null, creation_step = 1, px = 0,
      age = null, occupation = null, district_id = null, quote = null, bio = null,
      avatar_url = null, cover_url = null, cover_mobile_url = null,
      appearance = null, traits = null, skills = null,
      known_facts = null, relationships = null, equipment = null,
      sex = null, birth_date = null, nationality = null,
      study_track_id = null, year_id = null, club_id = null, minor_id = null,
      height = null, weight = null, eye_color = null, hair_color = null,
      face_claim = null, talent_claim = null, review_ticket_id = null
  where id = p_character;
  perform set_config('app.reset_scheda', 'off', true);

  perform public.send_system_message(c.owner_id,
    'Lo staff ha resettato la scheda di ' || c.name || ': ricomincia dalla creazione, dal primo passaggio.'
    || E'\nFinché non viene approvata il personaggio non può giocare.');
end;
$$;
revoke execute on function public.admin_reset_character(uuid) from public, anon;
grant execute on function public.admin_reset_character(uuid) to authenticated;

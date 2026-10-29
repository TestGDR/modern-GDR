-- =====================================================================
-- AMMINISTRAZIONE DELLE SCHEDE (solo l'Amministratore)
--
-- - Sblocca: la scheda torna in bozza con tutti i dati; il giocatore la
--   corregge e la rimanda in approvazione.
-- - Resetta: la scheda torna al passaggio 1 della creazione, vuota. Si
--   cancella tutto: caratteristiche, abilità, scelte, testi, immagini,
--   prestavolto, PX, conto in banca, numeri di telefono, lavori, gruppi.
--   Resta solo il nome (è il nome dell'account).
-- - Modifica completa: caratteristiche, abilità e scelte in un colpo solo
--   (gli altri campi li scrive il pannello con i permessi già esistenti).
-- Finché la scheda non è riapprovata il personaggio non gioca.
-- =====================================================================

-- Toglie il personaggio dalle chat in cui si trova
create or replace function public.admin_character_offline(p_character uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.chat_presence where character_id = p_character;
$$;
revoke execute on function public.admin_character_offline(uuid) from public, anon, authenticated;

create or replace function public.admin_unlock_character(p_character uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.characters;
begin
  if not public.is_admin_user() then
    raise exception 'Solo l''Amministratore può sbloccare una scheda.' using errcode = '42501';
  end if;
  select * into c from public.characters where id = p_character for update;
  if c.id is null then raise exception 'Scheda non trovata.' using errcode = 'P0001'; end if;
  if c.status = 'bozza' then raise exception 'La scheda è già in bozza.' using errcode = 'P0001'; end if;
  update public.characters
  set status = 'bozza', rejection_reason = null, creation_step = 6
  where id = p_character;
  perform public.admin_character_offline(p_character);
  perform public.send_system_message(c.owner_id,
    'Lo staff ha sbloccato la scheda di ' || c.name || '. Puoi modificarla da Scheda e inviarla di nuovo in approvazione.'
    || E'\nFinché non viene riapprovata il personaggio non può giocare.');
end;
$$;

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

  -- valori di gioco
  delete from public.character_skills where character_id = p_character;
  delete from public.character_attributes where character_id = p_character;
  delete from public.character_options where character_id = p_character;
  -- banca, telefono, lavori, gruppi, presenza in chat
  delete from public.bank_transactions where character_id = p_character;
  delete from public.bank_accounts where character_id = p_character;
  delete from public.phone_numbers where character_id = p_character;
  delete from public.character_jobs where character_id = p_character;
  delete from public.character_groups where character_id = p_character;
  perform public.admin_character_offline(p_character);

  -- scheda vuota, di nuovo al passaggio 1
  update public.characters
  set status = 'bozza', rejection_reason = null, creation_step = 1, px = 0,
      age = null, occupation = null, district_id = null, quote = null, bio = null,
      avatar_url = null, cover_url = null, appearance = null, traits = null, skills = null,
      known_facts = null, relationships = null, equipment = null,
      sex = null, birth_date = null, nationality = null,
      study_track_id = null, year_id = null, club_id = null,
      face_claim = null, review_ticket_id = null
  where id = p_character;

  perform public.send_system_message(c.owner_id,
    'Lo staff ha resettato la scheda di ' || c.name || ': ricomincia dalla creazione, dal primo passaggio.'
    || E'\nFinché non viene approvata il personaggio non può giocare.');
end;
$$;

-- Caratteristiche, abilità e scelte decise dall'Amministratore (senza i
-- limiti dei punti della creazione; un'abilità resta al massimo pari alla
-- sua caratteristica)
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

  delete from public.character_options where character_id = p_character;
  insert into public.character_options (character_id, option_id)
  select p_character, o.id from public.creation_options o where o.id = any (coalesce(p_options, '{}'));
end;
$$;

revoke execute on function public.admin_unlock_character(uuid), public.admin_reset_character(uuid),
  public.admin_set_build(uuid, jsonb, jsonb, uuid[]) from public, anon;
grant execute on function public.admin_unlock_character(uuid), public.admin_reset_character(uuid),
  public.admin_set_build(uuid, jsonb, jsonb, uuid[]) to authenticated;

-- Riapprovata dopo uno sblocco: niente stipendi per i mesi in cui era bloccata
create or replace function public.characters_open_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'approvata' and old.status is distinct from 'approvata' then
    update public.bank_accounts
    set salary_paid_until = greatest(salary_paid_until, public.bank_today())
    where character_id = new.id;
    perform public.bank_settle_internal(new.id);
  end if;
  return new;
end;
$$;
revoke execute on function public.characters_open_account() from public, anon, authenticated;

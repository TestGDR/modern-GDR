-- =====================================================================
-- SCHEDA: IMMAGINE VERTICALE PER IL CELLULARE
-- In Principale, sul telefono si vede questa (720x1280, 9:16) al posto
-- dell'immagine orizzontale del computer (640x560).
-- =====================================================================

alter table public.characters
  add column cover_mobile_url text check (char_length(cover_mobile_url) <= 500);

-- Il reset dell'Amministratore cancella anche questa immagine
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

  update public.characters
  set status = 'bozza', rejection_reason = null, creation_step = 1, px = 0,
      age = null, occupation = null, district_id = null, quote = null, bio = null,
      avatar_url = null, cover_url = null, cover_mobile_url = null,
      appearance = null, traits = null, skills = null,
      known_facts = null, relationships = null, equipment = null,
      sex = null, birth_date = null, nationality = null,
      study_track_id = null, year_id = null, club_id = null, minor_id = null,
      height = null, weight = null, eye_color = null, hair_color = null,
      face_claim = null, review_ticket_id = null
  where id = p_character;

  perform public.send_system_message(c.owner_id,
    'Lo staff ha resettato la scheda di ' || c.name || ': ricomincia dalla creazione, dal primo passaggio.'
    || E'\nFinché non viene approvata il personaggio non può giocare.');
end;
$$;

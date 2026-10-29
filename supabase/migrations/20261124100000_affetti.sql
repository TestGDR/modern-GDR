-- =====================================================================
-- SCHEDA → AFFETTI
-- Il proprietario della scheda aggiunge gli utenti registrati a cui il
-- personaggio è legato, ognuno con una frase o dedica (HTML dell'editor,
-- ripulito nel browser prima di mostrarlo). Li leggono tutti i giocatori
-- collegati, come il resto della scheda.
-- =====================================================================

create table public.character_affections (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters (id) on delete cascade,
  target_user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null default '' check (char_length(body) <= 8000),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (character_id, target_user_id)
);
create index character_affections_target_idx on public.character_affections (target_user_id);

-- Chi può modificare gli affetti di una scheda: il proprietario o lo staff delle schede
create or replace function public.can_edit_affections(p_character uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.characters c
    where c.id = p_character
      and (c.owner_id = auth.uid() or public.has_permission('personaggi.modificare_tutti'))
  )
$$;
revoke execute on function public.can_edit_affections(uuid) from public, anon;
grant execute on function public.can_edit_affections(uuid) to authenticated;

-- Non si aggiunge sé stessi
create or replace function public.check_affection()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.characters c where c.id = new.character_id and c.owner_id = new.target_user_id) then
    raise exception 'Non puoi aggiungere te stesso agli affetti.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger character_affections_check before insert or update of target_user_id, character_id on public.character_affections
  for each row execute function public.check_affection();

alter table public.character_affections enable row level security;
revoke all on public.character_affections from anon, authenticated;
grant select, delete on public.character_affections to authenticated;
grant insert (character_id, target_user_id, body, sort_order) on public.character_affections to authenticated;
grant update (body, sort_order) on public.character_affections to authenticated;

create policy "Affetti: li leggono i giocatori collegati" on public.character_affections for select to authenticated
  using (true);
create policy "Affetti: si aggiungono alla propria scheda" on public.character_affections for insert to authenticated
  with check ((select public.can_edit_affections(character_id)));
create policy "Affetti: si modificano sulla propria scheda" on public.character_affections for update to authenticated
  using ((select public.can_edit_affections(character_id)))
  with check ((select public.can_edit_affections(character_id)));
create policy "Affetti: si tolgono dalla propria scheda" on public.character_affections for delete to authenticated
  using ((select public.can_edit_affections(character_id)));

-- Il reset dell'Amministratore cancella anche gli affetti
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
  delete from public.character_affections where character_id = p_character;
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

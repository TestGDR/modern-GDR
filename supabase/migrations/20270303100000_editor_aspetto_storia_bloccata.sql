-- =====================================================================
-- SCHEDA: EDITOR PER «SI SA CHE» E «ASPETTO», STORIA SOLO DALLO STAFF
-- 1. «Si sa che» e «Aspetto» si scrivono con l'editor (HTML, ripulito da
--    DOMPurify in lettura): il limite sale da 3.000 a 20.000 caratteri.
-- 2. La Storia di una scheda inviata o approvata la cambia solo
--    l'Amministratore (in creazione e dopo uno sblocco il giocatore la
--    scrive come sempre).
-- =====================================================================

alter table public.characters drop constraint if exists characters_appearance_check;
alter table public.characters add constraint characters_appearance_check check (char_length(appearance) <= 20000);
alter table public.characters drop constraint if exists characters_known_facts_check;
alter table public.characters add constraint characters_known_facts_check check (char_length(known_facts) <= 20000);

create or replace function public.characters_bio_lock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.bio is distinct from old.bio
     and old.status in ('in_attesa', 'approvata')
     and auth.uid() is not null
     and not public.is_admin_user() then
    raise exception 'La storia del personaggio la modifica solo l''Amministratore.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.characters_bio_lock() from public, anon, authenticated;
drop trigger if exists characters_bio_lock on public.characters;
create trigger characters_bio_lock before update of bio on public.characters
  for each row execute function public.characters_bio_lock();

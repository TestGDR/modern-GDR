-- =====================================================================
-- 03 · PERSONAGGI
-- Un personaggio per utente. Chiunque sia registrato può vedere le schede;
-- solo il proprietario (o lo staff) può modificarle.
-- =====================================================================

create table public.characters (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null unique check (char_length(name) between 3 and 40),
  age smallint check (age between 16 and 99),
  occupation text check (char_length(occupation) <= 60),
  district_id uuid references public.districts (id) on delete set null,
  quote text check (char_length(quote) <= 140),
  bio text check (char_length(bio) <= 5000),
  avatar_url text check (char_length(avatar_url) <= 500),
  -- caratteristiche (1-10), massimo 28 punti in totale
  physique smallint not null default 5 check (physique between 1 and 10),
  cunning smallint not null default 5 check (cunning between 1 and 10),
  charisma smallint not null default 5 check (charisma between 1 and 10),
  driving smallint not null default 5 check (driving between 1 and 10),
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint characters_one_per_user unique (owner_id),
  constraint characters_stats_budget check (physique + cunning + charisma + driving <= 28)
);

comment on constraint characters_one_per_user on public.characters
  is 'Un solo personaggio per utente. Rimuovere il vincolo per permetterne di più.';

create index characters_district_id_idx on public.characters (district_id);

create trigger characters_set_updated_at
  before update on public.characters
  for each row execute function public.set_updated_at();

-- Dopo la creazione le caratteristiche le cambia solo lo staff
create or replace function public.protect_character_stats()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_staff() and (
    new.physique is distinct from old.physique
    or new.cunning is distinct from old.cunning
    or new.charisma is distinct from old.charisma
    or new.driving is distinct from old.driving
  ) then
    raise exception 'Le caratteristiche possono essere modificate solo dallo staff';
  end if;
  return new;
end;
$$;

create trigger characters_protect_stats
  before update on public.characters
  for each row execute function public.protect_character_stats();

-- Il personaggio appartiene all'utente corrente?
-- Usata dalle policy di chat, messaggi, forum e social.
create or replace function public.owns_character(p_character_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.characters
    where id = p_character_id
      and owner_id = (select auth.uid())
  );
$$;

alter table public.characters enable row level security;

grant select, insert, update, delete on public.characters to authenticated;

create policy "Personaggi: lettura per utenti registrati"
  on public.characters for select
  to authenticated
  using (true);

create policy "Personaggi: ognuno crea il proprio"
  on public.characters for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

create policy "Personaggi: modifica del proprietario o dello staff"
  on public.characters for update
  to authenticated
  using (owner_id = (select auth.uid()) or (select public.is_staff()))
  with check (owner_id = (select auth.uid()) or (select public.is_staff()));

create policy "Personaggi: eliminazione del proprietario o dello staff"
  on public.characters for delete
  to authenticated
  using (owner_id = (select auth.uid()) or (select public.is_staff()));

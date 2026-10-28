-- =====================================================================
-- 01 · PROFILI UTENTE E RUOLI
-- Un profilo (account OFF game) per ogni utente registrato.
-- Il profilo viene creato in automatico alla registrazione.
-- =====================================================================

create type public.user_role as enum ('player', 'master', 'admin');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (char_length(username) between 3 and 24),
  role public.user_role not null default 'player',
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'Account OFF game degli utenti. Il ruolo si cambia solo dalla dashboard o dall''SQL Editor.';

alter table public.profiles enable row level security;

-- ---------------------------------------------------------------------
-- Funzioni di supporto
-- ---------------------------------------------------------------------

-- L'utente corrente fa parte dello staff (master o admin)?
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role in ('master', 'admin')
  );
$$;

-- Aggiorna la colonna updated_at a ogni modifica
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Crea il profilo quando un utente si registra.
-- Lo username arriva dai metadati della registrazione (options.data.username).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'username'), ''),
      'utente_' || left(replace(new.id::text, '-', ''), 8)
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Permessi e policy
-- ---------------------------------------------------------------------

-- Supabase concede di default tutti i permessi: li togliamo e
-- ridiamo solo quelli necessari. Lo username è modificabile, il ruolo no.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (username) on public.profiles to authenticated;

create policy "Profili: lettura per utenti registrati"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Profili: ognuno modifica il proprio"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Nessuna policy di insert/delete: il profilo lo crea il trigger
-- e viene cancellato insieme all'account.

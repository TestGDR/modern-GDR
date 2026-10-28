-- =====================================================================
-- 06 · FORUM
-- Sezioni (On Game / Off Game) → bacheche → discussioni → messaggi.
-- Il forum è leggibile anche da chi non è registrato (es. il regolamento).
-- Scrivono gli utenti registrati; lo staff modera, fissa e chiude.
-- =====================================================================

create table public.forum_sections (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 60),
  is_on_game boolean not null default true,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);

create table public.forum_boards (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.forum_sections (id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null check (char_length(name) between 2 and 80),
  description text check (char_length(description) <= 300),
  -- se true, solo lo staff può aprire discussioni (es. Regolamento)
  staff_only boolean not null default false,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);

create table public.forum_threads (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.forum_boards (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  -- facoltativo: nelle bacheche On Game si scrive come personaggio
  character_id uuid references public.characters (id) on delete set null,
  title text not null check (char_length(title) between 3 and 120),
  is_pinned boolean not null default false,
  is_locked boolean not null default false,
  created_at timestamptz not null default now(),
  -- ultima attività (aggiornata a ogni nuovo messaggio)
  updated_at timestamptz not null default now()
);

create table public.forum_posts (
  id bigint generated always as identity primary key,
  thread_id uuid not null references public.forum_threads (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  character_id uuid references public.characters (id) on delete set null,
  body text not null check (char_length(trim(body)) between 1 and 20000),
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

create index forum_boards_section_id_idx on public.forum_boards (section_id);
create index forum_threads_board_idx on public.forum_threads (board_id, is_pinned desc, updated_at desc);
create index forum_threads_author_id_idx on public.forum_threads (author_id);
create index forum_threads_character_id_idx on public.forum_threads (character_id);
create index forum_posts_thread_idx on public.forum_posts (thread_id, created_at);
create index forum_posts_author_id_idx on public.forum_posts (author_id);
create index forum_posts_character_id_idx on public.forum_posts (character_id);

-- ---------------------------------------------------------------------
-- Trigger
-- ---------------------------------------------------------------------

-- Solo lo staff può fissare o chiudere una discussione
create or replace function public.protect_thread_flags()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_staff() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.is_pinned = false;
    new.is_locked = false;
  elsif new.is_pinned is distinct from old.is_pinned
     or new.is_locked is distinct from old.is_locked then
    raise exception 'Solo lo staff può fissare o chiudere una discussione';
  end if;
  return new;
end;
$$;

create trigger forum_threads_protect_flags
  before insert or update on public.forum_threads
  for each row execute function public.protect_thread_flags();

-- Un nuovo messaggio aggiorna l'ultima attività della discussione
create or replace function public.bump_thread_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.forum_threads
  set updated_at = now()
  where id = new.thread_id;
  return new;
end;
$$;

create trigger forum_posts_bump_thread
  after insert on public.forum_posts
  for each row execute function public.bump_thread_activity();

-- Segna la data di modifica quando si corregge un messaggio
create or replace function public.set_edited_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.body is distinct from old.body then
    new.edited_at = now();
  end if;
  return new;
end;
$$;

create trigger forum_posts_set_edited_at
  before update on public.forum_posts
  for each row execute function public.set_edited_at();

-- ---------------------------------------------------------------------
-- Permessi e policy
-- ---------------------------------------------------------------------

alter table public.forum_sections enable row level security;
alter table public.forum_boards enable row level security;
alter table public.forum_threads enable row level security;
alter table public.forum_posts enable row level security;

grant select on public.forum_sections, public.forum_boards, public.forum_threads, public.forum_posts to anon, authenticated;
grant insert, update, delete on public.forum_sections, public.forum_boards, public.forum_threads, public.forum_posts to authenticated;

-- Sezioni
create policy "Forum sezioni: lettura per tutti"
  on public.forum_sections for select to anon, authenticated using (true);
create policy "Forum sezioni: lo staff le crea"
  on public.forum_sections for insert to authenticated with check ((select public.is_staff()));
create policy "Forum sezioni: lo staff le modifica"
  on public.forum_sections for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
create policy "Forum sezioni: lo staff le elimina"
  on public.forum_sections for delete to authenticated using ((select public.is_staff()));

-- Bacheche
create policy "Forum bacheche: lettura per tutti"
  on public.forum_boards for select to anon, authenticated using (true);
create policy "Forum bacheche: lo staff le crea"
  on public.forum_boards for insert to authenticated with check ((select public.is_staff()));
create policy "Forum bacheche: lo staff le modifica"
  on public.forum_boards for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
create policy "Forum bacheche: lo staff le elimina"
  on public.forum_boards for delete to authenticated using ((select public.is_staff()));

-- Discussioni
create policy "Forum discussioni: lettura per tutti"
  on public.forum_threads for select to anon, authenticated using (true);

create policy "Forum discussioni: gli utenti registrati le aprono"
  on public.forum_threads for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and (character_id is null or public.owns_character(character_id))
    and (
      (select public.is_staff())
      or not exists (
        select 1 from public.forum_boards b
        where b.id = board_id and b.staff_only
      )
    )
  );

create policy "Forum discussioni: modifica dell'autore o dello staff"
  on public.forum_threads for update
  to authenticated
  using (author_id = (select auth.uid()) or (select public.is_staff()))
  with check (author_id = (select auth.uid()) or (select public.is_staff()));

create policy "Forum discussioni: lo staff le elimina"
  on public.forum_threads for delete
  to authenticated
  using ((select public.is_staff()));

-- Messaggi
create policy "Forum messaggi: lettura per tutti"
  on public.forum_posts for select to anon, authenticated using (true);

create policy "Forum messaggi: si risponde nelle discussioni aperte"
  on public.forum_posts for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and (character_id is null or public.owns_character(character_id))
    and (
      (select public.is_staff())
      or exists (
        select 1 from public.forum_threads t
        where t.id = thread_id and not t.is_locked
      )
    )
  );

create policy "Forum messaggi: modifica dell'autore o dello staff"
  on public.forum_posts for update
  to authenticated
  using (author_id = (select auth.uid()) or (select public.is_staff()))
  with check (author_id = (select auth.uid()) or (select public.is_staff()));

create policy "Forum messaggi: eliminazione dell'autore o dello staff"
  on public.forum_posts for delete
  to authenticated
  using (author_id = (select auth.uid()) or (select public.is_staff()));

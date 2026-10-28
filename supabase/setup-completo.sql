-- =====================================================================
-- SETUP COMPLETO DEL DATABASE (Modern GDR)
-- Unione, nell'ordine, dei file in supabase/migrations/ (dal 01 al 09).
-- Da eseguire UNA SOLA VOLTA su un database vuoto:
-- Supabase > SQL Editor > New query > incolla tutto > Run.
-- Le modifiche future vanno in nuove migrazioni, non in questo file.
-- =====================================================================

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


-- =====================================================================
-- 02 · MAPPA: QUARTIERI E LUOGHI DI GIOCO
-- I quartieri di Miami e i luoghi (le stanze di chat) dentro ognuno.
-- Li legge chiunque, li gestisce solo lo staff.
-- =====================================================================

create table public.districts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null check (char_length(name) between 2 and 60),
  tagline text check (char_length(tagline) <= 120),
  -- posizione del pin sulla mappa (viewBox 0 0 300 400)
  map_x smallint not null default 150 check (map_x between 0 and 300),
  map_y smallint not null default 200 check (map_y between 0 and 400),
  -- classi Tailwind della sfumatura (es. 'from-violet via-flamingo to-sand')
  gradient text not null default 'from-violet via-flamingo to-peach',
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);

create table public.places (
  id uuid primary key default gen_random_uuid(),
  district_id uuid not null references public.districts (id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null check (char_length(name) between 2 and 80),
  description text check (char_length(description) <= 500),
  is_open boolean not null default true,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);

create index places_district_id_idx on public.places (district_id);

alter table public.districts enable row level security;
alter table public.places enable row level security;

grant select on public.districts, public.places to anon, authenticated;
grant insert, update, delete on public.districts, public.places to authenticated;

-- Quartieri
create policy "Quartieri: lettura per tutti"
  on public.districts for select
  to anon, authenticated
  using (true);

create policy "Quartieri: lo staff li crea"
  on public.districts for insert
  to authenticated
  with check ((select public.is_staff()));

create policy "Quartieri: lo staff li modifica"
  on public.districts for update
  to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

create policy "Quartieri: lo staff li elimina"
  on public.districts for delete
  to authenticated
  using ((select public.is_staff()));

-- Luoghi
create policy "Luoghi: lettura per tutti"
  on public.places for select
  to anon, authenticated
  using (true);

create policy "Luoghi: lo staff li crea"
  on public.places for insert
  to authenticated
  with check ((select public.is_staff()));

create policy "Luoghi: lo staff li modifica"
  on public.places for update
  to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

create policy "Luoghi: lo staff li elimina"
  on public.places for delete
  to authenticated
  using ((select public.is_staff()));


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


-- =====================================================================
-- 04 · CHAT DI GIOCO
-- I messaggi delle scene nei luoghi. Ogni messaggio ha un'azione
-- (in terza persona) e/o un parlato. Arrivano in tempo reale (Realtime).
-- =====================================================================

create table public.chat_messages (
  id bigint generated always as identity primary key,
  place_id uuid not null references public.places (id) on delete cascade,
  character_id uuid not null references public.characters (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  action text check (char_length(action) <= 4000),
  speech text check (char_length(speech) <= 2000),
  created_at timestamptz not null default now(),
  constraint chat_messages_not_empty
    check (coalesce(trim(action), '') <> '' or coalesce(trim(speech), '') <> '')
);

create index chat_messages_place_created_idx on public.chat_messages (place_id, created_at desc);
create index chat_messages_character_id_idx on public.chat_messages (character_id);
create index chat_messages_author_id_idx on public.chat_messages (author_id);

alter table public.chat_messages enable row level security;

-- I messaggi di chat non si modificano: solo lettura, invio ed eliminazione
revoke all on public.chat_messages from anon, authenticated;
grant select, insert, delete on public.chat_messages to authenticated;

create policy "Chat: lettura per utenti registrati"
  on public.chat_messages for select
  to authenticated
  using (true);

create policy "Chat: si scrive col proprio personaggio nei luoghi aperti"
  on public.chat_messages for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and public.owns_character(character_id)
    and exists (
      select 1 from public.places p
      where p.id = place_id and p.is_open
    )
  );

create policy "Chat: eliminazione dell'autore o dello staff"
  on public.chat_messages for delete
  to authenticated
  using (author_id = (select auth.uid()) or (select public.is_staff()));

-- Tempo reale
alter publication supabase_realtime add table public.chat_messages;


-- =====================================================================
-- 05 · MESSAGGI PRIVATI
-- Messaggi tra personaggi. Li possono leggere SOLO mittente e destinatario
-- (nemmeno lo staff). Il destinatario può solo segnarli come letti.
-- =====================================================================

create table public.private_messages (
  id bigint generated always as identity primary key,
  sender_id uuid not null references public.characters (id) on delete cascade,
  recipient_id uuid not null references public.characters (id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint private_messages_not_to_self check (sender_id <> recipient_id)
);

create index private_messages_sender_idx on public.private_messages (sender_id, created_at desc);
create index private_messages_recipient_idx on public.private_messages (recipient_id, created_at desc);

alter table public.private_messages enable row level security;

revoke all on public.private_messages from anon, authenticated;
grant select, insert on public.private_messages to authenticated;
-- Solo la data di lettura è modificabile
grant update (read_at) on public.private_messages to authenticated;

create policy "Messaggi privati: lettura solo di mittente e destinatario"
  on public.private_messages for select
  to authenticated
  using (public.owns_character(sender_id) or public.owns_character(recipient_id));

create policy "Messaggi privati: invio dal proprio personaggio"
  on public.private_messages for insert
  to authenticated
  with check (public.owns_character(sender_id) and read_at is null);

create policy "Messaggi privati: il destinatario li segna come letti"
  on public.private_messages for update
  to authenticated
  using (public.owns_character(recipient_id))
  with check (public.owns_character(recipient_id));

-- Nessuna policy di delete: i messaggi privati non si cancellano.

-- Tempo reale (Realtime rispetta le policy: ognuno riceve solo i propri)
alter publication supabase_realtime add table public.private_messages;


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


-- =====================================================================
-- 07 · SOCIAL
-- Post dei personaggi, "mi piace" e commenti.
-- Visibili agli utenti registrati; ognuno gestisce i propri.
-- =====================================================================

create table public.social_posts (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  image_url text check (char_length(image_url) <= 500),
  location text check (char_length(location) <= 60),
  created_at timestamptz not null default now()
);

create table public.social_likes (
  post_id uuid not null references public.social_posts (id) on delete cascade,
  character_id uuid not null references public.characters (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, character_id)
);

create table public.social_comments (
  id bigint generated always as identity primary key,
  post_id uuid not null references public.social_posts (id) on delete cascade,
  character_id uuid not null references public.characters (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index social_posts_created_idx on public.social_posts (created_at desc);
create index social_posts_character_id_idx on public.social_posts (character_id);
create index social_posts_author_id_idx on public.social_posts (author_id);
create index social_likes_character_id_idx on public.social_likes (character_id);
create index social_comments_post_idx on public.social_comments (post_id, created_at);
create index social_comments_character_id_idx on public.social_comments (character_id);
create index social_comments_author_id_idx on public.social_comments (author_id);

alter table public.social_posts enable row level security;
alter table public.social_likes enable row level security;
alter table public.social_comments enable row level security;

revoke all on public.social_posts, public.social_likes, public.social_comments from anon, authenticated;
grant select, insert, delete on public.social_posts, public.social_likes, public.social_comments to authenticated;
-- Dei post si può modificare solo il testo, l'immagine e il luogo
grant update (body, image_url, location) on public.social_posts to authenticated;

-- Post
create policy "Social post: lettura per utenti registrati"
  on public.social_posts for select to authenticated using (true);

create policy "Social post: pubblicazione col proprio personaggio"
  on public.social_posts for insert
  to authenticated
  with check (author_id = (select auth.uid()) and public.owns_character(character_id));

create policy "Social post: modifica dell'autore"
  on public.social_posts for update
  to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

create policy "Social post: eliminazione dell'autore o dello staff"
  on public.social_posts for delete
  to authenticated
  using (author_id = (select auth.uid()) or (select public.is_staff()));

-- Mi piace
create policy "Social like: lettura per utenti registrati"
  on public.social_likes for select to authenticated using (true);

create policy "Social like: si mette col proprio personaggio"
  on public.social_likes for insert
  to authenticated
  with check (public.owns_character(character_id));

create policy "Social like: si toglie il proprio"
  on public.social_likes for delete
  to authenticated
  using (public.owns_character(character_id));

-- Commenti
create policy "Social commenti: lettura per utenti registrati"
  on public.social_comments for select to authenticated using (true);

create policy "Social commenti: si commenta col proprio personaggio"
  on public.social_comments for insert
  to authenticated
  with check (author_id = (select auth.uid()) and public.owns_character(character_id));

create policy "Social commenti: eliminazione dell'autore o dello staff"
  on public.social_comments for delete
  to authenticated
  using (author_id = (select auth.uid()) or (select public.is_staff()));


-- =====================================================================
-- 08 · NOTIZIE DALLA CITTÀ
-- La cronaca di Miami mostrata in bacheca. La scrive lo staff.
-- =====================================================================

create table public.city_news (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 160),
  body text check (char_length(body) <= 5000),
  district_id uuid references public.districts (id) on delete set null,
  author_id uuid default auth.uid() references public.profiles (id) on delete set null,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index city_news_published_idx on public.city_news (published_at desc);
create index city_news_district_id_idx on public.city_news (district_id);
create index city_news_author_id_idx on public.city_news (author_id);

alter table public.city_news enable row level security;

grant select on public.city_news to anon, authenticated;
grant insert, update, delete on public.city_news to authenticated;

create policy "Notizie: lettura per tutti"
  on public.city_news for select to anon, authenticated using (true);

create policy "Notizie: lo staff le pubblica"
  on public.city_news for insert to authenticated with check ((select public.is_staff()));

create policy "Notizie: lo staff le modifica"
  on public.city_news for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));

create policy "Notizie: lo staff le elimina"
  on public.city_news for delete to authenticated using ((select public.is_staff()));


-- =====================================================================
-- 09 · DATI INIZIALI
-- Quartieri e luoghi di Miami, sezioni e bacheche del forum.
-- =====================================================================

insert into public.districts (slug, name, tagline, map_x, map_y, gradient, sort_order) values
  ('south-beach',   'South Beach',   'Spiaggia, neon e Art Déco',      236, 262, 'from-violet via-flamingo to-sand',  1),
  ('downtown',      'Downtown',      'Grattacieli sulla baia',         150, 182, 'from-dusk via-violet to-orchid',    2),
  ('brickell',      'Brickell',      'Soldi, rooftop e yacht',         140, 232, 'from-violet via-orchid to-peach',   3),
  ('little-havana', 'Little Havana', 'Musica, sigari e caffè cubano',   82, 214, 'from-orchid via-flamingo to-peach', 4),
  ('wynwood',       'Wynwood',       'Murales e gallerie',             112, 128, 'from-flamingo via-peach to-sand',   5),
  ('porto',         'Il Porto',      'Container e navi da crociera',   190, 200, 'from-dusk via-violet to-mint',      6),
  ('coconut-grove', 'Coconut Grove', 'Marina e vecchie ville',         108, 304, 'from-violet via-lavender to-mint',  7),
  ('everglades',    'Everglades',    'Paludi ai margini della città',   30, 352, 'from-dusk via-violet to-mint',      8);

insert into public.places (district_id, slug, name, description, sort_order)
select d.id, v.slug, v.name, v.description, v.sort_order
from (values
  ('south-beach',   'ocean-drive',      'Ocean Drive',              'Hotel Art Déco, insegne al neon e auto d''epoca in fila.',      1),
  ('south-beach',   'lummus-park',      'Lummus Park',              'Sabbia bianca, torrette dei bagnini e palme sul lungomare.',    2),
  ('downtown',      'bayfront-park',    'Bayfront Park',            'Prati sulla baia, concerti e incontri all''aperto.',            1),
  ('downtown',      'torre-uffici',     'Le torri degli uffici',    'Vetro, ascensori e affari poco puliti.',                        2),
  ('brickell',      'rooftop-bar',      'Rooftop Bar',              'Cocktail al trentesimo piano con vista sulla baia.',            1),
  ('little-havana', 'calle-ocho',       'Calle Ocho',               'Musica dai locali, sigari arrotolati a mano e caffè forte.',    1),
  ('little-havana', 'domino-park',      'Domino Park',              'Partite a domino, chiacchiere e informazioni di quartiere.',    2),
  ('wynwood',       'murales',          'Il quartiere dei murales', 'Street art, gallerie e magazzini riconvertiti.',                1),
  ('porto',         'banchine',         'Le banchine',              'Container, gru e carichi da non controllare troppo.',           1),
  ('coconut-grove', 'marina',           'La Marina',                'Barche a vela, pontili di legno e bar sul mare.',               1),
  ('everglades',    'airboat',          'Il pontile degli airboat', 'Acqua bassa, alligatori e nessun testimone.',                   1)
) as v (district_slug, slug, name, description, sort_order)
join public.districts d on d.slug = v.district_slug;

insert into public.forum_sections (title, is_on_game, sort_order) values
  ('On Game', true, 1),
  ('Off Game', false, 2);

insert into public.forum_boards (section_id, slug, name, description, staff_only, sort_order)
select s.id, v.slug, v.name, v.description, v.staff_only, v.sort_order
from (values
  ('On Game',  'annunci-citta', 'Annunci dalla città', 'Notizie, eventi e cronaca di Miami.',               false, 1),
  ('On Game',  'lavoro',        'Lavoro e attività',   'Offerte di lavoro, negozi e affari.',               false, 2),
  ('On Game',  'fazioni',       'Gruppi e fazioni',    'Crew, famiglie, aziende e istituzioni.',            false, 3),
  ('Off Game', 'regolamento',   'Regolamento',         'Le regole del gioco: da leggere prima di iniziare.', true,  1),
  ('Off Game', 'supporto',      'Supporto',            'Domande allo staff e segnalazioni.',                false, 2),
  ('Off Game', 'bar',           'Il bar degli utenti', 'Chiacchiere libere tra giocatori.',                 false, 3)
) as v (section_title, slug, name, description, staff_only, sort_order)
join public.forum_sections s on s.title = v.section_title;



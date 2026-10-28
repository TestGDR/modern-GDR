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

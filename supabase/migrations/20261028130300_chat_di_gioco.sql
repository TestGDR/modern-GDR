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

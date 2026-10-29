-- =====================================================================
-- FORUM: SEZIONI RISERVATE, SPOSTA E RINOMINA
-- - Ogni sezione (forum_boards) è pubblica, riservata a dei livelli
--   (ruolo: Master, Moderatore…) o a dei gruppi (corporazioni) del gioco.
--   Chi non può leggerla non la vede proprio: né la sezione né le discussioni.
-- - Permesso "forum.riservate": legge tutte le sezioni riservate
--   (l'Amministratore le legge sempre).
-- - Spostare e rinominare una discussione: solo chi modera il forum.
-- =====================================================================

alter table public.forum_boards
  add column if not exists access text not null default 'pubblica' check (access in ('pubblica', 'livelli', 'gruppi')),
  add column if not exists level_ids uuid[] not null default '{}',
  add column if not exists group_ids uuid[] not null default '{}';

-- Chi può leggere una sezione del forum
create or replace function public.can_read_board(p_board uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.forum_boards b
    where b.id = p_board
      and (
        b.access = 'pubblica'
        or public.has_permission('forum.riservate')
        or (b.access = 'livelli' and exists (
              select 1 from public.profiles p where p.id = auth.uid() and p.level_id = any (b.level_ids)))
        or (b.access = 'gruppi' and exists (
              select 1 from public.character_groups cg
              join public.characters c on c.id = cg.character_id
              where c.owner_id = auth.uid() and c.status = 'approvata' and cg.group_id = any (b.group_ids)))
      )
  );
$$;
revoke execute on function public.can_read_board(uuid) from public;
grant execute on function public.can_read_board(uuid) to anon, authenticated;

-- Lettura: sezioni, discussioni e messaggi solo se la sezione è leggibile
-- (chi gestisce il forum vede tutte le sezioni nel pannello)
create or replace function public.can_see_board(p_board uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_read_board(p_board) or public.has_permission('forum.sezioni');
$$;
revoke execute on function public.can_see_board(uuid) from public;
grant execute on function public.can_see_board(uuid) to anon, authenticated;

alter policy "Forum bacheche: lettura per tutti" on public.forum_boards
  using (public.can_see_board(id));
alter policy "Forum discussioni: lettura per tutti" on public.forum_threads
  using (public.can_read_board(board_id));
alter policy "Forum messaggi: lettura per tutti" on public.forum_posts
  using (exists (select 1 from public.forum_threads t where t.id = thread_id and public.can_read_board(t.board_id)));

-- Scrittura: solo nelle sezioni leggibili
alter policy "Forum discussioni: gli utenti registrati le aprono" on public.forum_threads
  with check (
    author_id = (select auth.uid())
    and (character_id is null or public.owns_character(character_id))
    and public.can_read_board(board_id)
    and (
      (select public.has_permission('annunci.globali'))
      or not exists (select 1 from public.forum_boards b where b.id = board_id and b.staff_only)
    )
  );
alter policy "Forum messaggi: si risponde nelle discussioni aperte" on public.forum_posts
  with check (
    author_id = (select auth.uid())
    and (character_id is null or public.owns_character(character_id))
    and exists (
      select 1 from public.forum_threads t
      where t.id = thread_id
        and public.can_read_board(t.board_id)
        and ((select public.has_permission('forum.moderare')) or not t.is_locked)
    )
  );

-- Fissare, chiudere, rendere importante, spostare e rinominare: solo chi modera il forum
create or replace function public.protect_thread_flags()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.has_permission('forum.moderare') or auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.is_pinned = false;
    new.is_locked = false;
    new.is_important = false;
  elsif new.is_pinned is distinct from old.is_pinned
     or new.is_locked is distinct from old.is_locked
     or new.is_important is distinct from old.is_important
     or new.board_id is distinct from old.board_id
     or new.title is distinct from old.title then
    raise exception 'Solo chi modera il forum può fissare, chiudere, spostare o rinominare una discussione';
  end if;
  return new;
end;
$$;

-- Non letti e segnalati: solo nelle sezioni leggibili
create or replace function public.forum_unread()
returns table (thread_id uuid, board_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.board_id
  from public.forum_threads t
  left join public.forum_reads r on r.thread_id = t.id and r.user_id = auth.uid()
  left join public.forum_users u on u.user_id = auth.uid()
  where auth.uid() is not null
    and public.can_read_board(t.board_id)
    and t.updated_at > coalesce(r.last_read_at, u.first_seen, now())
    and exists (
      select 1 from public.forum_posts p
      where p.thread_id = t.id and p.author_id is distinct from auth.uid()
        and p.created_at > coalesce(r.last_read_at, u.first_seen, now())
    );
$$;

create or replace function public.forum_mark_read(p_thread uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then return; end if;
  if p_thread is null then
    insert into public.forum_reads (user_id, thread_id, last_read_at)
    select auth.uid(), t.id, now() from public.forum_threads t where public.can_read_board(t.board_id)
    on conflict (user_id, thread_id) do update set last_read_at = now();
  else
    insert into public.forum_reads (user_id, thread_id, last_read_at)
    select auth.uid(), t.id, now() from public.forum_threads t where t.id = p_thread and public.can_read_board(t.board_id)
    on conflict (user_id, thread_id) do update set last_read_at = now();
  end if;
end;
$$;

create or replace function public.forum_pending_highlights()
returns table (post_id bigint, thread_id uuid, board_slug text, title text, highlighted_by text, highlighted_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, t.id, b.slug, t.title, p.highlighted_by, p.highlighted_at
  from public.forum_posts p
  join public.forum_threads t on t.id = p.thread_id
  join public.forum_boards b on b.id = t.board_id
  where auth.uid() is not null
    and public.can_read_board(b.id)
    and p.highlighted_at > now() - interval '30 days'
    and not exists (select 1 from public.forum_highlight_seen v where v.post_id = p.id and v.user_id = auth.uid())
  order by p.highlighted_at desc
  limit 10;
$$;

-- Le sezioni che l'utente può leggere (per la colonna di sinistra del forum)
create or replace function public.forum_my_boards()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select b.id from public.forum_boards b where public.can_read_board(b.id);
$$;

revoke execute on function public.forum_unread(), public.forum_mark_read(uuid), public.forum_pending_highlights(), public.forum_my_boards() from public, anon;
grant execute on function public.forum_unread(), public.forum_mark_read(uuid), public.forum_pending_highlights(), public.forum_my_boards() to authenticated;

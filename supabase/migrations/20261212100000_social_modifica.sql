-- =====================================================================
-- SOCIAL: MODIFICA DI POST E COMMENTI
-- Chi ha scritto un post o un commento lo può modificare; chi ha il
-- permesso contenuti.moderare (l'Amministratore li ha tutti) modifica ed
-- elimina anche quelli degli altri. Si segna l'ora della modifica.
-- =====================================================================

alter table public.social_posts add column if not exists edited_at timestamptz;
alter table public.social_comments add column if not exists edited_at timestamptz;

-- post: l'autore o la moderazione (testo, luogo, foto e video)
alter policy "Social post: modifica dell'autore" on public.social_posts
  using (author_id = (select auth.uid()) or (select public.has_permission('contenuti.moderare')))
  with check (author_id = (select auth.uid()) or (select public.has_permission('contenuti.moderare')));

-- commenti: si modifica solo il testo
grant update (body) on public.social_comments to authenticated;
create policy "Social commenti: modifica dell'autore o della moderazione"
  on public.social_comments for update to authenticated
  using (author_id = (select auth.uid()) or (select public.has_permission('contenuti.moderare')))
  with check (author_id = (select auth.uid()) or (select public.has_permission('contenuti.moderare')));

-- ora della modifica (la scrive il database, non chi modifica)
create or replace function public.social_mark_edited()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.body is distinct from old.body then
    new.edited_at := now();
  elsif tg_table_name = 'social_posts' then
    -- luogo e foto esistono solo nei post
    if to_jsonb(new) -> 'location' is distinct from to_jsonb(old) -> 'location'
       or to_jsonb(new) -> 'media' is distinct from to_jsonb(old) -> 'media' then
      new.edited_at := now();
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.social_mark_edited() from public, anon, authenticated;
drop trigger if exists social_posts_edited on public.social_posts;
create trigger social_posts_edited before update on public.social_posts
  for each row execute function public.social_mark_edited();
drop trigger if exists social_comments_edited on public.social_comments;
create trigger social_comments_edited before update on public.social_comments
  for each row execute function public.social_mark_edited();

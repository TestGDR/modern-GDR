-- =====================================================================
-- SOCIAL: RICERCA DELLE PERSONE (tag, inviti, cerca)
-- Prima il browser toglieva «_» dal testo cercato: @space_cowboy non si
-- trovava né scrivendo «space_cowboy» né «spacecowboy». Ora cerca il
-- database, nel nome e nel @nome, anche ignorando punti, trattini bassi
-- e spazi; prima chi corrisponde esattamente. Solo personaggi approvati.
-- =====================================================================

create or replace function public.social_people_search(p_term text)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  with q as (
    select lower(btrim(regexp_replace(coalesce(p_term, ''), '^\s*@', ''))) as t
  ), n as (
    select t, regexp_replace(t, '[^a-z0-9à-ü]', '', 'g') as flat from q
  )
  select c.id
  from public.characters c
  left join public.social_profiles s on s.character_id = c.id
  cross join n
  where auth.uid() is not null and c.status = 'approvata' and char_length(n.t) >= 2
    and (
      strpos(lower(c.name), n.t) > 0
      or strpos(lower(coalesce(s.handle, '')), n.t) > 0
      or (char_length(n.flat) >= 2 and (
        strpos(regexp_replace(lower(coalesce(s.handle, '')), '[^a-z0-9à-ü]', '', 'g'), n.flat) > 0
        or strpos(regexp_replace(lower(c.name), '[^a-z0-9à-ü]', '', 'g'), n.flat) > 0
      ))
    )
  order by
    (lower(coalesce(s.handle, '')) = n.t or regexp_replace(lower(coalesce(s.handle, '')), '[^a-z0-9à-ü]', '', 'g') = n.flat) desc,
    (lower(public.first_name(c.name)) = n.t) desc,
    c.name
  limit 12
$$;
revoke execute on function public.social_people_search(text) from public, anon;
grant execute on function public.social_people_search(text) to authenticated;

-- =====================================================================
-- COMMENTI: CITAZIONI (@nome) E RISPOSTE
-- - chi è citato con @nome in un commento riceve la notifica «mention»
--   (anche quando la citazione si aggiunge modificando il commento);
-- - social_comments.reply_to_id: risposta a un commento; chi l'aveva
--   scritto riceve la notifica «reply».
-- Ognuno riceve una sola notifica per commento (risposta prima di
-- citazione, citazione prima di «ha commentato il tuo post»).
-- =====================================================================

alter table public.social_comments add column if not exists reply_to_id bigint references public.social_comments (id) on delete set null;
create index if not exists social_comments_reply_idx on public.social_comments (reply_to_id);

alter table public.social_notifications drop constraint if exists social_notifications_kind_check;
alter table public.social_notifications add constraint social_notifications_kind_check
  check (kind in ('follow', 'reaction', 'comment', 'tag', 'mention', 'reply', 'evento_invito', 'evento_nuovo', 'evento_partecipa', 'evento_promemoria'));

-- personaggi citati con @nome in un testo
create or replace function public.social_mentioned(p_text text)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct s.character_id
  from regexp_matches(coalesce(p_text, ''), '@([a-z0-9._]{3,30})', 'g') as m
  join public.social_profiles s on lower(s.handle) = lower(m[1])
$$;
revoke execute on function public.social_mentioned(text) from public, anon, authenticated;

create or replace function public.social_on_comment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := (select character_id from public.social_posts where id = new.post_id);
  v_parent uuid;
  v_done uuid[] := array[new.character_id];
  v_old uuid[] := '{}';
  m uuid;
begin
  if tg_op = 'UPDATE' then
    -- modificando: solo chi è citato adesso e prima non lo era
    v_old := coalesce((select array_agg(x) from public.social_mentioned(old.body) x), '{}');
  else
    -- risposta a un commento
    if new.reply_to_id is not null then
      v_parent := (select character_id from public.social_comments where id = new.reply_to_id);
      if v_parent is not null and not v_parent = any (v_done) then
        perform public.social_notify(v_parent, new.character_id, 'reply', new.post_id, new.body);
        v_done := v_done || v_parent;
      end if;
    end if;
  end if;
  -- citazioni
  for m in select * from public.social_mentioned(new.body) loop
    continue when m = any (v_done) or m = any (v_old);
    perform public.social_notify(m, new.character_id, 'mention', new.post_id, new.body);
    v_done := v_done || m;
  end loop;
  -- il proprietario del post
  if tg_op = 'INSERT' and v_owner is not null and not v_owner = any (v_done) then
    perform public.social_notify(v_owner, new.character_id, 'comment', new.post_id, new.body);
  end if;
  return new;
end;
$$;
revoke execute on function public.social_on_comment() from public, anon, authenticated;
drop trigger if exists social_comments_notify on public.social_comments;
create trigger social_comments_notify after insert or update of body on public.social_comments
  for each row execute function public.social_on_comment();

-- la risposta deve essere a un commento dello stesso post
create or replace function public.social_comments_reply_check()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.reply_to_id is not null and not exists (
    select 1 from public.social_comments c where c.id = new.reply_to_id and c.post_id = new.post_id
  ) then
    new.reply_to_id := null;
  end if;
  return new;
end;
$$;
drop trigger if exists social_comments_reply_check on public.social_comments;
create trigger social_comments_reply_check before insert on public.social_comments
  for each row execute function public.social_comments_reply_check();

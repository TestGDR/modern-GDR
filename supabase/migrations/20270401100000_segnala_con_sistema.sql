-- =====================================================================
-- FORUM: «SEGNALA A TUTTI» CON UN MESSAGGIO DI SISTEMA
-- Prima un post segnalato compariva a tutti in una finestra al centro dello
-- schermo. Ora chi può leggere la sezione riceve un messaggio di SISTEMA con
-- il link al post (nei Messaggi OFF diventa «Apri il post»).
-- =====================================================================

create or replace function public.forum_highlight_post(p_post bigint, p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_slug text;
  v_thread uuid;
  v_board uuid;
  v_by text;
begin
  if not public.has_permission('forum.segnalare') then
    raise exception 'Non hai il permesso di segnalare i post.' using errcode = '42501';
  end if;
  update public.forum_posts
  set highlighted_at = case when p_on then now() else null end,
      highlighted_by = case when p_on then public.my_display_name() else null end
  where id = p_post;
  if not p_on then
    return;
  end if;

  select t.title, b.slug, t.id, b.id, p.highlighted_by
  into v_title, v_slug, v_thread, v_board, v_by
  from public.forum_posts p
  join public.forum_threads t on t.id = p.thread_id
  join public.forum_boards b on b.id = t.board_id
  where p.id = p_post;
  if v_thread is null then
    return;
  end if;

  -- a tutti quelli che possono leggere la sezione (come can_read_board, per ogni utente), tranne chi segnala
  insert into public.system_messages (user_id, body)
  select u.id,
         left('📣 ' || coalesce(v_by, 'Lo staff') || ' ha segnalato a tutti un post del forum: «' || v_title || '».' || chr(10) || chr(10)
              || '/forum/' || v_slug || '/' || v_thread::text || '#post-' || p_post::text, 8000)
  from public.profiles u
  join public.forum_boards b on b.id = v_board
  left join public.user_levels l on l.id = u.level_id
  where u.id is distinct from auth.uid()
    and (
      b.access = 'pubblica'
      or l.is_admin
      or 'forum.riservate' = any (coalesce(l.permissions, '{}'))
      or (b.access = 'livelli' and u.level_id = any (b.level_ids))
      or (b.access = 'gruppi' and exists (
            select 1 from public.character_groups cg
            join public.characters c on c.id = cg.character_id
            where c.owner_id = u.id and c.status = 'approvata' and cg.group_id = any (b.group_ids)))
    );
end;
$$;
revoke execute on function public.forum_highlight_post(bigint, boolean) from public, anon;
grant execute on function public.forum_highlight_post(bigint, boolean) to authenticated;

-- Contatori: niente più post segnalati da mostrare in finestra
create or replace function public.my_counters()
returns jsonb
language sql
set search_path = ''
as $$
  select jsonb_build_object(
    'off', public.off_unread('off'),
    'phone', public.phone_state(),
    'forum_unread', (select count(*)::int from public.forum_unread()),
    'social', public.social_unread(),
    'tickets', coalesce((select jsonb_agg(t.id order by t.id) from public.ticket_unread_ids() as t(id)), '[]'::jsonb),
    'news_seen_at', (select s.seen_at from public.news_seen s where s.user_id = auth.uid()),
    'news', (select count(*)::int from public.news n
             where n.created_at > coalesce((select s.seen_at from public.news_seen s where s.user_id = auth.uid()), '-infinity'::timestamptz)),
    'absences', (select count(*)::int from public.absences a
                 where a.user_id <> auth.uid()
                   and a.created_at > coalesce((select s.seen_at from public.absences_seen s where s.user_id = auth.uid()), '-infinity'::timestamptz)),
    'play_requests', (select count(*)::int from public.play_requests r
                      where r.user_id <> auth.uid() and r.ends_at > now()
                        and r.created_at > coalesce((select s.seen_at from public.play_requests_seen s where s.user_id = auth.uid()), '-infinity'::timestamptz)),
    'gossip', public.gossip_waiting(),
    'gossip_new', (select count(*)::int from public.gossip_reports g
                   where g.status = 'approvato'
                     and coalesce(g.reviewed_at, g.created_at) > coalesce((select s.seen_at from public.gossip_seen s where s.user_id = auth.uid()), now())),
    'calendar_new', (select count(*)::int from public.calendar_events e
                     where e.created_by is distinct from auth.uid()
                       and e.created_at > coalesce((select s.seen_at from public.calendar_seen s where s.user_id = auth.uid()), now()))
  );
$$;
revoke execute on function public.my_counters() from public, anon;
grant execute on function public.my_counters() to authenticated;

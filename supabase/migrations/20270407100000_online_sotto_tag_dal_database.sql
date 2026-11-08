-- =====================================================================
-- ONLINE: IL SOTTO-TAG LETTO DAL DATABASE
-- Prima il sotto-tag accanto al nome lo mandava il browser di ognuno
-- (chi non aveva ricaricato il sito non lo mandava). Ora recent_online lo
-- prende dalla giocata (chat_presence.tag_id → room_tags) e lo mette in
-- info.subTag: si vede per tutti, senza cambiare le colonne restituite.
-- =====================================================================

create or replace function public.recent_online()
returns table (
  user_id uuid,
  name text,
  avatar_url text,
  character_id uuid,
  level_name text,
  level_color text,
  level_icon text,
  info jsonb,
  invisible boolean,
  last_seen timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.user_id,
         coalesce(c.name, p.username),
         c.avatar_url,
         c.id,
         l.name,
         l.color,
         l.icon_url,
         (coalesce(o.info, '{}'::jsonb) - 'subTag') || coalesce(jsonb_build_object('subTag', t.name), '{}'::jsonb),
         p.invisible,
         o.last_seen
  from public.online_status o
  join public.profiles p on p.id = o.user_id
  join public.user_levels l on l.id = p.level_id
  -- il personaggio dell'account: approvato, poi in attesa, poi il più recente
  left join lateral (
    select ch.* from public.characters ch
    where ch.owner_id = o.user_id
    order by (ch.status = 'approvata') desc, (ch.status = 'in_attesa') desc, ch.created_at desc
    limit 1
  ) c on true
  -- il sotto-tag scelto nella chat in cui è in giocata (se ne ha scelto uno)
  left join lateral (
    select rt.name from public.chat_presence cp
    join public.room_tags rt on rt.id = cp.tag_id
    where cp.character_id = c.id
    limit 1
  ) t on true
  where o.last_action > now() - public.chat_idle()
    and (
      not p.invisible
      or o.user_id = auth.uid()
      or public.has_permission('staff.invisibile')
    )
  order by coalesce(c.name, p.username);
$$;
revoke execute on function public.recent_online() from public, anon;
grant execute on function public.recent_online() to authenticated;

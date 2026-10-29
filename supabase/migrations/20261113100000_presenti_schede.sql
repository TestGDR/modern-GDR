-- =====================================================================
-- PRESENTI ONLINE: scheda apribile anche se non è ancora approvata,
-- per chi può vedere tutte le schede (personaggi.vedere_tutti).
-- Per gli altri resta solo la scheda approvata.
-- =====================================================================

create or replace function public.recent_online()
returns table (
  user_id uuid,
  name text,
  avatar_url text,
  character_id uuid,
  level_name text,
  level_color text,
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
         case when c.status = 'approvata' then c.avatar_url end,
         case when c.status = 'approvata' or public.has_permission('personaggi.vedere_tutti') or o.user_id = auth.uid() then c.id end,
         l.name,
         l.color,
         o.info,
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
  where o.last_action > now() - interval '60 minutes'
    and (
      not p.invisible
      or o.user_id = auth.uid()
      or public.has_permission('staff.invisibile')
    )
  order by coalesce(c.name, p.username);
$$;

revoke execute on function public.recent_online() from public, anon;
grant execute on function public.recent_online() to authenticated;

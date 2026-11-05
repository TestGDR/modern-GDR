-- =====================================================================
-- PRESENTI ONLINE: SI RESTA IN ELENCO FINCHÉ NON SI È SCOLLEGATI
-- Prima si spariva dopo 60 minuti senza azioni, mentre l'uscita per
-- inattività arriva dopo chat_settings.idle_minutes (120): chi leggeva una
-- giocata senza toccare niente spariva pur essendo collegato. Ora la
-- finestra degli online è la stessa dell'uscita (chat_idle()).
-- =====================================================================
drop function if exists public.recent_online();
create function public.recent_online()
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

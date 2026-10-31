-- =====================================================================
-- ICONE DEI LIVELLI (ruolo OFF: Amministratore, Master, Moderatore…)
-- Un link https a un'immagine piccola (circa 20x20), come per lavori e
-- gruppi. Si mostra nei presenti online e sotto il ritratto della scheda.
-- =====================================================================

alter table public.user_levels
  add column if not exists icon_url text check (icon_url is null or icon_url ~ '^https://');

-- I presenti online portano anche l'icona del livello
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

-- Livello OFF del proprietario di una scheda (nome, colore, icona)
create or replace function public.character_owner_level(p_character uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('name', l.name, 'color', l.color, 'icon_url', l.icon_url)
  from public.characters c
  join public.profiles p on p.id = c.owner_id
  join public.user_levels l on l.id = p.level_id
  where c.id = p_character
$$;
revoke execute on function public.character_owner_level(uuid) from public, anon;
grant execute on function public.character_owner_level(uuid) to authenticated;

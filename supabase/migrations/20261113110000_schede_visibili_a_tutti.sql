-- =====================================================================
-- SCHEDE VISIBILI A TUTTI (decisione dell'utente)
-- Ogni giocatore collegato apre qualsiasi scheda, anche in bozza o in
-- attesa. Modificarle resta riservato al proprietario (finché è in
-- creazione) e allo staff; approvarle a chi ha "personaggi.approvare".
-- Sostituisce anche la versione precedente di recent_online().
-- =====================================================================

-- Lettura delle schede: tutti i registrati
alter policy "Personaggi: lettura per utenti registrati" on public.characters
  using (true);

-- Caratteristiche, abilità e scelte: visibili come la scheda
create or replace function public.can_see_character(p_character_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (select 1 from public.characters c where c.id = p_character_id);
$$;

-- Presenti online: la scheda si apre sempre
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
         c.avatar_url,
         c.id,
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

-- Anagrafe: anche le schede non approvate si aprono
create or replace function public.registry()
returns table (
  user_id uuid,
  username text,
  character_id uuid,
  status text,
  avatar_url text,
  occupation text,
  face_claim text
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.username, c.id, c.status, c.avatar_url, c.occupation, c.face_claim
  from public.profiles p
  left join lateral (
    select ch.* from public.characters ch
    where ch.owner_id = p.id
    order by (ch.status = 'approvata') desc, (ch.status = 'in_attesa') desc, (ch.status = 'bozza') desc, ch.created_at desc
    limit 1
  ) c on true
  where auth.uid() is not null
  order by lower(p.username)
$$;
revoke execute on function public.registry() from public, anon;
grant execute on function public.registry() to authenticated;

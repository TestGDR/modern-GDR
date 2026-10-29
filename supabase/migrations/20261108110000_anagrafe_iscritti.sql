-- =====================================================================
-- ANAGRAFE: TUTTI GLI ISCRITTI
-- Un utente per riga, con il suo personaggio (approvato > in attesa >
-- bozza > più recente). Ritratto, lavoro, prestavolto e scheda si vedono
-- solo se la scheda è approvata; per gli altri solo lo stato.
-- =====================================================================

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
  select
    p.id,
    p.username,
    case when c.status = 'approvata' then c.id end,
    c.status,
    case when c.status = 'approvata' then c.avatar_url end,
    case when c.status = 'approvata' then c.occupation end,
    case when c.status = 'approvata' then c.face_claim end
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

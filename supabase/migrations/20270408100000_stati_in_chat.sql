-- =====================================================================
-- STATI IN CHAT: alcol, droghe e insonnia accanto al nome delle azioni
-- characters_status_get(personaggi[]) = character_status_get per più
-- personaggi in una sola chiamata (al massimo 30): la chat la usa per
-- i presenti, invece di una richiesta per ognuno.
-- =====================================================================

create or replace function public.characters_status_get(p_characters uuid[])
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(x.id, public.character_status_get(x.id)), '{}'::jsonb)
  from (select distinct unnest(p_characters[1:30]) as id) x
  where auth.uid() is not null and exists (select 1 from public.characters c where c.id = x.id);
$$;
revoke execute on function public.characters_status_get(uuid[]) from public, anon;
grant execute on function public.characters_status_get(uuid[]) to authenticated;

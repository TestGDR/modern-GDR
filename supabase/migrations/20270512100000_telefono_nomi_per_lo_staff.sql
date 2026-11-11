-- =====================================================================
-- TELEFONO: LO STAFF VEDE A CHI APPARTIENE OGNI NUMERO
-- Chi ha messaggi.log può aprire il telefono degli altri (Gestione → Log
-- e il selettore dei numeri), ma phone_directory dava solo i numeri delle
-- proprie conversazioni: gli altri comparivano come «Numero sconosciuto».
-- Ora, con messaggi.log, phone_directory dà tutti i numeri e in più
-- owner_name = il nome del personaggio a cui appartiene il numero
-- (per gli altri giocatori owner_name resta vuoto, come prima).
-- =====================================================================

drop function if exists public.phone_directory(text[]);
create or replace function public.phone_directory(p_digits text[] default '{}')
returns table (number_id uuid, digits text, display_name text, avatar_url text, status_text text, owner_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.digits, n.display_name, n.avatar_url, n.status_text,
    case when public.has_permission('messaggi.log') then (select c.name from public.characters c where c.id = n.character_id) end
  from public.phone_numbers n
  where auth.uid() is not null and (
    public.has_permission('messaggi.log')
    or n.id in (
      select m2.number_id from public.phone_members m1
      join public.phone_numbers mine on mine.id = m1.number_id
      join public.characters c on c.id = mine.character_id and c.owner_id = auth.uid()
      join public.phone_members m2 on m2.thread_id = m1.thread_id
    )
    or n.digits = any (coalesce(p_digits, '{}'))
  )
$$;
revoke execute on function public.phone_directory(text[]) from public, anon;
grant execute on function public.phone_directory(text[]) to authenticated;

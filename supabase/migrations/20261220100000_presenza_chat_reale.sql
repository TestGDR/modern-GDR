-- Presenti in chat: contano solo i personaggi che sono davvero lì adesso.
-- Prima bastava la riga di chat_presence, che restava finché non scadeva
-- l'inattività se si chiudeva il browser, si usciva dal sito o si spegneva
-- il telefono senza lasciare la chat: sulla mappa restava "1 in gioco".
-- Ora serve anche il segnale dei presenti online (touch_online, ogni 60 s)
-- degli ultimi 5 minuti, con il luogo uguale a questa chat.

create or replace function public.in_chat_now(p_character uuid, p_room uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.characters c
    join public.online_status o on o.user_id = c.owner_id
    where c.id = p_character
      and o.last_seen > now() - interval '5 minutes'
      and o.info ->> 'placeKey' = 'chat:' || p_room::text
  );
$$;
revoke execute on function public.in_chat_now(uuid, uuid) from public, anon;
grant execute on function public.in_chat_now(uuid, uuid) to authenticated;

create or replace function public.room_activity()
returns table (room_id uuid, n int)
language sql
stable
security definer
set search_path = ''
as $$
  select p.room_id, count(*)::int
  from public.chat_presence p
  where p.last_active_at > now() - public.chat_idle()
    and public.in_chat_now(p.character_id, p.room_id)
    and public.room_on_active_map(p.room_id)
  group by p.room_id;
$$;

create or replace function public.chat_present(p_room uuid)
returns table (character_id uuid, name text, avatar_url text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.character_id, c.name, c.avatar_url
  from public.chat_presence p
  join public.characters c on c.id = p.character_id
  where p.room_id = p_room
    and p.last_active_at > now() - public.chat_idle()
    -- io ci sono sempre (appena entrato il segnale online può arrivare un attimo dopo)
    and (c.owner_id = auth.uid() or public.in_chat_now(p.character_id, p_room))
    and public.can_enter_room(p_room)
  order by p.joined_at;
$$;

revoke execute on function public.room_activity() from public, anon;
revoke execute on function public.chat_present(uuid) from public, anon;
grant execute on function public.room_activity() to authenticated;
grant execute on function public.chat_present(uuid) to authenticated;

-- =====================================================================
-- GIOCATE: SALVA CHAT E ARCHIVIO DA «ENTRA IN CHAT» A «ESCI DALLA CHAT»
-- chat_session_start(chat, pg) = quando è cominciata la giocata del
-- personaggio in quella chat: l'entrata (chat_presence.joined_at) o, se
-- la giocata è stata chiusa per inattività, il suo ultimo «è entrato in
-- chat.» senza un «è uscito dalla chat.» dopo (ultime 24 ore).
-- Salva chat (nel browser) e l'archivio partono da lì, con tutti i
-- messaggi anche se sullo schermo non sono più caricati (dopo «Aggiorna»).
-- =====================================================================

create or replace function public.chat_session_start(p_room uuid, p_character uuid)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_from timestamptz;
  v_out timestamptz;
begin
  if not exists (select 1 from public.characters where id = p_character and owner_id = auth.uid()) then
    return null;
  end if;
  select p.joined_at into v_from from public.chat_presence p where p.room_id = p_room and p.character_id = p_character;
  if v_from is not null then return v_from; end if;
  -- giocata chiusa da sola: l'ultima entrata non seguita da un'uscita
  select max(m.created_at) into v_from from public.messages m
  where m.room_id = p_room and m.character_id = p_character and m.kind = 'sistema' and m.content = 'è entrato in chat.'
    and m.created_at > now() - interval '24 hours';
  if v_from is null then return null; end if;
  select max(m.created_at) into v_out from public.messages m
  where m.room_id = p_room and m.character_id = p_character and m.kind = 'sistema' and m.content = 'è uscito dalla chat.'
    and m.created_at > v_from;
  if v_out is not null then return null; end if;
  return v_from;
end;
$$;
revoke execute on function public.chat_session_start(uuid, uuid) from public, anon;
grant execute on function public.chat_session_start(uuid, uuid) to authenticated;

create or replace function public.play_archive_save(p_room uuid, p_character uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  ro record;
  v_from timestamptz;
  v_msgs jsonb;
  v_chars jsonb;
  v_text text;
  v_n int;
  v_id bigint;
begin
  v_from := public.chat_session_start(p_room, p_character);
  if v_from is null then raise exception 'Non sei in giocata in questa chat.' using errcode = 'P0001'; end if;
  select r.name, coalesce(l.name, '') as place, r.cleared_at into ro
  from public.rooms r left join public.locations l on l.id = r.location_id where r.id = p_room;

  if not exists (select 1 from public.messages m where m.room_id = p_room and m.created_at >= v_from
                 and m.kind in ('azione', 'master', 'png')) then
    raise exception 'Non c''è niente da salvare: serve almeno un''azione o una narrazione.' using errcode = 'P0001';
  end if;

  with last_msgs as (
    select m.* from public.messages m
    where m.room_id = p_room and m.created_at >= v_from and m.kind not in ('fuori_gioco', 'sussurro')
    order by m.created_at desc, m.id desc limit 3000
  ), named as (
    select lm.*, case when lm.kind = 'png' then coalesce((select n.name from public.npcs n where n.id = lm.npc_id), lm.character_name)
                      else coalesce(nullif(lm.character_name, ''), (select c.name from public.characters c where c.id = lm.character_id), '') end as who
    from last_msgs lm
  )
  select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'name', who, 'content', content, 'recipient', recipient, 'at', created_at)
                            order by created_at, id), '[]'::jsonb),
         coalesce(string_agg(who || ': ' || content, E'\n' order by created_at, id), ''),
         count(*)::int
    into v_msgs, v_text, v_n
  from named;

  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'avatar', c.avatar_url) order by c.name), '[]'::jsonb)
    into v_chars
  from public.characters c
  where c.id in (select m.character_id from public.messages m where m.room_id = p_room and m.created_at >= v_from
                 and m.kind in ('azione', 'master', 'png', 'dado', 'sistema', 'combattimento', 'incidente'));

  insert into public.play_archives (user_id, character_id, character_name, room_id, room_name, place_name, started_at, ended_at,
    characters, messages, message_count, search_text)
  select c.owner_id, c.id, c.name, p_room, ro.name, ro.place, v_from, now(), v_chars, v_msgs, v_n, left(v_text, 500000)
  from public.characters c where c.id = p_character
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.play_archive_save(uuid, uuid) from public, anon, authenticated;

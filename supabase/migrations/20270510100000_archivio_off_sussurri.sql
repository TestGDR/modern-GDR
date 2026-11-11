-- =====================================================================
-- ARCHIVIO GIOCATE: ANCHE OFF E SUSSURRI
-- play_archive_save salva tutta la giocata da «Entra in chat»: azioni,
-- narrazioni, dadi, combattimenti, incidenti, sistema e ora anche i
-- messaggi fuori gioco (OFF) e i sussurri del personaggio (mandati o
-- ricevuti; quelli tra altri no).
-- =====================================================================

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
    where m.room_id = p_room and m.created_at >= v_from
      -- sussurri: solo quelli del personaggio (mandati o ricevuti)
      and (m.kind <> 'sussurro' or m.character_id = p_character or m.recipient_id = p_character)
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

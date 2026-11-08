-- =====================================================================
-- TURNI: CHI SCRIVE FUORI TURNO VIENE SALTATO UNA VOLTA
-- Prima un'azione fuori turno non contava: se poi il turno arrivava a quel
-- personaggio, doveva scrivere di nuovo. Ora chi scrive fuori turno è segnato
-- (acted_ahead) e quando il turno arriva a lui passa al successivo.
-- Il turno resta comunque a chi lo aveva.
-- =====================================================================

alter table public.room_turns add column if not exists acted_ahead boolean not null default false;

-- Chi viene dopo la posizione indicata (in cerchio), saltando una volta chi ha già scritto
create or replace function public.room_turn_next(p_room uuid, p_scene text, p_after int)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pos int := p_after;
  v_n int;
  v_i int := 0;
  r record;
begin
  select count(*) into v_n from public.room_turns where room_id = p_room and scene = p_scene;
  loop
    select t.character_id, t.position, t.acted_ahead into r
    from public.room_turns t
    where t.room_id = p_room and t.scene = p_scene
    order by (t.position <= v_pos), t.position
    limit 1;
    if r.character_id is null then
      return null;
    end if;
    update public.room_turns set acted_ahead = false
    where room_id = p_room and character_id = r.character_id and acted_ahead;
    if not r.acted_ahead or v_i >= v_n then
      return r.character_id;
    end if;
    -- aveva già scritto fuori turno: si salta
    v_pos := r.position;
    v_i := v_i + 1;
  end loop;
end;
$$;
revoke execute on function public.room_turn_next(uuid, text, int) from public, anon, authenticated;

-- A ogni azione: entra in lista, fa scorrere il turno o segna chi scrive fuori turno
create or replace function public.messages_turns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scene text := coalesce(new.tag_id::text, '');
  r public.room_turns;
  d record;
begin
  if new.kind <> 'azione' or new.character_id is null then return null; end if;
  -- solo chi è davvero in giocata (non lo staff invisibile)
  if not public.in_chat_now(new.character_id, new.room_id) then return null; end if;
  perform pg_advisory_xact_lock(hashtext('turni:' || new.room_id::text));

  -- via chi non è più in giocata
  for d in
    select t.character_id from public.room_turns t
    where t.room_id = new.room_id and t.character_id <> new.character_id
      and not public.in_chat_now(t.character_id, t.room_id)
  loop
    perform public.room_turn_drop(new.room_id, d.character_id);
  end loop;

  select * into r from public.room_turns where room_id = new.room_id and character_id = new.character_id;
  -- ha cambiato sotto-tag: lascia la turnazione di prima
  if r.room_id is not null and r.scene <> v_scene then
    perform public.room_turn_drop(new.room_id, new.character_id);
    r := null;
  end if;

  if r.room_id is null then
    -- nuovo: in fondo alla lista; il turno resta a chi lo aveva
    insert into public.room_turns (room_id, character_id, scene, position)
    values (new.room_id, new.character_id, v_scene,
            coalesce((select max(t.position) from public.room_turns t where t.room_id = new.room_id and t.scene = v_scene), 0) + 1)
    returning * into r;
    if not exists (select 1 from public.room_turns t where t.room_id = new.room_id and t.scene = v_scene and t.is_current) then
      perform public.room_turn_give(new.room_id, v_scene, public.room_turn_next(new.room_id, v_scene, r.position));
    end if;
  elsif r.is_current then
    -- era il suo turno: passa al successivo
    update public.room_turns set acted_ahead = false where room_id = new.room_id and character_id = new.character_id and acted_ahead;
    perform public.room_turn_give(new.room_id, v_scene, public.room_turn_next(new.room_id, v_scene, r.position));
  elsif not r.acted_ahead then
    -- fuori turno: il turno resta, ma quando arriva a lui si salta
    update public.room_turns set acted_ahead = true where room_id = new.room_id and character_id = new.character_id;
  end if;
  return null;
end;
$$;
revoke execute on function public.messages_turns() from public, anon, authenticated;

-- Lettura: in più chi ha già scritto fuori turno
drop function if exists public.room_turns_get(uuid);
create function public.room_turns_get(p_room uuid)
returns table (character_id uuid, name text, scene text, "position" int, is_current boolean, live boolean, acted_ahead boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select t.character_id, c.name, t.scene, t.position, t.is_current, public.in_chat_now(t.character_id, t.room_id), t.acted_ahead
  from public.room_turns t
  join public.characters c on c.id = t.character_id
  where t.room_id = p_room and public.can_enter_room(p_room)
  order by t.scene, t.position;
$$;
revoke execute on function public.room_turns_get(uuid) from public, anon;
grant execute on function public.room_turns_get(uuid) to authenticated;

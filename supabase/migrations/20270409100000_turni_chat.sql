-- =====================================================================
-- TURNI DELLE CHAT
-- In ogni chat la turnazione è sempre attiva:
-- - la prima azione di un personaggio in giocata lo mette in fondo alla lista;
-- - quando scrive il personaggio di turno, il turno passa al successivo
--   (dopo l'ultimo si torna al primo); chi scrive fuori turno non lo sposta;
-- - contano solo le azioni (niente OFF, sussurri, dadi, master, PNG, sistema);
-- - ogni sotto-tag ha la sua turnazione (scene = id del sotto-tag, '' = Principale);
-- - chi esce dalla giocata esce anche dalla lista; se era di turno, passa al successivo.
-- Il Master (chat.narrazione) salta, sposta, toglie e azzera; chi è di turno può passare.
-- Si scrive solo dalle funzioni e dai trigger.
-- =====================================================================

create table if not exists public.room_turns (
  room_id uuid not null references public.rooms (id) on delete cascade,
  character_id uuid not null references public.characters (id) on delete cascade,
  scene text not null default '',
  position int not null,
  is_current boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (room_id, character_id)
);
create index if not exists room_turns_scene_idx on public.room_turns (room_id, scene, position);
create unique index if not exists room_turns_one_current on public.room_turns (room_id, scene) where is_current;

alter table public.room_turns enable row level security;
revoke all on public.room_turns from anon, authenticated;
grant select on public.room_turns to authenticated;

drop policy if exists "Turni: visibili a chi entra nella chat" on public.room_turns;
create policy "Turni: visibili a chi entra nella chat" on public.room_turns for select to authenticated
  using ((select public.can_enter_room(room_id)) or (select public.has_permission('chat.log')));
drop policy if exists "Turni: solo dalle funzioni (inserimento)" on public.room_turns;
create policy "Turni: solo dalle funzioni (inserimento)" on public.room_turns for insert to authenticated with check (false);
drop policy if exists "Turni: solo dalle funzioni (modifica)" on public.room_turns;
create policy "Turni: solo dalle funzioni (modifica)" on public.room_turns for update to authenticated using (false);
drop policy if exists "Turni: solo dalle funzioni (eliminazione)" on public.room_turns;
create policy "Turni: solo dalle funzioni (eliminazione)" on public.room_turns for delete to authenticated using (false);

-- Il turno tocca a un personaggio (uno solo per scena)
create or replace function public.room_turn_give(p_room uuid, p_scene text, p_character uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.room_turns set is_current = false
  where room_id = p_room and scene = p_scene and is_current and character_id is distinct from p_character;
  if p_character is not null then
    update public.room_turns set is_current = true
    where room_id = p_room and scene = p_scene and character_id = p_character and not is_current;
  end if;
end;
$$;

-- Chi viene dopo la posizione indicata (in cerchio, dopo l'ultimo il primo)
create or replace function public.room_turn_next(p_room uuid, p_scene text, p_after int)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.character_id from public.room_turns t
  where t.room_id = p_room and t.scene = p_scene
  order by (t.position <= p_after), t.position
  limit 1;
$$;

-- Toglie un personaggio dalla lista; se era di turno, il turno passa al successivo
create or replace function public.room_turn_drop(p_room uuid, p_character uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.room_turns;
begin
  delete from public.room_turns where room_id = p_room and character_id = p_character returning * into r;
  if r.room_id is not null and r.is_current then
    perform public.room_turn_give(p_room, r.scene, public.room_turn_next(p_room, r.scene, r.position));
  end if;
end;
$$;

revoke execute on function public.room_turn_give(uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.room_turn_next(uuid, text, int) from public, anon, authenticated;
revoke execute on function public.room_turn_drop(uuid, uuid) from public, anon, authenticated;

-- A ogni azione: entra in lista o fa scorrere il turno
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
    perform public.room_turn_give(new.room_id, v_scene, public.room_turn_next(new.room_id, v_scene, r.position));
  end if;
  return null;
end;
$$;
revoke execute on function public.messages_turns() from public, anon, authenticated;
drop trigger if exists messages_turns on public.messages;
create trigger messages_turns after insert on public.messages
  for each row execute function public.messages_turns();

-- Chi esce dalla giocata (o la chat si svuota) esce dalla lista
create or replace function public.chat_presence_turns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.room_turn_drop(old.room_id, old.character_id);
  return null;
end;
$$;
revoke execute on function public.chat_presence_turns() from public, anon, authenticated;
drop trigger if exists chat_presence_turns on public.chat_presence;
create trigger chat_presence_turns after delete on public.chat_presence
  for each row execute function public.chat_presence_turns();

-- Sotto-tag eliminato: la sua turnazione sparisce
create or replace function public.room_tags_turns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.room_turns where room_id = old.room_id and scene = old.id::text;
  return null;
end;
$$;
revoke execute on function public.room_tags_turns() from public, anon, authenticated;
drop trigger if exists room_tags_turns on public.room_tags;
create trigger room_tags_turns after delete on public.room_tags
  for each row execute function public.room_tags_turns();

-- Lettura: la lista con i nomi e chi è ancora in giocata
create or replace function public.room_turns_get(p_room uuid)
returns table (character_id uuid, name text, scene text, "position" int, is_current boolean, live boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select t.character_id, c.name, t.scene, t.position, t.is_current, public.in_chat_now(t.character_id, t.room_id)
  from public.room_turns t
  join public.characters c on c.id = t.character_id
  where t.room_id = p_room and public.can_enter_room(p_room)
  order by t.scene, t.position;
$$;

-- Comandi: passa / salta (il Master, o chi è di turno), dai il turno, sposta, togli, azzera
create or replace function public.room_turn_action(p_room uuid, p_action text, p_character uuid default null, p_scene text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_master boolean := public.has_permission('chat.narrazione');
  r public.room_turns;
  o public.room_turns;
begin
  if not public.can_enter_room(p_room) then
    raise exception 'Non puoi entrare in questa chat.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('turni:' || p_room::text));

  if p_action = 'passa' then
    select * into r from public.room_turns where room_id = p_room and scene = coalesce(p_scene, '') and is_current;
    if r.room_id is null then return; end if;
    if not v_master and not public.owns_character(r.character_id) then
      raise exception 'Solo il Master o chi è di turno può passare il turno.' using errcode = '42501';
    end if;
    perform public.room_turn_give(p_room, r.scene, public.room_turn_next(p_room, r.scene, r.position));
    return;
  end if;

  if not v_master then
    raise exception 'Solo il Master può cambiare i turni.' using errcode = '42501';
  end if;

  if p_action = 'azzera' then
    delete from public.room_turns where room_id = p_room and scene = coalesce(p_scene, '');
    return;
  end if;

  select * into r from public.room_turns where room_id = p_room and character_id = p_character;
  if r.room_id is null then
    raise exception 'Questo personaggio non è nei turni.' using errcode = 'P0001';
  end if;

  if p_action = 'dai' then
    perform public.room_turn_give(p_room, r.scene, r.character_id);
  elsif p_action = 'togli' then
    perform public.room_turn_drop(p_room, r.character_id);
  elsif p_action in ('su', 'giu') then
    select * into o from public.room_turns t
    where t.room_id = p_room and t.scene = r.scene
      and case when p_action = 'su' then t.position < r.position else t.position > r.position end
    order by case when p_action = 'su' then -t.position else t.position end
    limit 1;
    if o.room_id is null then return; end if;
    update public.room_turns set position = o.position where room_id = p_room and character_id = r.character_id;
    update public.room_turns set position = r.position where room_id = p_room and character_id = o.character_id;
  else
    raise exception 'Comando sconosciuto.' using errcode = 'P0001';
  end if;
end;
$$;

revoke execute on function public.room_turns_get(uuid) from public, anon;
revoke execute on function public.room_turn_action(uuid, text, uuid, text) from public, anon;
grant execute on function public.room_turns_get(uuid) to authenticated;
grant execute on function public.room_turn_action(uuid, text, uuid, text) to authenticated;

-- Tempo reale: la riga dei turni si aggiorna da sola
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'room_turns') then
    alter publication supabase_realtime add table public.room_turns;
  end if;
end;
$$;

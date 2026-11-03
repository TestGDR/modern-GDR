-- =====================================================================
-- CAMERE DEI DORMITORI IN CHAT
-- Ogni camera dei dormitori (dorm_rooms) ha la sua chat su invito nel
-- quartiere «Dormitori» (creato sulla mappa attiva se manca), gruppo di
-- chat «Dormitori». Ci entrano i residenti (uno nella singola, due nella
-- doppia) e chi invitano; i residenti invitano e allontanano come il
-- proprietario di una chat su invito. La descrizione della chat dice il
-- tipo di camera e chi la occupa, e si aggiorna da sola. Quando un
-- residente lascia la camera i suoi ospiti perdono l'accesso.
-- =====================================================================

alter table public.dorm_rooms add column if not exists chat_room_id uuid references public.rooms (id) on delete set null;
create unique index if not exists dorm_rooms_chat_room_key on public.dorm_rooms (chat_room_id) where chat_room_id is not null;

-- quartiere e gruppo di chat dei dormitori (creati se mancano)
create or replace function public.dorm_chat_group()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_loc uuid;
  v_group uuid;
begin
  select l.id into v_loc from public.locations l join public.maps m on m.id = l.map_id
  where lower(btrim(l.name)) = 'dormitori' order by m.active desc, l.sort_order limit 1;
  if v_loc is null then
    insert into public.locations (map_id, name, tagline, x, y, sort_order)
    select m.id, 'Dormitori', 'Le camere degli studenti', 50, 50, 99 from public.maps m where m.active order by m.created_at limit 1
    returning id into v_loc;
  end if;
  if v_loc is null then raise exception 'Nessuna mappa attiva per il quartiere dei dormitori.'; end if;
  select id into v_group from public.room_groups where location_id = v_loc and lower(btrim(name)) = 'dormitori' limit 1;
  if v_group is null then
    insert into public.room_groups (location_id, name, sort_order) values (v_loc, 'Dormitori', 0) returning id into v_group;
  end if;
  return v_group;
end;
$$;
revoke execute on function public.dorm_chat_group() from public, anon, authenticated;

-- "Doppia · Occupata da Anna e Marco" / "Singola · Libera"
create or replace function public.dorm_room_chat_text(p_room uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select initcap(r.kind) || ' · ' || coalesce('Occupata da ' || (
      select string_agg(public.first_name(c.name), ' e ' order by d.since)
      from public.dorm_residents d join public.characters c on c.id = d.character_id
      where d.room_id = r.id), 'Libera')
    || case when btrim(r.description) <> '' then E'\n' || r.description else '' end
  from public.dorm_rooms r where r.id = p_room
$$;
revoke execute on function public.dorm_room_chat_text(uuid) from public, anon, authenticated;

-- crea o aggiorna la chat di una camera
create or replace function public.dorm_room_chat_sync(p_room uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.dorm_rooms;
  v_dorm text;
  v_group uuid;
  v_loc uuid;
  v_chat uuid;
  v_name text;
begin
  select * into r from public.dorm_rooms where id = p_room;
  if r.id is null then return; end if;
  select name into v_dorm from public.dorms where id = r.dorm_id;
  v_name := left(v_dorm || ' · ' || r.name, 80);
  v_chat := r.chat_room_id;
  if v_chat is null or not exists (select 1 from public.rooms where id = v_chat) then
    v_group := public.dorm_chat_group();
    select location_id into v_loc from public.room_groups where id = v_group;
    insert into public.rooms (location_id, group_id, name, description, access, sort_order)
    values (v_loc, v_group, v_name, left(public.dorm_room_chat_text(r.id), 2000), 'su_invito', r.sort_order)
    returning id into v_chat;
    update public.dorm_rooms set chat_room_id = v_chat where id = r.id;
  else
    update public.rooms set name = v_name, description = left(public.dorm_room_chat_text(r.id), 2000), access = 'su_invito'
    where id = v_chat;
  end if;
end;
$$;
revoke execute on function public.dorm_room_chat_sync(uuid) from public, anon, authenticated;

-- chi comanda una chat su invito: il proprietario, o un residente della camera
create or replace function public.room_controller(r uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select c.id
     from public.rooms ro
     join public.characters c on c.id = ro.owner_character_id
     where ro.id = r and ro.access = 'su_invito'
       and c.owner_id = auth.uid() and c.status = 'approvata'),
    (select c.id
     from public.rooms ro
     join public.dorm_rooms dr on dr.chat_room_id = ro.id
     join public.dorm_residents d on d.room_id = dr.id
     join public.characters c on c.id = d.character_id
     where ro.id = r and ro.access = 'su_invito'
       and c.owner_id = auth.uid() and c.status = 'approvata'
     limit 1));
$$;

-- camere nuove o cambiate → chat
create or replace function public.dorm_rooms_chat_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.active then
    perform public.dorm_room_chat_sync(new.id);
  end if;
  return null;
end;
$$;
revoke execute on function public.dorm_rooms_chat_trigger() from public, anon, authenticated;
drop trigger if exists dorm_rooms_chat on public.dorm_rooms;
create trigger dorm_rooms_chat after insert or update of name, kind, description, dorm_id, active on public.dorm_rooms
  for each row execute function public.dorm_rooms_chat_trigger();

-- dormitorio rinominato → nomi delle chat
create or replace function public.dorms_chat_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in select id from public.dorm_rooms where dorm_id = new.id and chat_room_id is not null loop
    perform public.dorm_room_chat_sync(r.id);
  end loop;
  return null;
end;
$$;
revoke execute on function public.dorms_chat_trigger() from public, anon, authenticated;
drop trigger if exists dorms_chat on public.dorms;
create trigger dorms_chat after update of name on public.dorms
  for each row execute function public.dorms_chat_trigger();

-- residenti che arrivano o se ne vanno → descrizione e ospiti
create or replace function public.dorm_residents_chat_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chat uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') and (tg_op = 'DELETE' or old.room_id is distinct from new.room_id) then
    select chat_room_id into v_chat from public.dorm_rooms where id = old.room_id;
    if v_chat is not null then
      -- chi se ne va non entra più, e nemmeno i suoi ospiti
      delete from public.room_guests where room_id = v_chat and (invited_by = old.character_id or character_id = old.character_id);
      -- camera vuota: niente ospiti
      if not exists (select 1 from public.dorm_residents where room_id = old.room_id) then
        delete from public.room_guests where room_id = v_chat;
      end if;
    end if;
    perform public.dorm_room_chat_sync(old.room_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.dorm_room_chat_sync(new.room_id);
  end if;
  return null;
end;
$$;
revoke execute on function public.dorm_residents_chat_trigger() from public, anon, authenticated;
drop trigger if exists dorm_residents_chat on public.dorm_residents;
create trigger dorm_residents_chat after insert or update or delete on public.dorm_residents
  for each row execute function public.dorm_residents_chat_trigger();

-- personaggio eliminato o rinominato → descrizioni giuste
create or replace function public.characters_dorm_chat_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room uuid;
begin
  select room_id into v_room from public.dorm_residents where character_id = new.id;
  if v_room is not null then perform public.dorm_room_chat_sync(v_room); end if;
  return null;
end;
$$;
revoke execute on function public.characters_dorm_chat_trigger() from public, anon, authenticated;
drop trigger if exists characters_dorm_chat on public.characters;
create trigger characters_dorm_chat after update of name on public.characters
  for each row execute function public.characters_dorm_chat_trigger();

-- una volta: le chat di tutte le camere attive
do $$
declare
  r record;
begin
  for r in
    select dr.id from public.dorm_rooms dr join public.dorms d on d.id = dr.dorm_id
    where dr.active and d.active
    order by d.sort_order, d.name, dr.sort_order, dr.name
  loop
    perform public.dorm_room_chat_sync(r.id);
  end loop;
end;
$$;

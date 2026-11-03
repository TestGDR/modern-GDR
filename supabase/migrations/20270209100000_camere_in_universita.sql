-- =====================================================================
-- CAMERE DEI DORMITORI: GRUPPO «DORMITORI» DENTRO IL QUARTIERE DELL'UNIVERSITÀ
-- Il gruppo di chat delle camere sta nel quartiere della mappa attiva il
-- cui nome contiene «University» (o «Università»), non in un quartiere a
-- parte; solo se manca si usa (o si crea) il quartiere «Dormitori».
-- Le chat delle camere già create si spostano nel gruppo giusto.
-- =====================================================================

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
  where m.active and (lower(l.name) like '%universit%')
  order by l.sort_order limit 1;
  if v_loc is null then
    select l.id into v_loc from public.locations l join public.maps m on m.id = l.map_id
    where lower(btrim(l.name)) = 'dormitori' order by m.active desc, l.sort_order limit 1;
  end if;
  if v_loc is null then
    insert into public.locations (map_id, name, tagline, x, y, sort_order)
    select m.id, 'Dormitori', 'Le camere degli studenti', 50, 50, 99 from public.maps m where m.active order by m.created_at limit 1
    returning id into v_loc;
  end if;
  if v_loc is null then raise exception 'Nessuna mappa attiva per le camere dei dormitori.'; end if;
  select id into v_group from public.room_groups where location_id = v_loc and lower(btrim(name)) = 'dormitori' limit 1;
  if v_group is null then
    insert into public.room_groups (location_id, name, sort_order)
    values (v_loc, 'Dormitori', coalesce((select max(sort_order) + 1 from public.room_groups where location_id = v_loc), 0))
    returning id into v_group;
  end if;
  return v_group;
end;
$$;
revoke execute on function public.dorm_chat_group() from public, anon, authenticated;

-- chat delle camere già create → nel gruppo giusto
do $$
declare
  v_group uuid;
begin
  if not exists (select 1 from public.dorm_rooms where chat_room_id is not null) then return; end if;
  v_group := public.dorm_chat_group();
  update public.rooms ro set group_id = v_group, location_id = (select location_id from public.room_groups where id = v_group)
  where ro.id in (select chat_room_id from public.dorm_rooms where chat_room_id is not null);
end;
$$;

-- DORMITORI E CAMERE DI PARTENZA (ogni camera crea la sua chat da sola)
insert into public.dorms (name, description, sort_order) values
  ('Revelle Hall', 'Il dormitorio più vecchio del campus: corridoi lunghi, muri sottili e la vista sull''oceano dalle finestre dell''ultimo piano.', 1),
  ('Muir Hall', 'Tra gli eucalipti, vicino ai sentieri: qui vivono gli sportivi e chi si alza presto per il surf.', 2),
  ('Marshall Hall', 'Moderno e rumoroso, a due passi dalla biblioteca e dalle feste del venerdì.', 3),
  ('Warren Hall', 'Il più tranquillo: aule studio aperte tutta la notte e una terrazza comune sul tetto.', 4)
on conflict (name) do nothing;

insert into public.dorm_rooms (dorm_id, name, kind, sort_order)
select d.id, 'Camera ' || v.num, v.kind, v.num
from public.dorms d
cross join (values
  (101, 'singola'), (102, 'singola'), (103, 'singola'), (104, 'singola'),
  (201, 'doppia'), (202, 'doppia'), (203, 'doppia'), (204, 'doppia'), (205, 'doppia'), (206, 'doppia')
) as v (num, kind)
where d.name in ('Revelle Hall', 'Muir Hall', 'Marshall Hall', 'Warren Hall')
on conflict (dorm_id, name) do nothing;

-- =====================================================================
-- CAPITANO NEI GRUPPI DELLE SQUADRE E RUOLI DEL BASKET
-- 1. Ogni squadra ha nel suo gruppo il ruolo «Capitano»: lo prende da
--    solo l'atleta che in Gestione → Sport ha lo stato Capitano (uno per
--    squadra); in gara tira sempre con il suo ruolo sportivo.
-- 2. Basket con i cinque ruoli classici: Playmaker, Guardia tiratrice,
--    Ala piccola, Ala grande, Centro.
-- =====================================================================

-- 1. CAPITANO
-- ruolo «Capitano» del gruppo, creato se manca
create or replace function public.sport_group_captain_role(p_group uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role uuid;
begin
  select id into v_role from public.group_roles where group_id = p_group and position_id is null and lower(name) = 'capitano' limit 1;
  if v_role is null then
    insert into public.group_roles (group_id, name, description, salary, max_members, sort_order)
    values (p_group, 'Capitano', 'Guida la squadra dentro e fuori dal campo (uno solo). In gara gareggia nel suo ruolo.', 0, 1, 0)
    returning id into v_role;
  end if;
  return v_role;
end;
$$;
revoke execute on function public.sport_group_captain_role(uuid) from public, anon, authenticated;

-- il ruolo nel gruppo di un atleta: Capitano, altrimenti il suo ruolo in squadra, altrimenti Atleta
create or replace function public.sport_member_role_sync(p_character uuid, p_sport uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid := (select group_id from public.sports where id = p_sport);
  v_position uuid;
  v_status text;
  v_role uuid;
begin
  if v_group is null or not exists (select 1 from public.characters where id = p_character and status = 'approvata') then return; end if;
  select position_id, squad_status into v_position, v_status
  from public.sport_roster where character_id = p_character and sport_id = p_sport and left_at is null;
  if v_status = 'captain' then
    v_role := public.sport_group_captain_role(v_group);
  elsif v_position is not null then
    v_role := public.sport_position_role_sync(v_position);
  end if;
  if v_role is null then v_role := public.sport_group_fallback_role(v_group); end if;
  update public.character_groups set role_id = v_role where character_id = p_character and group_id = v_group and role_id <> v_role;
end;
$$;
revoke execute on function public.sport_member_role_sync(uuid, uuid) from public, anon, authenticated;

-- ora anche il cambio di stato (capitano sì/no) aggiorna il ruolo nel gruppo
drop trigger if exists sport_roster_role_sync on public.sport_roster;
create trigger sport_roster_role_sync after update of position_id, squad_status on public.sport_roster
  for each row execute function public.sport_roster_role_sync();

-- 2. BASKET: cinque ruoli (Guardia → Guardia tiratrice, Ala → Ala grande, nuova Ala piccola)
update public.sport_positions set name = 'Guardia tiratrice'
where name = 'Guardia' and sport_id = (select id from public.sports where name = 'Basketball');
update public.sport_positions set name = 'Ala grande', sort_order = 4
where name = 'Ala' and sport_id = (select id from public.sports where name = 'Basketball');
update public.sport_positions set sort_order = 5
where name = 'Centro' and sport_id = (select id from public.sports where name = 'Basketball');

insert into public.sport_positions (sport_id, name, attribute_id, skill_id, max_slots, team_bonus, sort_order)
select s.id, 'Ala piccola', a.id, sk.id, 2, false, 3
from public.sports s
join public.attributes a on a.code = 'RIF'
left join public.skills sk on lower(sk.name) = 'atletica'
where s.name = 'Basketball'
on conflict (sport_id, name) do nothing;

-- una volta: il ruolo Capitano in tutti i gruppi delle squadre e i capitani al loro posto
do $$
declare
  s record;
  ro record;
begin
  for s in select id, group_id from public.sports where group_id is not null loop
    perform public.sport_group_captain_role(s.group_id);
  end loop;
  for ro in select character_id, sport_id from public.sport_roster where left_at is null loop
    perform public.sport_member_role_sync(ro.character_id, ro.sport_id);
  end loop;
end;
$$;

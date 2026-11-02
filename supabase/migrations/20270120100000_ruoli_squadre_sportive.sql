-- =====================================================================
-- RUOLI DELLE SQUADRE SPORTIVE NEI GRUPPI
-- Il gruppo di ogni sport ha come ruoli i ruoli dello sport (Stile libero,
-- Quarterback…), con caratteristica e abilità nella descrizione. Ogni
-- atleta ha nel gruppo il suo ruolo in squadra; «Atleta» resta per chi
-- non ha un ruolo. Tutto resta allineato da solo: si cambiano i ruoli in
-- Gestione → Sport → Sport e ruoli.
-- =====================================================================

alter table public.group_roles add column if not exists position_id uuid references public.sport_positions (id) on delete cascade;
create unique index if not exists group_roles_position_key on public.group_roles (position_id) where position_id is not null;

-- "VIG + Nuoto e sport acquatici" (+ "conta doppio")
create or replace function public.sport_position_text(p_position uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select a.code || coalesce(' + ' || s.name, '') || case when p.team_bonus then ' · conta doppio per la squadra' else '' end
  from public.sport_positions p join public.attributes a on a.id = p.attribute_id
  left join public.skills s on s.id = p.skill_id
  where p.id = p_position
$$;
revoke execute on function public.sport_position_text(uuid) from public, anon, authenticated;

-- ruolo «Atleta» del gruppo (per chi non ha un ruolo), creato se manca
create or replace function public.sport_group_fallback_role(p_group uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role uuid;
begin
  select id into v_role from public.group_roles where group_id = p_group and position_id is null and lower(name) = 'atleta' limit 1;
  if v_role is null then
    insert into public.group_roles (group_id, name, description, salary, sort_order)
    values (p_group, 'Atleta', 'Student-athlete della squadra, senza un ruolo.', 0, 999) returning id into v_role;
  end if;
  return v_role;
end;
$$;
revoke execute on function public.sport_group_fallback_role(uuid) from public, anon, authenticated;

-- crea o aggiorna il ruolo del gruppo legato a un ruolo sportivo
create or replace function public.sport_position_role_sync(p_position uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.sport_positions;
  v_group uuid;
  v_role uuid;
begin
  select * into p from public.sport_positions where id = p_position;
  select group_id into v_group from public.sports where id = p.sport_id;
  if p.id is null or v_group is null then return null; end if;
  select id into v_role from public.group_roles where position_id = p.id;
  if v_role is null then
    -- un ruolo con lo stesso nome già nel gruppo: lo si collega
    select id into v_role from public.group_roles where group_id = v_group and lower(name) = lower(p.name) and position_id is null;
    if v_role is null then
      insert into public.group_roles (group_id, name, description, salary, sort_order, position_id)
      values (v_group, left(p.name, 60), public.sport_position_text(p.id), 0, p.sort_order, p.id) returning id into v_role;
      return v_role;
    end if;
  end if;
  update public.group_roles set group_id = v_group, name = left(p.name, 60), description = public.sport_position_text(p.id),
    sort_order = p.sort_order, position_id = p.id
  where id = v_role;
  return v_role;
end;
$$;
revoke execute on function public.sport_position_role_sync(uuid) from public, anon, authenticated;

-- il ruolo nel gruppo di un atleta = il suo ruolo in squadra
create or replace function public.sport_member_role_sync(p_character uuid, p_sport uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid := (select group_id from public.sports where id = p_sport);
  v_position uuid;
  v_role uuid;
begin
  if v_group is null or not exists (select 1 from public.characters where id = p_character and status = 'approvata') then return; end if;
  select position_id into v_position from public.sport_roster where character_id = p_character and sport_id = p_sport and left_at is null;
  if v_position is not null then v_role := public.sport_position_role_sync(v_position); end if;
  if v_role is null then v_role := public.sport_group_fallback_role(v_group); end if;
  update public.character_groups set role_id = v_role where character_id = p_character and group_id = v_group and role_id <> v_role;
end;
$$;
revoke execute on function public.sport_member_role_sync(uuid, uuid) from public, anon, authenticated;

-- entrare o uscire dal gruppo con il roster (ora con il ruolo giusto)
create or replace function public.sport_group_member(p_character uuid, p_sport uuid, p_in boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid := (select group_id from public.sports where id = p_sport);
begin
  if v_group is null then return; end if;
  if p_in then
    insert into public.character_groups (character_id, group_id, role_id)
    values (p_character, v_group, public.sport_group_fallback_role(v_group))
    on conflict do nothing;
    perform public.sport_member_role_sync(p_character, p_sport);
  else
    delete from public.character_groups where character_id = p_character and group_id = v_group;
  end if;
end;
$$;
revoke execute on function public.sport_group_member(uuid, uuid, boolean) from public, anon, authenticated;

-- cambio di ruolo in squadra → cambio di ruolo nel gruppo
create or replace function public.sport_roster_role_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.left_at is null then
    perform public.sport_member_role_sync(new.character_id, new.sport_id);
  end if;
  return null;
end;
$$;
revoke execute on function public.sport_roster_role_sync() from public, anon, authenticated;
drop trigger if exists sport_roster_role_sync on public.sport_roster;
create trigger sport_roster_role_sync after update of position_id on public.sport_roster
  for each row execute function public.sport_roster_role_sync();

-- ruoli sportivi creati, cambiati o eliminati → ruoli del gruppo
create or replace function public.sport_positions_role_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role uuid;
  v_group uuid;
begin
  if tg_op = 'DELETE' then
    -- chi aveva quel ruolo passa ad «Atleta» prima che il ruolo sparisca
    select id, group_id into v_role, v_group from public.group_roles where position_id = old.id;
    if v_role is not null then
      update public.character_groups set role_id = public.sport_group_fallback_role(v_group)
      where role_id = v_role and character_id in (select id from public.characters where status = 'approvata');
    end if;
    return old;
  end if;
  perform public.sport_position_role_sync(new.id);
  return null;
end;
$$;
revoke execute on function public.sport_positions_role_sync() from public, anon, authenticated;
drop trigger if exists sport_positions_role_sync on public.sport_positions;
create trigger sport_positions_role_sync after insert or update on public.sport_positions
  for each row execute function public.sport_positions_role_sync();
drop trigger if exists sport_positions_role_cleanup on public.sport_positions;
create trigger sport_positions_role_cleanup before delete on public.sport_positions
  for each row execute function public.sport_positions_role_sync();

-- una volta: ruoli per tutti gli sport e atleti al loro posto
do $$
declare
  p record;
  ro record;
  s record;
begin
  for s in select id, group_id from public.sports where group_id is not null loop
    perform public.sport_group_fallback_role(s.group_id);
    update public.group_roles set sort_order = 999,
      description = 'Student-athlete della squadra, senza un ruolo.'
    where group_id = s.group_id and position_id is null and name = 'Atleta';
  end loop;
  for p in select id from public.sport_positions loop
    perform public.sport_position_role_sync(p.id);
  end loop;
  for ro in select character_id, sport_id from public.sport_roster where left_at is null loop
    perform public.sport_member_role_sync(ro.character_id, ro.sport_id);
  end loop;
end;
$$;

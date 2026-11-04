-- =====================================================================
-- SQUADRE: IL CAPITANO RESTA NEL SUO RUOLO ANCHE NEL GRUPPO
-- Nel gruppo di una squadra ogni atleta ha il suo ruolo sportivo
-- (Attaccante, Difensore…), anche il capitano: così i ruoli del gruppo
-- contano davvero chi li occupa. Che sia il capitano lo dice una scritta
-- accanto al nome (sport_captains). Il ruolo «Capitano» dei gruppi delle
-- squadre non serve più e si toglie.
-- =====================================================================

-- il ruolo nel gruppo di un atleta: il suo ruolo in squadra, altrimenti Atleta
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
  select position_id into v_position
  from public.sport_roster where character_id = p_character and sport_id = p_sport and left_at is null;
  if v_position is not null then
    v_role := public.sport_position_role_sync(v_position);
  end if;
  if v_role is null then v_role := public.sport_group_fallback_role(v_group); end if;
  update public.character_groups set role_id = v_role where character_id = p_character and group_id = v_group and role_id <> v_role;
end;
$$;
revoke execute on function public.sport_member_role_sync(uuid, uuid) from public, anon, authenticated;

-- capitani delle squadre (in tutte le pagine dei gruppi)
create or replace function public.sport_captains()
returns table (character_id uuid, group_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select r.character_id, s.group_id
  from public.sport_roster r join public.sports s on s.id = r.sport_id
  where r.squad_status = 'captain' and r.left_at is null and s.group_id is not null
$$;
revoke execute on function public.sport_captains() from public, anon;
grant execute on function public.sport_captains() to authenticated;

-- una volta: tutti gli atleti al loro ruolo, poi via il ruolo «Capitano» dei gruppi delle squadre
do $$
declare
  ro record;
begin
  for ro in select character_id, sport_id from public.sport_roster where left_at is null loop
    perform public.sport_member_role_sync(ro.character_id, ro.sport_id);
  end loop;
end $$;

delete from public.group_roles gr
where gr.position_id is null and lower(gr.name) = 'capitano'
  and gr.group_id in (select group_id from public.sports where group_id is not null)
  and not exists (select 1 from public.character_groups cg where cg.role_id = gr.id);

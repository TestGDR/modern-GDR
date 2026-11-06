-- =====================================================================
-- FAMA: «RICALCOLA» RISISTEMA ANCHE I LIVELLI
-- - fame_recalc confronta il nuovo livello di fama con l'ultimo avvisato
--   (social_profiles.fame_level_seen): così il ricalcolo sistema e avvisa
--   anche i cambi dovuti ai follower o a soglie cambiate.
-- - fame_recalc_staff(null) passa tutti i personaggi (anche quelli senza
--   riga della fama) e ricalcola tutto.
-- - Una volta: livelli rimasti con la soglia spostata (sopra 100.000)
--   tornano al loro posto; poi ricalcolo di tutti.
-- =====================================================================

create or replace function public.fame_recalc(p_character uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.character_fame;
  v_bg_fame int;
  v_bg_infamy int;
  v_cap int := coalesce(public.setting_int('fama_max_background'), 40);
  v_fame int;
  v_infamy int;
  v_infamy_on boolean := coalesce(public.setting_int('fama_infamia_attiva'), 1) = 1;
  v_followers int := public.social_followers_total(p_character);
  v_before jsonb; v_after jsonb;
  v_seen_id text;
  v_seen_name text;
  c public.characters;
begin
  select * into c from public.characters where id = p_character;
  if c.id is null then return; end if;
  v_old := public.fame_row(p_character);
  select coalesce(sum(case when b.item_id is not null then coalesce(i.fame_points, 0) else coalesce(b.fame_points, 0) end), 0),
         coalesce(sum(case when b.item_id is not null then coalesce(i.infamy_points, 0) else coalesce(b.infamy_points, 0) end), 0)
  into v_bg_fame, v_bg_infamy
  from public.character_fame_bg b left join public.fame_bg_items i on i.id = b.item_id
  where b.character_id = p_character and b.status = 'approvata';
  if v_cap > 0 then v_bg_fame := least(v_bg_fame, v_cap); end if;

  v_fame := v_bg_fame
    + case when v_infamy_on then 0 else v_bg_infamy end
    + coalesce((select sum(points) from public.fame_entries where character_id = p_character and (kind = 'fama' or not v_infamy_on)), 0)
    + coalesce((select sum(fb.points) from public.character_badges cb join public.fame_badges fb on fb.id = cb.badge_id
                where cb.character_id = p_character and (fb.kind = 'fama' or not v_infamy_on)), 0);
  v_infamy := case when v_infamy_on then
      v_bg_infamy
    + coalesce((select sum(points) from public.fame_entries where character_id = p_character and kind = 'infamia'), 0)
    + coalesce((select sum(fb.points) from public.character_badges cb join public.fame_badges fb on fb.id = cb.badge_id
                where cb.character_id = p_character and fb.kind = 'infamia'), 0)
    else 0 end;
  v_fame := greatest(0, v_fame);
  v_infamy := greatest(0, v_infamy);
  update public.character_fame set fame_cache = v_fame, infamy_cache = v_infamy, updated_at = now() where character_id = p_character;

  if c.status = 'approvata' and coalesce(public.setting_int('fama_notifiche'), 1) = 1 then
    v_before := public.fame_level_info(v_old.fame_cache, 'fama', v_followers);
    v_after := public.fame_level_info(v_fame, 'fama', v_followers);
    -- livello di prima: l'ultimo avvisato (così contano anche i cambi dovuti ai follower o alle soglie)
    select l.id::text, l.name into v_seen_id, v_seen_name
    from public.social_profiles sp join public.fame_levels l on l.id = sp.fame_level_seen
    where sp.character_id = p_character;
    if v_seen_id is not null then
      v_before := jsonb_build_object('id', v_seen_id, 'name', v_seen_name);
    end if;
    if v_before ->> 'id' is distinct from v_after ->> 'id' and v_after is not null then
      perform public.send_system_message(c.owner_id, '⭐ La fama di ' || public.first_name(c.name) || ' cambia: ora è «' || (v_after ->> 'name') || '».');
      perform public.fame_log_add(p_character, 'livello', 'Fama: ' || coalesce(v_before ->> 'name', '—') || ' → ' || (v_after ->> 'name'), v_fame);
    end if;
    update public.social_profiles set fame_level_seen = (v_after ->> 'id')::uuid where character_id = p_character;
    if v_infamy_on then
      v_before := public.fame_level_info(v_old.infamy_cache, 'infamia');
      v_after := public.fame_level_info(v_infamy, 'infamia');
      if v_before ->> 'id' is distinct from v_after ->> 'id' and v_after is not null then
        perform public.send_system_message(c.owner_id, '🌶️ L''infamia di ' || public.first_name(c.name) || ' cambia: ora è «' || (v_after ->> 'name') || '».');
        perform public.fame_log_add(p_character, 'livello', 'Infamia: ' || coalesce(v_before ->> 'name', '—') || ' → ' || (v_after ->> 'name'), v_infamy);
      end if;
    end if;
  end if;
end;
$$;

create or replace function public.fame_recalc_staff(p_character uuid default null)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_n int := 0;
begin
  if not public.has_permission('fama.gestire') then raise exception 'Non hai il permesso di gestire la fama.' using errcode = '42501'; end if;
  for r in select id from public.characters where p_character is null or id = p_character loop
    perform public.fame_recalc(r.id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke execute on function public.fame_recalc_staff(uuid) from public, anon;
grant execute on function public.fame_recalc_staff(uuid) to authenticated;

-- una volta: soglie rimaste spostate (livelli con il nome cambiato a mano) tornano al loro posto
update public.fame_levels l set min_points = l.min_points - 100000
where l.min_points >= 100000 and l.min_points < 200000
  and not exists (select 1 from public.fame_levels x where x.kind = l.kind and x.min_points = l.min_points - 100000);

-- una volta: tutti ricalcolati
do $$
declare
  r record;
begin
  for r in select id from public.characters loop
    perform public.fame_recalc(r.id);
  end loop;
end $$;

-- controllo: i livelli come sono adesso
select kind as tipo, name as livello, min_points as da_punti, min_followers as oppure_follower
from public.fame_levels order by kind, min_points;

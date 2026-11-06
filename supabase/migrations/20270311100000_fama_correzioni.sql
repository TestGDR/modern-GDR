-- =====================================================================
-- FAMA: CORREZIONI DELLO STAFF
-- 1. Le soglie di follower danno fama una volta sola
--    (social_profiles.fame_thresholds): se lo staff elimina la voce
--    «Ha superato N follower», non viene ricreata il giorno dopo.
-- 2. Fama e infamia non scendono mai sotto zero.
-- 3. fame_recalc_staff: ricalcola un personaggio (o tutti) dal pannello.
-- Le correzioni si fanno con una voce «Correzione dello staff» (punti
-- negativi o positivi), anche nascosta al giocatore.
-- =====================================================================
alter table public.social_profiles add column if not exists fame_thresholds int[] not null default '{}';

-- soglie già date finora (dalle voci che esistono)
update public.social_profiles sp
set fame_thresholds = coalesce((
  select array_agg(distinct replace(substring(fe.title from 'Ha superato ([0-9.]+) follower'), '.', '')::int)
  from public.fame_entries fe
  where fe.character_id = sp.character_id and fe.title ~ '^Ha superato [0-9.]+ follower$'), '{}');

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
  v_before jsonb; v_after jsonb;
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
  -- fama e infamia non scendono mai sotto zero (anche con correzioni negative)
  v_fame := greatest(0, v_fame);
  v_infamy := greatest(0, v_infamy);
  update public.character_fame set fame_cache = v_fame, infamy_cache = v_infamy, updated_at = now() where character_id = p_character;

  if c.status = 'approvata' and coalesce(public.setting_int('fama_notifiche'), 1) = 1 then
    v_before := public.fame_level_info(v_old.fame_cache, 'fama');
    v_after := public.fame_level_info(v_fame, 'fama');
    if v_before ->> 'id' is distinct from v_after ->> 'id' and v_after is not null then
      perform public.send_system_message(c.owner_id, '⭐ La fama di ' || public.first_name(c.name) || ' cambia: ora è «' || (v_after ->> 'name') || '».');
      perform public.fame_log_add(p_character, 'livello', 'Fama: ' || coalesce(v_before ->> 'name', '—') || ' → ' || (v_after ->> 'name'), v_fame);
    end if;
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

-- ricalcolo a mano dallo staff (un personaggio, o tutti con p_character null)
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
  for r in select character_id from public.character_fame where p_character is null or character_id = p_character loop
    perform public.fame_recalc(r.character_id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke execute on function public.fame_recalc_staff(uuid) from public, anon;
grant execute on function public.fame_recalc_staff(uuid) to authenticated;

-- una volta: tutti i totali ricalcolati (e mai sotto zero)
do $$
declare
  r record;
begin
  for r in select character_id from public.character_fame loop
    perform public.fame_recalc(r.character_id);
  end loop;
end $$;

create or replace function public.social_grow_all()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := public.rome_today();
  v_like_pct numeric := coalesce(public.setting_int('social_like_pct'), 4);
  v_like_days int := greatest(1, coalesce(public.setting_int('social_like_giorni'), 3));
  v_idle int := coalesce(public.setting_int('social_inattivo_giorni'), 7);
  v_idle_pct numeric := coalesce(public.setting_int('social_calo_inattivo_pct'), 1);
  v_bought_pct numeric := coalesce(public.setting_int('social_comprati_crescita_pct'), 200);
  v_th numeric[] := public.uni_list('social_soglie_follower');
  v_pts numeric[] := public.uni_list('social_soglie_fama');
  p record;
  po record;
  v_base int;
  v_mult numeric;
  v_last timestamptz;
  v_npc int;
  v_bought int;
  v_total int;
  v_title text;
  v_n int := 0;
begin
  for p in
    select sp.*, c.status from public.social_profiles sp join public.characters c on c.id = sp.character_id
    where c.status = 'approvata' and sp.grown_on is distinct from v_today
  loop
    v_base := coalesce((select l.social_followers_day from public.fame_levels l
                        where l.id = ((public.character_fame_level(p.character_id, 'fama')) ->> 'id')::uuid), 0);
    v_mult := case when p.boost_until > now() then p.boost_mult else 1 end;
    select max(created_at) into v_last from public.social_posts where character_id = p.character_id;
    v_npc := p.npc_followers;
    if v_last is null or v_last < now() - make_interval(days => v_idle) then
      v_npc := greatest(0, v_npc - ceil(v_npc * v_idle_pct / 100.0)::int);
    else
      v_npc := v_npc + round(v_base * (0.7 + random() * 0.6) * v_mult)::int;
    end if;
    -- comprati: sono pagati, non calano mai; ogni giorno crescono in base alla fama
    -- (anche senza post), con la campagna attiva di più
    v_bought := greatest(p.bought_followers, p.bought_paid);
    if p.bought_paid > 0 then
      v_bought := v_bought + greatest(0, round(v_base * v_bought_pct / 100.0 * (0.7 + random() * 0.6) * v_mult)::int);
    end if;
    update public.social_profiles set npc_followers = v_npc, bought_followers = v_bought, grown_on = v_today
    where character_id = p.character_id;
    -- totale: veri + pubblico PNG + comprati + quelli del background (Influencer…)
    v_total := v_npc + v_bought + p.bg_followers + (select count(*)::int from public.social_follows where followed_id = p.character_id);

    -- like PNG ai post dei primi giorni
    for po in
      select id, created_at from public.social_posts
      where character_id = p.character_id and created_at > now() - make_interval(days => v_like_days)
    loop
      update public.social_posts
      set npc_likes = npc_likes + greatest(0, round(v_total * v_like_pct / 100.0 / v_like_days * (0.7 + random() * 0.6)
                        * case when p.boost_until > po.created_at then p.boost_mult else 1 end)::int)
      where id = po.id;
    end loop;

    -- soglie di follower: una voce di fama per soglia
    for i in 1..coalesce(array_length(v_th, 1), 0) loop
      -- i follower del background hanno già dato la loro fama con la voce: per le soglie non contano
      continue when v_total - p.bg_followers < v_th[i] or coalesce(v_pts[i], 0) <= 0;
      -- ogni soglia dà fama una volta sola: se lo staff toglie la voce, non torna
      continue when v_th[i]::int = any (p.fame_thresholds);
      v_title := 'Ha superato ' || replace(to_char(v_th[i], 'FM999,999,999'), ',', '.') || ' follower';
      if not exists (select 1 from public.fame_entries where character_id = p.character_id and title = v_title) then
        insert into public.fame_entries (character_id, title, description, points, kind, is_public, author_id)
        values (p.character_id, v_title, 'Il profilo social è cresciuto fino a superare ' || replace(to_char(v_th[i], 'FM999,999,999'), ',', '.') || ' follower.',
                v_pts[i]::int, 'fama', true, null);
      end if;
      update public.social_profiles set fame_thresholds = fame_thresholds || v_th[i]::int where character_id = p.character_id;
    end loop;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke execute on function public.social_grow_all() from public, anon, authenticated;

-- =====================================================================
-- FOLLOWER DAL BACKGROUND DI FAMA
-- Ogni voce del catalogo del background può dare follower sul social
-- (fame_bg_items.social_followers): «Influencer con 50.000 follower» ne
-- dà 50.000. Sono un pubblico fisso (social_profiles.bg_followers), che
-- non cala e segue la voce: se viene tolta o la scheda resettata, se ne
-- vanno. Contano per i like dei post, non per le soglie di fama (la voce
-- ha già dato la sua fama).
-- =====================================================================
alter table public.fame_bg_items add column if not exists social_followers int not null default 0
  check (social_followers between 0 and 10000000);
update public.fame_bg_items set social_followers = 50000 where name = 'Influencer con 50.000 follower' and social_followers = 0;
update public.fame_bg_items set social_followers = 10000 where name = 'Canale seguito' and social_followers = 0;
update public.fame_bg_items set social_followers = 5000 where name = 'Video virale' and social_followers = 0;

alter table public.social_profiles add column if not exists bg_followers int not null default 0 check (bg_followers >= 0);

-- follower del background di un personaggio (voci approvate)
create or replace function public.social_bg_followers(p_character uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(i.social_followers), 0)::int
  from public.character_fame_bg b join public.fame_bg_items i on i.id = b.item_id
  where b.character_id = p_character and b.status = 'approvata'
$$;
revoke execute on function public.social_bg_followers(uuid) from public, anon, authenticated;

create or replace function public.social_bg_sync(p_character uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v int := public.social_bg_followers(p_character);
begin
  update public.social_profiles set bg_followers = v where character_id = p_character and bg_followers is distinct from v;
end;
$$;
revoke execute on function public.social_bg_sync(uuid) from public, anon, authenticated;

-- voce scelta, approvata, tolta
create or replace function public.character_fame_bg_social_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.social_bg_sync(case when tg_op = 'DELETE' then old.character_id else new.character_id end);
  return null;
end;
$$;
revoke execute on function public.character_fame_bg_social_sync() from public, anon, authenticated;
drop trigger if exists character_fame_bg_social_sync on public.character_fame_bg;
create trigger character_fame_bg_social_sync after insert or update or delete on public.character_fame_bg
  for each row execute function public.character_fame_bg_social_sync();

-- lo staff cambia i follower di una voce: si aggiornano tutti quelli che l'hanno
create or replace function public.fame_bg_items_social_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  if new.social_followers is distinct from old.social_followers then
    for r in select distinct character_id from public.character_fame_bg where item_id = new.id loop
      perform public.social_bg_sync(r.character_id);
    end loop;
  end if;
  return null;
end;
$$;
revoke execute on function public.fame_bg_items_social_sync() from public, anon, authenticated;
drop trigger if exists fame_bg_items_social_sync on public.fame_bg_items;
create trigger fame_bg_items_social_sync after update of social_followers on public.fame_bg_items
  for each row execute function public.fame_bg_items_social_sync();

-- profilo social nuovo: parte già con i follower del background
create or replace function public.social_profiles_bg_init()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.bg_followers := public.social_bg_followers(new.character_id);
  return new;
end;
$$;
revoke execute on function public.social_profiles_bg_init() from public, anon, authenticated;
drop trigger if exists social_profiles_bg_init on public.social_profiles;
create trigger social_profiles_bg_init before insert on public.social_profiles
  for each row execute function public.social_profiles_bg_init();

-- una volta: i profili che esistono già
update public.social_profiles sp set bg_followers = public.social_bg_followers(sp.character_id);

-- crescita di ogni giorno: anche i follower del background nel totale
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
      v_title := 'Ha superato ' || replace(to_char(v_th[i], 'FM999,999,999'), ',', '.') || ' follower';
      if not exists (select 1 from public.fame_entries where character_id = p.character_id and title = v_title) then
        insert into public.fame_entries (character_id, title, description, points, kind, is_public, author_id)
        values (p.character_id, v_title, 'Il profilo social è cresciuto fino a superare ' || replace(to_char(v_th[i], 'FM999,999,999'), ',', '.') || ' follower.',
                v_pts[i]::int, 'fama', true, null);
      end if;
    end loop;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke execute on function public.social_grow_all() from public, anon, authenticated;

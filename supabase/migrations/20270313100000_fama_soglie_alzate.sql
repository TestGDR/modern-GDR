-- =====================================================================
-- FAMA: PIÙ LIVELLI, SOGLIE ALZATE E LIVELLO MINIMO DAI FOLLOWER
-- - Fama in 8 livelli: Sconosciuto 0, Noto nel campus 20, Popolare 50,
--   Influente 80, Celebre 120, Star 170, Icona 220, Leggenda di San Diego 300.
--   Infamia in 6: Pulito 0, Chiacchierato 20, Discusso 45, Malfamato 70,
--   Famigerato 110, Nemico pubblico 160.
-- - fame_levels.min_followers (0 o vuoto = solo punti): con quei follower sul social (tutti: veri,
--   pubblico PNG, comprati e del background) si è almeno a quel livello,
--   anche con meno punti (5.000 Noto, 15.000 Popolare, 30.000 Influente,
--   50.000 Celebre, 100.000 Star, 500.000 Icona; Leggenda solo giocando).
--   fame_level_info(punti, tipo, follower); quella a due argomenti resta
--   (follower = 0). Il cambio di livello dovuto ai follower si avvisa in
--   social_grow_all.
-- - Le soglie di follower superate grazie ai follower comprati danno punti
--   fama al massimo una volta ogni social_comprati_fama_mesi (6) mesi
--   (social_profiles.bought_fame_at); quelle saltate restano libere.
-- =====================================================================

alter table public.fame_levels add column if not exists min_followers int check (min_followers is null or min_followers >= 0);
alter table public.social_profiles add column if not exists bought_fame_at timestamptz;
-- ultimo livello di fama avvisato (per avvisare i cambi dovuti ai follower)
alter table public.social_profiles add column if not exists fame_level_seen uuid;

-- 1. LIVELLI (prima si spostano di lato per il vincolo unico su tipo + punti)
update public.fame_levels set min_points = min_points + 100000
where (kind = 'fama' and name in ('Noto nel campus', 'Popolare', 'Celebre', 'Leggenda di San Diego'))
   or (kind = 'infamia' and name in ('Chiacchierato', 'Malfamato', 'Famigerato'));

insert into public.fame_levels (kind, name, min_points, sort_order, icon, color)
select v.kind, v.name, 200000 + v.ord, v.ord, v.icon, v.color
from (values
  ('fama', 'Influente', 4, '📸', '#f2b39c'),
  ('fama', 'Star', 6, '💫', '#ec8cb8'),
  ('fama', 'Icona', 7, '💎', '#ec8cb8'),
  ('infamia', 'Discusso', 3, '🗯️', '#c391cc'),
  ('infamia', 'Nemico pubblico', 6, '☠️', '#ec8cb8')
) as v (kind, name, ord, icon, color)
where not exists (select 1 from public.fame_levels l where l.kind = v.kind and l.name = v.name);

update public.fame_levels l
set min_points = v.pts, sort_order = v.ord, min_followers = v.followers, gossip_bonus = v.bonus, social_followers_day = v.per_day,
    description = case when l.description = '' or v.force then v.descr else l.description end
from (values
  ('fama', 'Sconosciuto', 0, 1, null::int, 0, 3, false, ''),
  ('fama', 'Noto nel campus', 20, 2, 5000, 1, 20, false, ''),
  ('fama', 'Popolare', 50, 3, 15000, 2, 80, false, ''),
  ('fama', 'Influente', 80, 4, 30000, 2, 150, true,
   'Hai un pubblico vero: brand piccoli ti propongono collaborazioni, i locali ti invitano, i giornali del college ti citano. Nei luoghi pubblici del campus vieni riconosciuto spesso e a San Diego capita che qualcuno ti fermi. Quello che fai in pubblico finisce facilmente online.'),
  ('fama', 'Celebre', 120, 5, 50000, 3, 300, false, ''),
  ('fama', 'Star', 170, 6, 100000, 4, 500, true,
   'Sei una star: interviste, eventi, inviti ovunque, agenti e manager che ti cercano. In pubblico è difficile passare inosservati e i paparazzi sanno dove trovarti. Ogni tua scelta ha un pubblico enorme: gioca la pressione, l''invidia e le persone che si avvicinano per interesse.'),
  ('fama', 'Icona', 220, 7, 500000, 5, 800, true,
   'Il tuo nome è un marchio: sei conosciuto in tutta la California e oltre. Non esiste un luogo pubblico dove tu possa stare tranquillo; servono sicurezza, ingressi riservati, posti privati. Tutto quello che fai fa tendenza o scandalo.'),
  ('fama', 'Leggenda di San Diego', 300, 8, null::int, 6, 1200, false, ''),
  ('infamia', 'Pulito', 0, 1, null::int, 0, 0, false, ''),
  ('infamia', 'Chiacchierato', 20, 2, null::int, 1, 0, false, ''),
  ('infamia', 'Discusso', 45, 3, null::int, 2, 0, true,
   'Il tuo nome divide: c''è chi ti difende e chi ti attacca. Le voci su di te girano in fretta e qualche porta comincia a chiudersi. Nei luoghi pubblici chi ti riconosce ti osserva con sospetto.'),
  ('infamia', 'Malfamato', 70, 4, null::int, 2, 0, false, ''),
  ('infamia', 'Famigerato', 110, 5, null::int, 3, 0, false, ''),
  ('infamia', 'Nemico pubblico', 160, 6, null::int, 4, 0, true,
   'Sei il cattivo della storia per tutto il campus e oltre: polizia, stampa e amministrazione hanno gli occhi su di te. Ovunque vai qualcuno ti riconosce e lo racconta; chi ti sta vicino rischia la reputazione.')
) as v (kind, name, pts, ord, followers, bonus, per_day, force, descr)
where l.kind = v.kind and l.name = v.name;

-- 2. TOTALE DEI FOLLOWER DI UN PERSONAGGIO (come nel profilo)
create or replace function public.social_followers_total(p_character uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select sp.npc_followers + sp.bought_followers + sp.bg_followers from public.social_profiles sp where sp.character_id = p_character), 0)
    + (select count(*)::int from public.social_follows where followed_id = p_character)
$$;
revoke execute on function public.social_followers_total(uuid) from public, anon;
grant execute on function public.social_followers_total(uuid) to authenticated;

-- 3. LIVELLO CON I FOLLOWER: il più alto tra quello dei punti e quello dei follower
create or replace function public.fame_level_info(p_points int, p_kind text, p_followers int)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with by_points as (
    select * from public.fame_levels where kind = p_kind and min_points <= greatest(p_points, 0)
    order by min_points desc limit 1
  ), by_followers as (
    select * from public.fame_levels where kind = p_kind and min_followers > 0 and min_followers <= greatest(coalesce(p_followers, 0), 0)
    order by min_points desc limit 1
  ), low as (
    select * from public.fame_levels where kind = p_kind order by min_points limit 1
  ), cur as (
    select * from (select * from by_points union all select * from by_followers) x order by min_points desc limit 1
  ), lv as (
    select * from cur union all select * from low where not exists (select 1 from cur)
  ), nxt as (
    select * from public.fame_levels where kind = p_kind and min_points > (select min_points from lv)
    order by min_points limit 1
  )
  select case when not exists (select 1 from lv) then null else jsonb_build_object(
    'points', p_points,
    'followers', coalesce(p_followers, 0),
    'by_followers', (select min_points from lv) > greatest(p_points, 0),
    'min_followers', (select min_followers from lv),
    'description', (select description from lv), 'gossip_bonus', (select gossip_bonus from lv),
    'id', (select id from lv), 'name', (select name from lv), 'icon', (select icon from lv), 'color', (select color from lv),
    'min', (select min_points from lv),
    'next_name', (select name from nxt), 'next_min', (select min_points from nxt),
    'next_followers', (select min_followers from nxt),
    'missing', case when exists (select 1 from nxt) then (select min_points from nxt) - p_points end,
    'pct', case when p_points < 0 then 0
                when not exists (select 1 from nxt) then 100
                else least(100, greatest(0, round(100.0 * (p_points - (select min_points from lv))
                       / nullif((select min_points from nxt) - (select min_points from lv), 0))))::int end) end
$$;
revoke execute on function public.fame_level_info(int, text, int) from public, anon;
grant execute on function public.fame_level_info(int, text, int) to authenticated;

create or replace function public.fame_level_info(p_points int, p_kind text default 'fama')
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.fame_level_info(p_points, p_kind, 0)
$$;

-- livello di un personaggio (la fama conta anche i follower)
create or replace function public.character_fame_level(p_character uuid, p_kind text default 'fama')
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.fame_level_info(case when p_kind = 'infamia' then f.infamy_cache else f.fame_cache end, p_kind,
           case when p_kind = 'infamia' then 0 else public.social_followers_total(p_character) end)
  from public.character_fame f where f.character_id = p_character
$$;

create or replace function public.fame_ranking()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(x order by (x ->> 'fame')::int desc, x ->> 'name'), '[]'::jsonb)
  from (
    select jsonb_build_object('id', c.id, 'name', c.name, 'avatar_url', c.avatar_url, 'fame', f.fame_cache,
      'infamy', case when coalesce(public.setting_int('fama_infamia_attiva'), 1) = 1 then f.infamy_cache end,
      'level', public.fame_level_info(f.fame_cache, 'fama', public.social_followers_total(c.id))) as x
    from public.character_fame f join public.characters c on c.id = f.character_id
    where c.status = 'approvata' and auth.uid() is not null
    order by f.fame_cache desc, c.name
    limit greatest(0, coalesce(public.setting_int('fama_classifica_n'), 20))
  ) t
$$;

create or replace function public.fame_icons(p_characters uuid[])
returns table (character_id uuid, fame_name text, fame_icon text, infamy_name text, infamy_icon text)
language sql
stable
security definer
set search_path = ''
as $$
  select f.character_id,
    public.fame_level_info(f.fame_cache, 'fama', public.social_followers_total(f.character_id)) ->> 'name',
    public.fame_level_info(f.fame_cache, 'fama', public.social_followers_total(f.character_id)) ->> 'icon',
    case when coalesce(public.setting_int('fama_infamia_attiva'), 1) = 1 then public.fame_level_info(f.infamy_cache, 'infamia') ->> 'name' end,
    case when coalesce(public.setting_int('fama_infamia_attiva'), 1) = 1 then public.fame_level_info(f.infamy_cache, 'infamia') ->> 'icon' end
  from public.character_fame f
  where f.character_id = any (p_characters) and auth.uid() is not null
    and coalesce(public.setting_int('fama_icona_presenti'), 1) = 1
$$;

create or replace function public.fame_overview(p_character uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.character_fame;
  v_staff boolean := public.has_permission('fama.gestire');
  v_owner boolean := exists (select 1 from public.characters where id = p_character and owner_id = auth.uid());
  v_infamy_on boolean := coalesce(public.setting_int('fama_infamia_attiva'), 1) = 1;
begin
  if auth.uid() is null then raise exception 'Serve l''accesso.' using errcode = '42501'; end if;
  f := public.fame_row(p_character);
  return jsonb_build_object(
    'fame', public.fame_level_info(f.fame_cache, 'fama', public.social_followers_total(p_character)),
    'infamy', case when v_infamy_on then public.fame_level_info(f.infamy_cache, 'infamia') end,
    'converted', f.converted, 'pf_pool', f.pf_pool, 'pf_converted', f.pf_converted, 'px_from_conversion', f.px_from_conversion,
    'max_background', coalesce(public.setting_int('fama_max_background'), 40),
    'is_staff', v_staff, 'is_owner', v_owner,
    'background', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'name', coalesce(b.custom_name, i.name),
                     'description', coalesce(nullif(b.custom_description, ''), i.description, ''), 'category', coalesce(i.category, b.category),
                     'cost', b.cost_pf, 'status', b.status,
                     'fame', case when b.item_id is not null then i.fame_points else b.fame_points end,
                     'infamy', case when b.item_id is not null then i.infamy_points else b.infamy_points end) order by b.created_at)
                   from public.character_fame_bg b left join public.fame_bg_items i on i.id = b.item_id
                   where b.character_id = p_character and (b.status = 'approvata' or v_staff or v_owner)), '[]'::jsonb),
    'badges', coalesce((select jsonb_agg(jsonb_build_object('id', cb.id, 'badge_id', fb.id, 'name', fb.name, 'description', fb.description,
                     'icon', fb.icon, 'points', fb.points, 'kind', fb.kind, 'reason', cb.reason, 'date', cb.created_at,
                     'rarity', r.name, 'color', coalesce(r.color, '#b8a8e4')) order by cb.created_at desc)
                   from public.character_badges cb join public.fame_badges fb on fb.id = cb.badge_id
                   left join public.fame_rarities r on r.id = fb.rarity_id
                   where cb.character_id = p_character and (v_infamy_on or fb.kind = 'fama')), '[]'::jsonb),
    'entries', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'title', e.title, 'description', e.description, 'points', e.points,
                     'kind', e.kind, 'public', e.is_public, 'date', e.created_at) order by e.created_at desc)
                   from public.fame_entries e
                   where e.character_id = p_character and (e.is_public or v_staff) and (v_infamy_on or e.kind = 'fama')), '[]'::jsonb));
end;
$$;

-- ricalcolo: l'avviso di cambio livello tiene conto anche dei follower
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

-- pettegolezzi: il bonus usa il livello vero (anche quello dei follower)
create or replace function public.gossip_roll(p_character uuid, p_room uuid default null)
returns table (id uuid, seen boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.gossip_settings;
  v_roll int;
  v_bonus int := 0;
  v_id uuid;
begin
  if not public.owns_character(p_character) then
    raise exception 'Serve un personaggio approvato.' using errcode = 'P0001';
  end if;
  select * into s from public.gossip_settings;
  if p_room is not null and exists (select 1 from public.rooms where rooms.id = p_room and access = 'pubblica') then
    v_bonus := greatest(0,
      coalesce((public.character_fame_level(p_character, 'fama') ->> 'gossip_bonus')::int, 0),
      coalesce((public.character_fame_level(p_character, 'infamia') ->> 'gossip_bonus')::int, 0));
  end if;
  v_roll := 1 + floor(random() * s.die_sides)::int;
  insert into public.gossip_rolls (character_id, user_id, roll, sides, seen, room_id, bonus)
  values (p_character, auth.uid(), v_roll, s.die_sides, v_roll + v_bonus >= s.seen_from, p_room, v_bonus)
  returning gossip_rolls.id into v_id;
  return query select v_id, v_roll + v_bonus >= s.seen_from;
end;
$$;

-- 4. FOLLOWER COMPRATI: punti fama dalle soglie al massimo una volta ogni 6 mesi
insert into public.game_settings (key, value, kind, label, description, sort_order) values
  ('social_comprati_fama_mesi', '6', 'number', 'Social · Mesi tra due volte in cui i follower comprati danno fama',
   'Le soglie di follower superate grazie ai follower comprati danno punti fama al massimo una volta ogni tanti mesi. 0 = sempre.', 429)
on conflict (key) do nothing;

alter table public.social_profiles add column if not exists bought_fame_at timestamptz;


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
  v_bought_months int := coalesce(public.setting_int('social_comprati_fama_mesi'), 6);
  v_notify boolean := coalesce(public.setting_int('fama_notifiche'), 1) = 1;
  v_th numeric[] := public.uni_list('social_soglie_follower');
  v_pts numeric[] := public.uni_list('social_soglie_fama');
  p record;
  po record;
  v_lv_before jsonb;
  v_lv_after jsonb;
  v_base int;
  v_mult numeric;
  v_last timestamptz;
  v_npc int;
  v_bought int;
  v_total int;
  v_real int;
  v_bought_ok boolean;
  v_bought_used boolean;
  v_title text;
  v_n int := 0;
begin
  for p in
    select sp.*, c.status, c.owner_id, c.name as char_name
    from public.social_profiles sp join public.characters c on c.id = sp.character_id
    where c.status = 'approvata' and sp.grown_on is distinct from v_today
  loop
    v_lv_before := public.character_fame_level(p.character_id, 'fama');
    v_base := coalesce((select l.social_followers_day from public.fame_levels l where l.id = (v_lv_before ->> 'id')::uuid), 0);
    v_mult := case when p.boost_until > now() then p.boost_mult else 1 end;
    select max(created_at) into v_last from public.social_posts where character_id = p.character_id;
    v_npc := p.npc_followers;
    if v_last is null or v_last < now() - make_interval(days => v_idle) then
      v_npc := greatest(0, v_npc - ceil(v_npc * v_idle_pct / 100.0)::int);
    else
      v_npc := v_npc + round(v_base * (0.7 + random() * 0.6) * v_mult)::int;
    end if;
    -- comprati: sono pagati, non calano mai; ogni giorno crescono in base alla fama
    v_bought := greatest(p.bought_followers, p.bought_paid);
    if p.bought_paid > 0 then
      v_bought := v_bought + greatest(0, round(v_base * v_bought_pct / 100.0 * (0.7 + random() * 0.6) * v_mult)::int);
    end if;
    update public.social_profiles set npc_followers = v_npc, bought_followers = v_bought, grown_on = v_today
    where character_id = p.character_id;
    v_total := v_npc + v_bought + p.bg_followers + (select count(*)::int from public.social_follows where followed_id = p.character_id);
    v_real := v_total - p.bg_followers - v_bought;

    -- livello cambiato per i follower (anche comprati o seguiti da ieri): avviso
    v_lv_after := public.character_fame_level(p.character_id, 'fama');
    if v_notify and v_lv_after is not null and p.fame_level_seen is not null
       and p.fame_level_seen::text is distinct from v_lv_after ->> 'id' then
      perform public.send_system_message(p.owner_id, '⭐ La fama di ' || public.first_name(p.char_name) || ' cambia: ora è «' || (v_lv_after ->> 'name') || '» (follower sul social).');
      perform public.fame_log_add(p.character_id, 'livello', 'Fama: ' || coalesce((select name from public.fame_levels where id = p.fame_level_seen), '—') || ' → ' || (v_lv_after ->> 'name') || ' (follower)', (v_lv_after ->> 'points')::int);
    end if;
    update public.social_profiles set fame_level_seen = (v_lv_after ->> 'id')::uuid where character_id = p.character_id;

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
    -- quelle superate solo grazie ai comprati: al massimo una volta ogni v_bought_months mesi
    v_bought_ok := v_bought_months <= 0 or p.bought_fame_at is null
                   or p.bought_fame_at <= now() - make_interval(months => v_bought_months);
    v_bought_used := false;
    for i in 1..coalesce(array_length(v_th, 1), 0) loop
      continue when v_total - p.bg_followers < v_th[i] or coalesce(v_pts[i], 0) <= 0;
      continue when v_th[i]::int = any (p.fame_thresholds);
      if v_real < v_th[i] then
        continue when not v_bought_ok;
        v_bought_used := true;
      end if;
      v_title := 'Ha superato ' || replace(to_char(v_th[i], 'FM999,999,999'), ',', '.') || ' follower';
      if not exists (select 1 from public.fame_entries where character_id = p.character_id and title = v_title) then
        insert into public.fame_entries (character_id, title, description, points, kind, is_public, author_id)
        values (p.character_id, v_title, 'Il profilo social è cresciuto fino a superare ' || replace(to_char(v_th[i], 'FM999,999,999'), ',', '.') || ' follower.',
                v_pts[i]::int, 'fama', true, null);
      end if;
      update public.social_profiles set fame_thresholds = fame_thresholds || v_th[i]::int where character_id = p.character_id;
    end loop;
    if v_bought_used then
      update public.social_profiles set bought_fame_at = now() where character_id = p.character_id;
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- tutti i profili partono dal livello di oggi (niente avvisi arretrati)
update public.social_profiles sp set fame_level_seen = (public.character_fame_level(sp.character_id, 'fama') ->> 'id')::uuid;

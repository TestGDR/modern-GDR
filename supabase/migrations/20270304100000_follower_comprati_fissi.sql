-- =====================================================================
-- SOCIAL: I FOLLOWER COMPRATI NON CALANO, CRESCONO CON LA FAMA
-- Sono pagati: non scendono mai sotto quelli comprati
-- (social_profiles.bought_paid). Ogni giorno crescono in base al livello
-- di fama: social_comprati_crescita_pct (200) % dei follower al giorno
-- del livello (fame_levels.social_followers_day). L'impostazione del calo
-- giornaliero non serve più.
-- Una volta: chi ne aveva persi li riavrà tutti.
-- =====================================================================

alter table public.social_profiles add column if not exists bought_paid int not null default 0 check (bought_paid >= 0);

-- una volta: quanti follower ha pagato ognuno, dagli acquisti fatti
update public.social_profiles sp
set bought_paid = x.paid, bought_followers = greatest(sp.bought_followers, x.paid)
from (
  select pu.character_id, sum(pk.amount)::int as paid
  from public.social_purchases pu join public.social_packages pk on pk.id = pu.package_id
  where pk.kind = 'follower'
  group by pu.character_id
) x
where x.character_id = sp.character_id;

delete from public.game_settings where key = 'social_comprati_calo_pct';
insert into public.game_settings (key, value, kind, label, description, sort_order) values
  ('social_comprati_crescita_pct', '200', 'number', 'Social · Crescita dei follower comprati (% della crescita del livello)', 'Ogni giorno i follower comprati aumentano di questa percentuale dei «follower al giorno» del livello di fama (200 = il doppio del pubblico PNG). Non calano mai. 0 = restano fermi.', 424)
on conflict (key) do nothing;

create or replace function public.social_buy(p_character uuid, p_package uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  k public.social_packages;
  c public.characters;
  v_caught boolean := false;
  v_infamy int := coalesce(public.setting_int('social_comprati_infamia'), 5);
begin
  if not public.owns_character(p_character) then raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501'; end if;
  if not exists (select 1 from public.social_profiles where character_id = p_character) then
    raise exception 'Prima crea il tuo profilo social.' using errcode = 'P0001';
  end if;
  select * into k from public.social_packages where id = p_package and active;
  if k.id is null then raise exception 'Pacchetto non disponibile.' using errcode = 'P0001'; end if;
  select * into c from public.characters where id = p_character;
  perform public.bank_move(p_character, -k.price, 'servizio', 'Social: ' || k.name, true);
  if k.kind = 'follower' then
    update public.social_profiles set bought_followers = bought_followers + k.amount, bought_paid = bought_paid + k.amount where character_id = p_character;
    v_caught := random() * 100 < coalesce(public.setting_int('social_comprati_rischio_pct'), 10);
    if v_caught and v_infamy > 0 then
      insert into public.fame_entries (character_id, title, description, points, kind, is_public, author_id)
      values (p_character, 'Follower comprati', 'Qualcuno ha scoperto che ' || public.first_name(c.name) || ' ha comprato follower.', v_infamy, 'infamia', true, null);
    end if;
  else
    update public.social_profiles
    set boost_until = greatest(coalesce(boost_until, now()), now()) + make_interval(days => k.days),
        boost_mult = greatest(k.multiplier, case when boost_until > now() then boost_mult else 1 end)
    where character_id = p_character;
  end if;
  insert into public.social_purchases (character_id, package_id, name, price, caught) values (p_character, k.id, k.name, k.price, v_caught);
  return jsonb_build_object('kind', k.kind, 'amount', k.amount, 'days', k.days, 'caught', v_caught);
end;
$$;
revoke execute on function public.social_buy(uuid, uuid) from public, anon;
grant execute on function public.social_buy(uuid, uuid) to authenticated;

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
    v_total := v_npc + v_bought + (select count(*)::int from public.social_follows where followed_id = p.character_id);

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
      continue when v_total < v_th[i] or coalesce(v_pts[i], 0) <= 0;
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

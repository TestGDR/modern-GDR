-- =====================================================================
-- PACCHETTI DEL SOCIAL: QUANTE VOLTE E OGNI QUANTO
-- - social_packages.max_per_character: quante volte un personaggio può
--   comprarlo in tutto (0 = senza limite). Il pacchetto da 50.000 follower: 1.
-- - social_packages.cooldown_days: giorni da aspettare tra un acquisto e il
--   successivo dello stesso pacchetto (0 = nessuna attesa). Gli altri
--   pacchetti di follower: 30 giorni.
-- Si cambiano in Gestione → Fama → Pacchetti del social.
-- Va eseguita dopo 20270416100000_fama_classifica_follower_background.sql.
-- =====================================================================

alter table public.social_packages
  add column if not exists max_per_character int not null default 0 check (max_per_character between 0 and 100),
  add column if not exists cooldown_days int not null default 0 check (cooldown_days between 0 and 365);

update public.social_packages set max_per_character = 1
where kind = 'follower' and amount >= 50000 and max_per_character = 0;
update public.social_packages set cooldown_days = 30
where kind = 'follower' and amount < 50000 and cooldown_days = 0;

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
  v_wait int := coalesce(public.setting_int('social_bg_attesa_mesi'), 6);
  v_until timestamptz;
  v_times int;
  v_last timestamptz;
begin
  if not public.owns_character(p_character) then raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501'; end if;
  if not exists (select 1 from public.social_profiles where character_id = p_character) then
    raise exception 'Prima crea il tuo profilo social.' using errcode = 'P0001';
  end if;
  select * into k from public.social_packages where id = p_package and active;
  if k.id is null then raise exception 'Pacchetto non disponibile.' using errcode = 'P0001'; end if;
  -- un acquisto alla volta per personaggio
  select * into c from public.characters where id = p_character for update;
  -- follower dal background: come tutti, prima si cresce con i tempi del social
  if k.kind = 'follower' and v_wait > 0
     and exists (select 1 from public.social_profiles where character_id = p_character and bg_followers > 0) then
    v_until := coalesce(c.approved_at, now()) + make_interval(months => v_wait);
    if v_until > now() then
      raise exception 'Hai già i follower del tuo background: potrai comprarne altri dal %.',
        to_char(v_until at time zone 'Europe/Rome', 'DD/MM/YYYY') using errcode = 'P0001';
    end if;
  end if;
  -- quante volte e ogni quanto
  select count(*), max(created_at) into v_times, v_last
  from public.social_purchases where character_id = p_character and package_id = k.id;
  if k.max_per_character > 0 and v_times >= k.max_per_character then
    raise exception '«%» si può comprare % volt%: l''hai già fatto.', k.name, k.max_per_character,
      case when k.max_per_character = 1 then 'a sola' else 'e' end using errcode = 'P0001';
  end if;
  if k.cooldown_days > 0 and v_last is not null and v_last + make_interval(days => k.cooldown_days) > now() then
    raise exception 'Potrai ricomprare «%» dal %.', k.name,
      to_char((v_last + make_interval(days => k.cooldown_days)) at time zone 'Europe/Rome', 'DD/MM/YYYY') using errcode = 'P0001';
  end if;
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

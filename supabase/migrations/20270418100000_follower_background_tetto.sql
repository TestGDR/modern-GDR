-- =====================================================================
-- FOLLOWER DAL BACKGROUND: UNA SOLA VOCE CON FOLLOWER, AL MASSIMO 50.000
-- - Nessuna voce di background dà più di 50.000 follower (le voci più alte
--   scendono a 50.000; il pannello non permette di superarli).
-- - Un personaggio sceglie al massimo UNA voce che dà follower: le altre con
--   follower non si possono più prendere (fame_bg_toggle). In più il totale
--   dal background non supera mai social_bg_max (50.000).
-- - Chi ne ha già più di una tiene quella con più follower (a parità quella
--   pagata di più, poi la prima scelta); le altre si tolgono e si rimborsano:
--   PF di nuovo da spendere se la scheda non è ancora approvata, altrimenti
--   in PX come la conversione dei PF non spesi (fama_tasso_px). Avviso di SISTEMA.
-- - Chi ha almeno social_bg_attesa_soglia (50.000) follower dal background
--   non compra mai il pacchetto da 50.000 e nessun pacchetto di follower per
--   social_bg_attesa_mesi (6) mesi dall'approvazione. Gli acquisti già fatti
--   restano come sono. Le campagne restano libere.
-- =====================================================================

insert into public.game_settings (key, value, kind, label, description, sort_order) values
  ('social_bg_max', '50000', 'number', 'Social · Follower massimi dal background',
   'Quanti follower può avere al massimo un personaggio dalle voci di background.', 91),
  ('social_bg_attesa_soglia', '50000', 'number', 'Social · Follower dal background che bloccano gli acquisti',
   'Chi ha almeno questi follower dal background non compra il pacchetto da 50.000 e aspetta i mesi indicati prima di comprarne altri.', 92)
on conflict (key) do nothing;

-- 1. NESSUNA VOCE OLTRE 50.000
update public.fame_bg_items set social_followers = 50000 where social_followers > 50000;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fame_bg_items_followers_max') then
    alter table public.fame_bg_items add constraint fame_bg_items_followers_max check (social_followers <= 50000);
  end if;
end;
$$;

-- 2. TETTO SUL TOTALE (anche se lo staff aggiunge voci a mano)
create or replace function public.social_bg_followers(p_character uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select least(coalesce(public.setting_int('social_bg_max'), 50000), coalesce(sum(i.social_followers), 0))::int
  from public.character_fame_bg b join public.fame_bg_items i on i.id = b.item_id
  where b.character_id = p_character and b.status = 'approvata'
$$;
revoke execute on function public.social_bg_followers(uuid) from public, anon, authenticated;

-- 3. IN CREAZIONE: UNA SOLA VOCE CHE DÀ FOLLOWER
create or replace function public.fame_bg_toggle(p_character uuid, p_item uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.fame_bg_items;
  f public.character_fame;
  v_spent int;
  v_cat int;
  v_max_item int := coalesce(public.setting_int('fama_max_pf_voce'), 0);
  v_max_cat int := coalesce(public.setting_int('fama_max_pf_categoria'), 0);
  v_other text;
begin
  perform public.fame_creation_check(p_character);
  if not p_on then
    delete from public.character_fame_bg where character_id = p_character and item_id = p_item;
    return;
  end if;
  select * into i from public.fame_bg_items where id = p_item and active;
  if i.id is null then raise exception 'Voce non disponibile.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.character_fame_bg where character_id = p_character and item_id = p_item) then return; end if;
  -- una sola voce che dà follower al social
  if coalesce(i.social_followers, 0) > 0 then
    select x.name into v_other from public.character_fame_bg b join public.fame_bg_items x on x.id = b.item_id
    where b.character_id = p_character and b.status = 'approvata' and coalesce(x.social_followers, 0) > 0
    limit 1;
    if v_other is not null then
      raise exception 'Hai già una voce che dà follower («%»): se ne può avere una sola. Togli quella per scegliere questa.', v_other using errcode = 'P0001';
    end if;
  end if;
  if v_max_item > 0 and i.cost_pf > v_max_item then
    raise exception 'Questa voce costa % PF: il massimo per una voce è %.', i.cost_pf, v_max_item using errcode = 'P0001';
  end if;
  f := public.fame_row(p_character);
  select coalesce(sum(coalesce(cost_pf, 0)), 0) into v_spent from public.character_fame_bg where character_id = p_character and status = 'approvata';
  if v_spent + i.cost_pf > f.pf_pool then
    raise exception 'Ti restano % PF: questa voce ne costa %.', f.pf_pool - v_spent, i.cost_pf using errcode = 'P0001';
  end if;
  if v_max_cat > 0 then
    select coalesce(sum(coalesce(b.cost_pf, 0)), 0) into v_cat from public.character_fame_bg b
    left join public.fame_bg_items x on x.id = b.item_id
    where b.character_id = p_character and b.status = 'approvata' and coalesce(x.category, b.category) = i.category;
    if v_cat + i.cost_pf > v_max_cat then
      raise exception 'Nella categoria «%» puoi spendere al massimo % PF.', i.category, v_max_cat using errcode = 'P0001';
    end if;
  end if;
  insert into public.character_fame_bg (character_id, item_id, category, cost_pf, status)
  values (p_character, i.id, i.category, i.cost_pf, 'approvata');
end;
$$;
revoke execute on function public.fame_bg_toggle(uuid, uuid, boolean) from public, anon;
grant execute on function public.fame_bg_toggle(uuid, uuid, boolean) to authenticated;

-- 4. CHI HA GIÀ PIÙ VOCI CON FOLLOWER: SE NE TIENE UNA, LE ALTRE SI RIMBORSANO
do $$
declare
  r record;
  v_rate int := coalesce(public.setting_int('fama_tasso_px'), 5);
  v_px int;
  v_kept text;
begin
  for r in
    select b.id, b.character_id, coalesce(b.cost_pf, 0) as cost, i.name as item, c.name as pg, c.owner_id,
           coalesce((select f.converted from public.character_fame f where f.character_id = c.id), false) as converted
    from (
      select b.*, row_number() over (partition by b.character_id
               order by i.social_followers desc, coalesce(b.cost_pf, 0) desc, b.created_at) as n
      from public.character_fame_bg b join public.fame_bg_items i on i.id = b.item_id
      where b.status = 'approvata' and coalesce(i.social_followers, 0) > 0
    ) b
    join public.fame_bg_items i on i.id = b.item_id
    join public.characters c on c.id = b.character_id
    where b.n > 1
  loop
    select x.name into v_kept
    from public.character_fame_bg y join public.fame_bg_items x on x.id = y.item_id
    where y.character_id = r.character_id and y.status = 'approvata' and coalesce(x.social_followers, 0) > 0 and y.id <> r.id
    order by x.social_followers desc, coalesce(y.cost_pf, 0) desc, y.created_at
    limit 1;
    delete from public.character_fame_bg where id = r.id;
    if r.converted and r.cost > 0 then
      -- scheda già approvata: i PF di questa voce diventano PX, come quelli non spesi
      v_px := r.cost * v_rate;
      perform set_config('app.invio_scheda', 'on', true);
      update public.characters set px = px + v_px where id = r.character_id;
      perform set_config('app.invio_scheda', 'off', true);
      update public.character_fame set pf_converted = pf_converted + r.cost, px_from_conversion = px_from_conversion + v_px, updated_at = now()
      where character_id = r.character_id;
      insert into public.px_moves (character_id, amount, reason)
      values (r.character_id, v_px, 'Rimborso della voce di background «' || r.item || '» (' || r.cost || ' PF)');
      perform public.send_system_message(r.owner_id,
        '⭐ ' || public.first_name(r.pg) || ': si può avere una sola voce di background che dà follower. Resta «' || coalesce(v_kept, '?')
        || '»; «' || r.item || '» è stata tolta e i suoi ' || r.cost || ' PF sono diventati ' || v_px || ' PX.');
    else
      perform public.send_system_message(r.owner_id,
        '⭐ ' || public.first_name(r.pg) || ': si può avere una sola voce di background che dà follower. Resta «' || coalesce(v_kept, '?')
        || '»; «' || r.item || '» è stata tolta e i suoi ' || r.cost || ' PF sono di nuovo da spendere.');
    end if;
    perform public.fame_recalc(r.character_id);
    raise notice 'Tolta «%» a % (tiene «%», % PF)', r.item, r.pg, v_kept, r.cost;
  end loop;
end;
$$;

-- tutti i follower dal background ricalcolati con le regole nuove
update public.social_profiles sp set bg_followers = public.social_bg_followers(sp.character_id)
where sp.bg_followers is distinct from public.social_bg_followers(sp.character_id);

-- 5. ACQUISTI: CHI HA 50.000 FOLLOWER DAL BACKGROUND ASPETTA
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
  v_soglia int := coalesce(public.setting_int('social_bg_attesa_soglia'), 50000);
  v_bg int;
  v_until timestamptz;
  v_times int;
  v_last timestamptz;
begin
  if not public.owns_character(p_character) then raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501'; end if;
  select bg_followers into v_bg from public.social_profiles where character_id = p_character;
  if v_bg is null then
    raise exception 'Prima crea il tuo profilo social.' using errcode = 'P0001';
  end if;
  select * into k from public.social_packages where id = p_package and active;
  if k.id is null then raise exception 'Pacchetto non disponibile.' using errcode = 'P0001'; end if;
  -- un acquisto alla volta per personaggio
  select * into c from public.characters where id = p_character for update;
  -- tanti follower dal background (Influencer): niente pacchetto da 50.000 e prima i tempi del social
  if k.kind = 'follower' and v_soglia > 0 and v_bg >= v_soglia then
    if k.amount >= v_soglia then
      raise exception 'Hai già % follower dal tuo background: il pacchetto «%» non è per te.',
        replace(to_char(v_bg, 'FM999,999,999'), ',', '.'), k.name using errcode = 'P0001';
    end if;
    v_until := coalesce(c.approved_at, now()) + make_interval(months => v_wait);
    if v_wait > 0 and v_until > now() then
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

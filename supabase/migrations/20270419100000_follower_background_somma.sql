-- =====================================================================
-- FOLLOWER DAL BACKGROUND: PIÙ VOCI, FINO A 50.000 IN TUTTO
-- Al posto di «una sola voce con follower»: si possono scegliere più voci
-- che danno follower, ma la somma non può superare social_bg_max (50.000).
-- Una voce che farebbe superare il tetto non si può prendere.
-- =====================================================================

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
  v_bg_max int := coalesce(public.setting_int('social_bg_max'), 50000);
  v_followers int;
begin
  perform public.fame_creation_check(p_character);
  if not p_on then
    delete from public.character_fame_bg where character_id = p_character and item_id = p_item;
    return;
  end if;
  select * into i from public.fame_bg_items where id = p_item and active;
  if i.id is null then raise exception 'Voce non disponibile.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.character_fame_bg where character_id = p_character and item_id = p_item) then return; end if;
  -- follower dal background: più voci, ma in tutto non oltre il tetto
  if coalesce(i.social_followers, 0) > 0 then
    select coalesce(sum(x.social_followers), 0) into v_followers
    from public.character_fame_bg b join public.fame_bg_items x on x.id = b.item_id
    where b.character_id = p_character and b.status = 'approvata';
    if v_followers + i.social_followers > v_bg_max then
      raise exception 'Con questa voce i follower dal background sarebbero %: il massimo è %. Ne hai già %.',
        replace(to_char(v_followers + i.social_followers, 'FM999,999,999'), ',', '.'),
        replace(to_char(v_bg_max, 'FM999,999,999'), ',', '.'),
        replace(to_char(v_followers, 'FM999,999,999'), ',', '.') using errcode = 'P0001';
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

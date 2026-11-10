-- =====================================================================
-- BOXE: UNA SOLA SQUADRA
-- «Boxe maschile» diventa «Boxe»: le sue categorie di peso prendono
-- «maschili» nel nome e arrivano quelle «femminili» (stessi tiri), per
-- 16 incontri a dual meet. «Boxe femminile» si elimina con il suo gruppo,
-- le sue gare e la sua stagione (era in preparazione). Se qualcuno è già
-- nel suo roster, ci si ferma senza toccare niente.
-- =====================================================================
do $$
declare
  v_m uuid := (select id from public.sports where name = 'Boxe maschile');
  v_f uuid := (select id from public.sports where name = 'Boxe femminile');
  v_group uuid;
  r record;
  v_new uuid;
begin
  if v_m is null then
    raise notice 'Boxe maschile non trovata: niente da fare.';
    return;
  end if;
  if v_f is not null and exists (select 1 from public.sport_roster where sport_id = v_f and left_at is null) then
    raise exception 'In Boxe femminile c''è già qualcuno nel roster: toglilo da Gestione → Sport → Roster e riprova.';
  end if;

  -- 1. categorie maschili
  update public.sport_positions set name = name || ' maschili'
  where sport_id = v_m and name not like '% maschili';

  -- 2. categorie femminili (con le combinazioni dei tiri) nella stessa squadra
  if v_f is not null then
    for r in select * from public.sport_positions where sport_id = v_f order by sort_order loop
      insert into public.sport_positions (sport_id, name, attribute_id, skill_id, max_slots, team_bonus, sort_order)
      values (v_m, r.name || ' femminili', r.attribute_id, r.skill_id, r.max_slots, r.team_bonus, r.sort_order + 8)
      on conflict (sport_id, name) do nothing
      returning id into v_new;
      continue when v_new is null;
      insert into public.sport_position_combos (position_id, attribute_id, skill_id, sort_order, slot)
      select v_new, c.attribute_id, c.skill_id, c.sort_order, c.slot from public.sport_position_combos c where c.position_id = r.id
      on conflict (position_id, attribute_id, skill_id) do nothing;
    end loop;
  end if;

  -- 3. lo sport: «Boxe», 16 incontri (8 maschili e 8 femminili)
  update public.sports set
    name = 'Boxe',
    description = 'La squadra di pugilato del college, maschile e femminile. Nei dual meet pugili e pugilatrici delle due università salgono sul ring categoria per categoria: tre round da due minuti, tre giudici a bordo ring. Vince la squadra che porta a casa più incontri.',
    score_profile = jsonb_set(score_profile, '{bouts}', '16')
  where id = v_m;
  update public.game_groups set description = 'Squadra di Boxe dell''Athletic Department.'
  where id = (select group_id from public.sports where id = v_m) and description like 'Squadra di Boxe maschile%';

  -- descrizioni dei ruoli nel gruppo («caratteristica + abilità»)
  for r in select id from public.sport_positions where sport_id = v_m loop
    perform public.sport_position_role_sync(r.id);
  end loop;

  -- 4. via la squadra femminile (gare, stagione e ruoli se ne vanno con lei) e il suo gruppo
  if v_f is not null then
    v_group := (select group_id from public.sports where id = v_f);
    delete from public.sports where id = v_f;
    if v_group is not null then
      delete from public.game_groups where id = v_group and kind = 'sport';
    end if;
  end if;
  raise notice 'Boxe: % categorie di peso', (select count(*) from public.sport_positions where sport_id = v_m);
end $$;

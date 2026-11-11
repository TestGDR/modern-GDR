-- =====================================================================
-- SURF DEI TRITONS
-- Surf universitario (stile NSSA): ogni gara è un contest con tutte le
-- università della Conference in acqua insieme; heat giudicati a punti
-- (le due onde migliori, massimo 20) e la squadra somma i piazzamenti.
-- Una sola squadra «Surf» con quattro ruoli: Shortboard e Longboard,
-- maschile e femminile (4 posti ciascuno).
-- Tiri: Shortboard RIF + Agilità (in alternativa VIG + Atletica),
-- Longboard RIF + Agilità (in alternativa EMP + Danza: lo stile);
-- secondo tiro VIG + Nuoto (la remata e il fiato).
-- Rivali: la Big West e, per i Nationals, le università più forti nel
-- surf (solo surf). Stagione 2026-27 in preparazione: 6 contest dal
-- 9 gennaio 2027, uno ogni due settimane, poi Conference e Nationals
-- (automatici come gli altri sport). Si avvia da Gestione → Sport.
-- =====================================================================

-- 1. Lo sport (crea da solo il suo gruppo "squadra")
insert into public.sports (name, description, season, format, allows_draw, score_profile, icon, sort_order, category, default_rules)
values ('Surf',
  'La squadra di surf dei Tritons, sulle onde di La Jolla. Nei contest tutte le università della Conference entrano in acqua insieme, divise in heat di shortboard e longboard, maschili e femminili: i giudici danno un voto alle due onde migliori di ogni surfista e la squadra somma i piazzamenti.',
  'winter', 'individual_race', false, '{"kind":"score","base":13,"per":0.5,"max":20}'::jsonb, '🏄',
  coalesce((select max(sort_order) from public.sports), 0) + 1, '',
  '{"min_events":4,"nationals_threshold":25,"conference_teams":0,"race_meets":6,"nationals_others":4,"individual_enabled":true,"individual_threshold":40,"individual_min_events":4,"individual_slots":4}'::jsonb)
on conflict (name) do nothing;

-- 2. I ruoli
insert into public.sport_positions (sport_id, name, attribute_id, skill_id, max_slots, team_bonus, sort_order)
select s.id, v.pos, a.id, sk.id, 4, false, v.ord
from (values
  ('Shortboard maschile', 'RIF', 'Agilità', 1),
  ('Shortboard femminile', 'RIF', 'Agilità', 2),
  ('Longboard maschile', 'RIF', 'Agilità', 3),
  ('Longboard femminile', 'RIF', 'Agilità', 4)
) as v (pos, attr, skill, ord)
join public.sports s on s.name = 'Surf'
join public.attributes a on a.code = v.attr
left join public.skills sk on lower(sk.name) = lower(v.skill)
on conflict (sport_id, name) do nothing;

-- combinazioni: un'alternativa al primo tiro e il secondo tiro sulla remata
insert into public.sport_position_combos (position_id, attribute_id, skill_id, sort_order, slot)
select p.id, a.id, sk.id, v.ord, v.slot
from public.sport_positions p
join public.sports s on s.id = p.sport_id and s.name = 'Surf'
join (values
  ('Shortboard', 1, 'VIG', 'Atletica', 1),
  ('Longboard', 1, 'EMP', 'Danza', 1),
  ('Shortboard', 2, 'VIG', 'Nuoto', 1),
  ('Longboard', 2, 'VIG', 'Nuoto', 1)
) as v (board, slot, attr, skill, ord) on p.name like v.board || ' %'
join public.attributes a on a.code = v.attr
join public.skills sk on lower(sk.name) = lower(v.skill)
on conflict (position_id, attribute_id, skill_id) do nothing;

-- descrizioni dei ruoli nel gruppo della squadra («caratteristica + abilità»)
do $$
declare r record;
begin
  for r in select p.id from public.sport_positions p join public.sports s on s.id = p.sport_id where s.name = 'Surf' loop
    perform public.sport_position_role_sync(r.id);
  end loop;
end $$;

-- 3. Le università del surf (solo surf) e la forza delle squadre
insert into public.sport_teams (name, nickname, is_player_school, conference, is_national, active)
values ('Point Loma Nazarene', 'Sea Lions', false, false, true, true),
       ('San Diego State', 'Aztecs', false, false, true, true),
       ('Pepperdine', 'Waves', false, false, true, true),
       ('UCLA', 'Bruins', false, false, true, true),
       ('Cal State San Marcos', 'Cougars', false, false, true, true)
on conflict (name) do nothing;

-- la nostra 12, la Big West tra 8 e 16
insert into public.sport_team_ratings (team_id, sport_id, rating)
select t.id, s.id, case when t.is_player_school then 12 else 8 + (abs(hashtext(t.name || s.name)) % 9) end
from public.sport_teams t cross join public.sports s
where s.name = 'Surf' and t.active and (t.is_player_school or (t.conference and not t.is_national))
on conflict do nothing;

-- le più forti nel surf: Hawai'i e UC Santa Barbara in Conference, le altre fuori
insert into public.sport_team_ratings (team_id, sport_id, rating)
select t.id, s.id, v.rating
from (values ('Hawai''i', 16), ('UC Santa Barbara', 15), ('Point Loma Nazarene', 17), ('San Diego State', 16),
             ('Pepperdine', 16), ('UCLA', 15), ('Cal State San Marcos', 14)) as v (team, rating)
join public.sport_teams t on t.name = v.team
join public.sports s on s.name = 'Surf'
on conflict (team_id, sport_id) do update set rating = excluded.rating;

-- 4. Stagione 2026-27 in preparazione: 6 contest, uno ogni due settimane dal 9 gennaio 2027
--    (le funzioni dello sport chiedono il permesso: dall'SQL Editor si agisce come l'Amministratore)
do $$
declare
  v_admin uuid := (select p.id from public.profiles p join public.user_levels l on l.id = p.level_id
                   where l.is_admin order by p.created_at limit 1);
  v_sport uuid := (select id from public.sports where name = 'Surf');
  v_season uuid;
  v_events int;
begin
  if v_sport is null then return; end if;
  if v_admin is null then raise exception 'Nessun Amministratore trovato.'; end if;
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  insert into public.sport_seasons (sport_id, label) values (v_sport, '2026-27')
  on conflict (sport_id, label) do nothing
  returning id into v_season;
  if v_season is null then return; end if;
  perform public.sport_rules(v_season);
  perform set_config('app.sport_rules_init', 'on', true);
  update public.sport_season_rules set race_meets = 6, nonconf_games = 0, min_events = 4, nationals_threshold = 25,
    conference_teams = 0, nationals_others = 4, individual_enabled = true, individual_threshold = 40,
    individual_min_events = 4, individual_slots = 4
  where season_id = v_season;
  perform set_config('app.sport_rules_init', 'off', true);
  v_events := public.sport_season_generate(v_season, timestamptz '2027-01-09 19:00 Europe/Rome', 14);
  raise notice 'Surf · % contest in calendario', v_events;
end $$;

-- 5. Conference e Nationals del surf: in spiaggia
-- impianti inventati: [Conference/stagione, Nationals] per sport
create or replace function public.sport_neutral_site(p_sport uuid, p_phase text, p_seed text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_name text := lower(coalesce((select name || ' ' || category from public.sports where id = p_sport), ''));
  v_conf text[];
  v_nat text[];
  v_list text[];
begin
  if v_name like '%football%' then
    v_conf := array['Pacific Shores Stadium · Las Vegas, NV', 'Desert Bloom Bowl · Phoenix, AZ'];
    v_nat := array['Lone Star Championship Stadium · Arlington, TX', 'Gulf Coast Dome · New Orleans, LA'];
  elsif v_name like '%basket%' then
    v_conf := array['Harborview Arena · Henderson, NV', 'Silver Coast Center · Anaheim, CA'];
    v_nat := array['Heartland Arena · Indianapolis, IN', 'Riverbend Center · San Antonio, TX'];
  elsif v_name like '%hockey%' then
    v_conf := array['Glacier Point Ice Center · Ontario, CA', 'Sierra Ice Pavilion · Sacramento, CA'];
    v_nat := array['Northstar Ice Arena · St. Paul, MN', 'Liberty Ice Garden · Boston, MA'];
  elsif v_name like '%swim%' or v_name like '%nuoto%' then
    v_conf := array['Coral Bay Aquatic Center · Long Beach, CA', 'Mission Hills Natatorium · San Jose, CA'];
    v_nat := array['Lakeside Natatorium · Indianapolis, IN', 'Bluewater Aquatic Center · Austin, TX'];
  elsif v_name like '%cheer%' then
    v_conf := array['Seaside Convention Hall · Long Beach, CA', 'Golden State Expo Center · Fresno, CA'];
    v_nat := array['Sunshine Events Center · Daytona Beach, FL', 'Magnolia Convention Arena · Orlando, FL'];
  elsif v_name like '%equitazione%' then
    v_conf := array['Rolling Hills Equestrian Park · Temecula, CA', 'Sunset Valley Horse Park · Paso Robles, CA'];
    v_nat := array['Bluegrass Horse Park · Lexington, KY', 'Prairie Wind Equestrian Center · Waco, TX'];
  elsif v_name like '%surf%' then
    v_conf := array['Trestles Beach · San Clemente, CA', 'Huntington Beach Pier · Huntington Beach, CA'];
    v_nat := array['Oceanside Pier · Oceanside, CA', 'Steamer Lane · Santa Cruz, CA'];
  elsif v_name like '%boxe%' then
    v_conf := array['Ironworks Boxing Hall · Reno, NV', 'Copper Ring Pavilion · Tucson, AZ'];
    v_nat := array['Founders Fieldhouse · Colorado Springs, CO', 'Liberty Armory · Annapolis, MD'];
  else
    v_conf := array['Big West Sports Complex · Irvine, CA', 'Coastline Athletic Center · Santa Barbara, CA'];
    v_nat := array['National Collegiate Center · Kansas City, MO', 'Crossroads Arena · Omaha, NE'];
  end if;
  v_list := case when p_phase = 'national' then v_nat else v_conf end;
  return v_list[1 + abs(hashtext(coalesce(p_seed, ''))) % array_length(v_list, 1)];
end;
$$;
revoke execute on function public.sport_neutral_site(uuid, text, text) from public, anon, authenticated;

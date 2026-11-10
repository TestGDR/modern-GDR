-- =====================================================================
-- BOXE MASCHILE E FEMMINILE
-- Pugilato universitario (stile NCBA): dual meet contro un'altra
-- università, un incontro per categoria di peso (8), tre round giudicati
-- a punti; vince la squadra che porta a casa più incontri.
-- Categorie di peso = ruoli: Riflessi + Rissa (i massimi: Vigore + Rissa),
-- secondo tiro sul fiato (Vigore + Resistenza fisica, i massimi Forza).
-- Rivali: la Big West (come gli altri sport) e, fuori Conference, le
-- accademie militari, storicamente le più forti nella boxe universitaria.
-- Stagione invernale 2026-27 in preparazione, calendario da gennaio 2027:
-- si avvia da Gestione → Sport.
-- =====================================================================

-- 0. Regole di stagione: le colonne che il calendario automatico usa
--    (nel database la tabella era nata prima di alcune di queste)
alter table public.sport_season_rules
  add column if not exists placement_points int[] not null default '{10,7,5,3,2,1}',
  add column if not exists regular_rounds int not null default 1 check (regular_rounds between 1 and 4),
  add column if not exists nonconf_games int not null default 0 check (nonconf_games between 0 and 30),
  add column if not exists race_meets int not null default 4 check (race_meets between 1 and 30),
  add column if not exists min_events int not null default 8 check (min_events between 0 and 100),
  add column if not exists nationals_threshold int not null default 18 check (nationals_threshold between 0 and 1000),
  add column if not exists nationals_slots int not null default 8 check (nationals_slots between 1 and 64),
  add column if not exists nationals_others int not null default 4 check (nationals_others between 0 and 63),
  add column if not exists conference_teams int not null default 4 check (conference_teams between 0 and 32),
  add column if not exists conference_champion_auto boolean not null default true,
  add column if not exists conference_min_place int check (conference_min_place is null or conference_min_place between 1 and 32),
  add column if not exists tiebreakers text[] not null default '{scontri_diretti,differenza,vittorie}',
  add column if not exists individual_enabled boolean not null default false,
  add column if not exists individual_grade_points int[] not null default '{0,0,0,0,0,1,3,5,7,10}',
  add column if not exists individual_threshold int not null default 20 check (individual_threshold between 0 and 1000),
  add column if not exists individual_min_events int not null default 3 check (individual_min_events between 0 and 100),
  add column if not exists individual_slots int not null default 3 check (individual_slots between 0 and 50);

-- 1. I due sport (ognuno crea da solo il suo gruppo "squadra")
insert into public.sports (name, description, season, format, allows_draw, score_profile, icon, sort_order, category, default_rules)
select v.name, v.descr, 'winter', 'individual_match', false,
  '{"kind":"points","bouts":8,"match":{"kind":"points","base":29,"per":1,"jitter":1}}'::jsonb,
  '🥊', coalesce((select max(sort_order) from public.sports), 0) + v.ord, 'Boxe',
  '{"min_events":8,"nationals_threshold":18,"regular_rounds":1,"nonconf_games":2,"conference_teams":4,"nationals_others":4,"individual_enabled":true,"individual_threshold":40,"individual_min_events":6,"individual_slots":3}'::jsonb
from (values
  ('Boxe maschile', 'La squadra di pugilato maschile del college. Nei dual meet i pugili delle due università salgono sul ring categoria per categoria: tre round da due minuti, tre giudici a bordo ring. Vince la squadra che porta a casa più incontri.', 1),
  ('Boxe femminile', 'La squadra di pugilato femminile del college. Nei dual meet le pugili delle due università salgono sul ring categoria per categoria: tre round da due minuti, tre giudici a bordo ring. Vince la squadra che porta a casa più incontri.', 2)
) as v (name, descr, ord)
on conflict (name) do nothing;

-- 2. Le categorie di peso (ruoli): due posti ciascuna
insert into public.sport_positions (sport_id, name, attribute_id, skill_id, max_slots, team_bonus, sort_order)
select s.id, v.pos, a.id, sk.id, 2, false, v.ord
from (values
  ('Boxe maschile', 'Pesi mosca', 'RIF', 1), ('Boxe maschile', 'Pesi gallo', 'RIF', 2),
  ('Boxe maschile', 'Pesi piuma', 'RIF', 3), ('Boxe maschile', 'Pesi leggeri', 'RIF', 4),
  ('Boxe maschile', 'Pesi welter', 'RIF', 5), ('Boxe maschile', 'Pesi medi', 'RIF', 6),
  ('Boxe maschile', 'Pesi mediomassimi', 'VIG', 7), ('Boxe maschile', 'Pesi massimi', 'VIG', 8),
  ('Boxe femminile', 'Pesi minimosca', 'RIF', 1), ('Boxe femminile', 'Pesi mosca', 'RIF', 2),
  ('Boxe femminile', 'Pesi gallo', 'RIF', 3), ('Boxe femminile', 'Pesi piuma', 'RIF', 4),
  ('Boxe femminile', 'Pesi leggeri', 'RIF', 5), ('Boxe femminile', 'Pesi welter', 'RIF', 6),
  ('Boxe femminile', 'Pesi medi', 'VIG', 7), ('Boxe femminile', 'Pesi massimi', 'VIG', 8)
) as v (sport, pos, attr, ord)
join public.sports s on s.name = v.sport
join public.attributes a on a.code = v.attr
left join public.skills sk on lower(sk.name) = 'rissa'
on conflict (sport_id, name) do nothing;

-- combinazioni: i leggeri possono usare anche l'Agilità al primo tiro;
-- secondo tiro sul fiato (Resistenza fisica), per i più pesanti la Forza
insert into public.sport_position_combos (position_id, attribute_id, skill_id, sort_order, slot)
select p.id, a.id, sk.id, v.ord, v.slot
from public.sport_positions p
join public.sports s on s.id = p.sport_id and s.category = 'Boxe'
join (values
  ('light', 1, 'RIF', 'Agilità', 1),
  ('light', 2, 'VIG', 'Resistenza fisica', 1),
  ('middle', 2, 'VIG', 'Resistenza fisica', 1),
  ('heavy', 2, 'VIG', 'Forza', 1),
  ('heavy', 2, 'VIG', 'Resistenza fisica', 2)
) as v (band, slot, attr, skill, ord)
  on v.band = case
    when p.name in ('Pesi minimosca', 'Pesi mosca', 'Pesi gallo', 'Pesi piuma') then 'light'
    when p.name in ('Pesi mediomassimi', 'Pesi massimi') or (s.name = 'Boxe femminile' and p.name = 'Pesi medi') then 'heavy'
    else 'middle' end
join public.attributes a on a.code = v.attr
join public.skills sk on lower(sk.name) = lower(v.skill)
on conflict (position_id, attribute_id, skill_id) do nothing;

-- descrizioni dei ruoli nei gruppi delle squadre («caratteristica + abilità»)
do $$
declare r record;
begin
  for r in select p.id from public.sport_positions p join public.sports s on s.id = p.sport_id where s.category = 'Boxe' loop
    perform public.sport_position_role_sync(r.id);
  end loop;
end $$;

-- 3. Le accademie militari (solo boxe) e la forza delle squadre
insert into public.sport_teams (name, nickname, is_player_school, conference, is_national, active)
values ('Army', 'Black Knights', false, false, true, true),
       ('Navy', 'Midshipmen', false, false, true, true),
       ('Air Force', 'Falcons', false, false, true, true)
on conflict (name) do nothing;

-- la nostra 12, la Big West tra 8 e 16, fuori Conference le più forti
insert into public.sport_team_ratings (team_id, sport_id, rating)
select t.id, s.id,
  case when t.is_player_school then 12 else 8 + (abs(hashtext(t.name || s.name)) % 9) end
from public.sport_teams t cross join public.sports s
where s.category = 'Boxe' and t.active and (t.is_player_school or (t.conference and not t.is_national))
on conflict do nothing;

insert into public.sport_team_ratings (team_id, sport_id, rating)
select t.id, s.id, v.rating
from (values ('Army', 17), ('Navy', 17), ('Air Force', 16), ('Ohio State', 14)) as v (team, rating)
join public.sport_teams t on t.name = v.team
join public.sports s on s.category = 'Boxe'
on conflict (team_id, sport_id) do update set rating = excluded.rating;

-- 4. Stagione 2026-27 in preparazione, una gara a settimana da gennaio 2027
--    (2 fuori Conference + la Big West; i posti liberi evitano gli altri sport).
--    Le funzioni dello sport chiedono il permesso: dall'SQL Editor si agisce come l'Amministratore.
do $$
declare
  v_admin uuid := (select p.id from public.profiles p join public.user_levels l on l.id = p.level_id
                   where l.is_admin order by p.created_at limit 1);
  sp record;
  v_season uuid;
  v_events int;
begin
  if v_admin is null then raise exception 'Nessun Amministratore trovato.'; end if;
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  for sp in select id, name from public.sports where category = 'Boxe' order by sort_order loop
    v_season := null;
    insert into public.sport_seasons (sport_id, label) values (sp.id, '2026-27')
    on conflict (sport_id, label) do nothing
    returning id into v_season;
    continue when v_season is null;
    -- regole dello sport (anche se la funzione delle regole nel database è più vecchia)
    perform public.sport_rules(v_season);
    perform set_config('app.sport_rules_init', 'on', true);
    update public.sport_season_rules set regular_rounds = 1, nonconf_games = 2, min_events = 8, nationals_threshold = 18,
      conference_teams = 4, nationals_others = 4, individual_enabled = true, individual_threshold = 40,
      individual_min_events = 6, individual_slots = 3
    where season_id = v_season;
    perform set_config('app.sport_rules_init', 'off', true);
    v_events := public.sport_season_generate(v_season, timestamptz '2027-01-16 19:00 Europe/Rome', 7);
    raise notice '% · % gare in calendario', sp.name, v_events;
  end loop;
end $$;

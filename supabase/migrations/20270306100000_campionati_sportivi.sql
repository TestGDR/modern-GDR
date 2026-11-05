-- =====================================================================
-- SPORT: CAMPIONATI (documento «Sistema campionati sportivi» v1.0)
-- 1. Fasi della stagione: preseason → regular → conference → nationals →
--    concluded (sport_seasons.phase), cambiate con sport_phase_set.
-- 2. Regole per stagione (sport_season_rules): punti per vittoria,
--    pareggio, sconfitta, tabella piazzamento → punti, gare minime, soglia
--    e posti dei Nationals, squadre al torneo di Conference, campione di
--    Conference di diritto, piazzamento minimo, spareggi, qualificazione
--    individuale. Si copiano dalle regole predefinite dello sport
--    (sports.default_rules) quando nasce la stagione: cambiarle dopo non
--    tocca le stagioni passate.
-- 3. Classifica a punti (sport_table), separata dal punteggio della gara,
--    con penalità/bonus e spareggio dello staff (sport_standing_adjustments).
-- 4. Qualificazione ai Nationals (sport_qualification): soglia, gare
--    minime, piazzamento, posti; lo staff la conferma
--    (sport_qualification_confirm) e solo allora vale. Eccezioni motivate
--    (sport_qualification_override). Nessuna squadra o atleta non
--    qualificato entra in una gara dei Nationals (trigger).
-- 5. Tabelloni di Conference e Nationals (sport_bracket_matches): le
--    partite della nostra università diventano gare da simulare o giocare,
--    quelle tra le altre si decidono da sole; gli sport a gare hanno una
--    finale unica.
-- 6. Registro di tutte le modifiche (sport_season_log) e albo d'oro.
-- 7. Equitazione divisa in Equitazione English ed Equitazione Western
--    (categoria «Equitazione»), con i cavalieri western spostati.
-- 8. Università vere: la Big West Conference (le rivali di UCSD) e grandi
--    università nazionali, ognuna negli sport in cui è forte. Stagioni come
--    in NCAA: partite fuori Conference (nonconf_games) e di Conference,
--    numero di meeting per gli sport a gare (race_meets), posti dei
--    Nationals per le altre Conference (nationals_others).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. COLONNE NUOVE
-- ---------------------------------------------------------------------
alter table public.sports add column if not exists category text not null default '' check (char_length(category) <= 40);
alter table public.sports add column if not exists default_rules jsonb not null default '{}' check (jsonb_typeof(default_rules) = 'object');

alter table public.sport_seasons add column if not exists phase text not null default 'preseason'
  check (phase in ('preseason', 'regular', 'conference', 'nationals', 'concluded'));
alter table public.sport_seasons add column if not exists conference_champion_id uuid references public.sport_teams (id) on delete set null;
alter table public.sport_seasons add column if not exists national_champion_id uuid references public.sport_teams (id) on delete set null;
alter table public.sport_seasons add column if not exists qualified_confirmed_at timestamptz;
alter table public.sport_seasons add column if not exists qualified_confirmed_by uuid references public.profiles (id) on delete set null;
create index if not exists sport_seasons_conference_champion_idx on public.sport_seasons (conference_champion_id);
create index if not exists sport_seasons_national_champion_idx on public.sport_seasons (national_champion_id);
create index if not exists sport_seasons_confirmed_by_idx on public.sport_seasons (qualified_confirmed_by);

-- gare dei Nationals create prima di questo sistema: nessun controllo di qualificazione
alter table public.sport_events add column if not exists qualification_free boolean not null default false;
update public.sport_events set qualification_free = true where phase = 'national';

update public.sport_seasons
set phase = case status when 'closed' then 'concluded' when 'active' then 'regular' else 'preseason' end
where phase = 'preseason';

-- ---------------------------------------------------------------------
-- 2. REGOLE DELLA STAGIONE
-- ---------------------------------------------------------------------
create table if not exists public.sport_season_rules (
  season_id uuid primary key references public.sport_seasons (id) on delete cascade,
  pts_win int not null default 3 check (pts_win between 0 and 20),
  pts_draw int not null default 1 check (pts_draw between 0 and 20),
  pts_loss int not null default 0 check (pts_loss between -10 and 20),
  -- gare a giudizio o a cronometro: punti per il 1°, 2°, 3°…
  placement_points int[] not null default '{10,7,5,3,2,1}',
  -- partite contro ogni rivale nella stagione regolare (calendario automatico)
  regular_rounds int not null default 1 check (regular_rounds between 1 and 4),
  -- partite fuori Conference contro le università nazionali (calendario automatico)
  nonconf_games int not null default 0 check (nonconf_games between 0 and 30),
  -- sport a gare: meeting della stagione regolare (calendario automatico)
  race_meets int not null default 4 check (race_meets between 1 and 30),
  min_events int not null default 8 check (min_events between 0 and 100),
  nationals_threshold int not null default 18 check (nationals_threshold between 0 and 1000),
  nationals_slots int not null default 8 check (nationals_slots between 1 and 64),
  -- posti dei Nationals per le altre Conference (le università nazionali più forti)
  nationals_others int not null default 4 check (nationals_others between 0 and 63),
  -- squadre al torneo di Conference (0 = tutte)
  conference_teams int not null default 4 check (conference_teams between 0 and 32),
  conference_champion_auto boolean not null default true,
  -- piazzamento minimo nel torneo di Conference (null = nessun vincolo)
  conference_min_place int check (conference_min_place is null or conference_min_place between 1 and 32),
  tiebreakers text[] not null default '{scontri_diretti,differenza,vittorie}'
    check (tiebreakers <@ array['scontri_diretti', 'differenza', 'vittorie', 'conference']::text[]),
  -- qualificazione individuale (nuoto, equitazione): punti per voto 1…10
  individual_enabled boolean not null default false,
  individual_grade_points int[] not null default '{0,0,0,0,0,1,3,5,7,10}',
  individual_threshold int not null default 20 check (individual_threshold between 0 and 1000),
  individual_min_events int not null default 3 check (individual_min_events between 0 and 100),
  individual_slots int not null default 3 check (individual_slots between 0 and 50),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null default auth.uid()
);
create index if not exists sport_season_rules_updated_by_idx on public.sport_season_rules (updated_by);
alter table public.sport_season_rules enable row level security;
revoke all on public.sport_season_rules from anon;
drop policy if exists "Regole sport: lette da tutti" on public.sport_season_rules;
create policy "Regole sport: lette da tutti" on public.sport_season_rules for select to authenticated using (true);
drop policy if exists "Regole sport: lo staff aggiunge" on public.sport_season_rules;
create policy "Regole sport: lo staff aggiunge" on public.sport_season_rules for insert to authenticated
  with check ((select public.has_permission('sport.gestire')));
drop policy if exists "Regole sport: lo staff modifica" on public.sport_season_rules;
create policy "Regole sport: lo staff modifica" on public.sport_season_rules for update to authenticated
  using ((select public.has_permission('sport.gestire'))) with check ((select public.has_permission('sport.gestire')));
drop policy if exists "Regole sport: non si cancellano" on public.sport_season_rules;
create policy "Regole sport: non si cancellano" on public.sport_season_rules for delete to authenticated using (false);

-- penalità, bonus e spareggio dello staff
create table if not exists public.sport_standing_adjustments (
  id bigint generated always as identity primary key,
  season_id uuid not null references public.sport_seasons (id) on delete cascade,
  team_id uuid not null references public.sport_teams (id) on delete cascade,
  points int not null default 0 check (points between -100 and 100),
  tiebreak int not null default 0 check (tiebreak between -100 and 100),
  note text not null check (char_length(btrim(note)) between 3 and 300),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists sport_standing_adjustments_season_idx on public.sport_standing_adjustments (season_id);
create index if not exists sport_standing_adjustments_team_idx on public.sport_standing_adjustments (team_id);
create index if not exists sport_standing_adjustments_created_by_idx on public.sport_standing_adjustments (created_by);
alter table public.sport_standing_adjustments enable row level security;
revoke all on public.sport_standing_adjustments from anon;
drop policy if exists "Correzioni classifica: lette da tutti" on public.sport_standing_adjustments;
create policy "Correzioni classifica: lette da tutti" on public.sport_standing_adjustments for select to authenticated using (true);
drop policy if exists "Correzioni classifica: lo staff aggiunge" on public.sport_standing_adjustments;
create policy "Correzioni classifica: lo staff aggiunge" on public.sport_standing_adjustments for insert to authenticated
  with check ((select public.has_permission('sport.gestire')));
drop policy if exists "Correzioni classifica: non si modificano" on public.sport_standing_adjustments;
create policy "Correzioni classifica: non si modificano" on public.sport_standing_adjustments for update to authenticated using (false);
drop policy if exists "Correzioni classifica: lo staff toglie" on public.sport_standing_adjustments;
create policy "Correzioni classifica: lo staff toglie" on public.sport_standing_adjustments for delete to authenticated
  using ((select public.has_permission('sport.gestire')));

-- registro delle modifiche (lo legge lo staff)
create table if not exists public.sport_season_log (
  id bigint generated always as identity primary key,
  season_id uuid not null references public.sport_seasons (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null default auth.uid(),
  action text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists sport_season_log_season_idx on public.sport_season_log (season_id, created_at desc);
create index if not exists sport_season_log_actor_idx on public.sport_season_log (actor_id);
alter table public.sport_season_log enable row level security;
revoke all on public.sport_season_log from anon;
drop policy if exists "Registro sport: lo staff" on public.sport_season_log;
create policy "Registro sport: lo staff" on public.sport_season_log for select to authenticated
  using ((select public.has_permission('sport.gestire')));
drop policy if exists "Registro sport: solo dalle funzioni (nuove)" on public.sport_season_log;
create policy "Registro sport: solo dalle funzioni (nuove)" on public.sport_season_log for insert to authenticated with check (false);
drop policy if exists "Registro sport: non si modifica" on public.sport_season_log;
create policy "Registro sport: non si modifica" on public.sport_season_log for update to authenticated using (false);
drop policy if exists "Registro sport: non si cancella" on public.sport_season_log;
create policy "Registro sport: non si cancella" on public.sport_season_log for delete to authenticated using (false);

-- qualificati ai Nationals (confermati dallo staff) ed eccezioni
create table if not exists public.sport_qualifications (
  id bigint generated always as identity primary key,
  season_id uuid not null references public.sport_seasons (id) on delete cascade,
  kind text not null check (kind in ('team', 'individual')),
  team_id uuid references public.sport_teams (id) on delete cascade,
  character_id uuid references public.characters (id) on delete cascade,
  status text not null check (status in ('qualificato', 'escluso')),
  source text not null check (source in ('auto', 'override')),
  reason text not null default '' check (char_length(reason) <= 300),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check ((kind = 'team' and team_id is not null and character_id is null) or (kind = 'individual' and character_id is not null))
);
create unique index if not exists sport_qualifications_team_key on public.sport_qualifications (season_id, team_id) where kind = 'team';
create unique index if not exists sport_qualifications_individual_key on public.sport_qualifications (season_id, character_id) where kind = 'individual';
create index if not exists sport_qualifications_team_idx on public.sport_qualifications (team_id);
create index if not exists sport_qualifications_character_idx on public.sport_qualifications (character_id);
create index if not exists sport_qualifications_created_by_idx on public.sport_qualifications (created_by);
alter table public.sport_qualifications enable row level security;
revoke all on public.sport_qualifications from anon;
drop policy if exists "Qualificati: letti da tutti" on public.sport_qualifications;
create policy "Qualificati: letti da tutti" on public.sport_qualifications for select to authenticated using (true);
drop policy if exists "Qualificati: solo dalle funzioni (nuovi)" on public.sport_qualifications;
create policy "Qualificati: solo dalle funzioni (nuovi)" on public.sport_qualifications for insert to authenticated with check (false);
drop policy if exists "Qualificati: solo dalle funzioni (modifiche)" on public.sport_qualifications;
create policy "Qualificati: solo dalle funzioni (modifiche)" on public.sport_qualifications for update to authenticated using (false);
drop policy if exists "Qualificati: solo dalle funzioni (eliminazione)" on public.sport_qualifications;
create policy "Qualificati: solo dalle funzioni (eliminazione)" on public.sport_qualifications for delete to authenticated using (false);

-- tabelloni di Conference e Nationals
create table if not exists public.sport_bracket_matches (
  id bigint generated always as identity primary key,
  season_id uuid not null references public.sport_seasons (id) on delete cascade,
  phase text not null check (phase in ('conference', 'nationals')),
  round int not null check (round >= 1),
  slot int not null check (slot >= 1),
  team_a uuid references public.sport_teams (id) on delete set null,
  team_b uuid references public.sport_teams (id) on delete set null,
  event_id uuid references public.sport_events (id) on delete set null,
  score_a int,
  score_b int,
  winner_id uuid references public.sport_teams (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'done')),
  created_at timestamptz not null default now(),
  unique (season_id, phase, round, slot)
);
create index if not exists sport_bracket_team_a_idx on public.sport_bracket_matches (team_a);
create index if not exists sport_bracket_team_b_idx on public.sport_bracket_matches (team_b);
create index if not exists sport_bracket_event_idx on public.sport_bracket_matches (event_id);
create index if not exists sport_bracket_winner_idx on public.sport_bracket_matches (winner_id);
alter table public.sport_bracket_matches enable row level security;
revoke all on public.sport_bracket_matches from anon;
drop policy if exists "Tabelloni: letti da tutti" on public.sport_bracket_matches;
create policy "Tabelloni: letti da tutti" on public.sport_bracket_matches for select to authenticated using (true);
drop policy if exists "Tabelloni: solo dalle funzioni (nuovi)" on public.sport_bracket_matches;
create policy "Tabelloni: solo dalle funzioni (nuovi)" on public.sport_bracket_matches for insert to authenticated with check (false);
drop policy if exists "Tabelloni: solo dalle funzioni (modifiche)" on public.sport_bracket_matches;
create policy "Tabelloni: solo dalle funzioni (modifiche)" on public.sport_bracket_matches for update to authenticated using (false);
drop policy if exists "Tabelloni: lo staff li cancella" on public.sport_bracket_matches;
create policy "Tabelloni: lo staff li cancella" on public.sport_bracket_matches for delete to authenticated
  using ((select public.has_permission('sport.gestire')));

-- ---------------------------------------------------------------------
-- 3. REGISTRO
-- ---------------------------------------------------------------------
create or replace function public.sport_log(p_season uuid, p_action text, p_detail jsonb default '{}')
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.sport_season_log (season_id, actor_id, action, detail) values (p_season, auth.uid(), p_action, coalesce(p_detail, '{}'))
$$;
revoke execute on function public.sport_log(uuid, text, jsonb) from public, anon, authenticated;

-- fase, stato e campioni della stagione: sempre nel registro
create or replace function public.sport_seasons_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.phase is distinct from old.phase then
    perform public.sport_log(new.id, 'fase', jsonb_build_object('da', old.phase, 'a', new.phase));
  end if;
  if new.status is distinct from old.status then
    perform public.sport_log(new.id, 'stato', jsonb_build_object('da', old.status, 'a', new.status));
  end if;
  if new.conference_champion_id is distinct from old.conference_champion_id then
    perform public.sport_log(new.id, 'campione conference', jsonb_build_object('squadra', (select name from public.sport_teams where id = new.conference_champion_id)));
  end if;
  if new.national_champion_id is distinct from old.national_champion_id then
    perform public.sport_log(new.id, 'campione nazionale', jsonb_build_object('squadra', (select name from public.sport_teams where id = new.national_champion_id)));
  end if;
  return null;
end;
$$;
revoke execute on function public.sport_seasons_audit() from public, anon, authenticated;
drop trigger if exists sport_seasons_audit on public.sport_seasons;
create trigger sport_seasons_audit after update on public.sport_seasons
  for each row execute function public.sport_seasons_audit();

-- chiudere la stagione (anche dal vecchio pulsante) la porta nella fase «Conclusa»
create or replace function public.sport_seasons_phase_sync()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'closed' and old.status is distinct from 'closed' then new.phase := 'concluded'; end if;
  return new;
end;
$$;
drop trigger if exists sport_seasons_phase_sync on public.sport_seasons;
create trigger sport_seasons_phase_sync before update of status on public.sport_seasons
  for each row execute function public.sport_seasons_phase_sync();

create or replace function public.sport_rules_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := to_jsonb(old) - 'updated_at' - 'updated_by';
  v_new jsonb := to_jsonb(new) - 'updated_at' - 'updated_by';
  v_diff jsonb := '{}';
  k text;
begin
  if current_setting('app.sport_rules_init', true) = 'on' then return null; end if;
  for k in select jsonb_object_keys(v_new) loop
    if v_new -> k is distinct from v_old -> k then v_diff := v_diff || jsonb_build_object(k, jsonb_build_object('da', v_old -> k, 'a', v_new -> k)); end if;
  end loop;
  if v_diff <> '{}' then perform public.sport_log(new.season_id, 'regole', v_diff); end if;
  return null;
end;
$$;
revoke execute on function public.sport_rules_audit() from public, anon, authenticated;
drop trigger if exists sport_rules_audit on public.sport_season_rules;
create trigger sport_rules_audit after update on public.sport_season_rules
  for each row execute function public.sport_rules_audit();

create or replace function public.sport_rules_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;
drop trigger if exists sport_rules_touch on public.sport_season_rules;
create trigger sport_rules_touch before update on public.sport_season_rules
  for each row execute function public.sport_rules_touch();

-- correzioni di risultati già pubblicati
create or replace function public.sport_results_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev public.sport_events;
begin
  select * into ev from public.sport_events where id = new.event_id;
  if ev.status = 'published' and (new.score is distinct from old.score or new.placement is distinct from old.placement or new.points is distinct from old.points) then
    perform public.sport_log(ev.season_id, 'risultato corretto', jsonb_build_object(
      'gara', public.sport_event_label(ev.id), 'squadra', (select name from public.sport_teams where id = new.team_id),
      'punteggio', jsonb_build_object('da', old.score, 'a', new.score), 'piazzamento', jsonb_build_object('da', old.placement, 'a', new.placement)));
  end if;
  return null;
end;
$$;
revoke execute on function public.sport_results_audit() from public, anon, authenticated;
drop trigger if exists sport_results_audit on public.sport_event_teams;
create trigger sport_results_audit after update on public.sport_event_teams
  for each row execute function public.sport_results_audit();

create or replace function public.sport_adjustments_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.sport_standing_adjustments := case when tg_op = 'DELETE' then old else new end;
begin
  perform public.sport_log(r.season_id, case when tg_op = 'DELETE' then 'correzione tolta' else 'correzione' end, jsonb_build_object(
    'squadra', (select name from public.sport_teams where id = r.team_id), 'punti', r.points, 'spareggio', r.tiebreak, 'nota', r.note));
  return null;
end;
$$;
revoke execute on function public.sport_adjustments_audit() from public, anon, authenticated;
drop trigger if exists sport_adjustments_audit on public.sport_standing_adjustments;
create trigger sport_adjustments_audit after insert or delete on public.sport_standing_adjustments
  for each row execute function public.sport_adjustments_audit();

-- ---------------------------------------------------------------------
-- 4. REGOLE PREDEFINITE PER SPORT E REGOLE DI OGNI STAGIONE
-- ---------------------------------------------------------------------
-- come in NCAA Division I:
-- football 12 partite (10 di Conference + 2 fuori), finale di Conference tra le prime 2, soglia 6 vittorie;
-- basket 31 (20 di Conference andata e ritorno + 11 fuori), torneo di Conference a 8, soglia 18 vittorie;
-- hockey 34 (20 + 14), torneo a 8, soglia 18 vittorie; nuoto 10 meeting; equitazione 10 dual meet;
-- cheerleading 4 gare
update public.sports set default_rules = '{"min_events":10,"nationals_threshold":18,"regular_rounds":1,"nonconf_games":2,"conference_teams":2,"nationals_others":4}'
where name ilike 'football%' and default_rules = '{}';
update public.sports set default_rules = '{"min_events":25,"nationals_threshold":54,"regular_rounds":2,"nonconf_games":11,"conference_teams":8,"nationals_others":4}'
where name ilike 'basket%' and default_rules = '{}';
update public.sports set default_rules = '{"min_events":28,"nationals_threshold":54,"regular_rounds":2,"nonconf_games":14,"conference_teams":8,"nationals_others":4}'
where name ilike '%hockey%' and default_rules = '{}';
update public.sports set default_rules = '{"min_events":4,"nationals_threshold":25,"conference_teams":0,"race_meets":4,"nationals_others":4}'
where name ilike 'cheer%' and default_rules = '{}';
update public.sports set default_rules = '{"min_events":8,"nationals_threshold":50,"conference_teams":0,"race_meets":10,"nationals_others":4,"individual_enabled":true,"individual_threshold":40,"individual_min_events":6,"individual_slots":4}'
where (name ilike 'swim%' or name ilike 'nuoto%') and default_rules = '{}';
update public.sports set default_rules = '{"min_events":8,"nationals_threshold":18,"regular_rounds":1,"conference_teams":4,"nationals_others":4,"individual_enabled":true,"individual_threshold":40,"individual_min_events":6,"individual_slots":3}'
where name ilike 'equitazione%' and default_rules = '{}';

-- ---------------------------------------------------------------------
-- 4b. UNIVERSITÀ VERE: Big West Conference e grandi università nazionali
--     (solo nomi, come ambientazione: vedi il Disclaimer della homepage)
-- ---------------------------------------------------------------------
do $$
declare
  v_conf text[] := array['Cal Poly', 'CSU Bakersfield', 'Cal State Fullerton', 'Cal State Northridge', 'Hawai''i',
                         'Long Beach State', 'UC Davis', 'UC Irvine', 'UC Riverside', 'UC Santa Barbara'];
  v_conf_nick text[] := array['Mustangs', 'Roadrunners', 'Titans', 'Matadors', 'Rainbow Warriors',
                              'The Beach', 'Aggies', 'Anteaters', 'Highlanders', 'Gauchos'];
  v_nat text[] := array['Alabama', 'Georgia', 'Ohio State', 'Michigan', 'Texas', 'Florida', 'Stanford', 'Duke', 'Denver',
                        'Boston University', 'Auburn', 'Baylor', 'TCU', 'Texas A&M', 'South Carolina', 'Oklahoma State', 'Kentucky', 'Louisville'];
  v_nat_nick text[] := array['Crimson Tide', 'Bulldogs', 'Buckeyes', 'Wolverines', 'Longhorns', 'Gators', 'Cardinal', 'Blue Devils', 'Pioneers',
                             'Terriers', 'Tigers', 'Bears', 'Horned Frogs', 'Aggies', 'Gamecocks', 'Cowboys', 'Wildcats', 'Cardinals'];
  t record;
  i int;
begin
  -- le rivali inventate prendono i nomi veri ancora liberi (gare e risultati restano)
  i := 0;
  for t in select id from public.sport_teams where conference and not is_player_school and not is_national and name <> all (v_conf)
           order by created_at, name loop
    loop
      i := i + 1;
      exit when i > array_length(v_conf, 1) or not exists (select 1 from public.sport_teams where name = v_conf[i]);
    end loop;
    exit when i > array_length(v_conf, 1);
    update public.sport_teams set name = v_conf[i], nickname = v_conf_nick[i] where id = t.id;
  end loop;
  i := 0;
  for t in select id from public.sport_teams where is_national and not is_player_school and name <> all (v_nat)
           order by created_at, name loop
    loop
      i := i + 1;
      exit when i > array_length(v_nat, 1) or not exists (select 1 from public.sport_teams where name = v_nat[i]);
    end loop;
    exit when i > array_length(v_nat, 1);
    update public.sport_teams set name = v_nat[i], nickname = v_nat_nick[i] where id = t.id;
  end loop;
  -- quelle che mancano
  for j in 1..array_length(v_conf, 1) loop
    insert into public.sport_teams (name, nickname, is_player_school, conference, is_national, active)
    values (v_conf[j], v_conf_nick[j], false, true, false, true)
    on conflict (name) do update set conference = true, is_national = false, active = true;
  end loop;
  for j in 1..array_length(v_nat, 1) loop
    insert into public.sport_teams (name, nickname, is_player_school, conference, is_national, active)
    values (v_nat[j], v_nat_nick[j], false, false, true, true)
    on conflict (name) do update set conference = false, is_national = true, active = true;
  end loop;
  -- niente più università inventate
  update public.sport_teams set active = false
  where not is_player_school and name <> all (v_conf) and name <> all (v_nat);
end $$;

-- tutte le rivali di Conference fanno tutti gli sport
insert into public.sport_team_ratings (team_id, sport_id, rating)
select tm.id, s.id, 8 + (abs(hashtext(tm.name || s.name)) % 9)
from public.sport_teams tm cross join public.sports s
where tm.conference and tm.active and not tm.is_player_school and s.status = 'active'
on conflict do nothing;

-- le università nazionali solo negli sport in cui sono davvero forti
delete from public.sport_team_ratings where team_id in (select id from public.sport_teams where is_national);
insert into public.sport_team_ratings (team_id, sport_id, rating)
select tm.id, s.id, v.rating
from (values
  ('football%', 'Alabama', 17), ('football%', 'Georgia', 17), ('football%', 'Ohio State', 16), ('football%', 'Michigan', 16),
  ('football%', 'Texas', 16), ('football%', 'Florida', 15), ('football%', 'Stanford', 14), ('football%', 'Duke', 14),
  ('basket%', 'Duke', 17), ('basket%', 'Kentucky', 17), ('basket%', 'Michigan', 16), ('basket%', 'Texas', 15),
  ('basket%', 'Florida', 16), ('basket%', 'Alabama', 15), ('basket%', 'Louisville', 15), ('basket%', 'Stanford', 14),
  ('%hockey%', 'Michigan', 17), ('%hockey%', 'Denver', 17), ('%hockey%', 'Boston University', 16), ('%hockey%', 'Ohio State', 15),
  ('swim%', 'Stanford', 17), ('swim%', 'Texas', 17), ('swim%', 'Florida', 16), ('swim%', 'Michigan', 15),
  ('swim%', 'Georgia', 15), ('swim%', 'Alabama', 14), ('swim%', 'Ohio State', 14), ('swim%', 'Duke', 14),
  ('nuoto%', 'Stanford', 17), ('nuoto%', 'Texas', 17), ('nuoto%', 'Florida', 16), ('nuoto%', 'Michigan', 15),
  ('equitazione%', 'Georgia', 17), ('equitazione%', 'TCU', 16), ('equitazione%', 'Texas A&M', 16), ('equitazione%', 'Baylor', 15),
  ('equitazione%', 'Auburn', 15), ('equitazione%', 'South Carolina', 14), ('equitazione%', 'Oklahoma State', 14),
  ('cheer%', 'Alabama', 16), ('cheer%', 'Kentucky', 17), ('cheer%', 'Louisville', 16), ('cheer%', 'Ohio State', 15)
) as v (pat, team, rating)
join public.sports s on s.name ilike v.pat
join public.sport_teams tm on tm.name = v.team
on conflict (team_id, sport_id) do update set rating = excluded.rating;

-- regole di una stagione: le predefinite del sistema + quelle dello sport
create or replace function public.sport_rules_create(p_season uuid)
returns public.sport_season_rules
language plpgsql
security definer
set search_path = ''
as $$
declare
  ru public.sport_season_rules;
  v_defaults jsonb := (select s.default_rules from public.sport_seasons se join public.sports s on s.id = se.sport_id where se.id = p_season);
begin
  insert into public.sport_season_rules (season_id) values (p_season) on conflict (season_id) do nothing;
  select * into ru from public.sport_season_rules where season_id = p_season;
  if coalesce(v_defaults, '{}') <> '{}' then
    perform set_config('app.sport_rules_init', 'on', true);
    ru := jsonb_populate_record(ru, v_defaults - 'season_id');
    update public.sport_season_rules set
      pts_win = ru.pts_win, pts_draw = ru.pts_draw, pts_loss = ru.pts_loss, placement_points = ru.placement_points,
      regular_rounds = ru.regular_rounds, nonconf_games = ru.nonconf_games, race_meets = ru.race_meets,
      min_events = ru.min_events, nationals_threshold = ru.nationals_threshold,
      nationals_slots = ru.nationals_slots, nationals_others = ru.nationals_others, conference_teams = ru.conference_teams, conference_champion_auto = ru.conference_champion_auto,
      conference_min_place = ru.conference_min_place, tiebreakers = ru.tiebreakers, individual_enabled = ru.individual_enabled,
      individual_grade_points = ru.individual_grade_points, individual_threshold = ru.individual_threshold,
      individual_min_events = ru.individual_min_events, individual_slots = ru.individual_slots
    where season_id = p_season;
    perform set_config('app.sport_rules_init', 'off', true);
  end if;
  select * into ru from public.sport_season_rules where season_id = p_season;
  return ru;
end;
$$;
revoke execute on function public.sport_rules_create(uuid) from public, anon, authenticated;

create or replace function public.sport_rules(p_season uuid)
returns public.sport_season_rules
language plpgsql
security definer
set search_path = ''
as $$
declare
  ru public.sport_season_rules;
begin
  select * into ru from public.sport_season_rules where season_id = p_season;
  if ru.season_id is null then ru := public.sport_rules_create(p_season); end if;
  return ru;
end;
$$;
revoke execute on function public.sport_rules(uuid) from public, anon, authenticated;

create or replace function public.sport_seasons_rules_init()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.sport_rules_create(new.id);
  return null;
end;
$$;
revoke execute on function public.sport_seasons_rules_init() from public, anon, authenticated;
drop trigger if exists sport_seasons_rules_init on public.sport_seasons;
create trigger sport_seasons_rules_init after insert on public.sport_seasons
  for each row execute function public.sport_seasons_rules_init();

-- stagioni già esistenti: regole predefinite, adattate alle gare già in calendario
do $$
declare
  se record;
  ru public.sport_season_rules;
  v_n int;
begin
  for se in select id, sport_id from public.sport_seasons loop
    ru := public.sport_rules(se.id);
    select count(*) into v_n from public.sport_events e
    where e.season_id = se.id and e.phase = 'regular' and e.status <> 'cancelled'
      and exists (select 1 from public.sport_event_teams et join public.sport_teams t on t.id = et.team_id where et.event_id = e.id and t.is_player_school);
    if v_n > 0 and v_n < ru.min_events then
      perform set_config('app.sport_rules_init', 'on', true);
      update public.sport_season_rules
      set nationals_threshold = ceil(ru.nationals_threshold::numeric * v_n / greatest(1, ru.min_events))::int, min_events = v_n
      where season_id = se.id;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 5. CALENDARIO AUTOMATICO: più giri contro ogni rivale
-- ---------------------------------------------------------------------
create or replace function public.sport_season_generate(p_season uuid, p_start timestamptz, p_days int default 7)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  se public.sport_seasons;
  sp public.sports;
  ru public.sport_season_rules;
  v_school uuid;
  v_rivals uuid[];
  v_others uuid[];
  v_n int := 0;
  v_ev uuid;
begin
  if not public.has_permission('sport.gestire') then raise exception 'Non hai il permesso di gestire lo sport.' using errcode = '42501'; end if;
  select * into se from public.sport_seasons where id = p_season;
  if se.id is null or se.status = 'closed' then raise exception 'Stagione non modificabile.' using errcode = 'P0001'; end if;
  select * into sp from public.sports where id = se.sport_id;
  ru := public.sport_rules(p_season);
  select id into v_school from public.sport_teams where is_player_school;
  if sp.format in ('team_match', 'individual_match') then
    select array_agg(tm.id order by random()) into v_rivals
    from public.sport_teams tm join public.sport_team_ratings r on r.team_id = tm.id and r.sport_id = sp.id
    where tm.conference and tm.active and not tm.is_player_school;
    select array_agg(tm.id order by r.rating desc, random()) into v_others
    from public.sport_teams tm join public.sport_team_ratings r on r.team_id = tm.id and r.sport_id = sp.id
    where tm.is_national and tm.active;
    -- prima le partite fuori Conference, contro le grandi università
    if coalesce(array_length(v_others, 1), 0) > 0 then
      for i in 1..ru.nonconf_games loop
        insert into public.sport_events (season_id, sport_id, kind, phase, starts_at, venue, notes)
        values (p_season, sp.id, case when sp.format = 'team_match' then 'partita' else 'incontro' end, 'regular',
          p_start + make_interval(days => v_n * greatest(1, p_days)), case when i % 2 = 1 then 'home' else 'away' end, 'Fuori Conference')
        returning id into v_ev;
        insert into public.sport_event_teams (event_id, team_id) values (v_ev, v_school), (v_ev, v_others[1 + (i - 1) % array_length(v_others, 1)]);
        v_n := v_n + 1;
      end loop;
    end if;
    for k in 1..ru.regular_rounds loop
      for i in 1..coalesce(array_length(v_rivals, 1), 0) loop
        insert into public.sport_events (season_id, sport_id, kind, phase, starts_at, venue)
        values (p_season, sp.id, case when sp.format = 'team_match' then 'partita' else 'incontro' end, 'regular',
          p_start + make_interval(days => v_n * greatest(1, p_days)),
          -- al ritorno si scambiano casa e trasferta
          case when (i + k) % 2 = 0 then 'home' else 'away' end)
        returning id into v_ev;
        insert into public.sport_event_teams (event_id, team_id) values (v_ev, v_school), (v_ev, v_rivals[i]);
        v_n := v_n + 1;
      end loop;
    end loop;
  else
    -- gare: un meeting con tutta la Conference ogni periodo
    for i in 0..greatest(1, ru.race_meets) - 1 loop
      insert into public.sport_events (season_id, sport_id, kind, phase, starts_at, venue)
      values (p_season, sp.id, case when sp.format = 'team_race' then 'regata' else 'meeting' end, 'regular',
        p_start + make_interval(days => i * greatest(1, p_days)), case when i % 2 = 0 then 'home' else 'neutral' end)
      returning id into v_ev;
      insert into public.sport_event_teams (event_id, team_id)
      select v_ev, tm.id from public.sport_teams tm
      where tm.is_player_school or (tm.conference and tm.active and exists (select 1 from public.sport_team_ratings r where r.team_id = tm.id and r.sport_id = sp.id));
      v_n := v_n + 1;
    end loop;
  end if;
  perform public.sport_log(p_season, 'calendario generato', jsonb_build_object('gare', v_n));
  return v_n;
end;
$$;
revoke execute on function public.sport_season_generate(uuid, timestamptz, int) from public, anon;
grant execute on function public.sport_season_generate(uuid, timestamptz, int) to authenticated;

-- ---------------------------------------------------------------------
-- 6. PIAZZAMENTI NEL TORNEO DI CONFERENCE
-- ---------------------------------------------------------------------
create or replace function public.sport_conference_places(p_season uuid)
returns table (team_id uuid, place int)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  sp public.sports := (select s from public.sports s join public.sport_seasons se on se.sport_id = s.id where se.id = p_season);
  v_rounds int;
  v_champion uuid := (select conference_champion_id from public.sport_seasons where id = p_season);
begin
  if sp.format in ('team_race', 'individual_race') then
    return query
    select distinct on (et.team_id) et.team_id, et.placement
    from public.sport_events e join public.sport_event_teams et on et.event_id = e.id
    where e.season_id = p_season and e.phase = 'conference' and e.status = 'published' and et.placement is not null
    order by et.team_id, e.starts_at desc;
    return;
  end if;
  select max(round) into v_rounds from public.sport_bracket_matches where season_id = p_season and phase = 'conference';
  if v_rounds is null then return; end if;
  return query
  with teams as (
    select m.team_a as t from public.sport_bracket_matches m where m.season_id = p_season and m.phase = 'conference' and m.team_a is not null
    union select m.team_b from public.sport_bracket_matches m where m.season_id = p_season and m.phase = 'conference' and m.team_b is not null
  )
  select tt.t,
    case when tt.t = v_champion then 1
         else (select (power(2, v_rounds - m.round) + 1)::int from public.sport_bracket_matches m
               where m.season_id = p_season and m.phase = 'conference' and m.status = 'done' and m.winner_id is not null
                 and m.winner_id <> tt.t and tt.t in (m.team_a, m.team_b)
               order by m.round limit 1) end
  from teams tt;
end;
$$;
revoke execute on function public.sport_conference_places(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 7. CLASSIFICA A PUNTI (stagione regolare, risultati pubblicati)
-- ---------------------------------------------------------------------
create or replace function public.sport_table(p_season uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  sp public.sports := (select s from public.sports s join public.sport_seasons se on se.sport_id = s.id where se.id = p_season);
  ru public.sport_season_rules;
  v_race boolean;
  v_w int; v_d int; v_l int;
  v_pp int[];
  v_tb text[];
  v jsonb;
begin
  if sp.id is null then return '[]'; end if;
  ru := public.sport_rules(p_season);
  v_race := sp.format in ('team_race', 'individual_race');
  v_w := ru.pts_win; v_d := ru.pts_draw; v_l := ru.pts_loss; v_pp := ru.placement_points;
  v_tb := ru.tiebreakers || array['', '', '', '']::text[];

  with teams as (
    select t.id, t.name, t.is_player_school from public.sport_teams t
    where t.active and not t.is_national
      and (t.is_player_school or (t.conference and exists (select 1 from public.sport_team_ratings r where r.team_id = t.id and r.sport_id = sp.id)))
  ),
  games as (
    select a.team_id as t1, b.team_id as t2, a.score as s1, b.score as s2
    from public.sport_events e
    join public.sport_event_teams a on a.event_id = e.id
    join public.sport_event_teams b on b.event_id = e.id and b.team_id <> a.team_id
    where not v_race and e.season_id = p_season and e.status = 'published' and e.phase = 'regular' and a.score is not null and b.score is not null
    union all
    select team_a, team_b, score_a, score_b from public.sport_shadow_results where not v_race and season_id = p_season
    union all
    select team_b, team_a, score_b, score_a from public.sport_shadow_results where not v_race and season_id = p_season
  ),
  meets as (
    select et.team_id, et.placement from public.sport_events e join public.sport_event_teams et on et.event_id = e.id
    where v_race and e.season_id = p_season and e.status = 'published' and e.phase = 'regular' and et.placement is not null
  ),
  adj as (
    select a.team_id, sum(a.points)::int as pts, sum(a.tiebreak)::int as tb from public.sport_standing_adjustments a where a.season_id = p_season group by a.team_id
  ),
  cp as (select * from public.sport_conference_places(p_season)),
  base as (
    select tm.id, tm.name, tm.is_player_school,
      case when v_race then (select count(*) from meets m where m.team_id = tm.id) else (select count(*) from games g where g.t1 = tm.id) end::int as played,
      (select count(*) from games g where g.t1 = tm.id and g.s1 > g.s2)::int as won,
      (select count(*) from games g where g.t1 = tm.id and g.s1 = g.s2)::int as drawn,
      (select count(*) from games g where g.t1 = tm.id and g.s1 < g.s2)::int as lost,
      coalesce((select sum(g.s1 - g.s2) from games g where g.t1 = tm.id), 0)::int as diff,
      coalesce((select sum(coalesce(v_pp[m.placement], 0)) from meets m where m.team_id = tm.id), 0)::int as race_points,
      coalesce(a.pts, 0) as adj_points, coalesce(a.tb, 0) as adj_tiebreak,
      (select c.place from cp c where c.team_id = tm.id) as conf_place
    from teams tm left join adj a on a.team_id = tm.id
  ),
  pts as (
    select b.*, (case when v_race then b.race_points else b.won * v_w + b.drawn * v_d + b.lost * v_l end) + b.adj_points as points from base b
  ),
  h2h as (
    select p.*, coalesce((select sum(case when g.s1 > g.s2 then v_w when g.s1 = g.s2 then v_d else v_l end)
                          from games g join pts q on q.id = g.t2 where g.t1 = p.id and q.points = p.points and q.id <> p.id), 0)::int as h2h
    from pts p
  ),
  ranked as (
    select h.*, row_number() over (order by
      h.points desc,
      (case v_tb[1] when 'scontri_diretti' then h.h2h when 'differenza' then h.diff when 'vittorie' then h.won when 'conference' then -coalesce(h.conf_place, 99) else 0 end) desc,
      (case v_tb[2] when 'scontri_diretti' then h.h2h when 'differenza' then h.diff when 'vittorie' then h.won when 'conference' then -coalesce(h.conf_place, 99) else 0 end) desc,
      (case v_tb[3] when 'scontri_diretti' then h.h2h when 'differenza' then h.diff when 'vittorie' then h.won when 'conference' then -coalesce(h.conf_place, 99) else 0 end) desc,
      (case v_tb[4] when 'scontri_diretti' then h.h2h when 'differenza' then h.diff when 'vittorie' then h.won when 'conference' then -coalesce(h.conf_place, 99) else 0 end) desc,
      h.adj_tiebreak desc, h.name) as rank
    from h2h h
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'team_id', r.id, 'name', r.name, 'is_player_school', r.is_player_school, 'rank', r.rank, 'played', r.played,
      'won', r.won, 'drawn', r.drawn, 'lost', r.lost, 'diff', r.diff, 'points', r.points, 'adj_points', r.adj_points,
      'h2h', r.h2h, 'conf_place', r.conf_place) order by r.rank), '[]'::jsonb)
  into v from ranked r;
  return v;
end;
$$;
revoke execute on function public.sport_table(uuid) from public, anon;
grant execute on function public.sport_table(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 8. QUALIFICAZIONE AI NATIONALS
-- ---------------------------------------------------------------------
-- calcolo (provvisorio finché lo staff non conferma)
create or replace function public.sport_qualification_compute(p_season uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  se public.sport_seasons;
  sp public.sports;
  ru public.sport_season_rules;
  v_table jsonb := public.sport_table(p_season);
  r jsonb;
  v_teams jsonb := '[]';
  v_inds jsonb := '[]';
  v_reasons text[];
  v_ok boolean;
  v_auto boolean;
  v_ov public.sport_qualifications;
  v_free int;
  v_nat int;
  t record;
  v_status text;
  v_gp int[];
begin
  select * into se from public.sport_seasons where id = p_season;
  select * into sp from public.sports where id = se.sport_id;
  ru := public.sport_rules(p_season);
  v_gp := ru.individual_grade_points;

  -- altre Conference: le nazionali sono qualificate d'ufficio
  select count(*) into v_nat from public.sport_teams tm join public.sport_team_ratings tr on tr.team_id = tm.id and tr.sport_id = sp.id
  where tm.is_national and tm.active;
  v_nat := least(v_nat, ru.nationals_others, greatest(0, ru.nationals_slots - 1));
  for t in
    select tm.id, tm.name, tr.rating from public.sport_teams tm join public.sport_team_ratings tr on tr.team_id = tm.id and tr.sport_id = sp.id
    where tm.is_national and tm.active order by tr.rating desc, tm.name limit v_nat
  loop
    v_teams := v_teams || jsonb_build_array(jsonb_build_object('team_id', t.id, 'name', t.name, 'group', 'national', 'rating', t.rating,
      'qualifies', true, 'auto', true, 'reasons', jsonb_build_array('Campione di un''altra Conference: qualificata d''ufficio')));
  end loop;
  v_free := ru.nationals_slots - v_nat;

  -- la nostra Conference: prima il campione (se vale di diritto), poi l'ordine di classifica
  for r in
    select x from jsonb_array_elements(v_table) x
    order by coalesce((x ->> 'team_id')::uuid = se.conference_champion_id and ru.conference_champion_auto, false) desc, (x ->> 'rank')::int
  loop
    v_reasons := array[]::text[];
    v_auto := coalesce((r ->> 'team_id')::uuid = se.conference_champion_id and ru.conference_champion_auto, false);
    v_ok := true;
    if (r ->> 'points')::int < ru.nationals_threshold then
      v_ok := false;
      v_reasons := v_reasons || ('Punti ' || (r ->> 'points') || ' su ' || ru.nationals_threshold || ' richiesti (mancano ' || (ru.nationals_threshold - (r ->> 'points')::int) || ')');
    end if;
    if (r ->> 'played')::int < ru.min_events then
      v_ok := false;
      v_reasons := v_reasons || ('Gare giocate ' || (r ->> 'played') || ' su ' || ru.min_events || ' richieste');
    end if;
    if ru.conference_min_place is not null and coalesce((r ->> 'conf_place')::int, 99) > ru.conference_min_place then
      v_ok := false;
      v_reasons := v_reasons || ('Piazzamento in Conference ' || coalesce((r ->> 'conf_place') || '°', 'non disputato') || ', serve almeno ' || ru.conference_min_place || '°');
    end if;
    if v_auto then
      v_ok := true;
      v_reasons := array['Campione della Conference: qualificata di diritto'];
    elsif v_ok then
      v_reasons := array['Punti ' || (r ->> 'points') || ' su ' || ru.nationals_threshold || ', gare ' || (r ->> 'played') || ' su ' || ru.min_events];
    end if;
    if v_ok and v_free <= 0 then
      v_ok := false;
      v_reasons := v_reasons || 'Posti per i Nationals esauriti'::text;
    end if;
    if v_ok then v_free := v_free - 1; end if;
    v_teams := v_teams || jsonb_build_array(r || jsonb_build_object('group', 'conference', 'qualifies', v_ok, 'auto', v_auto, 'reasons', to_jsonb(v_reasons),
      'missing', greatest(0, ru.nationals_threshold - (r ->> 'points')::int)));
  end loop;

  -- eccezioni dello staff
  for v_ov in select * from public.sport_qualifications where season_id = p_season and kind = 'team' and source = 'override' loop
    v_teams := (select coalesce(jsonb_agg(case when (x ->> 'team_id')::uuid = v_ov.team_id
                  then x || jsonb_build_object('qualifies', v_ov.status = 'qualificato', 'override', true,
                         'reasons', (x -> 'reasons') || to_jsonb(case when v_ov.status = 'qualificato' then 'Inserita dallo staff: ' else 'Esclusa dallo staff: ' end || v_ov.reason))
                  else x end), '[]'::jsonb) from jsonb_array_elements(v_teams) x);
  end loop;

  -- individuali
  if ru.individual_enabled then
    for t in
      with rolls as (
        select x.character_id, x.grade from public.sport_event_rolls x join public.sport_events e on e.id = x.event_id
        where e.season_id = p_season and e.status = 'published' and e.phase = 'regular'
      )
      select ro.character_id, c.name, count(*)::int as n,
        sum(coalesce(v_gp[least(10, greatest(1, ro.grade))], 0))::int as pts
      from rolls ro join public.characters c on c.id = ro.character_id
      group by ro.character_id, c.name
      order by pts desc, n desc, c.name
    loop
      v_reasons := array[]::text[];
      v_ok := true;
      if t.pts < ru.individual_threshold then
        v_ok := false;
        v_reasons := v_reasons || ('Punti ' || t.pts || ' su ' || ru.individual_threshold || ' (mancano ' || (ru.individual_threshold - t.pts) || ')');
      end if;
      if t.n < ru.individual_min_events then
        v_ok := false;
        v_reasons := v_reasons || ('Gare ' || t.n || ' su ' || ru.individual_min_events);
      end if;
      if v_ok
         and (select count(*) from jsonb_array_elements(v_inds) i where (i ->> 'qualifies')::boolean) >= ru.individual_slots then
        v_ok := false;
        v_reasons := v_reasons || 'Posti individuali esauriti'::text;
      end if;
      if v_ok then v_reasons := array['Punti ' || t.pts || ' su ' || ru.individual_threshold || ', gare ' || t.n]; end if;
      select * into v_ov from public.sport_qualifications where season_id = p_season and kind = 'individual' and source = 'override' and character_id = t.character_id;
      if v_ov.id is not null then
        v_ok := v_ov.status = 'qualificato';
        v_reasons := v_reasons || ((case when v_ok then 'Inserito dallo staff: ' else 'Escluso dallo staff: ' end) || v_ov.reason);
      end if;
      v_inds := v_inds || jsonb_build_array(jsonb_build_object('character_id', t.character_id, 'name', public.first_name(t.name),
        'events', t.n, 'points', t.pts, 'qualifies', v_ok, 'reasons', to_jsonb(v_reasons)));
    end loop;
  end if;

  return jsonb_build_object('teams', v_teams, 'individuals', v_inds);
end;
$$;
revoke execute on function public.sport_qualification_compute(uuid) from public, anon, authenticated;

-- la squadra o l'atleta può gareggiare ai Nationals?
create or replace function public.sport_can_play_nationals(p_season uuid, p_team uuid, p_character uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_character is not null then
      exists (select 1 from public.sport_qualifications q where q.season_id = p_season and q.status = 'qualificato'
              and ((q.kind = 'individual' and q.character_id = p_character)
                or (q.kind = 'team' and q.team_id = (select id from public.sport_teams where is_player_school))))
    else
      exists (select 1 from public.sport_qualifications q where q.season_id = p_season and q.kind = 'team' and q.status = 'qualificato' and q.team_id = p_team)
      -- la nostra università entra anche solo per i suoi atleti qualificati individualmente
      or (p_team = (select id from public.sport_teams where is_player_school)
          and exists (select 1 from public.sport_qualifications q where q.season_id = p_season and q.kind = 'individual' and q.status = 'qualificato'))
  end
$$;
revoke execute on function public.sport_can_play_nationals(uuid, uuid, uuid) from public, anon, authenticated;

-- nessuno entra in una gara dei Nationals senza qualificazione confermata (o eccezione dello staff)
create or replace function public.sport_event_teams_nationals_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev public.sport_events := (select e from public.sport_events e where e.id = new.event_id);
begin
  if ev.phase <> 'national' then return new; end if;
  if exists (select 1 from public.sport_event_teams where event_id = new.event_id and team_id = new.team_id) then return new; end if;
  -- gare dei Nationals create prima di questo sistema: restano com'erano
  if ev.qualification_free then return new; end if;
  if not public.sport_can_play_nationals(ev.season_id, new.team_id) then
    raise exception '% non è qualificata ai Nationals (manca la conferma dello staff o un''eccezione motivata).',
      (select name from public.sport_teams where id = new.team_id) using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.sport_event_teams_nationals_guard() from public, anon, authenticated;
drop trigger if exists sport_event_teams_nationals_guard on public.sport_event_teams;
create trigger sport_event_teams_nationals_guard before insert on public.sport_event_teams
  for each row execute function public.sport_event_teams_nationals_guard();

create or replace function public.sport_callups_nationals_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev public.sport_events := (select e from public.sport_events e where e.id = new.event_id);
begin
  if ev.phase <> 'national' or ev.qualification_free then return new; end if;
  -- il tifo a bordo campo (atleti di un altro sport) non gareggia
  if not exists (select 1 from public.sport_roster where character_id = new.character_id and sport_id = ev.sport_id and left_at is null) then return new; end if;
  if not public.sport_can_play_nationals(ev.season_id, null, new.character_id) then
    raise exception 'Questo atleta non è qualificato ai Nationals (né con la squadra né individualmente).' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.sport_callups_nationals_guard() from public, anon, authenticated;
drop trigger if exists sport_callups_nationals_guard on public.sport_callups;
create trigger sport_callups_nationals_guard before insert on public.sport_callups
  for each row execute function public.sport_callups_nationals_guard();

-- conferma dello staff: si congela l'elenco (le eccezioni restano)
create or replace function public.sport_qualification_confirm(p_season uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v jsonb := public.sport_qualification_compute(p_season);
  x jsonb;
  v_n int := 0;
  v_school uuid := (select id from public.sport_teams where is_player_school);
  v_sport uuid := (select sport_id from public.sport_seasons where id = p_season);
  v_msg text;
begin
  if not public.has_permission('sport.gestire') then raise exception 'Non hai il permesso di gestire lo sport.' using errcode = '42501'; end if;
  delete from public.sport_qualifications where season_id = p_season and source = 'auto';
  for x in select * from jsonb_array_elements(v -> 'teams') loop
    if (x ->> 'qualifies')::boolean and not coalesce((x ->> 'override')::boolean, false) then
      insert into public.sport_qualifications (season_id, kind, team_id, status, source, reason)
      values (p_season, 'team', (x ->> 'team_id')::uuid, 'qualificato', 'auto', left(coalesce(x -> 'reasons' ->> 0, ''), 300));
      v_n := v_n + 1;
    end if;
  end loop;
  for x in select * from jsonb_array_elements(v -> 'individuals') loop
    if (x ->> 'qualifies')::boolean and not exists (select 1 from public.sport_qualifications where season_id = p_season and kind = 'individual'
                                                     and character_id = (x ->> 'character_id')::uuid) then
      insert into public.sport_qualifications (season_id, kind, character_id, status, source, reason)
      values (p_season, 'individual', (x ->> 'character_id')::uuid, 'qualificato', 'auto', left(coalesce(x -> 'reasons' ->> 0, ''), 300));
    end if;
  end loop;
  update public.sport_seasons set qualified_confirmed_at = now(), qualified_confirmed_by = auth.uid() where id = p_season;
  perform public.sport_log(p_season, 'qualificati confermati', jsonb_build_object('squadre', v_n,
    'elenco', (select jsonb_agg(t.name) from public.sport_qualifications q join public.sport_teams t on t.id = q.team_id
               where q.season_id = p_season and q.kind = 'team' and q.status = 'qualificato')));
  v_msg := case when public.sport_can_play_nationals(p_season, v_school)
                then '🏆 Nationals: la squadra è qualificata! Trovi il tabellone nella pagina Sport.'
                else '🏅 Nationals: la squadra non si è qualificata. Nella pagina Sport trovi la classifica e i motivi.' end;
  perform public.sport_notify_athletes(v_sport, v_msg);
  return v_n;
end;
$$;
revoke execute on function public.sport_qualification_confirm(uuid) from public, anon;
grant execute on function public.sport_qualification_confirm(uuid) to authenticated;

-- riapre l'elenco (per correggere un risultato rettificato): serve un motivo
create or replace function public.sport_qualification_reopen(p_season uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_permission('sport.gestire') then raise exception 'Non hai il permesso di gestire lo sport.' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'Scrivi il motivo (almeno 5 caratteri).' using errcode = 'P0001'; end if;
  update public.sport_seasons set qualified_confirmed_at = null, qualified_confirmed_by = null where id = p_season;
  delete from public.sport_qualifications where season_id = p_season and source = 'auto';
  perform public.sport_log(p_season, 'qualificati riaperti', jsonb_build_object('motivo', btrim(p_reason)));
end;
$$;
revoke execute on function public.sport_qualification_reopen(uuid, text) from public, anon;
grant execute on function public.sport_qualification_reopen(uuid, text) to authenticated;

-- eccezione motivata: inserire o escludere una squadra o un atleta (p_status null = togli l'eccezione)
create or replace function public.sport_qualification_override(p_season uuid, p_team uuid, p_character uuid, p_status text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text := case when p_character is not null then 'individual' else 'team' end;
begin
  if not public.has_permission('sport.gestire') then raise exception 'Non hai il permesso di gestire lo sport.' using errcode = '42501'; end if;
  if p_team is null and p_character is null then raise exception 'Scegli una squadra o un atleta.' using errcode = 'P0001'; end if;
  delete from public.sport_qualifications
  where season_id = p_season and kind = v_kind
    and ((v_kind = 'team' and team_id = p_team) or (v_kind = 'individual' and character_id = p_character));
  if p_status is null then
    perform public.sport_log(p_season, 'eccezione tolta', jsonb_build_object('squadra', (select name from public.sport_teams where id = p_team),
      'atleta', (select name from public.characters where id = p_character)));
    return;
  end if;
  if p_status not in ('qualificato', 'escluso') then raise exception 'Stato non valido.' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'Scrivi il motivo dell''eccezione (almeno 5 caratteri).' using errcode = 'P0001'; end if;
  insert into public.sport_qualifications (season_id, kind, team_id, character_id, status, source, reason)
  values (p_season, v_kind, case when v_kind = 'team' then p_team end, p_character, p_status, 'override', left(btrim(p_reason), 300));
  perform public.sport_log(p_season, 'eccezione', jsonb_build_object('squadra', (select name from public.sport_teams where id = p_team),
    'atleta', (select name from public.characters where id = p_character), 'stato', p_status, 'motivo', btrim(p_reason)));
end;
$$;
revoke execute on function public.sport_qualification_override(uuid, uuid, uuid, text, text) from public, anon;
grant execute on function public.sport_qualification_override(uuid, uuid, uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 9. TABELLONI
-- ---------------------------------------------------------------------
-- punteggio di una partita decisa da sola (vincitore, perdente)
create or replace function public.sport_auto_score(p_sport uuid, p_diff int)
returns int[]
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  sp public.sports := (select s from public.sports s where s.id = p_sport);
  v_bouts int;
  v_w int;
begin
  if sp.format = 'individual_match' then
    v_bouts := coalesce((sp.score_profile ->> 'bouts')::int, 9);
    v_w := v_bouts / 2 + 1 + floor(random() * (v_bouts - v_bouts / 2))::int;
    v_w := least(v_bouts, v_w);
    return array[v_w, v_bouts - v_w];
  end if;
  return public.sport_points(sp.score_profile, greatest(1, abs(p_diff)), false);
end;
$$;
revoke execute on function public.sport_auto_score(uuid, int) from public, anon, authenticated;

-- nome del turno: Finale, Semifinali, Quarti…
create or replace function public.sport_round_name(p_matches int)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_matches when 1 then 'Finale' when 2 then 'Semifinali' when 4 then 'Quarti di finale' when 8 then 'Ottavi di finale' else 'Primo turno' end
$$;

-- una partita del tabellone: se gioca la nostra università diventa una gara da simulare o giocare
create or replace function public.sport_bracket_add(p_season uuid, p_phase text, p_round int, p_slot int, p_a uuid, p_b uuid, p_start timestamptz, p_matches int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  sp public.sports := (select s from public.sports s join public.sport_seasons se on se.sport_id = s.id where se.id = p_season);
  v_school uuid := (select id from public.sport_teams where is_player_school);
  v_ev uuid;
begin
  if p_a is null or p_b is null then
    -- turno libero: passa chi c'è
    insert into public.sport_bracket_matches (season_id, phase, round, slot, team_a, team_b, winner_id, status)
    values (p_season, p_phase, p_round, p_slot, p_a, p_b, coalesce(p_a, p_b), 'done');
    return;
  end if;
  if v_school in (p_a, p_b) then
    insert into public.sport_events (season_id, sport_id, kind, phase, starts_at, venue, notes)
    values (p_season, sp.id, case when sp.format = 'team_match' then 'partita' else 'incontro' end,
      case when p_phase = 'nationals' then 'national' else 'conference' end, p_start, 'neutral',
      case when p_phase = 'nationals' then 'Nationals' else 'Conference' end || ' · ' || public.sport_round_name(p_matches))
    returning id into v_ev;
    insert into public.sport_event_teams (event_id, team_id) values (v_ev, p_a), (v_ev, p_b);
  end if;
  insert into public.sport_bracket_matches (season_id, phase, round, slot, team_a, team_b, event_id)
  values (p_season, p_phase, p_round, p_slot, p_a, p_b, v_ev);
end;
$$;
revoke execute on function public.sport_bracket_add(uuid, text, int, int, uuid, uuid, timestamptz, int) from public, anon, authenticated;

-- primo turno: teste di serie 1 contro l'ultima, 2 contro la penultima…
create or replace function public.sport_bracket_seed(p_season uuid, p_phase text, p_teams uuid[], p_start timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n int := coalesce(array_length(p_teams, 1), 0);
  v_size int := 2;
begin
  if v_n < 2 then raise exception 'Servono almeno due squadre.' using errcode = 'P0001'; end if;
  while v_size < v_n loop v_size := v_size * 2; end loop;
  for i in 1..v_size / 2 loop
    perform public.sport_bracket_add(p_season, p_phase, 1, i, p_teams[i], p_teams[v_size + 1 - i], p_start, v_size / 2);
  end loop;
end;
$$;
revoke execute on function public.sport_bracket_seed(uuid, text, uuid[], timestamptz) from public, anon, authenticated;

-- gara unica (sport a gare): una finale con le squadre indicate
create or replace function public.sport_final_event(p_season uuid, p_phase text, p_teams uuid[], p_start timestamptz)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  sp public.sports := (select s from public.sports s join public.sport_seasons se on se.sport_id = s.id where se.id = p_season);
  v_ev uuid;
begin
  insert into public.sport_events (season_id, sport_id, kind, phase, starts_at, venue, notes)
  values (p_season, sp.id, case when sp.format = 'team_race' then 'regata' else 'meeting' end,
    case when p_phase = 'nationals' then 'national' else 'conference' end, p_start, 'neutral',
    case when p_phase = 'nationals' then 'Nationals · Finale' else 'Conference Championship' end)
  returning id into v_ev;
  insert into public.sport_event_teams (event_id, team_id) select v_ev, t from unnest(p_teams) t on conflict do nothing;
  return v_ev;
end;
$$;
revoke execute on function public.sport_final_event(uuid, text, uuid[], timestamptz) from public, anon, authenticated;

-- torneo di Conference: le prime della classifica (o tutte)
create or replace function public.sport_conference_generate(p_season uuid, p_start timestamptz)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  se public.sport_seasons;
  sp public.sports;
  ru public.sport_season_rules;
  v_teams uuid[];
begin
  if not public.has_permission('sport.gestire') then raise exception 'Non hai il permesso di gestire lo sport.' using errcode = '42501'; end if;
  select * into se from public.sport_seasons where id = p_season;
  if se.status = 'closed' then raise exception 'Stagione chiusa.' using errcode = 'P0001'; end if;
  select * into sp from public.sports where id = se.sport_id;
  ru := public.sport_rules(p_season);
  if exists (select 1 from public.sport_bracket_matches where season_id = p_season and phase = 'conference')
     or exists (select 1 from public.sport_events where season_id = p_season and phase = 'conference' and status <> 'cancelled'
                and notes = 'Conference Championship') then
    raise exception 'Il torneo di Conference è già stato creato.' using errcode = 'P0001';
  end if;
  select array_agg((x ->> 'team_id')::uuid order by (x ->> 'rank')::int) into v_teams
  from jsonb_array_elements(public.sport_table(p_season)) x
  where ru.conference_teams = 0 or (x ->> 'rank')::int <= ru.conference_teams;
  if sp.format in ('team_race', 'individual_race') then
    perform public.sport_final_event(p_season, 'conference', v_teams, p_start);
  else
    perform public.sport_bracket_seed(p_season, 'conference', v_teams, p_start);
  end if;
  update public.sport_seasons set phase = 'conference' where id = p_season and phase in ('preseason', 'regular');
  perform public.sport_log(p_season, 'torneo di conference', jsonb_build_object('squadre', (select jsonb_agg(t.name) from public.sport_teams t where t.id = any (v_teams))));
  perform public.sport_notify_athletes(sp.id, '🏟️ ' || sp.name || ': comincia la fase di Conference. Tabellone e calendario nella pagina Sport.');
  return coalesce(array_length(v_teams, 1), 0);
end;
$$;
revoke execute on function public.sport_conference_generate(uuid, timestamptz) from public, anon;
grant execute on function public.sport_conference_generate(uuid, timestamptz) to authenticated;

-- Nationals: solo con l'elenco dei qualificati confermato
create or replace function public.sport_nationals_generate(p_season uuid, p_start timestamptz)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  se public.sport_seasons;
  sp public.sports;
  v_teams uuid[];
  v_table jsonb;
begin
  if not public.has_permission('sport.gestire') then raise exception 'Non hai il permesso di gestire lo sport.' using errcode = '42501'; end if;
  select * into se from public.sport_seasons where id = p_season;
  if se.qualified_confirmed_at is null then raise exception 'Prima conferma l''elenco dei qualificati.' using errcode = 'P0001'; end if;
  select * into sp from public.sports where id = se.sport_id;
  if exists (select 1 from public.sport_bracket_matches where season_id = p_season and phase = 'nationals')
     or exists (select 1 from public.sport_events where season_id = p_season and phase = 'national' and status <> 'cancelled' and notes = 'Nationals · Finale') then
    raise exception 'Il tabellone dei Nationals è già stato creato.' using errcode = 'P0001';
  end if;
  v_table := public.sport_table(p_season);
  -- teste di serie: campione di Conference, poi la classifica, poi le altre Conference per forza
  select array_agg(q.team_id order by
      (q.team_id = se.conference_champion_id) desc,
      coalesce((select (x ->> 'rank')::int from jsonb_array_elements(v_table) x where (x ->> 'team_id')::uuid = q.team_id), 100),
      coalesce((select rating from public.sport_team_ratings r where r.team_id = q.team_id and r.sport_id = sp.id), 0) desc)
  into v_teams
  from public.sport_qualifications q where q.season_id = p_season and q.kind = 'team' and q.status = 'qualificato';
  if sp.format in ('team_race', 'individual_race') then
    -- la nostra università gareggia anche solo con gli atleti qualificati individualmente
    if public.sport_can_play_nationals(p_season, (select id from public.sport_teams where is_player_school))
       and not ((select id from public.sport_teams where is_player_school) = any (coalesce(v_teams, '{}'))) then
      v_teams := coalesce(v_teams, '{}') || (select id from public.sport_teams where is_player_school);
    end if;
    perform public.sport_final_event(p_season, 'nationals', v_teams, p_start);
  else
    perform public.sport_bracket_seed(p_season, 'nationals', v_teams, p_start);
  end if;
  update public.sport_seasons set phase = 'nationals' where id = p_season and phase <> 'concluded';
  perform public.sport_log(p_season, 'tabellone nationals', jsonb_build_object('squadre', (select jsonb_agg(t.name) from public.sport_teams t where t.id = any (v_teams))));
  return coalesce(array_length(v_teams, 1), 0);
end;
$$;
revoke execute on function public.sport_nationals_generate(uuid, timestamptz) from public, anon;
grant execute on function public.sport_nationals_generate(uuid, timestamptz) to authenticated;

-- chiude il turno: le nostre partite devono essere pubblicate, le altre si decidono da sole;
-- poi crea il turno dopo (o proclama il campione)
create or replace function public.sport_bracket_advance(p_season uuid, p_phase text, p_start timestamptz default null, p_days int default 7)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  se public.sport_seasons;
  sp public.sports;
  v_round int;
  v_n int;
  m public.sport_bracket_matches;
  v_a int; v_b int;
  v_score int[];
  v_winner uuid;
  v_next timestamptz;
  v_ev public.sport_events;
  v_champion uuid;
begin
  if not public.has_permission('sport.gestire') then raise exception 'Non hai il permesso di gestire lo sport.' using errcode = '42501'; end if;
  if p_phase not in ('conference', 'nationals') then raise exception 'Fase non valida.' using errcode = 'P0001'; end if;
  select * into se from public.sport_seasons where id = p_season;
  select * into sp from public.sports where id = se.sport_id;

  -- sport a gare: il campione è il primo della finale pubblicata
  if sp.format in ('team_race', 'individual_race') then
    select e.* into v_ev from public.sport_events e
    where e.season_id = p_season and e.phase = case when p_phase = 'nationals' then 'national' else 'conference' end and e.status <> 'cancelled'
    order by e.starts_at desc limit 1;
    if v_ev.id is null then raise exception 'Prima crea la gara.' using errcode = 'P0001'; end if;
    if v_ev.status <> 'published' then raise exception 'Prima simula e pubblica la gara: %', public.sport_event_label(v_ev.id) using errcode = 'P0001'; end if;
    select team_id into v_champion from public.sport_event_teams where event_id = v_ev.id order by placement nulls last, points desc limit 1;
  else
    select max(round) into v_round from public.sport_bracket_matches where season_id = p_season and phase = p_phase;
    if v_round is null then raise exception 'Prima genera il tabellone.' using errcode = 'P0001'; end if;
    for m in select * from public.sport_bracket_matches where season_id = p_season and phase = p_phase and round = v_round and status = 'pending' order by slot loop
      if m.event_id is not null then
        select * into v_ev from public.sport_events where id = m.event_id;
        if v_ev.status <> 'published' then
          raise exception 'Prima simula e pubblica la partita: %', public.sport_event_label(m.event_id) using errcode = 'P0001';
        end if;
        select score into v_a from public.sport_event_teams where event_id = m.event_id and team_id = m.team_a;
        select score into v_b from public.sport_event_teams where event_id = m.event_id and team_id = m.team_b;
        select team_id into v_winner from public.sport_event_teams where event_id = m.event_id order by placement nulls last, score desc nulls last limit 1;
      else
        v_a := coalesce((select rating from public.sport_team_ratings where team_id = m.team_a and sport_id = sp.id), 12) + public.academic_die();
        v_b := coalesce((select rating from public.sport_team_ratings where team_id = m.team_b and sport_id = sp.id), 12) + public.academic_die();
        if v_a = v_b then v_a := v_a + case when random() < 0.5 then 1 else -1 end; end if;
        v_score := public.sport_auto_score(sp.id, v_a - v_b);
        v_winner := case when v_a > v_b then m.team_a else m.team_b end;
        v_a := case when v_a > v_b then v_score[1] else v_score[2] end;
        v_b := case when v_winner = m.team_b then v_score[1] else v_score[2] end;
      end if;
      update public.sport_bracket_matches set score_a = v_a, score_b = v_b, winner_id = v_winner, status = 'done' where id = m.id;
    end loop;

    select count(*) into v_n from public.sport_bracket_matches where season_id = p_season and phase = p_phase and round = v_round;
    if v_n > 1 then
      v_next := coalesce(p_start,
        (select max(e.starts_at) from public.sport_bracket_matches b join public.sport_events e on e.id = b.event_id
         where b.season_id = p_season and b.phase = p_phase) + make_interval(days => greatest(1, p_days)),
        now() + make_interval(days => greatest(1, p_days)));
      for i in 1..v_n / 2 loop
        perform public.sport_bracket_add(p_season, p_phase, v_round + 1, i,
          (select winner_id from public.sport_bracket_matches where season_id = p_season and phase = p_phase and round = v_round and slot = 2 * i - 1),
          (select winner_id from public.sport_bracket_matches where season_id = p_season and phase = p_phase and round = v_round and slot = 2 * i),
          v_next, v_n / 2);
      end loop;
      perform public.sport_log(p_season, 'turno chiuso', jsonb_build_object('fase', p_phase, 'turno', v_round));
      return 'turno';
    end if;
    select winner_id into v_champion from public.sport_bracket_matches where season_id = p_season and phase = p_phase and round = v_round;
  end if;

  if p_phase = 'conference' then
    update public.sport_seasons set conference_champion_id = v_champion where id = p_season;
  else
    update public.sport_seasons set national_champion_id = v_champion where id = p_season;
  end if;
  perform public.sport_notify_athletes(sp.id, '🏆 ' || sp.name || ' · ' || case when p_phase = 'conference' then 'campione della Conference: ' else 'campione nazionale: ' end
    || coalesce((select name from public.sport_teams where id = v_champion), '—'));
  return 'campione';
end;
$$;
revoke execute on function public.sport_bracket_advance(uuid, text, timestamptz, int) from public, anon;
grant execute on function public.sport_bracket_advance(uuid, text, timestamptz, int) to authenticated;

-- ricomincia un tabellone (le gare già create si annullano)
create or replace function public.sport_bracket_reset(p_season uuid, p_phase text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_permission('sport.gestire') then raise exception 'Non hai il permesso di gestire lo sport.' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'Scrivi il motivo (almeno 5 caratteri).' using errcode = 'P0001'; end if;
  update public.sport_events set status = 'cancelled'
  where season_id = p_season and phase = case when p_phase = 'nationals' then 'national' else 'conference' end and status in ('scheduled', 'postponed', 'simulated');
  delete from public.sport_bracket_matches where season_id = p_season and phase = p_phase;
  if p_phase = 'conference' then update public.sport_seasons set conference_champion_id = null where id = p_season;
  else update public.sport_seasons set national_champion_id = null where id = p_season; end if;
  perform public.sport_log(p_season, 'tabellone azzerato', jsonb_build_object('fase', p_phase, 'motivo', btrim(p_reason)));
end;
$$;
revoke execute on function public.sport_bracket_reset(uuid, text, text) from public, anon;
grant execute on function public.sport_bracket_reset(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 10. FASI
-- ---------------------------------------------------------------------
create or replace function public.sport_phase_set(p_season uuid, p_phase text, p_note text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  se public.sport_seasons;
  v_order text[] := array['preseason', 'regular', 'conference', 'nationals', 'concluded'];
  v_from int;
  v_to int;
begin
  if not public.has_permission('sport.gestire') then raise exception 'Non hai il permesso di gestire lo sport.' using errcode = '42501'; end if;
  select * into se from public.sport_seasons where id = p_season for update;
  if se.id is null then raise exception 'Stagione non trovata.' using errcode = 'P0001'; end if;
  v_from := array_position(v_order, se.phase);
  v_to := array_position(v_order, p_phase);
  if v_to is null then raise exception 'Fase non valida.' using errcode = 'P0001'; end if;
  if v_to = v_from then return; end if;
  if v_to < v_from and char_length(btrim(coalesce(p_note, ''))) < 5 then
    raise exception 'Per tornare a una fase precedente scrivi il motivo.' using errcode = 'P0001';
  end if;
  if se.status = 'closed' and p_phase <> 'concluded' then raise exception 'La stagione è chiusa.' using errcode = 'P0001'; end if;
  if p_phase = 'nationals' and se.qualified_confirmed_at is null then
    raise exception 'Prima conferma l''elenco dei qualificati ai Nationals.' using errcode = 'P0001';
  end if;
  update public.sport_seasons set phase = p_phase,
    status = case when status = 'planning' and p_phase <> 'preseason' then 'active' else status end
  where id = p_season;
  if char_length(btrim(coalesce(p_note, ''))) > 0 then
    perform public.sport_log(p_season, 'nota sulla fase', jsonb_build_object('fase', p_phase, 'nota', btrim(p_note)));
  end if;
  if p_phase = 'concluded' and se.status <> 'closed' then
    perform public.sport_season_close(p_season);
  end if;
end;
$$;
revoke execute on function public.sport_phase_set(uuid, text, text) from public, anon;
grant execute on function public.sport_phase_set(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 11. TUTTO PER LA PAGINA: fase, regole, classifica, qualificazione, tabelloni, albo d'oro
-- ---------------------------------------------------------------------
create or replace function public.sport_championship(p_season uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  se public.sport_seasons;
  sp public.sports;
  ru public.sport_season_rules;
  v_q jsonb;
  v_confirmed boolean;
  v_teams jsonb := '[]';
  x jsonb;
  v_status text;
  v_stored public.sport_qualifications;
  v_lost boolean;
begin
  select * into se from public.sport_seasons where id = p_season;
  if se.id is null then return null; end if;
  select * into sp from public.sports where id = se.sport_id;
  ru := public.sport_rules(p_season);
  v_q := public.sport_qualification_compute(p_season);
  v_confirmed := se.qualified_confirmed_at is not null;

  for x in select * from jsonb_array_elements(v_q -> 'teams') loop
    select * into v_stored from public.sport_qualifications where season_id = p_season and kind = 'team' and team_id = (x ->> 'team_id')::uuid;
    v_lost := exists (select 1 from public.sport_bracket_matches m where m.season_id = p_season and m.phase = 'nationals' and m.status = 'done'
                      and m.winner_id is not null and m.winner_id <> (x ->> 'team_id')::uuid and (x ->> 'team_id')::uuid in (m.team_a, m.team_b));
    v_status := case
      when se.national_champion_id = (x ->> 'team_id')::uuid then 'campione'
      when v_confirmed and v_stored.status = 'qualificato' and v_lost then 'eliminato'
      when v_confirmed and v_stored.status = 'qualificato' then 'qualificato'
      when v_confirmed then 'non_qualificato'
      when se.phase in ('nationals', 'concluded') then case when (x ->> 'qualifies')::boolean then 'qualificato' else 'non_qualificato' end
      else 'in_corsa' end;
    v_teams := v_teams || jsonb_build_array(x || jsonb_build_object('status', v_status,
      'provisional', not v_confirmed, 'stored_reason', v_stored.reason));
  end loop;

  return jsonb_build_object(
    'season', jsonb_build_object('id', se.id, 'label', se.label, 'status', se.status, 'phase', se.phase,
      'confirmed_at', se.qualified_confirmed_at,
      'conference_champion', (select name from public.sport_teams where id = se.conference_champion_id),
      'national_champion', (select name from public.sport_teams where id = se.national_champion_id)),
    'sport', jsonb_build_object('id', sp.id, 'name', sp.name, 'format', sp.format, 'allows_draw', sp.allows_draw, 'category', sp.category),
    'rules', to_jsonb(ru),
    'teams', v_teams,
    'individuals', (select coalesce(jsonb_agg(i || jsonb_build_object('status',
        case when v_confirmed then case when exists (select 1 from public.sport_qualifications q where q.season_id = p_season and q.kind = 'individual'
                                                    and q.character_id = (i ->> 'character_id')::uuid and q.status = 'qualificato') then 'qualificato' else 'non_qualificato' end
             when se.phase in ('nationals', 'concluded') then case when (i ->> 'qualifies')::boolean then 'qualificato' else 'non_qualificato' end
             else 'in_corsa' end)), '[]'::jsonb) from jsonb_array_elements(v_q -> 'individuals') i),
    'brackets', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'phase', m.phase, 'round', m.round, 'slot', m.slot,
        'team_a', ta.name, 'team_b', tb.name, 'team_a_id', m.team_a, 'team_b_id', m.team_b, 'score_a', m.score_a, 'score_b', m.score_b,
        'winner_id', m.winner_id, 'status', m.status, 'event_id', m.event_id, 'starts_at', e.starts_at, 'event_status', e.status)
        order by m.phase, m.round, m.slot), '[]'::jsonb)
      from public.sport_bracket_matches m
      left join public.sport_teams ta on ta.id = m.team_a left join public.sport_teams tb on tb.id = m.team_b
      left join public.sport_events e on e.id = m.event_id
      where m.season_id = p_season),
    'adjustments', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'team', t.name, 'team_id', a.team_id, 'points', a.points,
        'tiebreak', a.tiebreak, 'note', a.note, 'created_at', a.created_at) order by a.created_at desc), '[]'::jsonb)
      from public.sport_standing_adjustments a join public.sport_teams t on t.id = a.team_id where a.season_id = p_season),
    'overrides', (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'kind', q.kind, 'team', t.name, 'team_id', q.team_id,
        'character', public.first_name(c.name), 'character_id', q.character_id, 'status', q.status, 'reason', q.reason) order by q.created_at), '[]'::jsonb)
      from public.sport_qualifications q left join public.sport_teams t on t.id = q.team_id left join public.characters c on c.id = q.character_id
      where q.season_id = p_season and q.source = 'override'),
    'honors', (select coalesce(jsonb_agg(jsonb_build_object('label', s2.label, 'conference', tc.name, 'national', tn.name) order by s2.created_at desc), '[]'::jsonb)
      from public.sport_seasons s2 left join public.sport_teams tc on tc.id = s2.conference_champion_id left join public.sport_teams tn on tn.id = s2.national_champion_id
      where s2.sport_id = sp.id and (s2.conference_champion_id is not null or s2.national_champion_id is not null))
  );
end;
$$;
revoke execute on function public.sport_championship(uuid) from public, anon;
grant execute on function public.sport_championship(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 12. EQUITAZIONE: ENGLISH E WESTERN
-- ---------------------------------------------------------------------
do $$
declare
  v_admin uuid := (select p.id from public.profiles p join public.user_levels l on l.id = p.level_id
                   where l.is_admin order by p.created_at limit 1);
  v_en uuid := (select id from public.sports where name = 'Equitazione');
  v_we uuid;
  se record;
  v_season uuid;
  ev record;
  v_ev uuid;
  ro record;
  v_pos uuid;
begin
  if v_en is null then return; end if;
  -- per le funzioni che controllano il permesso dello staff
  if v_admin is not null then
    perform set_config('request.jwt.claim.sub', v_admin::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  end if;

  update public.sports set name = 'Equitazione English', category = 'Equitazione',
    description = 'La squadra di monta inglese: salto ostacoli, equitazione in piano, dressage e completo. Nei dual meet i cavalieri delle due università montano a turno e i giudici danno un punteggio a ogni prova: vince la squadra che porta a casa più confronti.'
  where id = v_en;

  insert into public.sports (name, description, season, format, allows_draw, score_profile, icon, sort_order, category, default_rules)
  select 'Equitazione Western',
    'La squadra di monta americana: reining, horsemanship, western pleasure e ranch riding. Nei dual meet i cavalieri delle due università montano a turno e i giudici danno un punteggio a ogni prova: vince la squadra che porta a casa più confronti.',
    s.season, s.format, s.allows_draw, s.score_profile, s.icon, s.sort_order + 1, 'Equitazione', s.default_rules
  from public.sports s where s.id = v_en
  on conflict (name) do nothing;
  v_we := (select id from public.sports where name = 'Equitazione Western');

  insert into public.sport_positions (sport_id, name, attribute_id, skill_id, max_slots, team_bonus, sort_order)
  select v_we, v.pos, a.id, sk.id, 3, false, v.ord
  from (values ('Reining', 'RIF', 1), ('Horsemanship', 'EMP', 2), ('Western pleasure', 'EMP', 3), ('Ranch riding', 'VIG', 4)) as v (pos, attr, ord)
  join public.attributes a on a.code = v.attr
  left join public.skills sk on lower(sk.name) = 'equitazione'
  on conflict (sport_id, name) do nothing;

  insert into public.sport_team_ratings (team_id, sport_id, rating)
  select team_id, v_we, rating from public.sport_team_ratings where sport_id = v_en
  on conflict do nothing;

  -- stagioni e gare non ancora giocate: le stesse della monta inglese
  for se in select * from public.sport_seasons where sport_id = v_en and status <> 'closed' loop
    insert into public.sport_seasons (sport_id, label, status, phase, started_at)
    values (v_we, se.label, se.status, se.phase, se.started_at)
    on conflict (sport_id, label) do nothing
    returning id into v_season;
    continue when v_season is null;
    perform set_config('app.sport_rules_init', 'on', true);
    update public.sport_season_rules r set
      min_events = o.min_events, nationals_threshold = o.nationals_threshold
    from public.sport_season_rules o where o.season_id = se.id and r.season_id = v_season;
    for ev in select * from public.sport_events where season_id = se.id and status in ('scheduled', 'postponed') and phase in ('friendly', 'regular') loop
      insert into public.sport_events (season_id, sport_id, kind, phase, starts_at, venue, mode, notes)
      values (v_season, v_we, ev.kind, ev.phase, ev.starts_at, ev.venue, ev.mode, ev.notes)
      returning id into v_ev;
      insert into public.sport_event_teams (event_id, team_id) select v_ev, team_id from public.sport_event_teams where event_id = ev.id;
    end loop;
  end loop;

  -- i cavalieri western passano alla nuova squadra
  for ro in
    select r.*, p.name as pos_name from public.sport_roster r join public.sport_positions p on p.id = r.position_id
    where r.sport_id = v_en and r.left_at is null and p.name ilike '%western%'
  loop
    v_pos := (select id from public.sport_positions where sport_id = v_we and name = case when ro.pos_name ilike 'reining%' then 'Reining' else 'Horsemanship' end);
    update public.sport_roster set left_at = now(), squad_status = case when squad_status = 'captain' then 'starter' else squad_status end where id = ro.id;
    perform public.sport_enter(ro.character_id, v_we, v_pos);
    update public.sport_roster set scholarship = ro.scholarship, training_intensity = ro.training_intensity, training_bonus = ro.training_bonus
    where character_id = ro.character_id and sport_id = v_we and left_at is null;
    perform public.send_system_message((select owner_id from public.characters where id = ro.character_id),
      '🏇 L''Equitazione si è divisa in due squadre: ' || public.first_name((select name from public.characters where id = ro.character_id))
      || ' ora fa parte di Equitazione Western. Trovi tutto nella pagina Sport.');
  end loop;
  delete from public.sport_positions p
  where p.sport_id = v_en and p.name ilike '%western%'
    and not exists (select 1 from public.sport_roster r where r.position_id = p.id and r.left_at is null);
end $$;

-- =====================================================================
-- CALENDARIO DEL GIOCO E SISTEMA SPORTIVO UNIVERSITARIO
-- Dal documento "Sistema Sportivo Universitario". Decisioni con l'utente:
-- - calendario generale del gioco (icona Calendario della barra laterale):
--   eventi dello staff + eventi sportivi;
-- - ogni sport ha un gruppo del GDR di tipo "sport": si entra e si esce
--   liberamente, non conta nel massimo dei gruppi, nessuno stipendio;
-- - università rivali inventate (modificabili), rating 8–16;
-- - la Probation accademica rende ineleggibili (impostazione);
-- - cambio di sport o ruolo a stagione in corso: lo approva il Master.
-- Tiro: caratteristica + abilità del ruolo + d10 (10 → +d10, 1 → −d10,
-- una volta) + modificatori contro CD 12; tutto nel database.
-- Tutti i numeri in game_settings con chiave sport_*.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. IMPOSTAZIONI E PERMESSI
-- ---------------------------------------------------------------------
insert into public.game_settings (key, value, kind, label, description, sort_order) values
  ('sport_cd', '12', 'number', 'Sport · CD della prestazione', 'Il tiro di ogni atleta (caratteristica + abilità + d10 + modificatori) contro questa CD.', 300),
  ('sport_contributo_max', '6', 'number', 'Sport · Contributo massimo dei PG', 'Somma massima dei contributi dei PG alla forza della squadra (in più o in meno).', 301),
  ('sport_riserve_percento', '50', 'number', 'Sport · Riserve in gara (%)', 'Probabilità che una riserva gareggi in un evento (o se un titolare del suo ruolo manca).', 302),
  ('sport_infortunio_soglia', '8', 'number', 'Sport · Soglia d''infortunio', 'Con un 1 naturale ci si infortuna se il d10 sottratto è almeno questo.', 303),
  ('sport_infortunio_durate', '[5, 8]', 'numbers', 'Sport · Durata degli infortuni', 'd10 fino al primo numero: 1 evento; fino al secondo: 3 eventi; oltre: fine stagione.', 304),
  ('sport_intensita', '[-1, 0, 1]', 'numbers', 'Sport · Intensità di allenamento', 'Leggera, normale, intensa: si somma ai tiri sportivi.', 305),
  ('sport_intenso_esami', '1', 'number', 'Sport · Malus agli esami con allenamento intenso', 'Si toglie a tutti i tiri d''esame del semestre.', 306),
  ('sport_probation_ineleggibile', '1', 'number', 'Sport · Probation rende ineleggibili', '1 = sì, 0 = no (solo Suspension e Dismissal).', 307),
  ('sport_crediti_anno', '24', 'number', 'Sport · Crediti nell''ultimo anno', 'Progresso verso la laurea: crediti ottenuti negli ultimi due semestri pubblicati.', 308),
  ('sport_gpa_minimo', '2.0', 'decimal', 'Sport · GPA minimo per gareggiare', 'GPA cumulativo.', 309),
  ('sport_stagioni_max', '4', 'number', 'Sport · Stagioni di gara', 'Stagioni di eleggibilità per sport (il Redshirt non ne consuma).', 310),
  ('sport_punti_piazzamento', '[10, 8, 6, 5, 4, 3, 2, 1]', 'numbers', 'Sport · Punti per piazzamento', 'Punti di squadra dal 1° all''8° posto nelle gare individuali.', 311),
  ('sport_media_all_conference', '8', 'number', 'Sport · Media voto per l''All-Conference', 'Media dei voti prestazione della stagione (almeno 2 eventi).', 312),
  ('sport_gpa_academic', '3.5', 'decimal', 'Sport · GPA per l''Academic All-American', 'Titolari o capitani con questo GPA cumulativo.', 313),
  ('sport_master_max', '3', 'number', 'Sport · Bonus/malus del Master per evento', 'Da −questo a +questo, per PG ed evento.', 314),
  ('sport_allenamento_max', '2', 'number', 'Sport · Bonus degli allenamenti in chat', 'Bonus di stagione dato dal Master (da 0 a questo).', 315),
  ('sport_offset_individuale', '3', 'number', 'Sport · Avversario individuale', 'Negli incontri e nelle gare individuali l''avversario PNG tira rating + d10 − questo valore.', 316),
  ('sport_promemoria_ore', '24', 'number', 'Sport · Promemoria (ore prima)', 'Avviso agli atleti prima di un evento.', 317)
on conflict (key) do nothing;

update public.user_levels
set permissions = permissions || array['sport.gestire', 'calendario.gestire']
where name = 'Master' and not ('sport.gestire' = any (permissions));

-- ---------------------------------------------------------------------
-- 2. CALENDARIO GENERALE
-- ---------------------------------------------------------------------
create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 2 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  category text not null default 'evento' check (category in ('evento', 'festa', 'lezione', 'staff', 'sport', 'universita')),
  starts_at timestamptz not null,
  ends_at timestamptz check (ends_at is null or ends_at >= starts_at),
  location text not null default '' check (char_length(location) <= 120),
  room_id uuid references public.rooms (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index calendar_events_starts_idx on public.calendar_events (starts_at);
create index calendar_events_room_idx on public.calendar_events (room_id);
create index calendar_events_created_by_idx on public.calendar_events (created_by);
alter table public.calendar_events enable row level security;
revoke all on public.calendar_events from anon;
create policy "Calendario: lo leggono tutti" on public.calendar_events for select to authenticated using (true);
create policy "Calendario: lo scrive lo staff" on public.calendar_events for insert to authenticated with check ((select public.has_permission('calendario.gestire')));
create policy "Calendario: lo modifica lo staff" on public.calendar_events for update to authenticated
  using ((select public.has_permission('calendario.gestire'))) with check ((select public.has_permission('calendario.gestire')));
create policy "Calendario: lo cancella lo staff" on public.calendar_events for delete to authenticated using ((select public.has_permission('calendario.gestire')));
create trigger calendar_events_log after insert or update or delete on public.calendar_events
  for each row execute function public.log_admin_change();

-- ---------------------------------------------------------------------
-- 3. GRUPPI SPORTIVI (tipo speciale: liberi, fuori dal massimo, senza stipendio)
-- ---------------------------------------------------------------------
alter table public.game_groups add column if not exists kind text not null default 'normale' check (kind in ('normale', 'sport'));

create or replace function public.character_groups_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max int := greatest(1, coalesce(public.setting_int('max_gruppi'), 3));
begin
  if not exists (select 1 from public.group_roles where id = new.role_id and group_id = new.group_id) then
    raise exception 'Il ruolo non appartiene a questo gruppo.' using errcode = 'P0001';
  end if;
  perform 1 from public.characters where id = new.character_id for update;
  if not exists (select 1 from public.characters where id = new.character_id and status = 'approvata') then
    raise exception 'I gruppi si danno solo ai personaggi approvati.' using errcode = 'P0001';
  end if;
  -- i gruppi sportivi non contano nel massimo
  if (select kind from public.game_groups where id = new.group_id) = 'normale' and (
    select count(*) from public.character_groups cg join public.game_groups g on g.id = cg.group_id
    where cg.character_id = new.character_id and cg.group_id <> new.group_id and g.kind = 'normale'
  ) >= v_max then
    raise exception 'Un personaggio può far parte al massimo di % gruppi.', v_max using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create or replace function public.character_salary_parts(p_character uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('label', label, 'amount', amount) order by ord, label), '[]'::jsonb)
  from (
    select 1 as ord, 'Patrimonio: ' || o.name as label, o.salary as amount
    from public.character_options co join public.creation_options o on o.id = co.option_id
    where co.character_id = p_character and o.kind = 'tenore' and o.salary > 0
    union all
    select 2, 'Lavoro: ' || r.name || ' (' || j.name || ')', r.salary
    from public.character_jobs cj join public.job_roles r on r.id = cj.role_id join public.jobs j on j.id = cj.job_id
    where cj.character_id = p_character and j.active and r.salary > 0
    union all
    select 3, 'Gruppo: ' || r.name || ' (' || g.name || ')', r.salary
    from public.character_groups cg join public.group_roles r on r.id = cg.role_id join public.game_groups g on g.id = cg.group_id
    where cg.character_id = p_character and g.active and g.kind = 'normale' and r.salary > 0
  ) parts
$$;

-- ---------------------------------------------------------------------
-- 4. CATALOGO: SPORT, RUOLI, UNIVERSITÀ, RATING
-- ---------------------------------------------------------------------
-- abilità nuova per la scherma (le armi da taglio restano del combattimento)
insert into public.skills (attribute_id, name, description, category, sort_order)
select a.id, 'Scherma', 'Fioretto, spada e sciabola sportivi', 'Sport', 40
from public.attributes a
where a.code = 'RIF' and not exists (select 1 from public.skills where lower(name) = 'scherma');
insert into public.skill_categories (skill_id, category)
select id, 'riflessi' from public.skills where lower(name) = 'scherma'
on conflict do nothing;

create table public.sports (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(btrim(name)) between 2 and 60),
  description text not null default '' check (char_length(description) <= 1000),
  season text not null check (season in ('fall', 'winter', 'spring', 'year_round')),
  format text not null check (format in ('team_match', 'individual_match', 'team_race', 'individual_race')),
  allows_draw boolean not null default false,
  -- come diventa punteggio il risultato: {kind: points|sets|bout|time, ...}
  score_profile jsonb not null default '{}' check (jsonb_typeof(score_profile) = 'object'),
  icon text not null default '🏅' check (char_length(icon) <= 8),
  color text not null default '' check (char_length(color) <= 20),
  group_id uuid references public.game_groups (id) on delete set null,
  status text not null default 'active' check (status in ('active', 'archived')),
  sort_order int not null default 0,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index sports_group_idx on public.sports (group_id);
create index sports_created_by_idx on public.sports (created_by);

create table public.sport_positions (
  id uuid primary key default gen_random_uuid(),
  sport_id uuid not null references public.sports (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 40),
  attribute_id uuid not null references public.attributes (id) on delete restrict,
  skill_id uuid references public.skills (id) on delete set null,
  max_slots int check (max_slots is null or max_slots > 0),
  -- es. il timoniere: il suo contributo vale per tutto l'equipaggio (conta doppio)
  team_bonus boolean not null default false,
  sort_order int not null default 0,
  unique (sport_id, name)
);
create index sport_positions_attribute_idx on public.sport_positions (attribute_id);
create index sport_positions_skill_idx on public.sport_positions (skill_id);

create table public.sport_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(btrim(name)) between 2 and 60),
  nickname text not null default '' check (char_length(nickname) <= 40),
  is_player_school boolean not null default false,
  conference boolean not null default true,
  is_national boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index sport_teams_one_school on public.sport_teams ((true)) where is_player_school;

create table public.sport_team_ratings (
  team_id uuid not null references public.sport_teams (id) on delete cascade,
  sport_id uuid not null references public.sports (id) on delete cascade,
  rating int not null check (rating between 1 and 30),
  primary key (team_id, sport_id)
);
create index sport_team_ratings_sport_idx on public.sport_team_ratings (sport_id);

-- ---------------------------------------------------------------------
-- 5. STAGIONI, ROSTER, CARRIERE
-- ---------------------------------------------------------------------
create table public.sport_seasons (
  id uuid primary key default gen_random_uuid(),
  sport_id uuid not null references public.sports (id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 2 and 40),
  status text not null default 'planning' check (status in ('planning', 'active', 'closed')),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  closed_at timestamptz,
  unique (sport_id, label)
);
create unique index sport_seasons_one_active on public.sport_seasons (sport_id) where status = 'active';

create table public.sport_roster (
  id bigint generated always as identity primary key,
  sport_id uuid not null references public.sports (id) on delete cascade,
  character_id uuid not null references public.characters (id) on delete cascade,
  position_id uuid references public.sport_positions (id) on delete set null,
  squad_status text not null default 'starter' check (squad_status in ('starter', 'reserve', 'captain', 'redshirt')),
  scholarship boolean not null default false,
  training_intensity text not null default 'normal' check (training_intensity in ('light', 'normal', 'intense')),
  -- allenamenti giocati in chat (dal Master, per la stagione)
  training_bonus int not null default 0 check (training_bonus between 0 and 5),
  eligibility_override text not null default 'auto' check (eligibility_override in ('auto', 'eligible', 'ineligible')),
  injury_events_left int not null default 0 check (injury_events_left >= 0),
  injury_note text not null default '' check (char_length(injury_note) <= 200),
  is_returning boolean not null default false,
  suspended_events int not null default 0 check (suspended_events >= 0),
  -- cambio a stagione in corso: lo approva il Master
  pending_sport_id uuid references public.sports (id) on delete set null,
  pending_position_id uuid references public.sport_positions (id) on delete set null,
  joined_at timestamptz not null default now(),
  left_at timestamptz
);
create unique index sport_roster_active on public.sport_roster (sport_id, character_id) where left_at is null;
create unique index sport_roster_one_captain on public.sport_roster (sport_id) where squad_status = 'captain' and left_at is null;
create index sport_roster_character_idx on public.sport_roster (character_id);
create index sport_roster_position_idx on public.sport_roster (position_id);
create index sport_roster_pending_sport_idx on public.sport_roster (pending_sport_id);
create index sport_roster_pending_position_idx on public.sport_roster (pending_position_id);

create table public.sport_athletes (
  character_id uuid not null references public.characters (id) on delete cascade,
  sport_id uuid not null references public.sports (id) on delete cascade,
  seasons_used int not null default 0,
  redshirt_years int not null default 0,
  primary key (character_id, sport_id)
);
create index sport_athletes_sport_idx on public.sport_athletes (sport_id);

-- ---------------------------------------------------------------------
-- 6. EVENTI, RISULTATI, TIRI, PREMI
-- ---------------------------------------------------------------------
create table public.sport_events (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.sport_seasons (id) on delete cascade,
  sport_id uuid not null references public.sports (id) on delete cascade,
  kind text not null default 'partita' check (kind in ('partita', 'incontro', 'gara', 'regata', 'meeting', 'torneo')),
  phase text not null default 'regular' check (phase in ('friendly', 'regular', 'conference', 'national')),
  starts_at timestamptz not null,
  venue text not null default 'home' check (venue in ('home', 'away', 'neutral')),
  room_id uuid references public.rooms (id) on delete set null,
  mode text not null default 'simulated' check (mode in ('simulated', 'played_in_chat')),
  status text not null default 'scheduled' check (status in ('scheduled', 'postponed', 'cancelled', 'simulated', 'published')),
  notes text not null default '' check (char_length(notes) <= 500),
  recap_text text not null default '',
  -- bonus/malus del Master per PG: { "<character_id>": { "value": 1, "note": "…" } }
  master_mods jsonb not null default '{}' check (jsonb_typeof(master_mods) = 'object'),
  -- chi non ha gareggiato perché infortunato o squalificato (per la pubblicazione)
  sim_meta jsonb not null default '{}',
  reminded_at timestamptz,
  simulated_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now()
);
create index sport_events_season_idx on public.sport_events (season_id);
create index sport_events_sport_idx on public.sport_events (sport_id, starts_at);
create index sport_events_starts_idx on public.sport_events (starts_at);
create index sport_events_room_idx on public.sport_events (room_id);

create table public.sport_event_teams (
  event_id uuid not null references public.sport_events (id) on delete cascade,
  team_id uuid not null references public.sport_teams (id) on delete cascade,
  score int,
  placement int,
  time_or_measure text not null default '',
  points int not null default 0,
  primary key (event_id, team_id)
);
create index sport_event_teams_team_idx on public.sport_event_teams (team_id);

create table public.sport_event_rolls (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.sport_events (id) on delete cascade,
  character_id uuid not null references public.characters (id) on delete cascade,
  position_id uuid references public.sport_positions (id) on delete set null,
  opponent text not null default '',
  d10 int not null,
  crit_type text not null check (crit_type in ('none', 'success', 'failure')),
  extra_d10 int,
  modifiers jsonb not null default '{}',
  total int not null,
  cd int not null,
  margin int not null,
  grade int not null,
  contribution int not null,
  highlight boolean not null default false,
  result_detail jsonb not null default '{}',
  injury jsonb,
  created_at timestamptz not null default now()
);
create index sport_event_rolls_event_idx on public.sport_event_rolls (event_id);
create index sport_event_rolls_character_idx on public.sport_event_rolls (character_id);
create index sport_event_rolls_position_idx on public.sport_event_rolls (position_id);

-- risultati tra le altre università della Conference (per una classifica credibile)
create table public.sport_shadow_results (
  id bigint generated always as identity primary key,
  season_id uuid not null references public.sport_seasons (id) on delete cascade,
  event_id uuid references public.sport_events (id) on delete cascade,
  team_a uuid not null references public.sport_teams (id) on delete cascade,
  team_b uuid not null references public.sport_teams (id) on delete cascade,
  score_a int not null,
  score_b int not null
);
create index sport_shadow_season_idx on public.sport_shadow_results (season_id);
create index sport_shadow_event_idx on public.sport_shadow_results (event_id);
create index sport_shadow_a_idx on public.sport_shadow_results (team_a);
create index sport_shadow_b_idx on public.sport_shadow_results (team_b);

create table public.sport_awards (
  id bigint generated always as identity primary key,
  sport_id uuid references public.sports (id) on delete cascade,
  season_id uuid references public.sport_seasons (id) on delete cascade,
  character_id uuid not null references public.characters (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  description text not null default '' check (char_length(description) <= 300),
  kind text not null default 'custom' check (kind in ('auto', 'custom')),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index sport_awards_character_idx on public.sport_awards (character_id);
create index sport_awards_sport_idx on public.sport_awards (sport_id);
create index sport_awards_season_idx on public.sport_awards (season_id);
create index sport_awards_created_by_idx on public.sport_awards (created_by);

-- ---------------------------------------------------------------------
-- 7. SICUREZZA: tutti leggono; scrive lo staff (sport.gestire);
--    i giocatori entrano, escono e scelgono l'intensità con le funzioni
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['sports', 'sport_positions', 'sport_teams', 'sport_team_ratings', 'sport_seasons', 'sport_roster',
    'sport_athletes', 'sport_events', 'sport_event_teams', 'sport_event_rolls', 'sport_shadow_results', 'sport_awards'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('create policy "Sport: lo leggono tutti" on public.%I for select to authenticated using (true)', t);
  end loop;
  -- lo staff scrive direttamente (i tiri e i risultati solo dalle funzioni)
  foreach t in array array['sports', 'sport_positions', 'sport_teams', 'sport_team_ratings', 'sport_seasons', 'sport_roster',
    'sport_athletes', 'sport_events', 'sport_event_teams', 'sport_awards'] loop
    execute format('create policy "Sport: lo staff aggiunge" on public.%I for insert to authenticated with check ((select public.has_permission(''sport.gestire'')))', t);
    execute format('create policy "Sport: lo staff modifica" on public.%I for update to authenticated using ((select public.has_permission(''sport.gestire''))) with check ((select public.has_permission(''sport.gestire'')))', t);
    execute format('create policy "Sport: lo staff toglie" on public.%I for delete to authenticated using ((select public.has_permission(''sport.gestire'')))', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.log_admin_change()', t || '_log', t);
  end loop;
  foreach t in array array['sport_event_rolls', 'sport_shadow_results'] loop
    execute format('create policy "Sport: solo dalle funzioni" on public.%I for insert to authenticated with check (false)', t);
    execute format('create policy "Sport: non si modificano" on public.%I for update to authenticated using (false)', t);
    execute format('create policy "Sport: non si cancellano" on public.%I for delete to authenticated using (false)', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 8. UNO SPORT = UN GRUPPO DEL GDR
-- ---------------------------------------------------------------------
create or replace function public.sports_group_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid;
begin
  if tg_op = 'INSERT' then
    insert into public.game_groups (name, description, kind, active)
    values (left(new.name, 60), 'Squadra di ' || new.name || ' dell''Athletic Department.', 'sport', new.status = 'active')
    returning id into v_group;
    insert into public.group_roles (group_id, name, description, salary) values (v_group, 'Atleta', 'Student-athlete della squadra.', 0);
    new.group_id := v_group;
  elsif new.group_id is not null then
    update public.game_groups set name = left(new.name, 60), active = new.status = 'active' where id = new.group_id;
  end if;
  return new;
end;
$$;
revoke execute on function public.sports_group_sync() from public, anon, authenticated;
create trigger sports_group_sync before insert or update of name, status on public.sports
  for each row execute function public.sports_group_sync();

-- Eliminare uno sport: solo se non ha mai avuto eventi giocati; il gruppo se ne va con lui
create or replace function public.sports_before_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.sport_events where sport_id = old.id and status in ('simulated', 'published')) then
    raise exception 'Questo sport ha già eventi giocati: archivialo invece di eliminarlo.' using errcode = 'P0001';
  end if;
  return old;
end;
$$;
revoke execute on function public.sports_before_delete() from public, anon, authenticated;
create trigger sports_before_delete before delete on public.sports
  for each row execute function public.sports_before_delete();

create or replace function public.sports_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.game_groups where id = old.group_id and kind = 'sport';
  return null;
end;
$$;
revoke execute on function public.sports_after_delete() from public, anon, authenticated;
create trigger sports_after_delete after delete on public.sports
  for each row execute function public.sports_after_delete();

-- Membro del gruppo dello sport (entra o esce col roster)
create or replace function public.sport_group_member(p_character uuid, p_sport uuid, p_in boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid := (select group_id from public.sports where id = p_sport);
begin
  if v_group is null then return; end if;
  if p_in then
    insert into public.character_groups (character_id, group_id, role_id)
    select p_character, v_group, r.id from public.group_roles r where r.group_id = v_group order by r.sort_order, r.name limit 1
    on conflict do nothing;
  else
    delete from public.character_groups where character_id = p_character and group_id = v_group;
  end if;
end;
$$;
revoke execute on function public.sport_group_member(uuid, uuid, boolean) from public, anon, authenticated;

-- Lo staff toglie o rimette un atleta dal roster: anche il gruppo segue
create or replace function public.sport_roster_group_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform public.sport_group_member(old.character_id, old.sport_id, false);
    return null;
  end if;
  if new.left_at is null and (tg_op = 'INSERT' or old.left_at is not null) then
    perform public.sport_group_member(new.character_id, new.sport_id, true);
  elsif tg_op = 'UPDATE' and new.left_at is not null and old.left_at is null then
    perform public.sport_group_member(new.character_id, new.sport_id, false);
  end if;
  return null;
end;
$$;
revoke execute on function public.sport_roster_group_sync() from public, anon, authenticated;
create trigger sport_roster_group_sync after insert or update of left_at or delete on public.sport_roster
  for each row execute function public.sport_roster_group_sync();

-- ---------------------------------------------------------------------
-- 9. MOTORE DELLE VOCI: fase, sede, allenamento intenso negli esami
-- ---------------------------------------------------------------------
create or replace function public.trait_mods(p_character uuid, p_ctx jsonb, p_situational uuid[] default '{}')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cap int := coalesce(public.setting_int('tetto_modificatori'), 4);
  v_system text := coalesce(p_ctx ->> 'system', 'general');
  v_skill uuid := nullif(p_ctx ->> 'skill_id', '')::uuid;
  v_cats text[];
  r record;
  e jsonb;
  w jsonb;
  v_val int;
  v_sum int := 0;
  v_items jsonb := '[]'::jsonb;
  v_smin int := 10;
  v_fmax int := 1;
  v_override boolean := false;
  v_cd int := 0;
  v_esys text;
  v_ok boolean;
begin
  -- categorie del tiro: quella indicata, oppure quelle dell'abilità
  if p_ctx ? 'category' and coalesce(p_ctx ->> 'category', '') <> '' then
    v_cats := array[p_ctx ->> 'category'];
  else
    select coalesce(array_agg(category), '{}') into v_cats from public.skill_categories where skill_id = v_skill;
  end if;

  for r in
    select o.id, o.name, o.roll_modifier, o.roll_skill_id, o.effects, co.level, co.choice_value
    from public.character_options co join public.creation_options o on o.id = co.option_id
    where co.character_id = p_character
  loop
    -- voci vecchie: modificatore all'abilità indicata (o a tutti i tiri)
    if r.roll_modifier is not null and (r.roll_skill_id is null or r.roll_skill_id = v_skill) then
      v_sum := v_sum + r.roll_modifier;
      v_items := v_items || jsonb_build_object('name', r.name, 'value', r.roll_modifier);
    end if;
    for e in select * from jsonb_array_elements(r.effects) loop
      w := coalesce(e -> 'when', '{}'::jsonb);
      v_esys := coalesce(w ->> 'system', e ->> 'system', 'general');
      -- sistema: general vale anche in combattimento; any vale ovunque
      v_ok := v_esys = 'any' or v_esys = v_system or (v_esys = 'general' and v_system = 'combat');
      if v_ok and w ? 'category' then
        v_ok := v_cats && array(select jsonb_array_elements_text(w -> 'category'));
      end if;
      if v_ok and w ? 'exam_type' then
        v_ok := (p_ctx ->> 'exam_type') = any (array(select jsonb_array_elements_text(w -> 'exam_type')));
      end if;
      if v_ok and w ? 'department' then
        v_ok := lower(coalesce(p_ctx ->> 'department', '')) = lower(case when w ->> 'department' = '$choice' then r.choice_value else w ->> 'department' end);
      end if;
      if v_ok and w ? 'area' then
        v_ok := coalesce(p_ctx ->> 'area', '') = (w ->> 'area');
      end if;
      if v_ok and w ? 'retake' then
        v_ok := coalesce((p_ctx ->> 'retake')::boolean, false);
      end if;
      if v_ok and w ? 'min_credits' then
        v_ok := coalesce((p_ctx ->> 'credits')::int, 0) > (w ->> 'min_credits')::int;
      end if;
      if v_ok and w ? 'phase' then
        v_ok := coalesce(p_ctx ->> 'phase', '') = any (array(select jsonb_array_elements_text(w -> 'phase')));
      end if;
      if v_ok and w ? 'venue' then
        v_ok := coalesce(p_ctx ->> 'venue', '') = (w ->> 'venue');
      end if;
      -- situazionali: solo se confermati
      if v_ok and coalesce((e ->> 'situational')::boolean, false) then
        v_ok := r.id = any (p_situational);
      end if;
      continue when not v_ok;

      if e ->> 'type' = 'roll_modifier' then
        v_val := case e ->> 'value' when '$level' then r.level when '-$level' then -r.level else (e ->> 'value')::int end;
        v_sum := v_sum + v_val;
        v_items := v_items || jsonb_build_object('name', r.name, 'value', v_val);
      elsif e ->> 'type' = 'cd_modifier' then
        v_cd := v_cd + (e ->> 'value')::int;
      elsif e ->> 'type' = 'crit_range' then
        if coalesce((e ->> 'override')::boolean, false) then
          v_override := true;
          v_smin := coalesce((e ->> 'success_min')::int, 10);
          v_fmax := coalesce((e ->> 'failure_max')::int, 1);
        elsif not v_override then
          v_smin := least(v_smin, coalesce((e ->> 'success_min')::int, 10));
          v_fmax := greatest(v_fmax, coalesce((e ->> 'failure_max')::int, 1));
        end if;
      end if;
    end loop;
  end loop;

  -- allenamento sportivo intenso (stagione in corso): malus agli esami
  if v_system = 'academic' and exists (
    select 1 from public.sport_roster ro join public.sport_seasons se on se.sport_id = ro.sport_id and se.status = 'active'
    where ro.character_id = p_character and ro.left_at is null and ro.training_intensity = 'intense'
  ) then
    v_val := -coalesce(public.setting_int('sport_intenso_esami'), 1);
    v_sum := v_sum + v_val;
    v_items := v_items || jsonb_build_object('name', 'Allenamento intenso', 'value', v_val);
  end if;

  return jsonb_build_object('total', greatest(-v_cap, least(v_cap, v_sum)), 'raw', v_sum, 'items', v_items,
    'success_min', v_smin, 'failure_max', v_fmax, 'cd', v_cd);
end;
$$;

-- voci sportive ora selezionabili
update public.creation_options set available = true where scope = 'sportiva';

-- ---------------------------------------------------------------------
-- 10. ELEGGIBILITÀ (legge dal sistema accademico)
-- ---------------------------------------------------------------------
create or replace function public.sport_eligibility(p_character uuid, p_sport uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  ro public.sport_roster;
  r public.student_records;
  a public.sport_athletes;
  v_term uuid;
  v_credits int;
  v_recent int;
  v_n int;
  v_reasons text[] := '{}';
begin
  select * into ro from public.sport_roster where character_id = p_character and sport_id = p_sport and left_at is null;
  if ro.id is null then return jsonb_build_object('eligible', false, 'reasons', jsonb_build_array('Non è nel roster.')); end if;
  if ro.eligibility_override = 'eligible' then return jsonb_build_object('eligible', true, 'reasons', '[]'::jsonb, 'override', true); end if;
  if ro.eligibility_override = 'ineligible' then
    return jsonb_build_object('eligible', false, 'reasons', jsonb_build_array('Deciso dal Master.'), 'override', true);
  end if;

  select * into r from public.student_records where character_id = p_character;
  -- semestre in corso: full-time
  select id into v_term from public.academic_terms where status in ('registration_open', 'in_progress', 'simulated') limit 1;
  if v_term is not null then
    select coalesce(sum(c.credits), 0) into v_credits from public.enrollments e join public.courses c on c.id = e.course_id
    where e.character_id = p_character and e.term_id = v_term and e.status <> 'withdrawn';
    if v_credits < coalesce(public.uni_n('uni_crediti_min'), 12) then
      v_reasons := v_reasons || ('Non è iscritto full-time (' || v_credits || ' crediti su ' || coalesce(public.uni_n('uni_crediti_min'), 12)::int || ').');
    end if;
  end if;
  if r.character_id is not null then
    if r.cumulative_gpa is not null and r.cumulative_gpa < coalesce(public.uni_n('sport_gpa_minimo'), 2.0) then
      v_reasons := v_reasons || ('GPA cumulativo ' || to_char(r.cumulative_gpa, 'FM0.00') || ' sotto ' || to_char(coalesce(public.uni_n('sport_gpa_minimo'), 2.0), 'FM0.0') || '.');
    end if;
    if r.academic_status in ('suspended', 'dismissed') then
      v_reasons := v_reasons || 'In sospensione o espulso dall''università.'::text;
    elsif r.academic_status = 'probation' and coalesce(public.setting_int('sport_probation_ineleggibile'), 1) = 1 then
      v_reasons := v_reasons || 'In Academic Probation.'::text;
    elsif r.academic_status = 'graduated' then
      v_reasons := v_reasons || 'Già laureato.'::text;
    end if;
    -- progresso verso la laurea: crediti negli ultimi due semestri pubblicati
    select count(*), coalesce(sum(credits_earned), 0) into v_n, v_recent
    from (select tr.credits_earned from public.term_reports tr join public.academic_terms t on t.id = tr.term_id
          where tr.character_id = p_character and t.status = 'published' order by t.created_at desc limit 2) x;
    if v_n = 2 and v_recent < coalesce(public.setting_int('sport_crediti_anno'), 24) then
      v_reasons := v_reasons || ('Solo ' || v_recent || ' crediti nell''ultimo anno (ne servono ' || coalesce(public.setting_int('sport_crediti_anno'), 24) || ').');
    end if;
  end if;
  select * into a from public.sport_athletes where character_id = p_character and sport_id = p_sport;
  if coalesce(a.seasons_used, 0) >= coalesce(public.setting_int('sport_stagioni_max'), 4) then
    v_reasons := v_reasons || 'Ha esaurito le stagioni di eleggibilità.'::text;
  end if;
  return jsonb_build_object('eligible', cardinality(v_reasons) = 0, 'reasons', to_jsonb(v_reasons));
end;
$$;
revoke execute on function public.sport_eligibility(uuid, uuid) from public, anon;
grant execute on function public.sport_eligibility(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 11. ENTRARE, CAMBIARE, USCIRE (giocatore)
-- ---------------------------------------------------------------------
create or replace function public.sport_notify_staff(p_text text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  u record;
begin
  for u in
    select p.id from public.profiles p join public.user_levels l on l.id = p.level_id
    where (l.is_admin or 'sport.gestire' = any (l.permissions)) and p.id is distinct from auth.uid()
  loop
    perform public.send_system_message(u.id, p_text);
  end loop;
end;
$$;
revoke execute on function public.sport_notify_staff(text) from public, anon, authenticated;

-- Inserimento nel roster (senza controlli sul giocatore: li fa chi la chiama)
create or replace function public.sport_enter(p_character uuid, p_sport uuid, p_position uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.sport_positions;
  v_status text := 'starter';
  v_schol boolean := false;
  v_roster jsonb := public.trait_effect(p_character, 'roster');
  v_taken int;
begin
  select * into p from public.sport_positions where id = p_position and sport_id = p_sport;
  if p.id is null then raise exception 'Ruolo non valido per questo sport.' using errcode = 'P0001'; end if;
  select count(*) into v_taken from public.sport_roster
  where position_id = p_position and left_at is null and squad_status in ('starter', 'captain');
  -- Recruited: titolare con borsa; Walk-on: riserva; ruolo pieno: riserva
  if v_roster is not null then
    v_status := case when v_roster ->> 'status' = 'reserve' then 'reserve' else 'starter' end;
    v_schol := coalesce((v_roster ->> 'scholarship')::boolean, false)
      and not exists (select 1 from public.sport_roster where character_id = p_character and scholarship);
  end if;
  if v_status = 'starter' and p.max_slots is not null and v_taken >= p.max_slots then
    v_status := 'reserve';
  end if;
  insert into public.sport_roster (sport_id, character_id, position_id, squad_status, scholarship)
  values (p_sport, p_character, p_position, v_status, v_schol);
  insert into public.sport_athletes (character_id, sport_id) values (p_character, p_sport) on conflict do nothing;
end;
$$;
revoke execute on function public.sport_enter(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.sport_has_active_season(p_sport uuid)
returns boolean
language sql
stable
set search_path = ''
as $$ select exists (select 1 from public.sport_seasons where sport_id = p_sport and status = 'active') $$;
revoke execute on function public.sport_has_active_season(uuid) from public, anon, authenticated;

-- Il giocatore sceglie sport e ruolo (anche per cambiare); a stagione in corso il cambio lo approva il Master
create or replace function public.sport_join(p_character uuid, p_sport uuid, p_position uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.sports;
  cur public.sport_roster;
  v_count int;
  v_max int;
  v_name text;
begin
  if not public.owns_character(p_character) then raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501'; end if;
  select * into s from public.sports where id = p_sport and status = 'active';
  if s.id is null then raise exception 'Sport non disponibile.' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.sport_positions where id = p_position and sport_id = p_sport) then
    raise exception 'Ruolo non valido per questo sport.' using errcode = 'P0001';
  end if;
  perform 1 from public.characters where id = p_character for update;
  select public.first_name(name) into v_name from public.characters where id = p_character;

  -- stesso sport: cambio di ruolo
  select * into cur from public.sport_roster where character_id = p_character and sport_id = p_sport and left_at is null;
  if cur.id is not null then
    if cur.position_id = p_position then raise exception 'Hai già questo ruolo.' using errcode = 'P0001'; end if;
    if public.sport_has_active_season(p_sport) then
      update public.sport_roster set pending_sport_id = null, pending_position_id = p_position where id = cur.id;
      perform public.sport_notify_staff('🏅 ' || v_name || ' chiede di cambiare ruolo in ' || s.name || ' a stagione in corso. Lo trovi in Gestione → Sport → Roster.');
      return 'in_attesa';
    end if;
    update public.sport_roster set position_id = p_position,
      squad_status = case when squad_status = 'captain' then 'starter' else squad_status end where id = cur.id;
    return 'fatto';
  end if;

  v_count := (select count(*) from public.sport_roster where character_id = p_character and left_at is null);
  v_max := case when public.trait_effect(p_character, 'extra_sport') is not null then 2 else 1 end;
  if v_count >= v_max then
    if v_max = 2 then raise exception 'Hai già due sport: prima lasciane uno.' using errcode = 'P0001'; end if;
    -- cambio di sport
    select * into cur from public.sport_roster where character_id = p_character and left_at is null limit 1;
    if public.sport_has_active_season(cur.sport_id) then
      update public.sport_roster set pending_sport_id = p_sport, pending_position_id = p_position where id = cur.id;
      perform public.sport_notify_staff('🏅 ' || v_name || ' chiede di passare a ' || s.name || ' a stagione in corso. Lo trovi in Gestione → Sport → Roster.');
      return 'in_attesa';
    end if;
    update public.sport_roster set left_at = now(), pending_sport_id = null, pending_position_id = null where id = cur.id;
  elsif v_count = 1 then
    -- Doppio sport: due stagioni diverse
    if exists (select 1 from public.sport_roster ro join public.sports s2 on s2.id = ro.sport_id
               where ro.character_id = p_character and ro.left_at is null
                 and (s2.season = s.season or s2.season = 'year_round' or s.season = 'year_round')) then
      raise exception 'Con Doppio sport i due sport devono essere di stagioni diverse.' using errcode = 'P0001';
    end if;
  end if;
  perform public.sport_enter(p_character, p_sport, p_position);
  return 'fatto';
end;
$$;
revoke execute on function public.sport_join(uuid, uuid, uuid) from public, anon;
grant execute on function public.sport_join(uuid, uuid, uuid) to authenticated;

-- Lasciare lo sport: sempre possibile; lo storico resta
create or replace function public.sport_leave(p_character uuid, p_sport uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.owns_character(p_character) then raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501'; end if;
  update public.sport_roster set left_at = now(), pending_sport_id = null, pending_position_id = null,
    squad_status = case when squad_status = 'captain' then 'starter' else squad_status end
  where character_id = p_character and sport_id = p_sport and left_at is null;
  if not found then raise exception 'Non fai parte di questo sport.' using errcode = 'P0001'; end if;
end;
$$;
revoke execute on function public.sport_leave(uuid, uuid) from public, anon;
grant execute on function public.sport_leave(uuid, uuid) to authenticated;

-- Ritira la richiesta di cambio
create or replace function public.sport_cancel_change(p_character uuid, p_sport uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.owns_character(p_character) then raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501'; end if;
  update public.sport_roster set pending_sport_id = null, pending_position_id = null
  where character_id = p_character and sport_id = p_sport and left_at is null;
end;
$$;
revoke execute on function public.sport_cancel_change(uuid, uuid) from public, anon;
grant execute on function public.sport_cancel_change(uuid, uuid) to authenticated;

-- Intensità di allenamento e Redshirt: si scelgono prima che la stagione cominci a giocarsi
create or replace function public.sport_set_training(p_character uuid, p_sport uuid, p_intensity text, p_redshirt boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ro public.sport_roster;
begin
  if not public.owns_character(p_character) then raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501'; end if;
  if p_intensity not in ('light', 'normal', 'intense') then raise exception 'Intensità non valida.' using errcode = 'P0001'; end if;
  select * into ro from public.sport_roster where character_id = p_character and sport_id = p_sport and left_at is null for update;
  if ro.id is null then raise exception 'Non fai parte di questo sport.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.sport_events e join public.sport_seasons se on se.id = e.season_id
             where e.sport_id = p_sport and se.status = 'active' and e.status in ('simulated', 'published')) then
    raise exception 'La stagione è già cominciata: intensità e Redshirt si scelgono prima del primo evento.' using errcode = 'P0001';
  end if;
  update public.sport_roster
  set training_intensity = p_intensity,
      squad_status = case when p_redshirt then 'redshirt' when squad_status = 'redshirt' then 'starter' else squad_status end
  where id = ro.id;
end;
$$;
revoke execute on function public.sport_set_training(uuid, uuid, text, boolean) from public, anon;
grant execute on function public.sport_set_training(uuid, uuid, text, boolean) to authenticated;

-- Il Master approva o rifiuta il cambio chiesto a stagione in corso
create or replace function public.sport_change_review(p_roster bigint, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ro public.sport_roster;
  v_owner uuid;
begin
  if not public.has_permission('sport.gestire') then raise exception 'Non hai il permesso di gestire lo sport.' using errcode = '42501'; end if;
  select * into ro from public.sport_roster where id = p_roster and left_at is null for update;
  if ro.id is null or ro.pending_position_id is null then raise exception 'Nessuna richiesta di cambio.' using errcode = 'P0001'; end if;
  select owner_id into v_owner from public.characters where id = ro.character_id;
  if p_approve then
    if ro.pending_sport_id is not null and ro.pending_sport_id <> ro.sport_id then
      update public.sport_roster set left_at = now(), pending_sport_id = null, pending_position_id = null,
        squad_status = case when squad_status = 'captain' then 'starter' else squad_status end where id = ro.id;
      perform public.sport_enter(ro.character_id, ro.pending_sport_id, ro.pending_position_id);
    else
      update public.sport_roster set position_id = ro.pending_position_id, pending_sport_id = null, pending_position_id = null where id = ro.id;
    end if;
  else
    update public.sport_roster set pending_sport_id = null, pending_position_id = null where id = ro.id;
  end if;
  perform public.send_system_message(v_owner, case when p_approve then '🏅 Il cambio di sport o di ruolo è stato approvato.'
    else '🏅 Il cambio di sport o di ruolo non è stato approvato.' end);
end;
$$;
revoke execute on function public.sport_change_review(bigint, boolean) from public, anon;
grant execute on function public.sport_change_review(bigint, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 12. NOTIFICHE DEL CALENDARIO SPORTIVO
-- ---------------------------------------------------------------------
create or replace function public.sport_notify_athletes(p_sport uuid, p_text text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  u record;
begin
  for u in
    select distinct c.owner_id from public.sport_roster ro join public.characters c on c.id = ro.character_id
    where ro.sport_id = p_sport and ro.left_at is null
  loop
    perform public.send_system_message(u.owner_id, p_text);
  end loop;
end;
$$;
revoke execute on function public.sport_notify_athletes(uuid, text) from public, anon, authenticated;

-- "Basketball · Neon Campus vs Coral Coast · 12/11 21:00"
create or replace function public.sport_event_label(p_event uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.icon || ' ' || s.name || ' · '
    || coalesce((select string_agg(t.name, ' vs ' order by t.is_player_school desc, t.name)
                 from public.sport_event_teams et join public.sport_teams t on t.id = et.team_id where et.event_id = e.id), e.kind)
    || ' · ' || to_char(e.starts_at at time zone 'Europe/Rome', 'DD/MM HH24:MI')
  from public.sport_events e join public.sports s on s.id = e.sport_id
  where e.id = p_event
$$;
revoke execute on function public.sport_event_label(uuid) from public, anon, authenticated;

create or replace function public.sport_events_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- durante la preparazione (stagione non ancora attiva) niente avvisi
  if not exists (select 1 from public.sport_seasons where id = new.season_id and status = 'active') then return null; end if;
  if tg_op = 'INSERT' then
    perform public.sport_notify_athletes(new.sport_id, '📅 Nuovo evento in calendario: ' || public.sport_event_label(new.id) || '.');
  elsif new.status = 'cancelled' and old.status <> 'cancelled' then
    perform public.sport_notify_athletes(new.sport_id, '📅 Evento annullato: ' || public.sport_event_label(new.id) || '.');
  elsif new.status = 'postponed' and old.status <> 'postponed' then
    perform public.sport_notify_athletes(new.sport_id, '📅 Evento rinviato: ' || public.sport_event_label(new.id) || '. La nuova data arriverà presto.');
  elsif new.starts_at <> old.starts_at and new.status in ('scheduled', 'postponed') then
    perform public.sport_notify_athletes(new.sport_id, '📅 Evento spostato: ' || public.sport_event_label(new.id) || '.');
  end if;
  return null;
end;
$$;
revoke execute on function public.sport_events_notify() from public, anon, authenticated;
create trigger sport_events_notify after insert or update of starts_at, status on public.sport_events
  for each row execute function public.sport_events_notify();

-- Stagione attivata: avviso agli atleti
create or replace function public.sport_seasons_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'active' and old.status = 'planning' then
    new.started_at := now();
    perform public.sport_notify_athletes(new.sport_id,
      '🏅 Comincia la stagione ' || new.label || ' di ' || (select name from public.sports where id = new.sport_id)
      || ': il calendario è nella pagina Sport. Scegli l''intensità di allenamento prima del primo evento.');
  end if;
  return new;
end;
$$;
revoke execute on function public.sport_seasons_notify() from public, anon, authenticated;
create trigger sport_seasons_notify before update of status on public.sport_seasons
  for each row execute function public.sport_seasons_notify();

-- Promemoria prima degli eventi (pg_cron ogni ora)
create or replace function public.sport_reminders()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e record;
begin
  for e in
    select ev.id, ev.sport_id from public.sport_events ev join public.sport_seasons se on se.id = ev.season_id
    where se.status = 'active' and ev.status = 'scheduled' and ev.reminded_at is null
      and ev.starts_at between now() and now() + make_interval(hours => coalesce(public.setting_int('sport_promemoria_ore'), 24))
  loop
    perform public.sport_notify_athletes(e.sport_id, '⏰ Promemoria: ' || public.sport_event_label(e.id) || '.');
    update public.sport_events set reminded_at = now() where id = e.id;
  end loop;
end;
$$;
revoke execute on function public.sport_reminders() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 13. SIMULAZIONE
-- ---------------------------------------------------------------------
-- Punteggi verosimili dal profilo dello sport (diff = differenza di forza)
create or replace function public.sport_points(p_profile jsonb, p_diff int, p_draw boolean default false)
returns int[]
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_kind text := coalesce(p_profile ->> 'kind', 'points');
  v_base numeric := coalesce((p_profile ->> 'base')::numeric, 10);
  v_per numeric := coalesce((p_profile ->> 'per')::numeric, 1);
  v_jit numeric := coalesce((p_profile ->> 'jitter')::numeric, 2);
  v_w int;
  v_l int;
  v_d int := abs(p_diff);
begin
  if v_kind = 'sets' then
    v_w := ceil(coalesce((p_profile ->> 'best_of')::numeric, 5) / 2)::int;
    return array[v_w, greatest(0, v_w - 1 - v_d / 4)];
  elsif v_kind = 'bout' then
    v_w := coalesce((p_profile ->> 'to')::int, 15);
    return array[v_w, greatest(0, least(v_w - 1, v_w - greatest(1, v_d)))];
  end if;
  v_w := round(v_base + v_d * v_per * 0.5 + (random() * 2 - 1) * v_jit)::int;
  if p_draw then return array[greatest(0, v_w), greatest(0, v_w)]; end if;
  v_l := greatest(0, v_w - greatest(1, round(v_d * v_per)::int));
  return array[greatest(v_w, v_l + 1), v_l];
end;
$$;
revoke execute on function public.sport_points(jsonb, int, boolean) from public, anon, authenticated;

-- Tempo o misura di una gara dal profilo ({kind: time, base: secondi, per: secondi per punto})
create or replace function public.sport_time(p_profile jsonb, p_total numeric)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v numeric := greatest(1, coalesce((p_profile ->> 'base')::numeric, 60) - (p_total - 15) * coalesce((p_profile ->> 'per')::numeric, 0.5)
    + (random() - 0.5) * coalesce((p_profile ->> 'per')::numeric, 0.5));
begin
  if v >= 60 then
    return floor(v / 60)::int || ':' || to_char(v - floor(v / 60) * 60, 'FM00.0');
  end if;
  return to_char(v, 'FM990.00');
end;
$$;
revoke execute on function public.sport_time(jsonb, numeric) from public, anon, authenticated;

-- Dettaglio di un incontro individuale (scherma 15–11, tennis 6–4 6–3, lotta 8–3)
create or replace function public.sport_match_detail(p_profile jsonb, p_diff int, p_won boolean)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  m jsonb := coalesce(p_profile -> 'match', '{}'::jsonb);
  v int[];
  a int; b int;
begin
  if m ->> 'kind' = 'tennis' then
    a := 6; b := greatest(0, least(4, 4 - abs(p_diff) / 3));
    return case when p_won then '6–' || b || ' 6–' || greatest(0, b - 1) else b || '–6 ' || greatest(0, b - 1) || '–6' end;
  end if;
  v := public.sport_points(m, p_diff);
  return case when p_won then v[1] || '–' || v[2] else v[2] || '–' || v[1] end;
end;
$$;
revoke execute on function public.sport_match_detail(jsonb, int, boolean) from public, anon, authenticated;

create or replace function public.sport_event_simulate(p_event uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev public.sport_events;
  sp public.sports;
  v_school uuid;
  v_school_rating int;
  v_cd int := coalesce(public.setting_int('sport_cd'), 12);
  v_cap int := coalesce(public.setting_int('sport_contributo_max'), 6);
  v_off int := coalesce(public.setting_int('sport_offset_individuale'), 3);
  v_int numeric[] := public.uni_list('sport_intensita');
  v_dur numeric[] := public.uni_list('sport_infortunio_durate');
  v_pts numeric[] := public.uni_list('sport_punti_piazzamento');
  v_phase text;
  ro record;
  m jsonb;
  v_attr int; v_skill int; v_d int; v_extra int; v_crit text; v_dval int; v_mods int; v_total int; v_margin int;
  v_grade int; v_contrib int; v_items jsonb; v_inj jsonb; v_thr int; v_shift int; v_tier int; v_len int;
  v_master jsonb; v_returning int; v_style int;
  v_sum int := 0; v_leader int := 0;
  v_injured bigint[] := '{}'; v_suspended bigint[] := '{}'; v_ejected bigint[] := '{}';
  v_comp boolean;
  v_opp uuid; v_opp_rating int; v_opp_total int; v_our int; v_their int; v_score int[];
  v_won int := 0; v_lost int := 0; v_bouts int; v_draw boolean := false; v_ot boolean := false;
  v_lines text := '';
  v_name text;
  v_result text;
  r record;
  v_place int;
  v_detail text;
begin
  if not public.has_permission('sport.gestire') then raise exception 'Non hai il permesso di gestire lo sport.' using errcode = '42501'; end if;
  select * into ev from public.sport_events where id = p_event for update;
  if ev.id is null then raise exception 'Evento non trovato.' using errcode = 'P0001'; end if;
  if ev.status in ('simulated', 'published') then return jsonb_build_object('gia_simulato', true); end if;
  if ev.status = 'cancelled' then raise exception 'L''evento è annullato.' using errcode = 'P0001'; end if;
  if ev.mode <> 'simulated' then raise exception 'Questo evento si gioca in chat: inserisci il risultato a mano.' using errcode = 'P0001'; end if;
  select * into sp from public.sports where id = ev.sport_id;
  select id into v_school from public.sport_teams where is_player_school;
  if v_school is null then raise exception 'Manca l''università dei personaggi tra le squadre.' using errcode = 'P0001'; end if;
  insert into public.sport_event_teams (event_id, team_id) values (p_event, v_school) on conflict do nothing;
  if (select count(*) from public.sport_event_teams where event_id = p_event) < 2 then
    raise exception 'Aggiungi almeno un avversario all''evento.' using errcode = 'P0001';
  end if;
  v_school_rating := coalesce((select rating from public.sport_team_ratings where team_id = v_school and sport_id = sp.id), 12);
  v_phase := case when ev.phase in ('conference', 'national') then 'playoff' else 'regular' end;

  -- 1. prestazione di ogni PG che gareggia
  create temporary table if not exists pg_temp.sport_sim (character_id uuid, roster_id bigint, position_id uuid, total int, contribution int,
    grade int, team_bonus boolean, crit text) on commit drop;
  truncate pg_temp.sport_sim;
  for ro in
    select x.*, p.attribute_id, p.skill_id, p.team_bonus, p.name as position_name,
      (public.sport_eligibility(x.character_id, x.sport_id) ->> 'eligible')::boolean as eligible
    from public.sport_roster x left join public.sport_positions p on p.id = x.position_id
    where x.sport_id = sp.id and x.left_at is null and x.squad_status <> 'redshirt'
    order by case x.squad_status when 'captain' then 0 when 'starter' then 1 else 2 end, x.id
  loop
    if ro.injury_events_left > 0 then v_injured := v_injured || ro.id; continue; end if;
    if ro.suspended_events > 0 then v_suspended := v_suspended || ro.id; continue; end if;
    if not ro.eligible then continue; end if;
    v_comp := true;
    if ro.squad_status = 'reserve' then
      -- la riserva gareggia nel 50% degli eventi o se manca un titolare del suo ruolo
      v_comp := public.academic_die() * 10 <= coalesce(public.setting_int('sport_riserve_percento'), 50)
        or exists (select 1 from public.sport_roster s2 where s2.sport_id = sp.id and s2.left_at is null and s2.position_id = ro.position_id
                     and s2.squad_status in ('starter', 'captain')
                     and (s2.injury_events_left > 0 or s2.suspended_events > 0 or not (public.sport_eligibility(s2.character_id, sp.id) ->> 'eligible')::boolean));
    end if;
    continue when not v_comp;

    v_attr := coalesce((select value from public.character_attributes where character_id = ro.character_id and attribute_id = ro.attribute_id), 0);
    v_skill := coalesce((select level from public.character_skills where character_id = ro.character_id and skill_id = ro.skill_id), 0);
    m := public.trait_mods(ro.character_id, jsonb_build_object('system', 'athletics', 'skill_id', ro.skill_id, 'phase', v_phase,
      'venue', ev.venue, 'format', sp.format));
    v_master := ev.master_mods -> ro.character_id::text;
    v_returning := case when ro.is_returning then case when public.trait_flag(ro.character_id, 'old_injury') then -2 else -1 end else 0 end;
    -- Vecchio infortunio: −1 al primo evento di ogni stagione
    if public.trait_flag(ro.character_id, 'old_injury') and not exists (
      select 1 from public.sport_event_rolls x join public.sport_events e2 on e2.id = x.event_id
      where x.character_id = ro.character_id and e2.season_id = ev.season_id) then
      v_returning := v_returning - 1;
    end if;
    -- Lupo solitario / Uomo squadra
    v_style := case
      when public.trait_flag(ro.character_id, 'lone_wolf') then case when sp.format like 'individual%' then 1 else -1 end
      when public.trait_flag(ro.character_id, 'team_player') then case when sp.format like 'team%' then 1 else -1 end
      else 0 end;
    v_mods := (m ->> 'total')::int
      + coalesce(v_int[case ro.training_intensity when 'light' then 1 when 'normal' then 2 else 3 end], 0)::int
      + least(ro.training_bonus, coalesce(public.setting_int('sport_allenamento_max'), 2))
      + v_returning + v_style + coalesce((v_master ->> 'value')::int, 0);

    v_d := public.academic_die();
    v_extra := null; v_crit := 'none'; v_dval := v_d;
    if v_d >= (m ->> 'success_min')::int then
      v_extra := public.academic_die(); v_crit := 'success'; v_dval := v_d + v_extra;
    elsif v_d <= (m ->> 'failure_max')::int then
      v_extra := public.academic_die(); v_crit := 'failure'; v_dval := v_d - v_extra;
    end if;
    v_total := v_attr + v_skill + v_dval + v_mods;
    v_margin := v_total - v_cd;
    v_grade := greatest(1, least(10, round(6 + v_margin / 2.0)::int));
    v_contrib := greatest(-3, least(3, round(v_margin / 2.0)::int));

    -- errore grave: infortunio se il d10 sottratto è alto (Fisico d'acciaio / Fragile cambiano soglia e durata)
    v_inj := null;
    if v_crit = 'failure' then
      v_thr := coalesce((public.trait_effect(ro.character_id, 'injury_threshold') ->> 'value')::int,
        coalesce(public.setting_int('sport_infortunio_soglia'), 8));
      if v_extra >= v_thr then
        v_shift := coalesce((public.trait_effect(ro.character_id, 'injury_band') ->> 'shift')::int, 0);
        v_len := public.academic_die();
        v_tier := case when v_len <= coalesce(v_dur[1], 5) then 0 when v_len <= coalesce(v_dur[2], 8) then 1 else 2 end;
        v_tier := greatest(0, least(2, v_tier + v_shift));
        v_inj := jsonb_build_object('d10', v_len, 'events', case v_tier when 0 then 1 when 1 then 3 else 999 end);
      end if;
      if public.trait_flag(ro.character_id, 'ejection_on_fumble') then v_ejected := v_ejected || ro.id; end if;
    end if;

    insert into pg_temp.sport_sim values (ro.character_id, ro.id, ro.position_id, v_total, v_contrib, v_grade, ro.team_bonus, v_crit);
    -- Leader dello spogliatoio (titolare o capitano): +1 al rating di squadra
    if ro.squad_status in ('starter', 'captain') and public.trait_effect(ro.character_id, 'team_rating_bonus') is not null then
      v_leader := 1;
    end if;
    insert into public.sport_event_rolls (event_id, character_id, position_id, d10, crit_type, extra_d10, modifiers, total, cd, margin, grade,
      contribution, highlight, injury)
    values (p_event, ro.character_id, ro.position_id, v_d, v_crit, v_extra,
      jsonb_build_object('voci', m -> 'items', 'intensita', ro.training_intensity, 'allenamenti', ro.training_bonus, 'rientro', v_returning,
        'stile', v_style, 'master', coalesce((v_master ->> 'value')::int, 0), 'nota_master', v_master ->> 'note', 'totale', v_mods,
        'caratteristica', v_attr, 'abilita', v_skill, 'ruolo', ro.position_name),
      v_total, v_cd, v_margin, v_grade, v_contrib, v_crit = 'success', v_inj);
  end loop;
  v_school_rating := v_school_rating + v_leader;
  select coalesce(sum(contribution * case when team_bonus then 2 else 1 end), 0) into v_sum from pg_temp.sport_sim;
  v_sum := greatest(-v_cap, least(v_cap, v_sum));

  -- 2. risultato secondo il formato
  if sp.format = 'team_match' then
    select team_id into v_opp from public.sport_event_teams where event_id = p_event and team_id <> v_school limit 1;
    v_opp_rating := coalesce((select rating from public.sport_team_ratings where team_id = v_opp and sport_id = sp.id), 12);
    v_our := v_school_rating + public.academic_die() + v_sum + case when ev.venue = 'home' then 1 else 0 end;
    v_their := v_opp_rating + public.academic_die() + case when ev.venue = 'away' then 1 else 0 end;
    if v_our = v_their then
      if sp.allows_draw and ev.phase in ('friendly', 'regular') then
        v_draw := true;
      else
        v_ot := true;
        loop
          v_our := v_our + public.academic_die();
          v_their := v_their + public.academic_die();
          exit when v_our <> v_their;
        end loop;
      end if;
    end if;
    v_score := public.sport_points(sp.score_profile, v_our - v_their, v_draw);
    update public.sport_event_teams set score = case when v_our >= v_their then v_score[1] else v_score[2] end,
      placement = case when v_draw then 1 when v_our > v_their then 1 else 2 end where event_id = p_event and team_id = v_school;
    update public.sport_event_teams set score = case when v_our >= v_their then v_score[2] else v_score[1] end,
      placement = case when v_draw then 1 when v_their > v_our then 1 else 2 end where event_id = p_event and team_id = v_opp;
    v_result := (select name from public.sport_teams where id = v_school) || ' ' || case when v_our >= v_their then v_score[1] else v_score[2] end
      || ' – ' || case when v_our >= v_their then v_score[2] else v_score[1] end || ' ' || (select name from public.sport_teams where id = v_opp)
      || case when v_ot then ' (supplementari)' else '' end;

  elsif sp.format = 'individual_match' then
    select team_id into v_opp from public.sport_event_teams where event_id = p_event and team_id <> v_school limit 1;
    v_opp_rating := coalesce((select rating from public.sport_team_ratings where team_id = v_opp and sport_id = sp.id), 12);
    v_bouts := coalesce((sp.score_profile ->> 'bouts')::int, 9);
    for r in select * from pg_temp.sport_sim loop
      v_opp_total := v_opp_rating + public.academic_die() - v_off;
      while v_opp_total = r.total loop v_opp_total := v_opp_total + (case when random() < 0.5 then 1 else -1 end); end loop;
      v_detail := public.sport_match_detail(sp.score_profile, r.total - v_opp_total, r.total > v_opp_total);
      if r.total > v_opp_total then v_won := v_won + 1; else v_lost := v_lost + 1; end if;
      update public.sport_event_rolls set opponent = (select name from public.sport_teams where id = v_opp),
        result_detail = jsonb_build_object('won', r.total > v_opp_total, 'score', v_detail)
      where event_id = p_event and character_id = r.character_id;
    end loop;
    -- gli incontri dei compagni PNG
    for i in 1..greatest(0, v_bouts - (select count(*) from pg_temp.sport_sim)::int) loop
      v_our := v_school_rating + public.academic_die();
      v_their := v_opp_rating + public.academic_die();
      if v_our > v_their or (v_our = v_their and random() < 0.5) then v_won := v_won + 1; else v_lost := v_lost + 1; end if;
    end loop;
    if v_won = v_lost then
      if sp.allows_draw and ev.phase in ('friendly', 'regular') then v_draw := true;
      elsif random() < 0.5 then v_won := v_won + 1; else v_lost := v_lost + 1; end if;
    end if;
    update public.sport_event_teams set score = v_won, placement = case when v_won >= v_lost then 1 else 2 end where event_id = p_event and team_id = v_school;
    update public.sport_event_teams set score = v_lost, placement = case when v_lost >= v_won then 1 else 2 end where event_id = p_event and team_id = v_opp;
    v_result := (select name from public.sport_teams where id = v_school) || ' ' || v_won || ' – ' || v_lost || ' ' || (select name from public.sport_teams where id = v_opp);

  elsif sp.format = 'team_race' then
    v_our := v_school_rating + public.academic_die() + v_sum;
    create temporary table if not exists pg_temp.sport_race (team_id uuid, total int) on commit drop;
    truncate pg_temp.sport_race;
    insert into pg_temp.sport_race values (v_school, v_our);
    insert into pg_temp.sport_race
    select et.team_id, coalesce((select rating from public.sport_team_ratings where team_id = et.team_id and sport_id = sp.id), 12) + public.academic_die()
    from public.sport_event_teams et where et.event_id = p_event and et.team_id <> v_school;
    v_place := 0;
    for r in select * from pg_temp.sport_race order by total desc, random() loop
      v_place := v_place + 1;
      update public.sport_event_teams set placement = v_place, score = r.total, time_or_measure = public.sport_time(sp.score_profile, r.total),
        points = coalesce(v_pts[v_place], 0)::int
      where event_id = p_event and team_id = r.team_id;
    end loop;
    v_result := 'Piazzamento: ' || (select placement from public.sport_event_teams where event_id = p_event and team_id = v_school) || '° su '
      || (select count(*) from public.sport_event_teams where event_id = p_event)
      || ' · tempo ' || (select time_or_measure from public.sport_event_teams where event_id = p_event and team_id = v_school);

  else -- individual_race
    create temporary table if not exists pg_temp.sport_race (team_id uuid, total int) on commit drop;
    create temporary table if not exists pg_temp.sport_runners (team_id uuid, character_id uuid, total int) on commit drop;
    truncate pg_temp.sport_runners;
    insert into pg_temp.sport_runners select v_school, character_id, total from pg_temp.sport_sim;
    -- un atleta PNG per ogni squadra (anche la nostra)
    insert into pg_temp.sport_runners
    select et.team_id, null, coalesce((select rating from public.sport_team_ratings where team_id = et.team_id and sport_id = sp.id), 12) + public.academic_die() - v_off
    from public.sport_event_teams et where et.event_id = p_event;
    v_place := 0;
    for r in select * from pg_temp.sport_runners order by total desc, random() loop
      v_place := v_place + 1;
      update public.sport_event_teams set points = points + coalesce(v_pts[v_place], 0)::int where event_id = p_event and team_id = r.team_id;
      if r.character_id is not null then
        update public.sport_event_rolls set result_detail = jsonb_build_object('placement', v_place, 'time', public.sport_time(sp.score_profile, r.total))
        where event_id = p_event and character_id = r.character_id;
      end if;
    end loop;
    v_place := 0;
    for r in select team_id, points from public.sport_event_teams where event_id = p_event order by points desc, random() loop
      v_place := v_place + 1;
      update public.sport_event_teams set placement = v_place, score = r.points where event_id = p_event and team_id = r.team_id;
    end loop;
    v_result := 'Classifica a squadre: ' || (select placement from public.sport_event_teams where event_id = p_event and team_id = v_school) || '° su '
      || (select count(*) from public.sport_event_teams where event_id = p_event) || ' con '
      || (select points from public.sport_event_teams where event_id = p_event and team_id = v_school) || ' punti';
  end if;

  -- 3. resoconto per la chat
  for r in
    select x.*, c.name, p.name as position_name from public.sport_event_rolls x join public.characters c on c.id = x.character_id
    left join public.sport_positions p on p.id = x.position_id where x.event_id = p_event order by x.grade desc
  loop
    v_name := public.first_name(r.name) || coalesce(' (' || r.position_name || ')', '');
    v_lines := v_lines || E'\n' || case when r.highlight then '⭐ ' else '· ' end || v_name || ': voto ' || r.grade
      || coalesce(case when r.result_detail ? 'won' then case when (r.result_detail ->> 'won')::boolean then ', vince ' else ', perde ' end || (r.result_detail ->> 'score') end, '')
      || coalesce(', ' || (r.result_detail ->> 'placement') || '° in ' || (r.result_detail ->> 'time'), '')
      || case when r.highlight then ' · giocata da highlight' else '' end
      || case when r.injury is not null then E'\n🩹 ' || public.first_name(r.name) || ': infortunio, fuori '
        || case when (r.injury ->> 'events')::int >= 999 then 'fino a fine stagione' when (r.injury ->> 'events')::int = 1 then '1 evento' else (r.injury ->> 'events') || ' eventi' end
        else '' end;
  end loop;
  update public.sport_events
  set status = 'simulated', simulated_at = now(),
      recap_text = public.sport_event_label(p_event) || E'\n' || v_result || v_lines,
      sim_meta = jsonb_build_object('injured', to_jsonb(v_injured), 'suspended', to_jsonb(v_suspended), 'ejected', to_jsonb(v_ejected),
        'our', v_our, 'their', v_their, 'contributi', v_sum, 'leader', v_leader)
  where id = p_event;
  return jsonb_build_object('atleti', (select count(*) from pg_temp.sport_sim), 'risultato', v_result);
end;
$$;
revoke execute on function public.sport_event_simulate(uuid) from public, anon;
grant execute on function public.sport_event_simulate(uuid) to authenticated;

-- Risultato inserito a mano (eventi giocati in chat): [{team_id, score, placement, time}]
create or replace function public.sport_event_result(p_event uuid, p_teams jsonb, p_recap text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev public.sport_events;
  t jsonb;
begin
  if not public.has_permission('sport.gestire') then raise exception 'Non hai il permesso di gestire lo sport.' using errcode = '42501'; end if;
  select * into ev from public.sport_events where id = p_event for update;
  if ev.id is null or ev.status not in ('scheduled', 'postponed', 'simulated') then raise exception 'Evento non modificabile.' using errcode = 'P0001'; end if;
  for t in select * from jsonb_array_elements(coalesce(p_teams, '[]'::jsonb)) loop
    insert into public.sport_event_teams (event_id, team_id, score, placement, time_or_measure, points)
    values (p_event, (t ->> 'team_id')::uuid, (t ->> 'score')::int, (t ->> 'placement')::int, left(coalesce(t ->> 'time', ''), 20), coalesce((t ->> 'points')::int, 0))
    on conflict (event_id, team_id) do update set score = excluded.score, placement = excluded.placement,
      time_or_measure = excluded.time_or_measure, points = excluded.points;
  end loop;
  update public.sport_events set status = 'simulated', simulated_at = now(),
    recap_text = left(coalesce(nullif(btrim(p_recap), ''), public.sport_event_label(p_event)), 3000)
  where id = p_event;
end;
$$;
revoke execute on function public.sport_event_result(uuid, jsonb, text) from public, anon;
grant execute on function public.sport_event_result(uuid, jsonb, text) to authenticated;

-- Annulla una simulazione non ancora pubblicata (per rifarla)
create or replace function public.sport_event_reset(p_event uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_permission('sport.gestire') then raise exception 'Non hai il permesso di gestire lo sport.' using errcode = '42501'; end if;
  if (select status from public.sport_events where id = p_event) is distinct from 'simulated' then
    raise exception 'Si annulla solo un evento simulato e non ancora pubblicato.' using errcode = 'P0001';
  end if;
  delete from public.sport_event_rolls where event_id = p_event;
  delete from public.sport_shadow_results where event_id = p_event;
  update public.sport_event_teams set score = null, placement = null, time_or_measure = '', points = 0 where event_id = p_event;
  update public.sport_events set status = 'scheduled', recap_text = '', sim_meta = '{}', simulated_at = null where id = p_event;
end;
$$;
revoke execute on function public.sport_event_reset(uuid) from public, anon;
grant execute on function public.sport_event_reset(uuid) to authenticated;

-- Pubblica: infortuni, squalifiche e rientri; risultati tra le altre università; avviso agli atleti
create or replace function public.sport_event_publish(p_event uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev public.sport_events;
  sp public.sports;
  r record;
  v_teams uuid[];
  v_a int; v_b int; v_score int[];
begin
  if not public.has_permission('sport.gestire') then raise exception 'Non hai il permesso di gestire lo sport.' using errcode = '42501'; end if;
  select * into ev from public.sport_events where id = p_event for update;
  if ev.status is distinct from 'simulated' then raise exception 'Prima simula l''evento o inserisci il risultato.' using errcode = 'P0001'; end if;
  select * into sp from public.sports where id = ev.sport_id;

  -- chi gareggiava torna normale; chi era fuori sconta un evento
  update public.sport_roster set is_returning = false
  where sport_id = ev.sport_id and character_id in (select character_id from public.sport_event_rolls where event_id = p_event);
  update public.sport_roster set injury_events_left = case when injury_events_left >= 999 then 999 else injury_events_left - 1 end,
    is_returning = injury_events_left = 1
  where id in (select (x #>> '{}')::bigint from jsonb_array_elements(coalesce(ev.sim_meta -> 'injured', '[]')) x);
  update public.sport_roster set suspended_events = greatest(0, suspended_events - 1)
  where id in (select (x #>> '{}')::bigint from jsonb_array_elements(coalesce(ev.sim_meta -> 'suspended', '[]')) x);
  -- nuovi infortuni e squalifiche (Testa calda)
  for r in select x.character_id, x.injury from public.sport_event_rolls x where x.event_id = p_event and x.injury is not null loop
    update public.sport_roster set injury_events_left = (r.injury ->> 'events')::int, is_returning = false,
      injury_note = 'Infortunio in gara (' || to_char(now() at time zone 'Europe/Rome', 'DD/MM') || ')'
    where sport_id = ev.sport_id and character_id = r.character_id and left_at is null;
  end loop;
  update public.sport_roster set suspended_events = suspended_events + 1
  where id in (select (x #>> '{}')::bigint from jsonb_array_elements(coalesce(ev.sim_meta -> 'ejected', '[]')) x);

  -- le altre università della Conference giocano tra loro (stagione regolare, sport a partite)
  if ev.phase = 'regular' and sp.format in ('team_match', 'individual_match') then
    select array_agg(t.id order by random()) into v_teams
    from public.sport_teams t join public.sport_team_ratings tr on tr.team_id = t.id and tr.sport_id = sp.id
    where t.conference and t.active and not t.is_player_school
      and t.id not in (select team_id from public.sport_event_teams where event_id = p_event);
    for i in 1..coalesce(array_length(v_teams, 1), 0) / 2 loop
      v_a := (select rating from public.sport_team_ratings where team_id = v_teams[2 * i - 1] and sport_id = sp.id) + public.academic_die();
      v_b := (select rating from public.sport_team_ratings where team_id = v_teams[2 * i] and sport_id = sp.id) + public.academic_die();
      if v_a = v_b and not sp.allows_draw then v_a := v_a + case when random() < 0.5 then 1 else -1 end; end if;
      v_score := public.sport_points(sp.score_profile, v_a - v_b, v_a = v_b);
      insert into public.sport_shadow_results (season_id, event_id, team_a, team_b, score_a, score_b)
      values (ev.season_id, p_event, v_teams[2 * i - 1], v_teams[2 * i],
        case when v_a >= v_b then v_score[1] else v_score[2] end, case when v_a >= v_b then v_score[2] else v_score[1] end);
    end loop;
  end if;

  update public.sport_events set status = 'published', published_at = now() where id = p_event;
  perform public.sport_notify_athletes(ev.sport_id, '🏅 Risultato pubblicato' || E'\n' || coalesce(nullif(ev.recap_text, ''), public.sport_event_label(p_event)));
end;
$$;
revoke execute on function public.sport_event_publish(uuid) from public, anon;
grant execute on function public.sport_event_publish(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 14. CALENDARIO AUTOMATICO, CLASSIFICA, CHIUSURA E PREMI
-- ---------------------------------------------------------------------
-- Girone contro le università della Conference che hanno lo sport (da ritoccare a mano)
create or replace function public.sport_season_generate(p_season uuid, p_start timestamptz, p_days int default 7)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  se public.sport_seasons;
  sp public.sports;
  v_school uuid;
  t record;
  v_n int := 0;
  v_ev uuid;
begin
  if not public.has_permission('sport.gestire') then raise exception 'Non hai il permesso di gestire lo sport.' using errcode = '42501'; end if;
  select * into se from public.sport_seasons where id = p_season;
  if se.id is null or se.status = 'closed' then raise exception 'Stagione non modificabile.' using errcode = 'P0001'; end if;
  select * into sp from public.sports where id = se.sport_id;
  select id into v_school from public.sport_teams where is_player_school;
  if sp.format in ('team_match', 'individual_match') then
    for t in
      select tm.id from public.sport_teams tm join public.sport_team_ratings r on r.team_id = tm.id and r.sport_id = sp.id
      where tm.conference and tm.active and not tm.is_player_school order by random()
    loop
      insert into public.sport_events (season_id, sport_id, kind, phase, starts_at, venue)
      values (p_season, sp.id, case when sp.format = 'team_match' then 'partita' else 'incontro' end, 'regular',
        p_start + make_interval(days => v_n * greatest(1, p_days)), case when v_n % 2 = 0 then 'home' else 'away' end)
      returning id into v_ev;
      insert into public.sport_event_teams (event_id, team_id) values (v_ev, v_school), (v_ev, t.id);
      v_n := v_n + 1;
    end loop;
  else
    -- gare: un meeting con tutta la Conference ogni periodo (quattro in stagione)
    for i in 0..3 loop
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
  return v_n;
end;
$$;
revoke execute on function public.sport_season_generate(uuid, timestamptz, int) from public, anon;
grant execute on function public.sport_season_generate(uuid, timestamptz, int) to authenticated;

-- Classifica della Conference: partite (V-S-P, scontro diretto, differenza punti) o punti delle gare
create or replace function public.sport_standings(p_season uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with sp as (select s.* from public.sports s join public.sport_seasons se on se.sport_id = s.id where se.id = p_season),
  games as (
    -- le nostre partite pubblicate di stagione regolare
    select a.team_id as t1, b.team_id as t2, a.score as s1, b.score as s2
    from public.sport_events e
    join public.sport_event_teams a on a.event_id = e.id
    join public.sport_event_teams b on b.event_id = e.id and b.team_id <> a.team_id
    where e.season_id = p_season and e.status = 'published' and e.phase = 'regular' and a.score is not null and b.score is not null
    union all
    select team_a, team_b, score_a, score_b from public.sport_shadow_results where season_id = p_season
    union all
    select team_b, team_a, score_b, score_a from public.sport_shadow_results where season_id = p_season
  ),
  race as (
    select et.team_id, sum(et.points) as pts, count(*) as n
    from public.sport_events e join public.sport_event_teams et on et.event_id = e.id
    where e.season_id = p_season and e.status = 'published' and e.phase = 'regular'
    group by et.team_id
  ),
  teams as (
    select t.id, t.name, t.is_player_school from public.sport_teams t
    where t.active and (t.is_player_school or (t.conference and exists (
      select 1 from public.sport_team_ratings r where r.team_id = t.id and r.sport_id = (select id from sp))))
  )
  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.pct desc, x.diff desc, x.points desc, x.name), '[]'::jsonb)
  from (
    select tm.id as team_id, tm.name, tm.is_player_school,
      count(*) filter (where g.s1 > g.s2) as won, count(*) filter (where g.s1 < g.s2) as lost, count(*) filter (where g.s1 = g.s2) as drawn,
      coalesce(sum(g.s1 - g.s2), 0) as diff,
      coalesce((count(*) filter (where g.s1 > g.s2) + 0.5 * count(*) filter (where g.s1 = g.s2)) / nullif(count(g.t1), 0), 0) as pct,
      coalesce((select pts from race where race.team_id = tm.id), 0) as points
    from teams tm left join games g on g.t1 = tm.id
    group by tm.id, tm.name, tm.is_player_school
  ) x
$$;
revoke execute on function public.sport_standings(uuid) from public, anon;
grant execute on function public.sport_standings(uuid) to authenticated;

-- Chiude la stagione: stagioni di eleggibilità, Redshirt, premi
create or replace function public.sport_season_close(p_season uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  se public.sport_seasons;
  sp public.sports;
  r record;
  v_awards int := 0;
begin
  if not public.has_permission('sport.gestire') then raise exception 'Non hai il permesso di gestire lo sport.' using errcode = '42501'; end if;
  select * into se from public.sport_seasons where id = p_season for update;
  if se.id is null or se.status = 'closed' then raise exception 'Stagione già chiusa.' using errcode = 'P0001'; end if;
  select * into sp from public.sports where id = se.sport_id;

  -- chi ha gareggiato consuma una stagione; i Redshirt no
  update public.sport_athletes a set seasons_used = seasons_used + 1
  where a.sport_id = sp.id and exists (select 1 from public.sport_event_rolls x join public.sport_events e on e.id = x.event_id
    where e.season_id = p_season and e.status = 'published' and x.character_id = a.character_id);
  update public.sport_athletes a set redshirt_years = redshirt_years + 1
  where a.sport_id = sp.id and exists (select 1 from public.sport_roster ro where ro.sport_id = sp.id and ro.character_id = a.character_id
    and ro.left_at is null and ro.squad_status = 'redshirt');

  -- MVP: somma dei voti + 2 per ogni giocata da highlight
  for r in
    select x.character_id, sum(x.grade) + 2 * count(*) filter (where x.highlight) as score
    from public.sport_event_rolls x join public.sport_events e on e.id = x.event_id
    where e.season_id = p_season and e.status = 'published'
    group by x.character_id order by 2 desc limit 1
  loop
    insert into public.sport_awards (sport_id, season_id, character_id, name, description, kind)
    values (sp.id, p_season, r.character_id, 'MVP di squadra', sp.name || ' ' || se.label || ' · ' || r.score || ' punti', 'auto');
    v_awards := v_awards + 1;
  end loop;
  -- All-Conference: media voto alta (almeno 2 eventi)
  for r in
    select x.character_id, round(avg(x.grade), 1) as avg
    from public.sport_event_rolls x join public.sport_events e on e.id = x.event_id
    where e.season_id = p_season and e.status = 'published'
    group by x.character_id having count(*) >= 2 and avg(x.grade) >= coalesce(public.setting_int('sport_media_all_conference'), 8)
  loop
    insert into public.sport_awards (sport_id, season_id, character_id, name, description, kind)
    values (sp.id, p_season, r.character_id, 'All-Conference Team', sp.name || ' ' || se.label || ' · media ' || r.avg, 'auto');
    v_awards := v_awards + 1;
  end loop;
  -- Academic All-American: titolari e capitani che hanno gareggiato con GPA alto
  for r in
    select ro.character_id, sr.cumulative_gpa from public.sport_roster ro join public.student_records sr on sr.character_id = ro.character_id
    where ro.sport_id = sp.id and ro.left_at is null and ro.squad_status in ('starter', 'captain')
      and sr.cumulative_gpa >= coalesce(public.uni_n('sport_gpa_academic'), 3.5)
      and exists (select 1 from public.sport_event_rolls x join public.sport_events e on e.id = x.event_id
                  where e.season_id = p_season and e.status = 'published' and x.character_id = ro.character_id)
  loop
    insert into public.sport_awards (sport_id, season_id, character_id, name, description, kind)
    values (sp.id, p_season, r.character_id, 'Academic All-American', sp.name || ' ' || se.label || ' · GPA ' || to_char(r.cumulative_gpa, 'FM0.00'), 'auto');
    v_awards := v_awards + 1;
  end loop;

  -- a fine stagione: infortuni "fino a fine stagione" chiusi (rientro), allenamenti azzerati
  update public.sport_roster set injury_events_left = 0, is_returning = true where sport_id = sp.id and injury_events_left >= 999;
  update public.sport_roster set training_bonus = 0, suspended_events = 0 where sport_id = sp.id;
  update public.sport_seasons set status = 'closed', closed_at = now() where id = p_season;
  perform public.sport_notify_athletes(sp.id, '🏆 La stagione ' || se.label || ' di ' || sp.name || ' è chiusa. Premi e classifica sono nella pagina Sport.');
  return jsonb_build_object('premi', v_awards);
end;
$$;
revoke execute on function public.sport_season_close(uuid) from public, anon;
grant execute on function public.sport_season_close(uuid) to authenticated;

-- Atleta della settimana: la miglior prestazione pubblicata negli ultimi 7 giorni
create or replace function public.sport_athlete_of_week()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(x) from (
    select c.id as character_id, c.name, s.name as sport, s.icon, r.grade, r.highlight, e.starts_at
    from public.sport_event_rolls r join public.sport_events e on e.id = r.event_id join public.sports s on s.id = e.sport_id
    join public.characters c on c.id = r.character_id
    where e.status = 'published' and e.published_at > now() - interval '7 days'
    order by r.grade desc, r.highlight desc, r.margin desc limit 1
  ) x
$$;
revoke execute on function public.sport_athlete_of_week() from public, anon;
grant execute on function public.sport_athlete_of_week() to authenticated;

-- Il pannello del giocatore: i suoi sport con eleggibilità, statistiche e premi
create or replace function public.sport_my(p_character uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'roster_id', ro.id, 'sport_id', ro.sport_id, 'sport', s.name, 'icon', s.icon, 'season', s.season, 'format', s.format,
    'position_id', ro.position_id, 'position', p.name, 'squad_status', ro.squad_status, 'scholarship', ro.scholarship,
    'training_intensity', ro.training_intensity, 'training_bonus', ro.training_bonus,
    'injury_events_left', ro.injury_events_left, 'injury_note', ro.injury_note, 'returning', ro.is_returning, 'suspended_events', ro.suspended_events,
    'pending_sport', (select name from public.sports where id = ro.pending_sport_id),
    'pending_position', (select name from public.sport_positions where id = ro.pending_position_id),
    'eligibility', public.sport_eligibility(ro.character_id, ro.sport_id),
    'seasons_used', coalesce(a.seasons_used, 0), 'redshirt_years', coalesce(a.redshirt_years, 0),
    'events', (select count(*) from public.sport_event_rolls x join public.sport_events e on e.id = x.event_id
               where x.character_id = ro.character_id and e.sport_id = ro.sport_id and e.status = 'published'),
    'avg_grade', (select round(avg(x.grade), 1) from public.sport_event_rolls x join public.sport_events e on e.id = x.event_id
               where x.character_id = ro.character_id and e.sport_id = ro.sport_id and e.status = 'published'),
    'highlights', (select count(*) from public.sport_event_rolls x join public.sport_events e on e.id = x.event_id
               where x.character_id = ro.character_id and e.sport_id = ro.sport_id and e.status = 'published' and x.highlight),
    'season_started', exists (select 1 from public.sport_events e join public.sport_seasons se on se.id = e.season_id
               where e.sport_id = ro.sport_id and se.status = 'active' and e.status in ('simulated', 'published'))
  ) order by s.name), '[]'::jsonb)
  from public.sport_roster ro join public.sports s on s.id = ro.sport_id
  left join public.sport_positions p on p.id = ro.position_id
  left join public.sport_athletes a on a.character_id = ro.character_id and a.sport_id = ro.sport_id
  where ro.character_id = p_character and ro.left_at is null
$$;
revoke execute on function public.sport_my(uuid) from public, anon;
grant execute on function public.sport_my(uuid) to authenticated;

-- Il calendario di un periodo: eventi del gioco ed eventi sportivi
create or replace function public.calendar_range(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(x order by x ->> 'starts_at'), '[]'::jsonb) from (
    select jsonb_build_object('id', e.id, 'source', 'evento', 'title', e.title, 'description', e.description, 'category', e.category,
      'starts_at', e.starts_at, 'ends_at', e.ends_at, 'location', e.location, 'room_id', e.room_id) as x
    from public.calendar_events e
    where e.starts_at < p_to and coalesce(e.ends_at, e.starts_at) >= p_from
    union all
    select jsonb_build_object('id', e.id, 'source', 'sport', 'title', s.icon || ' ' || s.name || coalesce(' · ' || (
        select string_agg(t.name, ' vs ' order by t.is_player_school desc, t.name) from public.sport_event_teams et
        join public.sport_teams t on t.id = et.team_id where et.event_id = e.id), ''),
      'description', e.notes, 'category', 'sport', 'starts_at', e.starts_at, 'ends_at', null,
      'location', case e.venue when 'home' then 'In casa' when 'away' then 'In trasferta' else 'Campo neutro' end,
      'room_id', e.room_id, 'status', e.status, 'phase', e.phase, 'sport_id', s.id, 'recap', case when e.status = 'published' then e.recap_text end)
    from public.sport_events e join public.sports s on s.id = e.sport_id join public.sport_seasons se on se.id = e.season_id
    where se.status <> 'planning' and e.starts_at >= p_from and e.starts_at < p_to
  ) y (x)
$$;
revoke execute on function public.calendar_range(timestamptz, timestamptz) from public, anon;
grant execute on function public.calendar_range(timestamptz, timestamptz) to authenticated;

-- Il reset della scheda toglie anche lo sport (lo storico dei tiri resta)
create or replace function public.characters_reset_sport()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'bozza' and old.status = 'approvata' and new.creation_step = 1 then
    update public.sport_roster set left_at = now() where character_id = new.id and left_at is null;
    delete from public.sport_athletes where character_id = new.id;
  end if;
  return null;
end;
$$;
revoke execute on function public.characters_reset_sport() from public, anon, authenticated;
drop trigger if exists characters_reset_sport on public.characters;
create trigger characters_reset_sport after update of status on public.characters
  for each row execute function public.characters_reset_sport();

do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('sport-promemoria', '7 * * * *', 'select public.sport_reminders()');
exception when others then
  raise notice 'pg_cron non disponibile: %', sqlerrm;
end $$;

-- ---------------------------------------------------------------------
-- 15. DATI INIZIALI: università, sport e ruoli (tutto modificabile)
-- ---------------------------------------------------------------------
insert into public.sport_teams (name, nickname, is_player_school, conference, is_national) values
  ('Neon Campus University', 'Flamingos', true, true, false),
  ('Coral Coast University', 'Mantas', false, true, false),
  ('Gulfport State', 'Pelicans', false, true, false),
  ('Everglades Institute of Technology', 'Gators', false, true, false),
  ('Palm Harbor College', 'Herons', false, true, false),
  ('Sawgrass University', 'Panthers', false, true, false),
  ('Biscayne Bay College', 'Marlins', false, true, false),
  ('Seminole Ridge University', 'Hawks', false, true, false),
  ('Northgate University', 'Wolves', false, false, true),
  ('Pacific Crest University', 'Condors', false, false, true),
  ('Great Lakes State', 'Lakers', false, false, true),
  ('Appalachian Union', 'Bears', false, false, true)
on conflict (name) do nothing;

insert into public.sports (name, description, season, format, allows_draw, score_profile, icon, sort_order)
values
  ('Football', 'Il football americano: la partita del sabato, lo stadio pieno.', 'fall', 'team_match', false, '{"kind":"points","base":24,"per":3,"jitter":7}', '🏈', 1),
  ('Soccer', 'Il calcio universitario.', 'fall', 'team_match', true, '{"kind":"points","base":1,"per":0.5,"jitter":1}', '⚽', 2),
  ('Volleyball', 'Pallavolo indoor, al meglio dei cinque set.', 'fall', 'team_match', false, '{"kind":"sets","best_of":5}', '🏐', 3),
  ('Cross country', 'Corsa campestre sugli 8 km.', 'fall', 'individual_race', false, '{"kind":"time","base":1560,"per":12}', '🏃', 4),
  ('Basketball', 'Il basket del palazzetto, la March Madness.', 'winter', 'team_match', false, '{"kind":"points","base":70,"per":3,"jitter":6}', '🏀', 5),
  ('Ice hockey', 'Hockey su ghiaccio.', 'winter', 'team_match', false, '{"kind":"points","base":3,"per":0.5,"jitter":1}', '🏒', 6),
  ('Swimming', 'Nuoto in vasca, 100 metri.', 'winter', 'individual_race', false, '{"kind":"time","base":52,"per":0.4}', '🏊', 7),
  ('Wrestling', 'Lotta libera: dual meet a 10 incontri.', 'winter', 'individual_match', false, '{"kind":"points","bouts":10,"match":{"kind":"points","base":6,"per":1,"jitter":2}}', '🤼', 8),
  ('Scherma', 'Fioretto, spada e sciabola: dual meet a 9 assalti.', 'winter', 'individual_match', false, '{"kind":"points","bouts":9,"match":{"kind":"bout","to":15}}', '🤺', 9),
  ('Baseball / Softball', 'Il diamante in primavera.', 'spring', 'team_match', false, '{"kind":"points","base":5,"per":1,"jitter":2}', '⚾', 10),
  ('Lacrosse', 'Lacrosse maschile e femminile.', 'spring', 'team_match', false, '{"kind":"points","base":11,"per":1.5,"jitter":3}', '🥍', 11),
  ('Track & field', 'Atletica leggera: 400 metri.', 'spring', 'individual_race', false, '{"kind":"time","base":49,"per":0.3}', '🏅', 12),
  ('Tennis', 'Dual match a 6 singolari.', 'spring', 'individual_match', false, '{"kind":"points","bouts":6,"match":{"kind":"tennis"}}', '🎾', 13),
  ('Canottaggio', 'Otto con timoniere sui 2000 metri, nella baia.', 'spring', 'team_race', false, '{"kind":"time","base":350,"per":2}', '🚣', 14)
on conflict (name) do nothing;

insert into public.sport_positions (sport_id, name, attribute_id, skill_id, max_slots, team_bonus, sort_order)
select s.id, v.pos, a.id, sk.id, v.slots, v.bonus, v.ord
from (values
  ('Football', 'Quarterback', 'RIF', 'Sport di squadra', 2, false, 1), ('Football', 'Running back', 'VIG', 'Atletica', 3, false, 2),
  ('Football', 'Wide receiver', 'RIF', 'Atletica', 4, false, 3), ('Football', 'Linea', 'VIG', 'Sport di contatto', 6, false, 4),
  ('Football', 'Difesa', 'VIG', 'Sport di contatto', 6, false, 5), ('Football', 'Kicker', 'RIF', 'Mira e precisione', 1, false, 6),
  ('Soccer', 'Portiere', 'RIF', 'Sport di squadra', 2, false, 1), ('Soccer', 'Difensore', 'VIG', 'Sport di squadra', 4, false, 2),
  ('Soccer', 'Centrocampista', 'VIG', 'Resistenza fisica', 4, false, 3), ('Soccer', 'Attaccante', 'RIF', 'Sport di squadra', 3, false, 4),
  ('Volleyball', 'Palleggiatore', 'RIF', 'Sport di squadra', 2, false, 1), ('Volleyball', 'Schiacciatore', 'VIG', 'Ginnastica e acrobazie', 4, false, 2),
  ('Volleyball', 'Centrale', 'VIG', 'Sport di squadra', 3, false, 3), ('Volleyball', 'Libero', 'RIF', 'Sport di squadra', 1, false, 4),
  ('Cross country', 'Corridore', 'VIG', 'Resistenza fisica', null, false, 1),
  ('Basketball', 'Playmaker', 'RIF', 'Sport di squadra', 2, false, 1), ('Basketball', 'Guardia', 'RIF', 'Mira e precisione', 2, false, 2),
  ('Basketball', 'Ala', 'VIG', 'Sport di squadra', 3, false, 3), ('Basketball', 'Centro', 'VIG', 'Forza', 2, false, 4),
  ('Ice hockey', 'Attaccante', 'RIF', 'Sport di squadra', 4, false, 1), ('Ice hockey', 'Difensore', 'VIG', 'Sport di contatto', 4, false, 2),
  ('Ice hockey', 'Portiere', 'RIF', 'Sport di squadra', 1, false, 3),
  ('Swimming', 'Stile libero', 'VIG', 'Nuoto e sport acquatici', null, false, 1), ('Swimming', 'Dorso', 'VIG', 'Nuoto e sport acquatici', null, false, 2),
  ('Swimming', 'Rana', 'VIG', 'Nuoto e sport acquatici', null, false, 3), ('Swimming', 'Farfalla', 'VIG', 'Nuoto e sport acquatici', null, false, 4),
  ('Wrestling', 'Lottatore', 'VIG', 'Sport di contatto', 10, false, 1),
  ('Scherma', 'Fioretto', 'RIF', 'Scherma', 3, false, 1), ('Scherma', 'Spada', 'RIF', 'Scherma', 3, false, 2), ('Scherma', 'Sciabola', 'RIF', 'Scherma', 3, false, 3),
  ('Baseball / Softball', 'Lanciatore', 'RIF', 'Mira e precisione', 3, false, 1), ('Baseball / Softball', 'Ricevitore', 'RIF', 'Sport di squadra', 1, false, 2),
  ('Baseball / Softball', 'Interno', 'RIF', 'Sport di squadra', 4, false, 3), ('Baseball / Softball', 'Esterno', 'VIG', 'Atletica', 3, false, 4),
  ('Baseball / Softball', 'Battitore designato', 'VIG', 'Forza', 1, false, 5),
  ('Lacrosse', 'Attaccante', 'RIF', 'Sport di squadra', 3, false, 1), ('Lacrosse', 'Centrocampista', 'VIG', 'Resistenza fisica', 3, false, 2),
  ('Lacrosse', 'Difensore', 'VIG', 'Sport di contatto', 3, false, 3), ('Lacrosse', 'Portiere', 'RIF', 'Sport di squadra', 1, false, 4),
  ('Track & field', 'Velocista', 'VIG', 'Atletica', null, false, 1), ('Track & field', 'Mezzofondista', 'VIG', 'Resistenza fisica', null, false, 2),
  ('Track & field', 'Saltatore', 'VIG', 'Ginnastica e acrobazie', null, false, 3), ('Track & field', 'Lanciatore', 'VIG', 'Forza', null, false, 4),
  ('Tennis', 'Singolarista', 'RIF', 'Mira e precisione', 6, false, 1),
  ('Canottaggio', 'Vogatore', 'VIG', 'Forza', 6, false, 1), ('Canottaggio', 'Capovoga', 'VIG', 'Resistenza fisica', 1, false, 2),
  ('Canottaggio', 'Timoniere', 'PRE', 'Leadership', 1, true, 3)
) as v (sport, pos, attr, skill, slots, bonus, ord)
join public.sports s on s.name = v.sport
join public.attributes a on a.code = v.attr
left join public.skills sk on lower(sk.name) = lower(v.skill)
on conflict (sport_id, name) do nothing;

-- rating: la nostra università 12; le rivali tra 8 e 16 (non tutte hanno tutti gli sport)
insert into public.sport_team_ratings (team_id, sport_id, rating)
select t.id, s.id,
  case when t.is_player_school then 12
       when t.is_national then 14 + (abs(hashtext(t.name || s.name)) % 3)
       else 8 + (abs(hashtext(t.name || s.name)) % 9) end
from public.sport_teams t cross join public.sports s
where t.is_player_school or t.is_national or abs(hashtext(s.name || t.name)) % 5 <> 0
on conflict do nothing;

-- =====================================================================
-- SPORT: IL «DOVE» DEI CAMPI NEUTRI E GLI AVVERSARI MANCANTI
-- 1. sport_events.site: per le gare in campo neutro un impianto (inventato)
--    adatto allo sport e alla fase; tutte le gare dello stesso torneo nello
--    stesso posto. Lo mette da sé il trigger sport_events_site anche alle
--    gare nuove (Conference, Nationals, finali); lo staff può cambiarlo.
-- 2. Avversari: ogni rivale della Big West ha la forza in ogni sport attivo;
--    le gare non giocate senza avversari ne ricevono uno coerente (una
--    rivale della Conference, prima quella incontrata meno volte) e i
--    meeting delle gare a cronometro tutta la Conference.
-- =====================================================================

alter table public.sport_events add column if not exists site text not null default '' check (char_length(site) <= 120);

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

create or replace function public.sport_events_site()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.venue = 'neutral' and btrim(coalesce(new.site, '')) = '' then
    new.site := public.sport_neutral_site(new.sport_id, new.phase, new.season_id::text || new.phase);
  end if;
  return new;
end;
$$;
revoke execute on function public.sport_events_site() from public, anon, authenticated;
drop trigger if exists sport_events_site on public.sport_events;
create trigger sport_events_site before insert or update of venue, site on public.sport_events
  for each row execute function public.sport_events_site();

-- le gare in campo neutro che ci sono già
update public.sport_events set site = public.sport_neutral_site(sport_id, phase, season_id::text || phase)
where venue = 'neutral' and site = '';

-- nelle etichette (messaggi di SISTEMA, promemoria) anche il posto
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
    || case when e.venue = 'neutral' and e.site <> '' then ' · ' || e.site else '' end
  from public.sport_events e join public.sports s on s.id = e.sport_id
  where e.id = p_event
$$;
revoke execute on function public.sport_event_label(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. AVVERSARI
-- ---------------------------------------------------------------------
-- ogni rivale della Big West ha la forza in ogni sport attivo
insert into public.sport_team_ratings (team_id, sport_id, rating)
select tm.id, s.id, 8 + (abs(hashtext(tm.name || s.name)) % 9)
from public.sport_teams tm cross join public.sports s
where tm.conference and tm.active and not tm.is_player_school and not tm.is_national and s.status = 'active'
on conflict do nothing;

-- la nostra università in ogni sport attivo
insert into public.sport_team_ratings (team_id, sport_id, rating)
select tm.id, s.id, 12
from public.sport_teams tm cross join public.sports s
where tm.is_player_school and s.status = 'active'
on conflict do nothing;

-- gare non ancora giocate senza avversari
do $$
declare
  v_school uuid := (select id from public.sport_teams where is_player_school limit 1);
  ev record;
  v_rival uuid;
  v_fixed int := 0;
begin
  for ev in
    select e.id, e.season_id, e.sport_id, s.format, s.name
    from public.sport_events e join public.sports s on s.id = e.sport_id
    join public.sport_seasons se on se.id = e.season_id
    where se.status <> 'closed' and e.status in ('scheduled', 'postponed') and e.phase in ('friendly', 'regular')
      and not exists (select 1 from public.sport_event_teams et where et.event_id = e.id and et.team_id <> v_school)
    order by e.starts_at
  loop
    insert into public.sport_event_teams (event_id, team_id) values (ev.id, v_school) on conflict do nothing;
    if ev.format in ('team_race', 'individual_race') then
      -- meeting: tutta la Conference di quello sport
      insert into public.sport_event_teams (event_id, team_id)
      select ev.id, tm.id from public.sport_teams tm
      join public.sport_team_ratings r on r.team_id = tm.id and r.sport_id = ev.sport_id
      where tm.conference and tm.active and not tm.is_player_school
      on conflict do nothing;
    else
      -- la rivale della Conference incontrata meno volte in questa stagione
      select tm.id into v_rival from public.sport_teams tm
      join public.sport_team_ratings r on r.team_id = tm.id and r.sport_id = ev.sport_id
      where tm.conference and tm.active and not tm.is_player_school
      order by (select count(*) from public.sport_events e2 join public.sport_event_teams et2 on et2.event_id = e2.id
                where e2.season_id = ev.season_id and e2.status <> 'cancelled' and et2.team_id = tm.id), random()
      limit 1;
      if v_rival is not null then
        insert into public.sport_event_teams (event_id, team_id) values (ev.id, v_rival) on conflict do nothing;
      end if;
    end if;
    v_fixed := v_fixed + 1;
  end loop;
  raise notice 'Gare a cui ho dato gli avversari: %', v_fixed;
end $$;

-- ---------------------------------------------------------------------
-- 3. CALENDARIO: il posto delle gare in campo neutro
-- ---------------------------------------------------------------------
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
      'location', case e.venue when 'home' then 'In casa' when 'away' then 'In trasferta'
        else 'Campo neutro' || case when e.site <> '' then ' · ' || e.site else '' end end,
      'room_id', e.room_id, 'status', e.status, 'phase', e.phase, 'sport_id', s.id, 'recap', case when e.status = 'published' then e.recap_text end)
    from public.sport_events e join public.sports s on s.id = e.sport_id join public.sport_seasons se on se.id = e.season_id
    where se.status <> 'planning' and e.starts_at >= p_from and e.starts_at < p_to
    union all
    -- Conference e Nationals senza partite della nostra università (in corsa o non qualificata)
    select jsonb_build_object('id', p.key, 'source', 'sport', 'title', p.title, 'description', p.description,
      'category', 'sport', 'starts_at', p.day::timestamp at time zone 'Europe/Rome',
      'ends_at', (p.end_day::timestamp + interval '23 hours 59 minutes') at time zone 'Europe/Rome',
      'location', case when p.locked then 'Senza la nostra università' else 'Sede da definire' end, 'room_id', null, 'phase', p.phase, 'sport_id', p.sport_id, 'all_day', true, 'locked', p.locked)
    from public.sport_calendar_previews((p_from at time zone 'Europe/Rome')::date, (p_to at time zone 'Europe/Rome')::date) p
    where auth.uid() is not null
    union all
    select jsonb_build_object('id', e.id, 'source', 'social', 'title', e.title, 'description', e.description, 'category', 'festa',
      'starts_at', e.starts_at, 'ends_at', e.ends_at, 'location', coalesce(r.name, nullif(e.place, ''), ''), 'room_id', e.room_id,
      'organizer', public.first_name(c.name))
    from public.social_events e join public.characters c on c.id = e.character_id left join public.rooms r on r.id = e.room_id
    where e.visibility = 'pubblico' and e.starts_at < p_to and coalesce(e.ends_at, e.starts_at) >= p_from
    union all
    -- università (tutto il giorno; la settimana degli esami e le pause durano più giorni)
    select jsonb_build_object('id', 'uni-' || a.key, 'source', 'universita', 'title', a.title, 'description', a.description,
      'category', 'universita', 'starts_at', a.day::timestamp at time zone 'Europe/Rome',
      'ends_at', case when a.end_day is not null then (a.end_day::timestamp + interval '23 hours 59 minutes') at time zone 'Europe/Rome' end,
      'location', 'UCSD', 'room_id', null, 'all_day', true)
    from public.academic_calendar_items((p_from at time zone 'Europe/Rome')::date, (p_to at time zone 'Europe/Rome')::date) a
    where auth.uid() is not null
    union all
    -- festività americane
    select jsonb_build_object('id', 'fest-' || h.day, 'source', 'festivita', 'title', h.title, 'description', h.description,
      'category', 'festivita', 'starts_at', h.day::timestamp at time zone 'Europe/Rome', 'ends_at', null,
      'location', '', 'room_id', null, 'all_day', true)
    from generate_series(extract(year from p_from at time zone 'Europe/Rome')::int, extract(year from p_to at time zone 'Europe/Rome')::int) yy
    cross join lateral public.us_holidays(yy) h
    where h.day >= (p_from at time zone 'Europe/Rome')::date and h.day < (p_to at time zone 'Europe/Rome')::date
      and auth.uid() is not null
  ) y (x)
$$;
revoke execute on function public.calendar_range(timestamptz, timestamptz) from public, anon;
grant execute on function public.calendar_range(timestamptz, timestamptz) to authenticated;

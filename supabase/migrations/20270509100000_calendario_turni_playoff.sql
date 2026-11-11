-- =====================================================================
-- CALENDARIO: CONFERENCE E NATIONALS SOLO NEI GIORNI DEI TURNI
-- Prima una voce lunga dal primo all'ultimo turno (compariva in ogni
-- giorno); ora una voce per turno, nel suo giorno, con il nome del turno
-- (Quarti di finale, Semifinali, Finale).
-- =====================================================================

drop function if exists public.sport_calendar_previews(date, date);
create or replace function public.sport_calendar_previews(p_from date, p_to date)
returns table (key text, sport_id uuid, title text, description text, phase text, day date, end_day date, locked boolean, site text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  x record;
  d record;
  v_school uuid := (select id from public.sport_teams where is_player_school limit 1);
  v_name text := coalesce((select name from public.sport_teams where is_player_school limit 1), 'La nostra università');
  v_regular_done boolean;
  v_generated boolean;
  v_rank int;
  v_k int;
  v_ind int;
  v_rounds int;
  v_title text;
  v_lock boolean;
  v_desc text;
  v_site text;
begin
  for x in
    select se.id, se.phase as season_phase, se.qualified_confirmed_at, s.id as sport, s.icon, s.name
    from public.sport_seasons se join public.sports s on s.id = se.sport_id
    where se.status = 'active' and s.status = 'active'
  loop
    select * into d from public.sport_phase_dates(x.id);
    continue when d.conf_start is null;
    continue when d.conf_start > p_to and d.naz_start > p_to;
    continue when d.conf_end < p_from and d.naz_end < p_from;

    -- TORNEO DI CONFERENCE (se la nostra università ci gioca ci sono le sue partite vere)
    if d.conf_start < p_to and d.conf_end >= p_from
       and not exists (select 1 from public.sport_events e join public.sport_event_teams et on et.event_id = e.id and et.team_id = v_school
                       where e.season_id = x.id and e.phase = 'conference' and e.status <> 'cancelled')
       and not exists (select 1 from public.sport_bracket_matches b where b.season_id = x.id and b.phase = 'conference'
                       and v_school in (b.team_a, b.team_b)) then
      v_generated := exists (select 1 from public.sport_bracket_matches b where b.season_id = x.id and b.phase = 'conference')
        or exists (select 1 from public.sport_events e where e.season_id = x.id and e.phase = 'conference')
        or x.season_phase in ('conference', 'nationals');
      v_site := public.sport_neutral_site(x.sport, 'conference', x.id::text || 'conference');
      if v_generated then
        v_lock := true;
        v_title := v_name || ' non qualificata';
        v_desc := 'La nostra università non è entrata nel torneo di Conference: niente gare né convocazioni. Il tabellone completo è nella pagina Sport.';
      else
        v_regular_done := not exists (select 1 from public.sport_events e where e.season_id = x.id and e.phase = 'regular'
                                      and e.status in ('scheduled', 'postponed', 'simulated'));
        v_k := coalesce((select r.conference_teams from public.sport_season_rules r where r.season_id = x.id), 4);
        v_rank := null;
        select (t ->> 'rank')::int into v_rank from jsonb_array_elements(public.sport_table(x.id)) t
        where (t ->> 'team_id')::uuid = v_school;
        v_lock := v_regular_done and v_k > 0 and v_rank is not null and v_rank > v_k;
        v_title := v_name || case
          when v_rank is null then ' in attesa'
          when v_lock then ' non qualificata'
          when v_regular_done then ' qualificata'
          when v_k = 0 then ' in corsa (' || v_rank || 'ª, passano tutte)'
          else ' in corsa (' || v_rank || 'ª, passano le prime ' || v_k || ')' end;
        v_desc := 'Al torneo di Conference vanno le migliori della classifica della stagione regolare'
          || case when v_k > 0 then ' (le prime ' || v_k || ')' else '' end
          || '. Si crea da solo a fine stagione regolare: se la nostra università è qualificata qui compaiono le sue partite, con convocazioni e tiri come le altre gare.';
      end if;
      v_rounds := public.sport_phase_rounds(x.id, 'conference');
      for r in 1..v_rounds loop
        key := 'conf-' || x.id || '-' || r; sport_id := x.sport; phase := 'conference'; site := v_site;
        day := d.conf_start + 7 * (r - 1); end_day := day; locked := v_lock; description := v_desc;
        title := x.icon || ' ' || x.name || ' · Conference'
          || case when v_rounds > 1 then ' · ' || public.sport_round_name((2 ^ (v_rounds - r))::int) else '' end
          || ' — ' || v_title;
        if day < p_to and day >= p_from then return next; end if;
      end loop;
    end if;

    -- NATIONALS
    if d.naz_start < p_to and d.naz_end >= p_from
       and not exists (select 1 from public.sport_events e join public.sport_event_teams et on et.event_id = e.id and et.team_id = v_school
                       where e.season_id = x.id and e.phase = 'national' and e.status <> 'cancelled')
       and not exists (select 1 from public.sport_bracket_matches b where b.season_id = x.id and b.phase = 'nationals'
                       and v_school in (b.team_a, b.team_b)) then
      v_generated := exists (select 1 from public.sport_bracket_matches b where b.season_id = x.id and b.phase = 'nationals')
        or exists (select 1 from public.sport_events e where e.season_id = x.id and e.phase = 'national')
        or x.season_phase = 'nationals';
      select count(*) into v_ind from public.sport_qualifications q
      where q.season_id = x.id and q.kind = 'individual' and q.status = 'qualificato';
      v_site := public.sport_neutral_site(x.sport, 'national', x.id::text || 'national');
      if v_generated or (x.qualified_confirmed_at is not null and not public.sport_can_play_nationals(x.id, v_school)) then
        v_lock := true;
        v_title := v_name || ' non qualificata';
        v_desc := 'La nostra università non si è qualificata ai Nationals: niente gare né convocazioni. Il tabellone completo è nella pagina Sport.';
      else
        v_lock := false;
        v_title := case
          when x.qualified_confirmed_at is not null then v_name || ' qualificata'
          else 'qualificazione da decidere' end
          || case when v_ind > 0 then ' · ' || v_ind || case when v_ind = 1 then ' atleta qualificato' else ' atleti qualificati' end else '' end;
        v_desc := 'Ai Nationals vanno le squadre qualificate (si confermano da sole alla fine della Conference) e, negli sport individuali, gli atleti qualificati con i loro voti. Se la nostra università è qualificata qui compaiono le sue partite, con convocazioni e tiri come le altre gare. Chi non è qualificato non può essere convocato.';
      end if;
      v_rounds := public.sport_phase_rounds(x.id, 'nationals');
      for r in 1..v_rounds loop
        key := 'naz-' || x.id || '-' || r; sport_id := x.sport; phase := 'national'; site := v_site;
        day := d.naz_start + 7 * (r - 1); end_day := day; locked := v_lock; description := v_desc;
        title := x.icon || ' ' || x.name || ' · Nationals'
          || case when v_rounds > 1 then ' · ' || public.sport_round_name((2 ^ (v_rounds - r))::int) else '' end
          || ' — ' || v_title;
        if day < p_to and day >= p_from then return next; end if;
      end loop;
    end if;
  end loop;
end;
$$;
revoke execute on function public.sport_calendar_previews(date, date) from public, anon, authenticated;

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
      'ends_at', case when p.end_day > p.day then (p.end_day::timestamp + interval '23 hours 59 minutes') at time zone 'Europe/Rome' end,
      'location', case when p.locked then 'Senza la nostra università · ' else 'Campo neutro · ' end || p.site, 'room_id', null, 'phase', p.phase, 'sport_id', p.sport_id, 'all_day', true, 'locked', p.locked)
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

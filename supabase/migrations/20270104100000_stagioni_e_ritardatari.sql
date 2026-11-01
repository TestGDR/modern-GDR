-- =====================================================================
-- STAGIONI SPORTIVE 2026-27 E PROTEZIONE DI CHI ARRIVA A STAGIONE IN CORSO
-- 1. Chi entra a semestre o stagione già iniziati: quel semestre/quella
--    stagione non gli fa perdere la borsa (vale come se avesse il minimo:
--    GPA 2.5 / media pagelle 6). Accademico: iscrizioni ai corsi fatte
--    dopo l'inizio del semestre. Sport: ingresso in squadra dopo l'inizio
--    della stagione.
-- 2. Una stagione "2026-27" per ogni sport attivo che non ne ha una aperta:
--    calendario generato con le rivali, stagione avviata (autunno e
--    inverno; la primavera resta in preparazione) e gare già passate
--    simulate e pubblicate.
-- =====================================================================

-- 1a. Inizio "vero" del semestre (started_at cambia se si riaprono le iscrizioni)
alter table public.academic_terms add column if not exists first_started_at timestamptz;
update public.academic_terms set first_started_at = started_at where first_started_at is null and started_at is not null;

create or replace function public.academic_terms_first_start()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.started_at is not null and old.first_started_at is null then
    new.first_started_at := new.started_at;
  end if;
  return new;
end;
$$;
revoke execute on function public.academic_terms_first_start() from public, anon, authenticated;
drop trigger if exists academic_terms_first_start on public.academic_terms;
create trigger academic_terms_first_start before update of started_at on public.academic_terms
  for each row execute function public.academic_terms_first_start();

-- 1b. Arrivato a semestre in corso: tutte le sue iscrizioni dopo l'inizio
create or replace function public.academic_late_term(p_character uuid, p_term uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.academic_terms t where t.id = p_term and t.first_started_at is not null)
    and exists (select 1 from public.enrollments e where e.character_id = p_character and e.term_id = p_term)
    and not exists (
      select 1 from public.enrollments e join public.academic_terms t on t.id = e.term_id
      where e.character_id = p_character and e.term_id = p_term and e.created_at <= t.first_started_at)
$$;
revoke execute on function public.academic_late_term(uuid, uuid) from public, anon, authenticated;

-- 1c. Arrivato a stagione in corso: in squadra solo dopo l'inizio della stagione
create or replace function public.sport_late_season(p_character uuid, p_season uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.sport_seasons s
    where s.id = p_season and s.started_at is not null
      and not exists (select 1 from public.sport_roster ro
                      where ro.character_id = p_character and ro.sport_id = s.sport_id and ro.joined_at <= s.started_at))
$$;
revoke execute on function public.sport_late_season(uuid, uuid) from public, anon, authenticated;

-- 1d. Le borse non si perdono nel semestre o nella stagione d'arrivo
create or replace function public.merit_scholarship_lost(p_character uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.term_reports tr join public.academic_terms t on t.id = tr.term_id
    where tr.character_id = p_character and t.status = 'published'
      and not public.academic_late_term(p_character, t.id)
      and (tr.standing_after in ('probation', 'suspended', 'dismissed')
           or (tr.credits_attempted > 0 and tr.term_gpa < coalesce(public.uni_n('uni_borsa_gpa_min'), 2.5)))
  )
$$;
revoke execute on function public.merit_scholarship_lost(uuid) from public, anon, authenticated;

create or replace function public.athletic_scholarship_lost(p_character uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.sport_event_rolls er
    join public.sport_events e on e.id = er.event_id and e.status = 'published'
    join public.sport_seasons s on s.id = e.season_id and s.status = 'closed'
    where er.character_id = p_character and not public.sport_late_season(p_character, s.id)
    group by s.id
    having avg(er.grade) < coalesce(public.uni_n('sport_borsa_media_min'), 6)
  )
$$;
revoke execute on function public.athletic_scholarship_lost(uuid) from public, anon, authenticated;

create or replace function public.academic_terms_scholarship_notice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_min numeric := coalesce(public.uni_n('uni_borsa_gpa_min'), 2.5);
begin
  if new.status <> 'published' or old.status = 'published' then
    return null;
  end if;
  for r in
    select c.id, c.owner_id, c.name, tr.standing_after
    from public.term_reports tr join public.characters c on c.id = tr.character_id
    where tr.term_id = new.id
      and public.trait_flag(c.id, 'scholarship')
      and not public.academic_late_term(c.id, new.id)
      and (tr.standing_after in ('probation', 'suspended', 'dismissed') or (tr.credits_attempted > 0 and tr.term_gpa < v_min))
      and not exists (
        select 1 from public.term_reports p join public.academic_terms t on t.id = p.term_id
        where p.character_id = c.id and p.term_id <> new.id and t.status = 'published'
          and not public.academic_late_term(c.id, t.id)
          and (p.standing_after in ('probation', 'suspended', 'dismissed') or (p.credits_attempted > 0 and p.term_gpa < v_min)))
  loop
    perform public.send_system_message(r.owner_id,
      '🎓 ' || public.first_name(r.name) || ' ha perso la Borsa di studio accademica: '
      || case when r.standing_after in ('probation', 'suspended', 'dismissed') then 'il semestre l''ha portato in Academic Probation'
              else 'il GPA del semestre è sotto ' || to_char(v_min, 'FM0.0') end
      || '. Da ora retta del college e camera si pagano ogni mese (Utility → Servizi bancari).');
  end loop;
  return null;
end;
$$;
revoke execute on function public.academic_terms_scholarship_notice() from public, anon, authenticated;

create or replace function public.sport_seasons_scholarship_notice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_min numeric := coalesce(public.uni_n('sport_borsa_media_min'), 6);
begin
  if new.status <> 'closed' or old.status = 'closed' then
    return null;
  end if;
  for r in
    select c.id, c.owner_id, c.name, round(avg(er.grade), 1) as media
    from public.sport_event_rolls er
    join public.sport_events e on e.id = er.event_id and e.season_id = new.id and e.status = 'published'
    join public.characters c on c.id = er.character_id
    where (public.trait_flag(c.id, 'athletic_scholarship')
           or exists (select 1 from public.sport_roster ro where ro.character_id = c.id and ro.scholarship))
      and not public.sport_late_season(c.id, new.id)
    group by c.id, c.owner_id, c.name
    having avg(er.grade) < v_min
      and not exists (
        select 1 from public.sport_event_rolls er2
        join public.sport_events e2 on e2.id = er2.event_id and e2.status = 'published'
        join public.sport_seasons s2 on s2.id = e2.season_id and s2.status = 'closed' and s2.id <> new.id
        where er2.character_id = c.id and not public.sport_late_season(c.id, s2.id)
        group by s2.id
        having avg(er2.grade) < v_min)
  loop
    perform public.send_system_message(r.owner_id,
      '🏅 ' || public.first_name(r.name) || ' ha perso la Borsa di studio sportiva: la media delle pagelle della stagione è '
      || to_char(r.media, 'FM90.0') || ', sotto ' || to_char(v_min, 'FM90') || '. Da ora retta del college e camera si pagano ogni mese (Utility → Servizi bancari).');
  end loop;
  return null;
end;
$$;
revoke execute on function public.sport_seasons_scholarship_notice() from public, anon, authenticated;

-- 2. Stagioni 2026-27 (le funzioni dello sport chiedono il permesso:
--    dall'SQL Editor si agisce come l'Amministratore)
do $$
declare
  v_admin uuid := (select p.id from public.profiles p join public.user_levels l on l.id = p.level_id
                   where l.is_admin order by p.created_at limit 1);
  sp record;
  ev record;
  v_season uuid;
  v_start timestamptz;
  v_days int;
  v_events int;
begin
  if v_admin is null then raise exception 'Nessun Amministratore trovato.'; end if;
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  for sp in
    select s.* from public.sports s
    where s.status = 'active'
      and not exists (select 1 from public.sport_seasons se where se.sport_id = s.id and se.status <> 'closed')
    order by s.sort_order, s.name
  loop
    -- calendario: autunno da settembre, inverno da metà novembre, primavera da febbraio
    v_start := case sp.season
      when 'fall' then timestamptz '2026-09-05 19:00 Europe/Rome'
      when 'winter' then timestamptz '2026-11-14 19:00 Europe/Rome'
      when 'spring' then timestamptz '2027-02-13 19:00 Europe/Rome'
      else timestamptz '2026-09-05 19:00 Europe/Rome' end;
    -- gare (meeting, regate, competizioni) ogni 3 settimane; partite ogni 10 giorni in autunno, ogni settimana poi
    v_days := case when sp.format in ('team_race', 'individual_race') then 21 when sp.season = 'fall' then 10 else 7 end;

    v_season := null;
    insert into public.sport_seasons (sport_id, label) values (sp.id, '2026-27')
    on conflict (sport_id, label) do nothing
    returning id into v_season;
    continue when v_season is null;

    v_events := public.sport_season_generate(v_season, v_start, v_days);
    raise notice '% · % eventi in calendario', sp.name, v_events;

    -- la primavera resta in preparazione (si avvia a febbraio da Gestione → Sport)
    continue when sp.season = 'spring' or v_events = 0;

    update public.sport_seasons set status = 'active' where id = v_season;
    update public.sport_seasons set started_at = v_start where id = v_season;

    -- le gare già passate: simulate e pubblicate, dalla più vecchia
    for ev in
      select id from public.sport_events where season_id = v_season and status = 'scheduled' and starts_at < now() order by starts_at
    loop
      begin
        perform public.sport_event_simulate(ev.id);
        perform public.sport_event_publish(ev.id);
      exception when others then
        raise notice '% · gara saltata: %', sp.name, sqlerrm;
      end;
    end loop;
  end loop;
end;
$$;

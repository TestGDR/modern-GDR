-- =====================================================================
-- CALENDARIO: DATE DELL'UNIVERSITÀ E FESTIVITÀ AMERICANE
-- calendar_range aggiunge, calcolati ogni volta (niente da riempire a mano):
-- - source 'universita': per ogni semestre (anche quelli futuri, con le date
--   del calendario americano; per quelli già creati le date vere) apertura
--   iscrizioni, inizio lezioni, fine lezioni, inizio e fine della settimana
--   degli esami, risultati; in più Thanksgiving break e Spring break.
-- - source 'festivita': le feste americane (date fisse e mobili, Pasqua).
-- Tutto il giorno (all_day), in ora italiana.
-- =====================================================================

-- n-esimo giorno della settimana del mese (dow: 0 = domenica … 6 = sabato); n = -1 l'ultimo
create or replace function public.nth_weekday(p_year int, p_month int, p_dow int, p_n int)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  d date;
begin
  if p_n > 0 then
    d := make_date(p_year, p_month, 1);
    d := d + ((p_dow - extract(dow from d)::int + 7) % 7);
    return d + (p_n - 1) * 7;
  end if;
  d := (make_date(p_year, p_month, 1) + interval '1 month' - interval '1 day')::date;
  return d - ((extract(dow from d)::int - p_dow + 7) % 7);
end;
$$;
revoke execute on function public.nth_weekday(int, int, int, int) from public, anon, authenticated;

-- Domenica di Pasqua (calendario gregoriano)
create or replace function public.easter_date(p_year int)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  a int := p_year % 19; b int := p_year / 100; c int := p_year % 100;
  d int := b / 4; e int := b % 4; f int := (b + 8) / 25; g int := (b - f + 1) / 3;
  h int := (19 * a + b - d - g + 15) % 30; i int := c / 4; k int := c % 4;
  l int := (32 + 2 * e + 2 * i - h - k) % 7; m int := (a + 11 * h + 22 * l) / 451;
begin
  return make_date(p_year, (h + l - 7 * m + 114) / 31, ((h + l - 7 * m + 114) % 31) + 1);
end;
$$;
revoke execute on function public.easter_date(int) from public, anon, authenticated;

-- Feste americane di un anno
create or replace function public.us_holidays(p_year int)
returns table (day date, title text, description text)
language sql
immutable
set search_path = ''
as $$
  select * from (values
    (make_date(p_year, 1, 1), '🎆 New Year''s Day', 'Capodanno: campus chiuso, si smaltisce la festa.'),
    (public.nth_weekday(p_year, 1, 1, 3), '✊ Martin Luther King Jr. Day', 'Terzo lunedì di gennaio: niente lezioni, giornata di servizio alla comunità.'),
    (make_date(p_year, 2, 14), '💘 San Valentino', 'Cioccolatini, appuntamenti e cuori infranti.'),
    (public.nth_weekday(p_year, 2, 1, 3), '🇺🇸 Presidents'' Day', 'Terzo lunedì di febbraio: festa federale e saldi nei negozi.'),
    (make_date(p_year, 3, 17), '☘️ St. Patrick''s Day', 'Tutti in verde, birra e parate.'),
    (public.easter_date(p_year), '🐣 Pasqua', 'Brunch in famiglia e caccia alle uova.'),
    (public.nth_weekday(p_year, 5, 0, 2), '💐 Festa della mamma', 'Seconda domenica di maggio.'),
    (public.nth_weekday(p_year, 5, 1, -1), '🎖️ Memorial Day', 'Ultimo lunedì di maggio: si ricordano i caduti e inizia l''estate.'),
    (public.nth_weekday(p_year, 6, 0, 3), '👔 Festa del papà', 'Terza domenica di giugno.'),
    (make_date(p_year, 6, 19), '✊🏾 Juneteenth', 'La fine della schiavitù negli Stati Uniti.'),
    (make_date(p_year, 7, 4), '🎇 Independence Day', 'Il 4 luglio: barbecue, parate e fuochi d''artificio sulla baia.'),
    (public.nth_weekday(p_year, 9, 1, 1), '🛠️ Labor Day', 'Primo lunedì di settembre: l''ultimo weekend lungo dell''estate.'),
    (public.nth_weekday(p_year, 10, 1, 2), '🌎 Indigenous Peoples'' Day', 'Secondo lunedì di ottobre (Columbus Day).'),
    (make_date(p_year, 10, 31), '🎃 Halloween', 'Costumi, feste e dolcetto o scherzetto.'),
    (make_date(p_year, 11, 11), '🎗️ Veterans Day', 'Si onorano i veterani.'),
    (public.nth_weekday(p_year, 11, 4, 4), '🦃 Thanksgiving', 'Quarto giovedì di novembre: tacchino, famiglia e football.'),
    (public.nth_weekday(p_year, 11, 4, 4) + 1, '🛍️ Black Friday', 'Il giorno degli sconti.'),
    (make_date(p_year, 12, 24), '🎄 Vigilia di Natale', 'Luci, regali e cena della vigilia.'),
    (make_date(p_year, 12, 25), '🎁 Natale', 'Campus vuoto: tutti a casa per le feste.'),
    (make_date(p_year, 12, 31), '🥂 Capodanno (vigilia)', 'Countdown e brindisi a mezzanotte.')
  ) as h (day, title, description)
$$;
revoke execute on function public.us_holidays(int) from public, anon, authenticated;

-- Date dell'università per un periodo: semestri esistenti con le loro date, quelli futuri con il calendario
create or replace function public.academic_calendar_items(p_from date, p_to date)
returns table (day date, end_day date, title text, description text, key text)
language sql
stable
security definer
set search_path = ''
as $$
  with years as (
    select y from generate_series(extract(year from p_from)::int - 1, extract(year from p_to)::int) y
  ), terms as (
    select ys.y, s.sem, (ys.y::text || '-' || lpad(((ys.y + 1) % 100)::text, 2, '0')) as ay
    from years ys cross join (values ('fall'), ('spring')) as s (sem)
  ), dated as (
    select public.uni_term_label(tm.ay, tm.sem) as label, tm.sem, tm.y,
           coalesce(t.registration_date, d.registration_date) as reg,
           coalesce(t.classes_start, d.classes_start) as cls,
           coalesce(t.exams_start, d.exams_start) as ex1,
           coalesce(t.exams_end, d.exams_end) as ex2,
           coalesce(t.results_date, d.results_date) as res
    from terms tm
    cross join lateral public.uni_term_dates(tm.ay, tm.sem) d
    left join public.academic_terms t on t.academic_year = tm.ay and t.semester = tm.sem
  ), items as (
    select reg as day, null::date as end_day, '🎓 Aperte le iscrizioni · ' || label as title,
           'Si scelgono i corsi del semestre dall''icona Università.' as description, 'reg-' || label as key from dated
    union all
    select cls, null, '📚 Inizio lezioni · ' || label, 'Le iscrizioni si chiudono: da oggi compiti, paper e assignment.', 'cls-' || label from dated
    union all
    select ex1 - 1, null, '📕 Ultimo giorno di lezioni · ' || label, 'Da domani la settimana degli esami.', 'end-' || label from dated
    union all
    select ex1, ex2, '📝 Settimana degli esami · ' || label,
           'Esami dal ' || to_char(ex1, 'DD/MM') || ' al ' || to_char(ex2, 'DD/MM') || '. I ritiri sono chiusi.', 'ex-' || label from dated
    union all
    select res, null, '📜 Risultati · ' || label, 'Escono pagelle, GPA e lauree del semestre.', 'res-' || label from dated
    union all
    -- pause: Thanksgiving break (dal mercoledì alla domenica) e Spring break (seconda settimana piena di marzo)
    select public.nth_weekday(y, 11, 4, 4) - 1, public.nth_weekday(y, 11, 4, 4) + 3, '🍂 Thanksgiving break',
           'Niente lezioni da mercoledì a domenica: si torna a casa per il Ringraziamento.', 'tg-' || y from dated where sem = 'fall'
    union all
    select public.nth_weekday(y + 1, 3, 1, 2), public.nth_weekday(y + 1, 3, 1, 2) + 6, '🌴 Spring break',
           'Una settimana senza lezioni: spiagge, viaggi e feste.', 'sb-' || (y + 1) from dated where sem = 'spring'
  )
  select day, end_day, title, description, key from items
  where coalesce(end_day, day) >= p_from and day <= p_to;
$$;
revoke execute on function public.academic_calendar_items(date, date) from public, anon, authenticated;

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

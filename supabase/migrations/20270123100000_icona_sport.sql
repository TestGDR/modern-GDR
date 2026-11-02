-- =====================================================================
-- ICONA DEGLI SPORT CON UN LINK
-- Accanto all'emoji (che resta per menu a tendina e resoconti) ogni sport
-- può avere un'immagine (link https, 30×30): si vede nella pagina Sport e
-- diventa l'icona del gruppo della squadra (scheda, elenco degli online).
-- =====================================================================

alter table public.sports add column if not exists icon_url text
  check (icon_url is null or (icon_url ~ '^https://' and char_length(icon_url) <= 500));

-- chi aveva già messo l'icona al gruppo della squadra la ritrova nello sport
update public.sports s set icon_url = g.icon_url
from public.game_groups g
where g.id = s.group_id and s.icon_url is null and g.icon_url is not null;

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
    insert into public.game_groups (name, description, kind, active, icon_url)
    values (left(new.name, 60), 'Squadra di ' || new.name || ' dell''Athletic Department.', 'sport', new.status = 'active', new.icon_url)
    returning id into v_group;
    insert into public.group_roles (group_id, name, description, salary, sort_order)
    values (v_group, 'Atleta', 'Student-athlete della squadra, senza un ruolo.', 0, 999);
    new.group_id := v_group;
  elsif new.group_id is not null then
    update public.game_groups set name = left(new.name, 60), active = new.status = 'active', icon_url = new.icon_url where id = new.group_id;
  end if;
  return new;
end;
$$;
revoke execute on function public.sports_group_sync() from public, anon, authenticated;
drop trigger if exists sports_group_sync on public.sports;
create trigger sports_group_sync before insert or update of name, status, icon_url on public.sports
  for each row execute function public.sports_group_sync();

-- pagina Sport: anche il link dell'icona
create or replace function public.sport_my(p_character uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'roster_id', ro.id, 'sport_id', ro.sport_id, 'sport', s.name, 'icon', s.icon, 'icon_url', s.icon_url, 'season', s.season, 'format', s.format,
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
               where e.sport_id = ro.sport_id and se.status = 'active' and e.status in ('simulated', 'published')),
    -- stagione in corso (o l'ultima): eventi e media voto
    'season_label', cur.label,
    'season_events', (select count(*) from public.sport_event_rolls x join public.sport_events e on e.id = x.event_id
               where x.character_id = ro.character_id and e.season_id = cur.id and e.status = 'published'),
    'season_avg', (select round(avg(x.grade), 1) from public.sport_event_rolls x join public.sport_events e on e.id = x.event_id
               where x.character_id = ro.character_id and e.season_id = cur.id and e.status = 'published'),
    'athletic_scholarship', ro.scholarship or public.trait_flag(ro.character_id, 'athletic_scholarship'),
    'scholarship_min', coalesce(public.uni_n('sport_borsa_media_min'), 6),
    -- allenamento settimanale
    'form', public.sport_training_form(ro.character_id, ro.sport_id),
    'training_max', coalesce(public.setting_int('sport_allenamento_max'), 2),
    'trainer_until', ro.trainer_until,
    'trainer_price', coalesce(public.setting_int('servizio_trainer'), 300),
    'physio_price', coalesce(public.setting_int('servizio_fisio'), 1500),
    'last_training', (select jsonb_build_object('at', t.created_at, 'success', t.success, 'total', t.total, 'cd', t.cd, 'd10', t.d10, 'crit', t.crit)
               from public.sport_trainings t where t.character_id = ro.character_id and t.sport_id = ro.sport_id order by t.created_at desc limit 1),
    'next_training_at', (select max(t.created_at) + make_interval(days => greatest(1, coalesce(public.setting_int('sport_allenamento_giorni'), 7)))
               from public.sport_trainings t where t.character_id = ro.character_id and t.sport_id = ro.sport_id)
  ) order by s.name), '[]'::jsonb)
  from public.sport_roster ro join public.sports s on s.id = ro.sport_id
  left join public.sport_positions p on p.id = ro.position_id
  left join public.sport_athletes a on a.character_id = ro.character_id and a.sport_id = ro.sport_id
  left join lateral (
    select se.id, se.label from public.sport_seasons se
    where se.sport_id = ro.sport_id and se.status <> 'planning'
    order by (se.status = 'active') desc, se.created_at desc limit 1
  ) cur on true
  where ro.character_id = p_character and ro.left_at is null
$$;

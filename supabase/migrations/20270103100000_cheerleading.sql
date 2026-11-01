-- =====================================================================
-- CHEERLEADING
-- Sport di gara a squadre (piazzamento con un punteggio dei giudici),
-- con i ruoli dello squad: flyer, base, back spot, tumbler, dancer e
-- coreografo/a (conta doppio per la squadra, come il timoniere).
-- Il risultato mostra il punteggio (non il tempo): profilo "score".
-- =====================================================================

-- 1. Punteggio dei giudici per le gare a squadre con profilo "score"
create or replace function public.sport_time(p_profile jsonb, p_total numeric)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v numeric;
begin
  -- punteggio: più alto è meglio (es. 92.40 punti)
  if p_profile ->> 'kind' = 'score' then
    v := least(coalesce((p_profile ->> 'max')::numeric, 100),
      greatest(0, coalesce((p_profile ->> 'base')::numeric, 85) + (p_total - 15) * coalesce((p_profile ->> 'per')::numeric, 1)
        + (random() - 0.5) * coalesce((p_profile ->> 'per')::numeric, 1)));
    return to_char(v, 'FM990.00') || ' punti';
  end if;
  v := greatest(1, coalesce((p_profile ->> 'base')::numeric, 60) - (p_total - 15) * coalesce((p_profile ->> 'per')::numeric, 0.5)
    + (random() - 0.5) * coalesce((p_profile ->> 'per')::numeric, 0.5));
  if v >= 60 then
    return floor(v / 60)::int || ':' || to_char(v - floor(v / 60) * 60, 'FM00.0');
  end if;
  return to_char(v, 'FM990.00');
end;
$$;
revoke execute on function public.sport_time(jsonb, numeric) from public, anon, authenticated;

-- nel resoconto delle gare a punteggio si legge "punteggio", non "tempo"
create or replace function public.sport_events_score_label()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.recap_text is distinct from old.recap_text
     and exists (select 1 from public.sports s where s.id = new.sport_id and s.score_profile ->> 'kind' = 'score') then
    new.recap_text := replace(new.recap_text, ' · tempo ', ' · punteggio ');
  end if;
  return new;
end;
$$;
revoke execute on function public.sport_events_score_label() from public, anon, authenticated;
drop trigger if exists sport_events_score_label on public.sport_events;
create trigger sport_events_score_label before update of recap_text on public.sport_events
  for each row execute function public.sport_events_score_label();

-- 2. Lo sport (crea da solo il suo gruppo "squadra")
insert into public.sports (name, description, season, format, allows_draw, score_profile, icon, sort_order)
values ('Cheerleading',
  'Cheerleading competitivo: lo squad sostiene le squadre del college a bordo campo e gareggia nelle competizioni di Conference con routine di acrobazie, piramidi e coreografie, giudicate a punti.',
  'winter', 'team_race', false, '{"kind":"score","base":86,"per":1.2,"max":100}', '📣', 15)
on conflict (name) do nothing;

-- 3. I ruoli
insert into public.sport_positions (sport_id, name, attribute_id, skill_id, max_slots, team_bonus, sort_order)
select s.id, v.pos, a.id, sk.id, v.slots, v.bonus, v.ord
from (values
  ('Flyer', 'VIG', 'Ginnastica e acrobazie', 4, false, 1),
  ('Base', 'VIG', 'Forza', 8, false, 2),
  ('Back spot', 'VIG', 'Forza', 4, false, 3),
  ('Tumbler', 'VIG', 'Ginnastica e acrobazie', 4, false, 4),
  ('Dancer', 'RIF', 'Danza', 4, false, 5),
  ('Coreografo/a', 'PRE', 'Leadership', 1, true, 6)
) as v (pos, attr, skill, slots, bonus, ord)
join public.sports s on s.name = 'Cheerleading'
join public.attributes a on a.code = v.attr
left join public.skills sk on lower(sk.name) = lower(v.skill)
on conflict (sport_id, name) do nothing;

-- 4. Forza delle squadre (la nostra 12, le rivali tra 8 e 16, come per gli altri sport)
insert into public.sport_team_ratings (team_id, sport_id, rating)
select t.id, s.id,
  case when t.is_player_school then 12
       when t.is_national then 14 + (abs(hashtext(t.name || s.name)) % 3)
       else 8 + (abs(hashtext(t.name || s.name)) % 9) end
from public.sport_teams t cross join public.sports s
where s.name = 'Cheerleading'
  and (t.is_player_school or t.is_national or abs(hashtext(s.name || t.name)) % 5 <> 0)
on conflict do nothing;

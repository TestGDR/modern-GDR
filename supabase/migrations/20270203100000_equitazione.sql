-- =====================================================================
-- EQUITAZIONE
-- Squadra equestre del college (stile NCEA): dual meet contro un'altra
-- università, ogni cavaliere gareggia nella sua disciplina contro un
-- avversario e i giudici danno un punteggio; vince chi porta a casa più
-- confronti (18: 3 per disciplina, i posti vuoti li coprono i PNG).
-- Discipline = ruoli: tutte con l'abilità Equitazione, cambia la
-- caratteristica. Stagione di primavera: resta in preparazione e si
-- avvia da Gestione → Sport.
-- =====================================================================

-- 1. Lo sport (crea da solo il suo gruppo "squadra")
insert into public.sports (name, description, season, format, allows_draw, score_profile, icon, sort_order)
values ('Equitazione',
  'La squadra equestre del college: monta inglese (salto ostacoli, piano, dressage, completo) e monta western (reining, horsemanship). Nei dual meet i cavalieri delle due università montano a turno e i giudici danno un punteggio a ogni prova: vince la squadra che porta a casa più confronti.',
  'spring', 'individual_match', false, '{"kind":"points","bouts":18,"match":{"kind":"points","base":80,"per":1,"jitter":3}}', '🏇', 16)
on conflict (name) do nothing;

-- 2. Le discipline (ruoli)
insert into public.sport_positions (sport_id, name, attribute_id, skill_id, max_slots, team_bonus, sort_order)
select s.id, v.pos, a.id, sk.id, v.slots, v.bonus, v.ord
from (values
  ('Salto ostacoli', 'RIF', 'Equitazione', 3, false, 1),
  ('Equitazione in piano', 'RIF', 'Equitazione', 3, false, 2),
  ('Dressage', 'EMP', 'Equitazione', 3, false, 3),
  ('Completo (cross country)', 'VIG', 'Equitazione', 3, false, 4),
  ('Reining (western)', 'RIF', 'Equitazione', 3, false, 5),
  ('Horsemanship (western)', 'EMP', 'Equitazione', 3, false, 6)
) as v (pos, attr, skill, slots, bonus, ord)
join public.sports s on s.name = 'Equitazione'
join public.attributes a on a.code = v.attr
left join public.skills sk on lower(sk.name) = lower(v.skill)
on conflict (sport_id, name) do nothing;

-- 3. Forza delle squadre (la nostra 12, le rivali tra 8 e 16, come per gli altri sport)
insert into public.sport_team_ratings (team_id, sport_id, rating)
select t.id, s.id,
  case when t.is_player_school then 12
       when t.is_national then 14 + (abs(hashtext(t.name || s.name)) % 3)
       else 8 + (abs(hashtext(t.name || s.name)) % 9) end
from public.sport_teams t cross join public.sports s
where s.name = 'Equitazione'
  and (t.is_player_school or t.is_national or abs(hashtext(s.name || t.name)) % 5 <> 0)
on conflict do nothing;

-- 4. Stagione 2026-27 in preparazione, con il calendario da febbraio (un meet a settimana)
--    (le funzioni dello sport chiedono il permesso: dall'SQL Editor si agisce come l'Amministratore)
do $$
declare
  v_admin uuid := (select p.id from public.profiles p join public.user_levels l on l.id = p.level_id
                   where l.is_admin order by p.created_at limit 1);
  v_sport uuid := (select id from public.sports where name = 'Equitazione');
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
  v_events := public.sport_season_generate(v_season, timestamptz '2027-02-13 19:00 Europe/Rome', 7);
  raise notice 'Equitazione · % eventi in calendario', v_events;
end;
$$;

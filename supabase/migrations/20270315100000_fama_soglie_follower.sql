-- =====================================================================
-- FAMA: SOGLIE DEI FOLLOWER PIÙ ALTE
-- 10.000 Noto nel campus, 25.000 Popolare, 50.000 Influente,
-- 100.000 Celebre, 250.000 Star, 1.000.000 Icona; Leggenda solo giocando.
-- Poi tutti ricalcolati (chi cambia livello riceve l'avviso).
-- =====================================================================

update public.fame_levels l set min_followers = v.followers
from (values
  ('Noto nel campus', 10000),
  ('Popolare', 25000),
  ('Influente', 50000),
  ('Celebre', 100000),
  ('Star', 250000),
  ('Icona', 1000000)
) as v (name, followers)
where l.kind = 'fama' and l.name = v.name;

do $$
declare
  r record;
begin
  for r in select id from public.characters loop
    perform public.fame_recalc(r.id);
  end loop;
end $$;

select name as livello, min_points as da_punti, min_followers as oppure_follower
from public.fame_levels where kind = 'fama' order by min_points;

-- =====================================================================
-- UNIVERSITÀ RIVALI CON NOMI REALI
-- La UCSD gioca nella Big West Conference: le 7 rivali di Conference
-- diventano le università di quella conference, le 4 nazionali grandi
-- università americane. Si aggiornano anche i resoconti delle gare.
-- Nickname della UCSD: Tritons.
-- =====================================================================
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('Coral Coast University', 'UC Irvine', 'Anteaters'),
      ('Gulfport State', 'UC Santa Barbara', 'Gauchos'),
      ('Everglades Institute of Technology', 'UC Davis', 'Aggies'),
      ('Palm Harbor College', 'UC Riverside', 'Highlanders'),
      ('Sawgrass University', 'Long Beach State', 'Beach'),
      ('Biscayne Bay College', 'Cal Poly', 'Mustangs'),
      ('Seminole Ridge University', 'Hawai''i', 'Rainbow Warriors'),
      ('Northgate University', 'UCLA', 'Bruins'),
      ('Pacific Crest University', 'USC', 'Trojans'),
      ('Great Lakes State', 'Michigan', 'Wolverines'),
      ('Appalachian Union', 'Stanford', 'Cardinal')
    ) as v (old_name, new_name, nick)
  loop
    if exists (select 1 from public.sport_teams where name = r.old_name)
       and not exists (select 1 from public.sport_teams where name = r.new_name) then
      update public.sport_teams set name = r.new_name, nickname = r.nick where name = r.old_name;
      update public.sport_events set recap_text = replace(recap_text, r.old_name, r.new_name) where recap_text like '%' || r.old_name || '%';
      update public.sport_event_rolls set opponent = r.new_name where opponent = r.old_name;
    end if;
  end loop;
  update public.sport_teams set nickname = 'Tritons' where is_player_school and nickname = 'Flamingos';
end;
$$;

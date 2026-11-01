-- La squadra dei personaggi si chiama "UCSD" (prima "Neon Campus University");
-- si aggiornano anche i resoconti delle gare già simulate.
do $$
declare
  v_old text := (select name from public.sport_teams where is_player_school);
begin
  if v_old is null or v_old = 'UCSD' then return; end if;
  update public.sport_teams set name = 'UCSD' where is_player_school;
  update public.sport_events set recap_text = replace(recap_text, v_old, 'UCSD') where recap_text like '%' || v_old || '%';
end;
$$;

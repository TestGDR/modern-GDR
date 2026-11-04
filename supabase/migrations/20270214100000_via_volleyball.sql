-- =====================================================================
-- VIA IL VOLLEYBALL (con tutto il suo storico)
-- Nessun atleta e nessuna pagella di personaggi: 6 gare simulate tra PNG
-- e una stagione. Prima le gare (il blocco «eventi giocati» guarda
-- quelle), poi lo sport: se ne vanno stagione, ruoli e gruppo della squadra.
-- =====================================================================
do $$
declare
  v_sport uuid := (select id from public.sports where name = 'Volleyball');
  r record;
begin
  if v_sport is null then return; end if;

  for r in
    select distinct c.owner_id, c.name from public.sport_roster ro join public.characters c on c.id = ro.character_id
    where ro.sport_id = v_sport and ro.left_at is null
  loop
    perform public.send_system_message(r.owner_id,
      '🏐 La squadra di Volleyball è stata chiusa: ' || public.first_name(r.name)
      || ' non ne fa più parte. Se vuoi, puoi entrare in un''altra squadra dalla pagina Sport.');
  end loop;

  delete from public.sport_events where sport_id = v_sport;
  delete from public.sports where id = v_sport;
end;
$$;

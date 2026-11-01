-- =====================================================================
-- VIA "AUTODIFESA E ARTI MARZIALI": C'È RISSA
-- - Chi l'aveva passa a Rissa con lo stesso livello (se aveva già Rissa
--   più alta resta quella). I PX spesi su Autodifesa tornano liberi.
-- - Corsi, ruoli sportivi e voci che la usavano passano a Rissa.
-- =====================================================================
do $$
declare
  v_old uuid := (select id from public.skills where lower(name) = lower('Autodifesa e arti marziali'));
  v_new uuid := (select id from public.skills where lower(name) = 'rissa');
begin
  if v_old is null then return; end if;
  if v_new is null then raise exception 'Abilità Rissa non trovata.'; end if;

  -- livelli dei personaggi: il più alto tra i due
  insert into public.character_skills (character_id, skill_id, level)
  select character_id, v_new, level from public.character_skills where skill_id = v_old
  on conflict (character_id, skill_id) do update set level = greatest(public.character_skills.level, excluded.level);
  delete from public.character_skills where skill_id = v_old;

  -- dove era usata
  update public.creation_options set roll_skill_id = v_new where roll_skill_id = v_old;
  update public.courses set skill_id = v_new where skill_id = v_old;
  update public.sport_positions set skill_id = v_new where skill_id = v_old;

  delete from public.skills where id = v_old;
end;
$$;

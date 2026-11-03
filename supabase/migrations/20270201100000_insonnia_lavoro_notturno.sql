-- =====================================================================
-- INSONNIA (UNA SOLA VOCE, CON IL MALUS) E LAVORO NOTTURNO
-- 1. Resta solo lo svantaggio «Insonnia», che ora ha le notti in bianco:
--    ogni giorno un tiro di resistenza (VIG + Resistenza fisica + d10
--    contro insonnia_cd); se fallisce, quel giorno −insonnia_malus a tutti
--    i tiri. Il tratto «Insonne» non si sceglie più (non lo aveva nessuno).
--    Avviso di SISTEMA a chi ha già «Insonnia».
-- 2. «Lavoro notturno»: −1 a esami e compiti (prezzo pieno, 1 punto).
-- =====================================================================

-- 1. INSONNIA
do $$
declare
  v_insonnia uuid := (select id from public.creation_options where name = 'Insonnia' and kind = 'svantaggio');
  r record;
begin
  update public.creation_options set active = false, available = false
  where name = 'Insonne' and kind = 'tratto';
  if v_insonnia is null then return; end if;
  update public.creation_options
  set effects = '[{"type":"rule_flag","flag":"insomnia"}]'::jsonb,
      description = 'Dormi poco e male. Ogni giorno un tiro di resistenza (VIG + Resistenza fisica + d10) decide se hai dormito: se fallisce passi la notte in bianco e quel giorno hai −1 a tutti i tiri (chat, esami, gare, allenamenti).'
  where id = v_insonnia;
  for r in
    select c.owner_id, c.name from public.character_options co join public.characters c on c.id = co.character_id
    where co.option_id = v_insonnia
  loop
    perform public.send_system_message(r.owner_id,
      '😴 Lo svantaggio «Insonnia» di ' || public.first_name(r.name) || ' ora ha effetto: ogni giorno un tiro di resistenza decide se hai dormito; '
      || 'se fallisce, quel giorno hai −1 a tutti i tiri. Lo stato si vede nell''icona accanto al ritratto della scheda.');
  end loop;
end;
$$;

-- 2. LAVORO NOTTURNO (togli questo blocco se non lo vuoi)
update public.creation_options
set cost_px = -40,
    description = 'Turni serali o notturni fuori campus: sei spesso stanco e irraggiungibile, e arrivi a lezione dopo poche ore di sonno. −1 a esami e compiti dell''università.',
    effects = '[{"type":"roll_modifier","value":-1,"when":{"system":"academic"}}]'::jsonb
where name = 'Lavoro notturno' and kind = 'svantaggio';

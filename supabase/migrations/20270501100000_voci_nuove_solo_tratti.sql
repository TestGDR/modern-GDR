-- =====================================================================
-- VOCI AGGIUNTE DOPO L'APPROVAZIONE: SOLO TRATTI
-- Vantaggi e svantaggi si scelgono solo in creazione. option_request_check
-- (usata all'invio e all'approvazione) rifiuta ogni voce che non sia un tratto,
-- quindi anche le richieste già in attesa con vantaggi o svantaggi.
-- =====================================================================

create or replace function public.option_request_check(p_character uuid, p_items jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  it jsonb;
  o public.creation_options;
  v_cost int := 0;
  v_neg int := 0;
  v_had int;
  v_lvl int;
  v_choice text;
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 10 then
    raise exception 'Scegli da 1 a 10 voci.' using errcode = 'P0001';
  end if;
  if (select count(distinct x ->> 'option_id') from jsonb_array_elements(p_items) x) <> jsonb_array_length(p_items) then
    raise exception 'Una voce è ripetuta.' using errcode = 'P0001';
  end if;
  for it in select * from jsonb_array_elements(p_items) loop
    select * into o from public.creation_options where id = (it ->> 'option_id')::uuid;
    if o.id is null or not o.active or not o.available or o.kind = 'tenore' then
      raise exception '"%" non si può scegliere.', coalesce(o.name, 'Voce') using errcode = 'P0001';
    end if;
    if o.kind <> 'tratto' then
      raise exception '"%": dopo l''approvazione si possono aggiungere solo tratti, non vantaggi né svantaggi.', o.name using errcode = 'P0001';
    end if;
    if exists (select 1 from public.character_options where character_id = p_character and option_id = o.id) then
      raise exception 'Hai già "%".', o.name using errcode = 'P0001';
    end if;
    v_lvl := coalesce((it ->> 'level')::int, 1);
    if v_lvl < 1 or v_lvl > o.max_level then raise exception '"%": livello non valido.', o.name using errcode = 'P0001'; end if;
    v_choice := btrim(coalesce(it ->> 'choice', ''));
    if o.requires_choice in ('testo', 'dipartimento', 'area', 'gruppo') and v_choice = '' then
      raise exception '"%": indica %.', o.name, coalesce(nullif(o.choice_hint, ''), 'la scelta richiesta') using errcode = 'P0001';
    end if;
    if o.cost_px < 0 then v_neg := v_neg + o.cost_px * v_lvl; else v_cost := v_cost + o.cost_px * v_lvl; end if;
  end loop;

  -- prova con le voci aggiunte: massimi, scelte, incompatibilità (poi si annulla)
  begin
    insert into public.character_options (character_id, option_id, level, choice_value)
    select p_character, (x ->> 'option_id')::uuid, coalesce((x ->> 'level')::int, 1), left(btrim(coalesce(x ->> 'choice', '')), 80)
    from jsonb_array_elements(p_items) x;
    perform public.check_character_options(p_character);
    if exists (
      select 1 from public.character_options co1 join public.creation_options o1 on o1.id = co1.option_id
      join public.character_options co2 on co2.character_id = co1.character_id and co2.option_id = any (o1.incompatible_ids)
      where co1.character_id = p_character
    ) then
      raise exception 'Una voce è incompatibile con quelle che hai già.' using errcode = 'P0001';
    end if;
    raise exception 'prova riuscita' using errcode = 'P0099';
  exception when sqlstate 'P0099' then
    null;
  end;
  -- gli svantaggi danno PX solo fino al tetto, contando quelli già presi
  select coalesce(-sum(cx.cost_px * co.level), 0) into v_had
  from public.character_options co join public.creation_options cx on cx.id = co.option_id
  where co.character_id = p_character and co.source <> 'master' and cx.cost_px < 0;
  v_cost := v_cost + greatest(v_neg, -greatest(0, coalesce(public.setting_int('voci_svantaggi_px_max'), 160) - v_had));
  return v_cost;
end;
$$;


-- =====================================================================
-- DADI: SOLO L'ESITO NEL MESSAGGIO
-- In chat e nei ticket si scrive solo che è stata fatta la prova e il
-- risultato: "SUCCESSO CRITICO" (10 naturale), "FALLIMENTO CRITICO"
-- (1 naturale), altrimenti "risultato N". I passaggi del calcolo restano
-- nei dati del tiro (roll_data), ma non si mostrano.
-- =====================================================================

create or replace function public.interlock_roll(p_character uuid, p_attribute uuid, p_skill uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attr public.attributes;
  v_skill public.skills;
  v_attr_value int := 0;
  v_skill_level int := 0;
  v_cap int := coalesce(public.setting_int('tetto_modificatori'), 3);
  v_mods int := 0;
  v_die int := 1 + floor(random() * 10)::int;
  v_extra int := 0;
  v_total int;
  v_label text := 'd10';
  v_text text;
begin
  if p_skill is not null then
    select * into v_skill from public.skills where id = p_skill and active;
    if not found then raise exception 'Abilità non valida.' using errcode = 'P0001'; end if;
    p_attribute := v_skill.attribute_id;
    select coalesce((select level from public.character_skills where character_id = p_character and skill_id = p_skill), 0)
      into v_skill_level;
  end if;
  if p_attribute is not null then
    select * into v_attr from public.attributes where id = p_attribute and active;
    if not found then raise exception 'Caratteristica non valida.' using errcode = 'P0001'; end if;
    select coalesce((select value from public.character_attributes where character_id = p_character and attribute_id = p_attribute), 0)
      into v_attr_value;
    select coalesce(sum(o.roll_modifier), 0) into v_mods
    from public.character_options co
    join public.creation_options o on o.id = co.option_id
    where co.character_id = p_character
      and o.roll_modifier is not null
      and (o.roll_skill_id is null or o.roll_skill_id = p_skill);
    v_mods := greatest(-v_cap, least(v_cap, v_mods));
    v_label := coalesce(v_skill.name || ' (' || v_attr.code || ')', v_attr.name);
  end if;

  if v_die = 10 then
    v_extra := 1 + floor(random() * 10)::int;
  elsif v_die = 1 then
    v_extra := -(1 + floor(random() * 10)::int);
  end if;
  v_total := v_die + v_extra + v_attr_value + v_skill_level + v_mods;

  -- nel messaggio solo l'esito, senza i passaggi
  v_text := 'tira ' || v_label || ': '
    || case when v_die = 10 then 'SUCCESSO CRITICO'
            when v_die = 1 then 'FALLIMENTO CRITICO'
            else 'risultato ' || v_total end;

  return jsonb_build_object(
    'die', v_die, 'extra', v_extra,
    'attribute', v_attr.code, 'attribute_value', case when v_attr.id is not null then v_attr_value end,
    'skill', v_skill.name, 'skill_level', case when v_skill.id is not null then v_skill_level end,
    'modifiers', v_mods, 'total', v_total, 'text', v_text);
end;
$$;
revoke execute on function public.interlock_roll(uuid, uuid, uuid) from public, anon, authenticated;

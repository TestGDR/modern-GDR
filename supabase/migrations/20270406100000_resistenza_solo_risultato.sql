-- =====================================================================
-- RESISTENZA AD ALCOL E DROGHE: IN CHAT SOLO IL RISULTATO
-- «Resistenza 13 contro CD 11: regge.» (senza VIG, abilità e dado).
-- Il calcolo non cambia.
-- =====================================================================

create or replace function public.item_use(p_character uuid, p_item bigint, p_room uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  it public.character_items;
  a public.character_alterations;
  e jsonb;
  v_kind text;
  v_stage_now int := 0;
  v_vig int; v_skill int; v_mods int;
  d int; v_extra int := 0; v_total int; v_cd int; v_ok boolean;
  v_new int; st jsonb;
  v_name text;
  v_left int;
  v_text text;
  v_detail text;
begin
  if not public.owns_character(p_character) then raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501'; end if;
  if not public.can_enter_room(p_room) then raise exception 'Non puoi usarlo in questa chat.' using errcode = '42501'; end if;
  if not public.i_am_invisible()
     and not exists (select 1 from public.chat_presence where room_id = p_room and character_id = p_character) then
    raise exception 'Prima entra in giocata.' using errcode = 'P0001';
  end if;
  select * into it from public.character_items where id = p_item and character_id = p_character for update;
  if it.id is null then raise exception 'Oggetto non trovato.' using errcode = 'P0001'; end if;
  if it.charges_left is null then raise exception '% non si consuma: descrivilo nella tua azione.', it.name using errcode = 'P0001'; end if;
  select public.first_name(name) into v_name from public.characters where id = p_character;

  v_left := it.charges_left - 1;
  if v_left <= 0 then
    delete from public.character_items where id = it.id;
  else
    update public.character_items set charges_left = v_left where id = it.id;
  end if;
  v_text := it.use_text || ' ' || it.name || ' (' || case when v_left <= 0 then 'finito' when v_left = 1 then '1 carica rimasta' else v_left || ' cariche rimaste' end || ')';

  e := it.effect;
  if e is not null then
    v_kind := e ->> 'type';
    select * into a from public.character_alterations where character_id = p_character and kind = v_kind for update;
    if a.character_id is not null and now() < a.stage_expires_at then v_stage_now := a.stage; end if;
    -- resistenza: VIG + Resistenza fisica + d10 + voci di resistenza
    v_vig := public.combat_attr(p_character, 'VIG');
    v_skill := public.combat_skill(p_character, 'Resistenza fisica');
    v_mods := (public.trait_mods(p_character, jsonb_build_object('system', 'general', 'category', 'resistenza')) ->> 'total')::int;
    d := public.combat_die(10);
    if d = 10 then v_extra := public.combat_die(10); elsif d = 1 then v_extra := -public.combat_die(10); end if;
    v_total := v_vig + v_skill + d + v_extra + v_mods;
    v_cd := coalesce((e ->> 'cd')::int, 12) + 2 * v_stage_now;
    -- in chat solo il risultato: totale contro CD (niente caratteristiche, abilità e dado)
    v_detail := v_total || ' contro CD ' || v_cd;
    v_ok := v_total >= v_cd;
    if v_ok then
      v_text := v_text || '. Resistenza ' || v_detail || ': regge.';
    else
      v_new := least(3, v_stage_now + 1);
      st := e -> 'stages' -> (v_new - 1);
      insert into public.character_alterations (character_id, kind, source_name, stage, stages, aftermath, stage_started_at, stage_expires_at, aftermath_until)
      values (p_character, v_kind, it.name, v_new, e -> 'stages', e -> 'aftermath', now(),
        now() + make_interval(mins => round(coalesce((st ->> 'hours')::numeric, 2) * 60)::int),
        now() + make_interval(mins => round((coalesce((st ->> 'hours')::numeric, 2) + coalesce((e #>> '{aftermath,hours}')::numeric, 0)) * 60)::int))
      on conflict (character_id, kind) do update set source_name = excluded.source_name, stage = excluded.stage, stages = excluded.stages,
        aftermath = excluded.aftermath, stage_started_at = excluded.stage_started_at, stage_expires_at = excluded.stage_expires_at,
        aftermath_until = excluded.aftermath_until, updated_at = now();
      v_text := v_text || '. Resistenza ' || v_detail || ': non regge'
        || case when v_new = v_stage_now then ', resta ' else ', ora è ' end || lower(coalesce(st ->> 'name', 'alterato')) || '.';
    end if;
  else
    v_text := v_text || '.';
  end if;

  insert into public.messages (room_id, character_id, kind, content)
  values (p_room, p_character, 'sistema', v_text);
  return jsonb_build_object('ok', v_ok, 'total', v_total, 'cd', v_cd, 'left', greatest(v_left, 0));
end;
$$;
revoke execute on function public.item_use(uuid, bigint, uuid) from public, anon;
grant execute on function public.item_use(uuid, bigint, uuid) to authenticated;

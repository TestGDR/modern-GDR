-- =====================================================================
-- ALLENAMENTI: CONTO COMPLETO SALVATO E MOSTRATO
-- Ogni allenamento salva tutti i pezzi del tiro (caratteristica con il
-- codice, abilità con il nome, d10 e secondo d10, intensità, voci, CD base
-- e sconto del personal trainer) e li restituisce al giocatore.
-- La formula non cambia: caratteristica + abilità + d10 (10 → +d10,
-- 1 → −d10) + voci + intensità contro la CD.
-- =====================================================================

create or replace function public.sport_train(p_character uuid, p_sport uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ro record;
  sp public.sports;
  m jsonb;
  v_last timestamptz;
  v_days int := greatest(1, coalesce(public.setting_int('sport_allenamento_giorni'), 7));
  v_cd int := coalesce(public.setting_int('sport_cd'), 14);
  v_int numeric[] := public.uni_list('sport_intensita');
  v_attr int; v_skill int; v_d int; v_extra int; v_crit text := 'none'; v_dval int; v_mods int; v_total int;
  v_success boolean;
  v_form int;
  v_intensity int;
  v_cd_base int;
  v_trainer int := 0;
  v_code text;
  v_skill_name text;
begin
  if not public.owns_character(p_character) then raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501'; end if;
  select x.*, p.attribute_id, p.skill_id, p.name as position_name into ro
  from public.sport_roster x left join public.sport_positions p on p.id = x.position_id
  where x.character_id = p_character and x.sport_id = p_sport and x.left_at is null
  for update of x;
  if ro.id is null then raise exception 'Non fai parte di questa squadra.' using errcode = 'P0001'; end if;
  if ro.position_id is null then raise exception 'Prima ti serve un ruolo in squadra.' using errcode = 'P0001'; end if;
  if ro.injury_events_left > 0 then raise exception 'Sei infortunato: niente allenamenti finché non rientri.' using errcode = 'P0001'; end if;
  select created_at into v_last from public.sport_trainings
  where character_id = p_character and sport_id = p_sport order by created_at desc limit 1;
  if v_last is not null and v_last > now() - make_interval(days => v_days) then
    raise exception 'Il prossimo allenamento si può fare dal %.',
      to_char((v_last + make_interval(days => v_days)) at time zone 'Europe/Rome', 'DD/MM "alle" HH24:MI') using errcode = 'P0001';
  end if;
  select * into sp from public.sports where id = p_sport;

  v_attr := coalesce((select value from public.character_attributes where character_id = p_character and attribute_id = ro.attribute_id), 0);
  v_skill := coalesce((select level from public.character_skills where character_id = p_character and skill_id = ro.skill_id), 0);
  m := public.trait_mods(p_character, jsonb_build_object('system', 'athletics', 'skill_id', ro.skill_id, 'phase', 'training',
    'venue', 'home', 'format', sp.format, 'attribute_id', ro.attribute_id));
  v_intensity := coalesce(v_int[case ro.training_intensity when 'light' then 1 when 'normal' then 2 else 3 end], 0)::int;
  v_mods := (m ->> 'total')::int + v_intensity;
  select code into v_code from public.attributes where id = ro.attribute_id;
  select name into v_skill_name from public.skills where id = ro.skill_id;
  v_d := public.academic_die();
  v_dval := v_d;
  if v_d >= (m ->> 'success_min')::int then
    v_extra := public.academic_die(); v_crit := 'success'; v_dval := v_d + v_extra;
  elsif v_d <= (m ->> 'failure_max')::int then
    v_extra := public.academic_die(); v_crit := 'failure'; v_dval := v_d - v_extra;
  end if;
  v_total := v_attr + v_skill + v_dval + v_mods;
  -- personal trainer: allenamento più facile
  v_cd_base := v_cd;
  if ro.trainer_until is not null and ro.trainer_until > now() then
    v_trainer := coalesce(public.setting_int('servizio_trainer_cd'), 2);
    v_cd := v_cd - v_trainer;
  end if;
  v_success := v_total >= v_cd and v_crit <> 'failure';

  insert into public.sport_trainings (character_id, sport_id, d10, crit, extra, total, cd, success, modifiers)
  values (p_character, p_sport, v_d, v_crit, v_extra, v_total, v_cd, v_success,
    jsonb_build_object('caratteristica', v_attr, 'codice', v_code, 'abilita', v_skill, 'abilita_nome', v_skill_name,
      'voci', m -> 'items', 'voci_totale', (m ->> 'total')::int, 'intensita', ro.training_intensity, 'intensita_valore', v_intensity,
      'totale', v_mods, 'ruolo', ro.position_name, 'cd_base', v_cd_base, 'trainer', v_trainer));
  v_form := public.sport_training_form(p_character, p_sport);
  return jsonb_build_object('success', v_success, 'crit', v_crit, 'd10', v_d, 'extra', v_extra, 'total', v_total, 'cd', v_cd,
    'attr', v_attr, 'code', v_code, 'skill', v_skill, 'skill_name', v_skill_name, 'mods', v_mods, 'trainer', v_trainer,
    'form', least(v_form + ro.training_bonus, coalesce(public.setting_int('sport_allenamento_max'), 2)));
end;
$$;


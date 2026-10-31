-- =====================================================================
-- RETTA ANNUALE E RICALIBRATURA
-- - La retta del college si indica all'anno (5.000 $) e si paga in 12
--   rate mensili con gli altri accrediti (417 $ al mese).
-- - Camere più leggere: doppia 400 $, singola 650 $ al mese.
-- - Vita tranquilla: entrata 2.600 $ (con retta e doppia resta poco).
-- - La Borsa di studio non si può avere con Agiato, Ricco ed Élite.
-- =====================================================================

-- 1. IMPOSTAZIONI
insert into public.game_settings (key, value, kind, label, description, sort_order) values
  ('college_retta_anno', '5000', 'number', 'College · Retta all''anno',
   'Retta universitaria annuale: si paga in 12 rate mensili con gli altri accrediti, per chi va all''università senza borsa di studio.', 322)
on conflict (key) do nothing;
delete from public.game_settings where key = 'college_retta_mese';
update public.game_settings set value = '400' where key = 'college_doppia_mese' and value = '600'::jsonb;
update public.game_settings set value = '650' where key = 'college_singola_mese' and value = '1000'::jsonb;

-- rata mensile della retta
create or replace function public.college_tuition_month()
returns int
language sql
stable
security definer
set search_path = ''
as $$ select round(coalesce(public.setting_int('college_retta_anno'), 5000) / 12.0)::int $$;
revoke execute on function public.college_tuition_month() from public, anon, authenticated;

-- 2. PATRIMONIO
update public.creation_options set salary = 2600 where kind = 'tenore' and name = 'Vita tranquilla' and salary = 3200;

-- 3. BORSA DI STUDIO: NON PER LE FASCE AGIATE (incompatibile in tutti e due i sensi)
do $$
declare
  v_borsa uuid := (select id from public.creation_options where kind = 'vantaggio' and name = 'Borsa di studio');
  v_rich uuid[] := array(select id from public.creation_options where kind = 'tenore' and name in ('Agiato', 'Ricco', 'Élite'));
begin
  if v_borsa is null then return; end if;
  update public.creation_options set incompatible_ids = array(select distinct unnest(incompatible_ids || v_rich)) where id = v_borsa;
  update public.creation_options set incompatible_ids = array(select distinct unnest(incompatible_ids || v_borsa)) where id = any (v_rich);
end;
$$;

update public.creation_options
set description = 'Studi con una borsa: niente retta del college e camera doppia pagata (per la singola paghi solo la differenza). Non per le fasce Agiato, Ricco ed Élite. Con «Borsa a rischio» la perdi se un semestre va sotto 2.5 di GPA.'
where kind = 'vantaggio' and name = 'Borsa di studio';

-- 4. FUNZIONI CON LA RATA MENSILE
create or replace function public.college_costs(p_character uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.npc_mine(p_character) or public.has_permission('alloggi.gestire')) then
    raise exception 'Personaggio non trovato.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'student', public.character_is_student(p_character),
    'scholarship', public.character_scholarship(p_character),
    'tuition', case when public.character_is_student(p_character) and not public.character_scholarship(p_character)
                    then public.college_tuition_month() else 0 end,
    'tuition_year', coalesce(public.setting_int('college_retta_anno'), 5000),
    'doppia', public.dorm_fee(p_character, 'doppia'),
    'singola', public.dorm_fee(p_character, 'singola')
  );
end;
$$;
revoke execute on function public.college_costs(uuid) from public, anon;
grant execute on function public.college_costs(uuid) to authenticated;

create or replace function public.dorm_fee(p_character uuid, p_kind text)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(0,
    case p_kind when 'singola' then coalesce(public.setting_int('college_singola_mese'), 650)
                else coalesce(public.setting_int('college_doppia_mese'), 400) end
    - case when public.character_scholarship(p_character) then coalesce(public.setting_int('college_doppia_mese'), 400) else 0 end)
$$;
revoke execute on function public.dorm_fee(uuid, text) from public, anon, authenticated;

create or replace function public.character_expense_parts(p_character uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('label', label, 'amount', amount, 'kind', kind) order by ord, label), '[]'::jsonb)
  from (
    select 1 as ord, 'Mantenimento: ' || o.name as label, o.upkeep as amount, 'mantenimento' as kind
    from public.character_options co join public.creation_options o on o.id = co.option_id
    where co.character_id = p_character and o.kind = 'tenore' and o.upkeep > 0
    union all
    select 2, 'Retta del college (rata mensile)', public.college_tuition_month(), 'retta'
    where public.character_is_student(p_character) and not public.character_scholarship(p_character)
      and public.college_tuition_month() > 0
    union all
    select 3, 'Camera ' || r.name || ' (' || d.name || ')', public.dorm_fee(p_character, r.kind), 'college'
    from public.dorm_residents dr join public.dorm_rooms r on r.id = dr.room_id join public.dorms d on d.id = r.dorm_id
    where dr.character_id = p_character and public.dorm_fee(p_character, r.kind) > 0
    union all
    select 4, 'Affitto: ' || h.name, h.rent, 'affitto'
    from public.character_homes h where h.character_id = p_character and h.mode = 'affitto' and h.rent > 0
    union all
    select 5, 'Spese di casa: ' || h.name, h.upkeep, 'casa'
    from public.character_homes h where h.character_id = p_character and h.mode = 'proprieta' and h.upkeep > 0
  ) parts
$$;
revoke execute on function public.character_expense_parts(uuid) from public, anon, authenticated;

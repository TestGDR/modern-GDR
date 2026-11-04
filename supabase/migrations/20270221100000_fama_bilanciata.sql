-- =====================================================================
-- FAMA: VALORE DELLE VOCI DI BACKGROUND SEPARATO DAL COSTO
-- Ogni voce di background ha il suo valore di Fama (e di Infamia),
-- diverso dal costo in Punti Fama: «Influencer con 50.000 follower»
-- costa 3 PF ma vale 25 punti di fama (Popolare).
-- Le voci del catalogo contano con il loro valore attuale (cambiandolo,
-- cambia per tutti); le voci proposte dai giocatori hanno il valore dato
-- dallo staff all'approvazione.
-- Tetto: dal background si arriva al massimo a fama_max_background (40);
-- il resto si guadagna giocando (voci e badge).
-- =====================================================================

insert into public.game_settings (key, value, kind, label, description, sort_order) values
  ('fama_max_background', '40', 'number', 'Fama · Massimo di fama dal background',
   'La fama che le voci di background possono dare in tutto (il resto si guadagna giocando). 0 = nessun limite.', 409)
on conflict (key) do nothing;

alter table public.fame_bg_items
  add column if not exists fame_points int not null default 0 check (fame_points between -1000 and 1000),
  add column if not exists infamy_points int not null default 0 check (infamy_points between -1000 and 1000);
alter table public.character_fame_bg
  add column if not exists fame_points int check (fame_points is null or fame_points between -1000 and 1000),
  add column if not exists infamy_points int check (infamy_points is null or infamy_points between -1000 and 1000);

-- valori del catalogo di partenza
update public.fame_bg_items i set fame_points = v.fame, infamy_points = v.infamy
from (values
  ('Figlio di una star di Hollywood', 30, 0),
  ('Attore bambino in una serie TV', 25, 0),
  ('Influencer con 50.000 follower', 25, 0),
  ('Celebrità del campus', 25, 0),
  ('Famiglia in politica', 20, 0),
  ('Medaglia ai campionati nazionali giovanili', 20, 0),
  ('Cognome su un edificio del campus', 15, 0),
  ('Canale seguito', 15, 0),
  ('Un singolo passato in radio', 15, 0),
  ('Modello per un marchio noto', 15, 0),
  ('Campione statale al liceo', 10, 0),
  ('Vincitore di un concorso scientifico nazionale', 10, 0),
  ('Video virale', 10, 0),
  ('Articolo su una rivista', 5, 0),
  ('Re o regina del ballo del liceo', 5, 0),
  ('Scandalo sui giornali', 10, 15)
) as v (name, fame, infamy)
where i.name = v.name;
-- le altre voci (aggiunte dallo staff): 5 punti di fama per PF
update public.fame_bg_items set fame_points = cost_pf * 5 where fame_points = 0 and infamy_points = 0 and cost_pf > 0;
-- voci proposte già approvate: 5 punti per PF
update public.character_fame_bg set fame_points = coalesce(cost_pf, 0) * 5
where item_id is null and status = 'approvata' and fame_points is null;

-- totali: il background con il suo valore (fino al tetto), poi voci e badge
create or replace function public.fame_recalc(p_character uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.character_fame;
  v_bg_fame int;
  v_bg_infamy int;
  v_cap int := coalesce(public.setting_int('fama_max_background'), 40);
  v_fame int;
  v_infamy int;
  v_infamy_on boolean := coalesce(public.setting_int('fama_infamia_attiva'), 1) = 1;
  v_before jsonb; v_after jsonb;
  c public.characters;
begin
  select * into c from public.characters where id = p_character;
  if c.id is null then return; end if;
  v_old := public.fame_row(p_character);
  select coalesce(sum(case when b.item_id is not null then coalesce(i.fame_points, 0) else coalesce(b.fame_points, 0) end), 0),
         coalesce(sum(case when b.item_id is not null then coalesce(i.infamy_points, 0) else coalesce(b.infamy_points, 0) end), 0)
  into v_bg_fame, v_bg_infamy
  from public.character_fame_bg b left join public.fame_bg_items i on i.id = b.item_id
  where b.character_id = p_character and b.status = 'approvata';
  if v_cap > 0 then v_bg_fame := least(v_bg_fame, v_cap); end if;

  v_fame := v_bg_fame
    + case when v_infamy_on then 0 else v_bg_infamy end
    + coalesce((select sum(points) from public.fame_entries where character_id = p_character and (kind = 'fama' or not v_infamy_on)), 0)
    + coalesce((select sum(fb.points) from public.character_badges cb join public.fame_badges fb on fb.id = cb.badge_id
                where cb.character_id = p_character and (fb.kind = 'fama' or not v_infamy_on)), 0);
  v_infamy := case when v_infamy_on then
      v_bg_infamy
    + coalesce((select sum(points) from public.fame_entries where character_id = p_character and kind = 'infamia'), 0)
    + coalesce((select sum(fb.points) from public.character_badges cb join public.fame_badges fb on fb.id = cb.badge_id
                where cb.character_id = p_character and fb.kind = 'infamia'), 0)
    else 0 end;
  update public.character_fame set fame_cache = v_fame, infamy_cache = v_infamy, updated_at = now() where character_id = p_character;

  if c.status = 'approvata' and coalesce(public.setting_int('fama_notifiche'), 1) = 1 then
    v_before := public.fame_level_info(v_old.fame_cache, 'fama');
    v_after := public.fame_level_info(v_fame, 'fama');
    if v_before ->> 'id' is distinct from v_after ->> 'id' and v_after is not null then
      perform public.send_system_message(c.owner_id, '⭐ La fama di ' || public.first_name(c.name) || ' cambia: ora è «' || (v_after ->> 'name') || '».');
      perform public.fame_log_add(p_character, 'livello', 'Fama: ' || coalesce(v_before ->> 'name', '—') || ' → ' || (v_after ->> 'name'), v_fame);
    end if;
    if v_infamy_on then
      v_before := public.fame_level_info(v_old.infamy_cache, 'infamia');
      v_after := public.fame_level_info(v_infamy, 'infamia');
      if v_before ->> 'id' is distinct from v_after ->> 'id' and v_after is not null then
        perform public.send_system_message(c.owner_id, '🌶️ L''infamia di ' || public.first_name(c.name) || ' cambia: ora è «' || (v_after ->> 'name') || '».');
        perform public.fame_log_add(p_character, 'livello', 'Infamia: ' || coalesce(v_before ->> 'name', '—') || ' → ' || (v_after ->> 'name'), v_infamy);
      end if;
    end if;
  end if;
end;
$$;
revoke execute on function public.fame_recalc(uuid) from public, anon, authenticated;

-- valore di una voce del catalogo cambiato: si ricalcola chi l'ha
create or replace function public.fame_bg_items_after()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  if new.fame_points is distinct from old.fame_points or new.infamy_points is distinct from old.infamy_points then
    for r in select distinct character_id from public.character_fame_bg where item_id = new.id and status = 'approvata' loop
      perform public.fame_recalc(r.character_id);
    end loop;
  end if;
  return null;
end;
$$;
revoke execute on function public.fame_bg_items_after() from public, anon, authenticated;
drop trigger if exists fame_bg_items_after on public.fame_bg_items;
create trigger fame_bg_items_after after update on public.fame_bg_items
  for each row execute function public.fame_bg_items_after();

-- creazione: anche il valore di fama di ogni voce e il tetto
create or replace function public.fame_creation_state(p_character uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.character_fame;
begin
  if not exists (select 1 from public.characters where id = p_character and owner_id = auth.uid())
     and not public.has_permission('fama.gestire') then
    raise exception 'Non hai i permessi necessari.' using errcode = '42501';
  end if;
  f := public.fame_row(p_character);
  return jsonb_build_object(
    'pool', f.pf_pool,
    'spent', coalesce((select sum(coalesce(cost_pf, 0)) from public.character_fame_bg where character_id = p_character and status = 'approvata'), 0),
    'converted', f.converted, 'px_from_conversion', f.px_from_conversion,
    'rate', coalesce(public.setting_int('fama_tasso_px'), 5),
    'max_item', coalesce(public.setting_int('fama_max_pf_voce'), 0),
    'max_category', coalesce(public.setting_int('fama_max_pf_categoria'), 0),
    'max_background', coalesce(public.setting_int('fama_max_background'), 40),
    'custom', coalesce(public.setting_int('fama_voci_personalizzate'), 1) = 1,
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'description', description, 'category', category, 'cost', cost_pf,
                         'fame', fame_points, 'infamy', infamy_points)
                       order by category, sort_order, name) from public.fame_bg_items where active), '[]'::jsonb),
    'mine', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'item_id', b.item_id,
                        'name', coalesce(b.custom_name, i.name), 'description', coalesce(nullif(b.custom_description, ''), i.description, ''),
                        'category', coalesce(i.category, b.category), 'cost', b.cost_pf, 'status', b.status, 'note', b.review_note,
                        'fame', case when b.item_id is not null then i.fame_points else b.fame_points end,
                        'infamy', case when b.item_id is not null then i.infamy_points else b.infamy_points end,
                        'custom', b.item_id is null) order by b.created_at)
                      from public.character_fame_bg b left join public.fame_bg_items i on i.id = b.item_id
                      where b.character_id = p_character), '[]'::jsonb));
end;
$$;
revoke execute on function public.fame_creation_state(uuid) from public, anon;
grant execute on function public.fame_creation_state(uuid) to authenticated;

-- lo staff approva una proposta dando costo in PF e valore di fama (e di infamia)
drop function if exists public.fame_bg_review(uuid, boolean, int, text);
create or replace function public.fame_bg_review(p_id uuid, p_approve boolean, p_cost int, p_note text, p_fame int default null, p_infamy int default 0)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.character_fame_bg;
  c public.characters;
  v_fame int;
begin
  if not public.has_permission('fama.gestire') then raise exception 'Non hai il permesso di gestire la fama.' using errcode = '42501'; end if;
  select * into b from public.character_fame_bg where id = p_id for update;
  if b.id is null or b.status <> 'in_attesa' then raise exception 'Proposta non trovata o già decisa.' using errcode = 'P0001'; end if;
  if p_approve and (p_cost is null or p_cost < 0 or p_cost > 100) then raise exception 'Dai un costo tra 0 e 100 PF.' using errcode = 'P0001'; end if;
  v_fame := coalesce(p_fame, coalesce(p_cost, 0) * 5);
  update public.character_fame_bg
  set status = case when p_approve then 'approvata' else 'rifiutata' end,
      cost_pf = case when p_approve then p_cost else null end,
      fame_points = case when p_approve then v_fame end,
      infamy_points = case when p_approve then coalesce(p_infamy, 0) end,
      review_note = left(coalesce(btrim(p_note), ''), 300)
  where id = p_id;
  select * into c from public.characters where id = b.character_id;
  perform public.send_system_message(c.owner_id,
    '⭐ La voce di fama «' || b.custom_name || '» di ' || public.first_name(c.name) || ' è stata '
    || case when p_approve then 'approvata: costa ' || p_cost || ' PF e vale ' || v_fame || ' punti di fama' else 'rifiutata' end
    || coalesce(nullif(': ' || btrim(p_note), ': '), '') || '.');
end;
$$;
revoke execute on function public.fame_bg_review(uuid, boolean, int, text, int, int) from public, anon;
grant execute on function public.fame_bg_review(uuid, boolean, int, text, int, int) to authenticated;

-- scheda: anche il valore di fama e infamia delle voci di background
create or replace function public.fame_overview(p_character uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.character_fame;
  v_staff boolean := public.has_permission('fama.gestire');
  v_owner boolean := exists (select 1 from public.characters where id = p_character and owner_id = auth.uid());
  v_infamy_on boolean := coalesce(public.setting_int('fama_infamia_attiva'), 1) = 1;
begin
  if auth.uid() is null then raise exception 'Serve l''accesso.' using errcode = '42501'; end if;
  f := public.fame_row(p_character);
  return jsonb_build_object(
    'fame', public.fame_level_info(f.fame_cache, 'fama'),
    'infamy', case when v_infamy_on then public.fame_level_info(f.infamy_cache, 'infamia') end,
    'converted', f.converted, 'pf_pool', f.pf_pool, 'pf_converted', f.pf_converted, 'px_from_conversion', f.px_from_conversion,
    'max_background', coalesce(public.setting_int('fama_max_background'), 40),
    'is_staff', v_staff, 'is_owner', v_owner,
    'background', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'name', coalesce(b.custom_name, i.name),
                     'description', coalesce(nullif(b.custom_description, ''), i.description, ''), 'category', coalesce(i.category, b.category),
                     'cost', b.cost_pf, 'status', b.status,
                     'fame', case when b.item_id is not null then i.fame_points else b.fame_points end,
                     'infamy', case when b.item_id is not null then i.infamy_points else b.infamy_points end) order by b.created_at)
                   from public.character_fame_bg b left join public.fame_bg_items i on i.id = b.item_id
                   where b.character_id = p_character and (b.status = 'approvata' or v_staff or v_owner)), '[]'::jsonb),
    'badges', coalesce((select jsonb_agg(jsonb_build_object('id', cb.id, 'badge_id', fb.id, 'name', fb.name, 'description', fb.description,
                     'icon', fb.icon, 'points', fb.points, 'kind', fb.kind, 'reason', cb.reason, 'date', cb.created_at,
                     'rarity', r.name, 'color', coalesce(r.color, '#b8a8e4')) order by cb.created_at desc)
                   from public.character_badges cb join public.fame_badges fb on fb.id = cb.badge_id
                   left join public.fame_rarities r on r.id = fb.rarity_id
                   where cb.character_id = p_character and (v_infamy_on or fb.kind = 'fama')), '[]'::jsonb),
    'entries', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'title', e.title, 'description', e.description, 'points', e.points,
                     'kind', e.kind, 'public', e.is_public, 'date', e.created_at) order by e.created_at desc)
                   from public.fame_entries e
                   where e.character_id = p_character and (e.is_public or v_staff) and (v_infamy_on or e.kind = 'fama')), '[]'::jsonb));
end;
$$;
revoke execute on function public.fame_overview(uuid) from public, anon;
grant execute on function public.fame_overview(uuid) to authenticated;

-- totali di tutti con i valori nuovi
do $$
declare
  r record;
begin
  for r in select character_id from public.character_fame loop
    perform public.fame_recalc(r.character_id);
  end loop;
end;
$$;

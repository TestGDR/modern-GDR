-- =====================================================================
-- FOLLOWER DAL BACKGROUND: SI RIDANNO LE VOCI TOLTE CHE STANNO NEL TETTO
-- Con la regola «una sola voce con follower» (20270418100000) alcune voci
-- erano state tolte e rimborsate in PX. Ora le voci si sommano fino a
-- 50.000: chi resta entro il tetto riprende la voce e restituisce i PX del
-- rimborso (mai sotto zero). Chi lo supererebbe (es. due voci da 50.000)
-- tiene il rimborso. Avviso di SISTEMA. Si può rilanciare.
-- =====================================================================
do $$
declare
  r record;
  v_max int := coalesce(public.setting_int('social_bg_max'), 50000);
  v_now int;
begin
  for r in
    select m.id as move_id, m.character_id, m.amount, (regexp_match(m.reason, '«(.*)»'))[1] as item_name,
           c.name as pg, c.owner_id
    from public.px_moves m join public.characters c on c.id = m.character_id
    where m.reason like 'Rimborso della voce di background%'
    order by m.character_id, m.amount desc, m.created_at
  loop
    -- follower dal background che ha adesso (somma delle voci, senza tetto)
    select coalesce(sum(x.social_followers), 0) into v_now
    from public.character_fame_bg b join public.fame_bg_items x on x.id = b.item_id
    where b.character_id = r.character_id and b.status = 'approvata';
    if exists (
      select 1 from public.fame_bg_items i
      where lower(i.name) = lower(r.item_name) and v_now + coalesce(i.social_followers, 0) <= v_max
        and not exists (select 1 from public.character_fame_bg b where b.character_id = r.character_id and b.item_id = i.id)
    ) then
      insert into public.character_fame_bg (character_id, item_id, category, cost_pf, status)
      select r.character_id, i.id, i.category, i.cost_pf, 'approvata'
      from public.fame_bg_items i where lower(i.name) = lower(r.item_name);
      -- si restituiscono i PX del rimborso
      perform set_config('app.invio_scheda', 'on', true);
      update public.characters set px = greatest(0, px - r.amount) where id = r.character_id;
      perform set_config('app.invio_scheda', 'off', true);
      update public.character_fame
      set px_from_conversion = greatest(0, px_from_conversion - r.amount),
          pf_converted = greatest(0, pf_converted - r.amount / greatest(1, coalesce(public.setting_int('fama_tasso_px'), 5))),
          updated_at = now()
      where character_id = r.character_id;
      delete from public.px_moves where id = r.move_id;
      perform public.fame_recalc(r.character_id);
      perform public.send_system_message(r.owner_id,
        '⭐ ' || public.first_name(r.pg) || ': ora le voci di background con follower si sommano fino a '
        || replace(to_char(v_max, 'FM999,999,999'), ',', '.') || '. «' || r.item_name || '» ti è stata ridata e i '
        || r.amount || ' PX del rimborso sono stati tolti.');
      raise notice 'Ridata «%» a % (−% PX)', r.item_name, r.pg, r.amount;
    else
      raise notice 'Non ridata «%» a %: supererebbe il tetto', r.item_name, r.pg;
    end if;
  end loop;
end;
$$;

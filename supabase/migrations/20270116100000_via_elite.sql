-- =====================================================================
-- VIA LA FASCIA ÉLITE
-- Le fasce di patrimonio diventano cinque; la più alta è Ricco.
-- Chi aveva Élite passa a Ricco: riprende la differenza di PX (Élite
-- costava 200 PX, Ricco ne costa 120) e, se era già approvato, perde la
-- differenza della quota iniziale (200.000 − 60.000 $) senza mai finire
-- in rosso per questo. Avviso di SISTEMA a ciascuno.
-- =====================================================================
do $$
declare
  v_elite public.creation_options;
  v_ricco public.creation_options;
  r record;
  v_cut int;
  v_balance int;
begin
  select * into v_elite from public.creation_options where kind = 'tenore' and name = 'Élite';
  select * into v_ricco from public.creation_options where kind = 'tenore' and name = 'Ricco';
  if v_elite.id is null or v_ricco.id is null then return; end if;

  for r in
    select c.id, c.owner_id, c.name, c.status, a.initial_paid, a.balance
    from public.character_options co join public.characters c on c.id = co.character_id
    left join public.bank_accounts a on a.character_id = c.id
    where co.option_id = v_elite.id
  loop
    update public.character_options set option_id = v_ricco.id where character_id = r.id and option_id = v_elite.id;

    -- PX: per le schede approvate i PX rimasti sono salvati, si restituisce la differenza
    if r.status = 'approvata' then
      update public.characters set px = px + greatest(0, v_elite.cost_px - v_ricco.cost_px) where id = r.id;
    end if;

    -- banca: via la differenza della quota iniziale, ma mai sotto zero per questo
    v_cut := 0;
    if coalesce(r.initial_paid, false) then
      v_cut := least(greatest(0, v_elite.initial_amount - v_ricco.initial_amount), greatest(r.balance, 0));
      if v_cut > 0 then
        update public.bank_accounts set balance = balance - v_cut, updated_at = now() where character_id = r.id returning balance into v_balance;
        insert into public.bank_transactions (character_id, amount, kind, description, balance_after)
        values (r.id, -v_cut, 'iniziale', 'Fascia Élite tolta: quota iniziale ricalcolata come Ricco', v_balance);
      end if;
    end if;

    perform public.send_system_message(r.owner_id,
      '💼 La fascia di patrimonio Élite non c''è più: ' || public.first_name(r.name) || ' ora è Ricco.'
      || case when r.status = 'approvata' then ' Riprende ' || greatest(0, v_elite.cost_px - v_ricco.cost_px) || ' PX' else '' end
      || case when v_cut > 0 then ' e il conto scende di ' || v_cut || ' $ (quota iniziale di Ricco).' when r.status = 'approvata' then '.' else '' end
      || ' Entrate e mantenimento del mese sono quelli di Ricco.');
  end loop;

  -- la voce resta nel database (storico) ma non si sceglie più
  update public.creation_options set active = false, available = false where id = v_elite.id;
end;
$$;

-- =====================================================================
-- FAMA: SBLOCCARE LA SCHEDA RIAPRE ANCHE I PUNTI FAMA
-- Quando l'Amministratore sblocca una scheda (torna in bozza) il giocatore
-- può rifare tutto, anche il background di fama: i Punti Fama si riaprono
-- (chi li aveva a 0 perché approvato prima della Fama riceve i PF
-- iniziali). Niente PX doppi: all'invio submit_character ricalcola i PX
-- da zero e alla nuova approvazione la conversione si rifà una volta.
-- Una volta: si riaprono anche le schede già sbloccate adesso.
-- =====================================================================
create or replace function public.characters_fame_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.character_fame;
  v_spent int;
  v_left int;
  v_px int;
begin
  -- reset della scheda (Amministrazione): la fama riparte da zero
  if new.status = 'bozza' and old.status = 'approvata' and new.creation_step = 1 then
    delete from public.character_fame_bg where character_id = new.id;
    delete from public.fame_entries where character_id = new.id;
    delete from public.character_badges where character_id = new.id;
    delete from public.character_fame where character_id = new.id;
    perform public.fame_row(new.id);
    perform public.fame_log_add(new.id, 'reset', 'Scheda resettata: fama azzerata', 0);
    return null;
  end if;

  -- sblocco della scheda: si riaprono i Punti Fama (le voci scelte restano, si possono cambiare)
  if new.status = 'bozza' and old.status is distinct from 'bozza' then
    f := public.fame_row(new.id);
    if f.converted then
      update public.character_fame
      set converted = false, converted_at = null, pf_converted = 0, px_from_conversion = 0,
          pf_pool = case when pf_pool = 0 then coalesce(public.setting_int('fama_pf_iniziali'), 10) else pf_pool end,
          updated_at = now()
      where character_id = new.id;
      perform public.fame_log_add(new.id, 'PF riaperti', 'Scheda sbloccata: Punti Fama di nuovo da spendere', null);
    end if;
    return null;
  end if;

  if new.status = 'approvata' and old.status is distinct from 'approvata' then
    f := public.fame_row(new.id);
    if f.converted then return null; end if;
    update public.character_fame_bg set status = 'rifiutata', review_note = 'Non decisa prima dell''approvazione della scheda'
    where character_id = new.id and status = 'in_attesa';
    select coalesce(sum(coalesce(cost_pf, 0)), 0) into v_spent from public.character_fame_bg where character_id = new.id and status = 'approvata';
    v_left := greatest(0, f.pf_pool - v_spent);
    v_px := v_left * coalesce(public.setting_int('fama_tasso_px'), 5);
    update public.character_fame set converted = true, converted_at = now(), pf_converted = v_left, px_from_conversion = v_px, updated_at = now()
    where character_id = new.id and not converted;
    if found and v_px > 0 then
      perform set_config('app.invio_scheda', 'on', true);
      update public.characters set px = px + v_px where id = new.id;
      perform set_config('app.invio_scheda', 'off', true);
      perform public.send_system_message(new.owner_id,
        '⭐ I ' || v_left || ' Punti Fama non spesi di ' || public.first_name(new.name) || ' sono diventati ' || v_px || ' PX.');
    end if;
    perform public.fame_log_add(new.id, 'conversione', v_left || ' PF non spesi → ' || v_px || ' PX (spesi ' || v_spent || ' PF)', v_px);
    perform public.fame_recalc(new.id);
  end if;
  return null;
end;
$$;
revoke execute on function public.characters_fame_status() from public, anon, authenticated;

-- una volta: le schede già sbloccate (in bozza o rifiutate) con i PF chiusi
update public.character_fame f
set converted = false, converted_at = null, pf_converted = 0, px_from_conversion = 0,
    pf_pool = case when f.pf_pool = 0 then coalesce(public.setting_int('fama_pf_iniziali'), 10) else f.pf_pool end,
    updated_at = now()
from public.characters c
where c.id = f.character_id and c.status in ('bozza', 'rifiutata') and f.converted;

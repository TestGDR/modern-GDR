-- =====================================================================
-- FAMA: RIAPRIRE I PUNTI FAMA DI UN PERSONAGGIO SBLOCCATO
-- I personaggi approvati prima della Fama risultano «già convertiti» con
-- 0 PF. Se lo staff li sblocca (bozza o rifiutata), può riaprire i Punti
-- Fama: il giocatore sceglie il background in creazione e alla nuova
-- approvazione i PF non spesi diventano PX. Solo per chi non ha mai
-- ricevuto PX dalla fama (niente doppia conversione).
-- =====================================================================
create or replace function public.fame_reopen(p_character uuid, p_pool int default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.characters;
  f public.character_fame;
  v_pool int := coalesce(p_pool, public.setting_int('fama_pf_iniziali'), 10);
begin
  if not public.has_permission('fama.gestire') then raise exception 'Non hai il permesso di gestire la fama.' using errcode = '42501'; end if;
  select * into c from public.characters where id = p_character;
  if c.id is null then raise exception 'Personaggio non trovato.' using errcode = 'P0001'; end if;
  if c.status not in ('bozza', 'rifiutata') then
    raise exception 'Prima sblocca la scheda (Amministrazione della scheda → Sblocca): i Punti Fama si riaprono solo in bozza.' using errcode = 'P0001';
  end if;
  f := public.fame_row(p_character);
  if f.px_from_conversion > 0 then
    raise exception 'Ha già ricevuto % PX dalla fama: i Punti Fama non si riaprono.', f.px_from_conversion using errcode = 'P0001';
  end if;
  if v_pool < 0 or v_pool > 1000 then raise exception 'PF non validi.' using errcode = 'P0001'; end if;
  update public.character_fame set converted = false, converted_at = null, pf_converted = 0, pf_pool = v_pool, updated_at = now()
  where character_id = p_character;
  perform public.fame_log_add(p_character, 'PF riaperti', 'Punti Fama riaperti con ' || v_pool || ' PF', v_pool);
  perform public.send_system_message(c.owner_id,
    '⭐ Lo staff ha riaperto i Punti Fama di ' || public.first_name(c.name) || ': hai ' || v_pool
    || ' PF da spendere sul background di fama nella creazione (passaggio Scelte). Quelli non spesi diventano PX all''approvazione.');
end;
$$;
revoke execute on function public.fame_reopen(uuid, int) from public, anon;
grant execute on function public.fame_reopen(uuid, int) to authenticated;

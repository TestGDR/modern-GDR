-- =====================================================================
-- GESTIONE → UTENTI: ELIMINA UTENTE
-- admin_delete_user(utente, conferma): cancella l'account di accesso e,
-- a cascata, profilo, personaggio e tutto ciò che gli appartiene (come la
-- pulizia degli account della Manutenzione). Permesso utenti.eliminare;
-- mai se stessi né l'Amministratore, solo livelli inferiori al proprio;
-- per confermare si scrive il nome dell'utente. Resta traccia in admin_log.
-- =====================================================================

create or replace function public.admin_delete_user(p_user uuid, p_confirm text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_rank int;
  v_admin boolean;
begin
  if not public.has_permission('utenti.eliminare') then
    raise exception 'Non hai il permesso di eliminare gli utenti.' using errcode = '42501';
  end if;
  if p_user = auth.uid() then
    raise exception 'Non puoi eliminare te stesso.' using errcode = 'P0001';
  end if;
  select p.username, l.rank, l.is_admin into v_name, v_rank, v_admin
  from public.profiles p join public.user_levels l on l.id = p.level_id
  where p.id = p_user;
  if v_name is null then raise exception 'Utente non trovato.' using errcode = 'P0001'; end if;
  if v_admin then raise exception 'L''Amministratore non si può eliminare.' using errcode = '42501'; end if;
  if v_rank >= public.my_rank() then
    raise exception 'Puoi eliminare solo utenti di livello inferiore al tuo.' using errcode = '42501';
  end if;
  if lower(btrim(coalesce(p_confirm, ''))) <> lower(btrim(v_name)) then
    raise exception 'Per confermare scrivi esattamente il nome dell''utente.' using errcode = 'P0001';
  end if;

  insert into public.admin_log (actor_id, action, entity, entity_label, details)
  values (auth.uid(), 'elimina utente', 'utente', v_name, jsonb_build_object('utente', p_user, 'nome', v_name));

  -- l'account di accesso; il profilo e tutto il resto si cancellano a cascata
  delete from auth.users where id = p_user;
  delete from public.profiles where id = p_user;
end;
$$;
revoke execute on function public.admin_delete_user(uuid, text) from public, anon;
grant execute on function public.admin_delete_user(uuid, text) to authenticated;

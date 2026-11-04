-- =====================================================================
-- SQUADRE ASSEGNATE DALLO STAFF (come i gruppi)
-- I giocatori non entrano, non cambiano squadra o ruolo e non escono più
-- da soli: sport_join, sport_leave e sport_cancel_change non sono più
-- usabili dal sito. Lo staff (sport.gestire) usa Gestione → Sport →
-- Roster: sport_staff_assign mette un personaggio in una squadra con un
-- ruolo (anche a stagione in corso; se era in un'altra squadra la lascia),
-- sport_staff_remove lo toglie. Il giocatore riceve un messaggio di SISTEMA.
-- Le richieste di cambio ancora in attesa restano da approvare o rifiutare.
-- =====================================================================

revoke execute on function public.sport_join(uuid, uuid, uuid) from authenticated;
revoke execute on function public.sport_leave(uuid, uuid) from authenticated;
revoke execute on function public.sport_cancel_change(uuid, uuid) from authenticated;

create or replace function public.sport_staff_assign(p_character uuid, p_sport uuid, p_position uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.sports;
  p public.sport_positions;
  c public.characters;
  cur public.sport_roster;
  v_status text;
begin
  if not public.has_permission('sport.gestire') then raise exception 'Non hai il permesso di gestire lo sport.' using errcode = '42501'; end if;
  select * into c from public.characters where id = p_character for update;
  if c.id is null or c.status <> 'approvata' then raise exception 'Serve un personaggio approvato.' using errcode = 'P0001'; end if;
  select * into s from public.sports where id = p_sport and status = 'active';
  if s.id is null then raise exception 'Sport non disponibile.' using errcode = 'P0001'; end if;
  select * into p from public.sport_positions where id = p_position and sport_id = p_sport;
  if p.id is null then raise exception 'Ruolo non valido per questo sport.' using errcode = 'P0001'; end if;

  -- già in questa squadra: cambio di ruolo
  select * into cur from public.sport_roster where character_id = p_character and sport_id = p_sport and left_at is null;
  if cur.id is not null then
    if cur.position_id = p_position then raise exception 'Ha già questo ruolo.' using errcode = 'P0001'; end if;
    update public.sport_roster set position_id = p_position, pending_sport_id = null, pending_position_id = null where id = cur.id;
    perform public.send_system_message(c.owner_id,
      '🏅 Lo staff ha cambiato il ruolo di ' || public.first_name(c.name) || ' in ' || s.name || ': ora è ' || p.name || '.');
    return 'ruolo';
  end if;

  -- una squadra per personaggio: lascia quella di prima (lo storico resta)
  update public.sport_roster set left_at = now(), pending_sport_id = null, pending_position_id = null,
    squad_status = case when squad_status = 'captain' then 'starter' else squad_status end
  where character_id = p_character and left_at is null;

  perform public.sport_enter(p_character, p_sport, p_position);
  select squad_status into v_status from public.sport_roster where character_id = p_character and sport_id = p_sport and left_at is null;
  perform public.send_system_message(c.owner_id,
    '🏅 Lo staff ha inserito ' || public.first_name(c.name) || ' nella squadra di ' || s.name || ' come ' || p.name
    || case when v_status = 'reserve' then ' (riserva: i posti da titolare sono pieni)' else '' end
    || '. Trovi tutto nella pagina Sport.');
  return 'inserito';
end;
$$;
revoke execute on function public.sport_staff_assign(uuid, uuid, uuid) from public, anon;
grant execute on function public.sport_staff_assign(uuid, uuid, uuid) to authenticated;

create or replace function public.sport_staff_remove(p_character uuid, p_sport uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.characters;
  v_sport text := (select name from public.sports where id = p_sport);
begin
  if not public.has_permission('sport.gestire') then raise exception 'Non hai il permesso di gestire lo sport.' using errcode = '42501'; end if;
  select * into c from public.characters where id = p_character;
  update public.sport_roster set left_at = now(), pending_sport_id = null, pending_position_id = null,
    squad_status = case when squad_status = 'captain' then 'starter' else squad_status end
  where character_id = p_character and sport_id = p_sport and left_at is null;
  if not found then raise exception 'Non fa parte di questa squadra.' using errcode = 'P0001'; end if;
  perform public.send_system_message(c.owner_id,
    '🏅 Lo staff ha tolto ' || public.first_name(c.name) || ' dalla squadra di ' || coalesce(v_sport, 'questo sport') || '. Lo storico delle gare resta.');
end;
$$;
revoke execute on function public.sport_staff_remove(uuid, uuid) from public, anon;
grant execute on function public.sport_staff_remove(uuid, uuid) to authenticated;

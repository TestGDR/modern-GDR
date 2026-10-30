-- =====================================================================
-- PETTEGOLEZZI: ARCHIVIO E AVVISO ALLO STAFF
-- - Si tira il dado: se si è scoperti si manda il pettegolezzo (riassunto,
--   personaggi, chat) allo staff; altrimenti il tiro finisce nell'archivio
--   come "Visto e non visto".
-- - gossip_archive(): l'archivio per tutti (voci approvate e tiri "visto e
--   non visto"), dal più recente; il numero del dado resta allo staff.
-- - Un nuovo pettegolezzo avvisa con un messaggio di SISTEMA chi lo gestisce
--   (Amministratore e livelli con "pettegolezzi.gestire"). Niente più ticket.
-- =====================================================================

create or replace function public.gossip_report(p_roll uuid, p_summary text, p_location uuid, p_room uuid, p_participants uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.gossip_rolls;
  v_author text;
  v_zone text;
  v_names text;
  v_report uuid;
  v_others uuid[];
  v_staff uuid;
begin
  select * into r from public.gossip_rolls where id = p_roll;
  if r.id is null or not public.owns_character(r.character_id) then raise exception 'Tiro non trovato.' using errcode = 'P0001'; end if;
  if not r.seen then raise exception 'Non siete stati scoperti: niente pettegolezzo.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.gossip_reports where roll_id = p_roll) then
    raise exception 'Per questo tiro il pettegolezzo è già stato mandato.' using errcode = 'P0001';
  end if;
  if r.created_at < now() - interval '2 days' then
    raise exception 'Il tiro è troppo vecchio: tirane uno nuovo a fine giocata.' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_summary, ''))) not between 10 and 2000 then
    raise exception 'Scrivi un riassunto tra 10 e 2000 caratteri.' using errcode = 'P0001';
  end if;
  if p_location is null then raise exception 'Indica il quartiere della giocata.' using errcode = 'P0001'; end if;

  select name into v_author from public.characters where id = r.character_id;
  select l.name || coalesce(' · ' || (select name from public.rooms where id = p_room and location_id = l.id), '')
    into v_zone from public.locations l where l.id = p_location;
  if v_zone is null then raise exception 'Quartiere non valido.' using errcode = 'P0001'; end if;
  v_others := array(select c.id from public.characters c
                    where c.id = any (coalesce(p_participants, '{}')) and c.id <> r.character_id and c.status = 'approvata');
  select coalesce(string_agg(c.name, ', ' order by c.name), '') into v_names
  from public.characters c where c.id = any (v_others);

  insert into public.gossip_reports (roll_id, character_id, author_name, participants, participant_names,
                                     location_id, room_id, zone_name, summary)
  values (p_roll, r.character_id, v_author, v_others, v_names, p_location, p_room, v_zone, btrim(p_summary))
  returning id into v_report;

  -- SMS di SISTEMA a chi approva i pettegolezzi
  for v_staff in
    select p.id from public.profiles p join public.user_levels l on l.id = p.level_id
    where l.is_admin or 'pettegolezzi.gestire' = any (l.permissions)
  loop
    perform public.send_system_message(v_staff,
      'Nuovo pettegolezzo da approvare (' || v_zone || ') mandato da ' || public.first_name(v_author)
      || '. Lo trovi in Pettegolezzi → Da approvare.');
  end loop;
  return v_report;
end;
$$;

-- Archivio per tutti: voci approvate e tiri "visto e non visto", dal più recente
create or replace function public.gossip_archive()
returns table (id uuid, kind text, body text, zone text, author text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select * from (
    select g.id as id, 'voce'::text as kind, g.published_text as body, g.zone_name as zone, public.first_name(g.author_name) as author, coalesce(g.reviewed_at, g.created_at) as at
    from public.gossip_reports g
    where g.status = 'approvato'
    union all
    select r.id, 'non_visto'::text, 'Visto e non visto'::text, ''::text, public.first_name(c.name), r.created_at
    from public.gossip_rolls r join public.characters c on c.id = r.character_id
    where not r.seen
  ) a
  where auth.uid() is not null
  order by a.at desc
  limit 300;
$$;
revoke execute on function public.gossip_archive() from public, anon;
grant execute on function public.gossip_archive() to authenticated;

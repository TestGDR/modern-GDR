-- =====================================================================
-- SCONTRI MULTIPLI NELLA STESSA CHAT
-- Prima: un solo scontro per chat. Ora più scontri contemporanei (una rissa
-- al bancone e una in fondo al locale), numerati per chat ("Scontro 1",
-- "Scontro 2"; negli esiti compare il numero quando ce n'è più d'uno).
-- Dentro ogni scontro resta tutto com'era: turni per iniziativa, una difesa
-- alla volta, chiunque attacca chiunque (1 contro 2, tutti contro tutti) e
-- gli altri presenti possono entrare. Un personaggio sta in un solo scontro
-- alla volta; chi abbandona può rientrare (se non è fuori combattimento).
-- =====================================================================

drop index if exists public.combats_one_active_per_room;
alter table public.combats add column if not exists number int not null default 1 check (number between 1 and 50);
create index if not exists combats_room_active_idx on public.combats (room_id) where status = 'in_corso';

-- Lo scontro in corso in cui il personaggio sta combattendo (null se nessuno)
create or replace function public.combat_engaged(p_character uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id from public.combats c join public.combat_participants p on p.combat_id = c.id
  where c.status = 'in_corso' and p.character_id = p_character and not p.out
  limit 1
$$;
revoke execute on function public.combat_engaged(uuid) from public, anon, authenticated;

create or replace function public.combat_say(p_combat uuid, p_action bigint, p_character uuid, p_text text, p_detail jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room uuid;
  v_number int;
  v_msg bigint;
begin
  select room_id, number into v_room, v_number from public.combats where id = p_combat;
  -- con più scontri nella stessa chat, ogni esito dice di quale si tratta
  if exists (select 1 from public.combats where room_id = v_room and status = 'in_corso' and id <> p_combat)
     or exists (select 1 from public.combats where room_id = v_room and id <> p_combat and closed_at > now() - interval '10 minutes') then
    p_text := 'Scontro ' || v_number || ' · ' || p_text;
  end if;
  insert into public.messages (room_id, character_id, kind, content)
  values (v_room, p_character, 'combattimento', left(p_text, 3900))
  returning id into v_msg;
  if p_detail is not null then
    insert into public.combat_log (combat_id, action_id, message_id, detail) values (p_combat, p_action, v_msg, p_detail);
  end if;
  return v_msg;
end;
$$;

create or replace function public.combat_start(p_room uuid, p_character uuid, p_opponents uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_combat uuid;
  v_id uuid;
  v_ini jsonb;
  v_names text;
  v_detail jsonb := '[]'::jsonb;
  v_first uuid;
begin
  if not public.owns_character(p_character) then raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501'; end if;
  if not public.combat_can_fight(p_character, p_room) then
    raise exception 'Per combattere devi essere in giocata in questa chat e non fuori combattimento.' using errcode = 'P0001';
  end if;
  if coalesce(array_length(p_opponents, 1), 0) = 0 then raise exception 'Scegli almeno un avversario.' using errcode = 'P0001'; end if;
  -- uno scontro alla volta per personaggio (in chat possono esserci più scontri)
  if public.combat_engaged(p_character) is not null then
    raise exception 'Sei già in uno scontro: abbandonalo prima di iniziarne un altro.' using errcode = 'P0001';
  end if;
  foreach v_id in array p_opponents loop
    if v_id = p_character or not public.combat_can_fight(v_id, p_room) then
      raise exception 'Un avversario non è in giocata qui o non può combattere.' using errcode = 'P0001';
    end if;
    if public.combat_engaged(v_id) is not null then
      raise exception '% è già in un altro scontro: entra in quello, oppure aspetta che finisca.',
        public.first_name((select name from public.characters where id = v_id)) using errcode = 'P0001';
    end if;
  end loop;

  -- numero dello scontro nella chat: il più basso libero tra quelli in corso
  insert into public.combats (room_id, created_by, number)
  values (p_room, p_character, (
    select min(n) from generate_series(1, 50) n
    where not exists (select 1 from public.combats x where x.room_id = p_room and x.status = 'in_corso' and x.number = n)))
  returning id into v_combat;
  foreach v_id in array (array[p_character] || p_opponents) loop
    v_ini := public.combat_initiative(v_id);
    insert into public.combat_participants (combat_id, character_id, name, initiative, rif)
    select v_combat, v_id, c.name, (v_ini ->> 'total')::int, (v_ini ->> 'rif')::int from public.characters c where c.id = v_id
    on conflict do nothing;
    v_detail := v_detail || jsonb_build_object('character_id', v_id, 'iniziativa', v_ini);
  end loop;
  perform public.combat_reorder(v_combat);
  select string_agg(public.first_name(p.name), ', ' order by array_position(c.turn_order, p.character_id))
    into v_names
  from public.combat_participants p join public.combats c on c.id = p.combat_id where p.combat_id = v_combat;
  select turn_order[1] into v_first from public.combats where id = v_combat;
  perform public.combat_say(v_combat, null, p_character,
    'Inizia uno scontro! Ordine di turno: ' || v_names || '. Tocca a '
      || public.first_name((select name from public.combat_participants where combat_id = v_combat and character_id = v_first)) || '.',
    jsonb_build_object('tipo', 'iniziativa', 'tiri', v_detail));
  return v_combat;
end;
$$;

create or replace function public.combat_join(p_combat uuid, p_character uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.combats;
  v_ini jsonb;
  v_current uuid;
begin
  select * into c from public.combats where id = p_combat and status = 'in_corso' for update;
  if c.id is null then raise exception 'Scontro non in corso.' using errcode = 'P0001'; end if;
  if not public.owns_character(p_character) then raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501'; end if;
  if not public.combat_can_fight(p_character, c.room_id) then
    raise exception 'Per combattere devi essere in giocata in questa chat e non fuori combattimento.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.combat_participants where combat_id = p_combat and character_id = p_character and not out) then
    raise exception 'Sei già nello scontro.' using errcode = 'P0001';
  end if;
  if public.combat_engaged(p_character) is not null then
    raise exception 'Sei già in un altro scontro: abbandonalo prima di entrare in questo.' using errcode = 'P0001';
  end if;
  -- chi aveva abbandonato rientra con una nuova iniziativa
  delete from public.combat_participants where combat_id = p_combat and character_id = p_character and out
    and not exists (select 1 from public.character_health h where h.character_id = p_character and h.hp = 0);
  v_current := c.turn_order[c.turn_index + 1];
  v_ini := public.combat_initiative(p_character);
  insert into public.combat_participants (combat_id, character_id, name, initiative, rif)
  select p_combat, p_character, ch.name, (v_ini ->> 'total')::int, (v_ini ->> 'rif')::int from public.characters ch where ch.id = p_character;
  perform public.combat_reorder(p_combat);
  -- il turno resta a chi lo aveva
  update public.combats set turn_index = array_position(turn_order, v_current) - 1 where id = p_combat;
  perform public.combat_say(p_combat, null, p_character,
    public.first_name((select name from public.characters where id = p_character)) || ' entra nello scontro.',
    jsonb_build_object('tipo', 'iniziativa', 'tiri', jsonb_build_array(jsonb_build_object('character_id', p_character, 'iniziativa', v_ini))));
end;
$$;

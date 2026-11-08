-- =====================================================================
-- CEDERE UN OGGETTO IN CHAT
-- Dal pannello «Oggetti» della chat un personaggio in giocata dà un suo
-- oggetto (intero, con le cariche rimaste) a un altro personaggio in giocata
-- nella stessa chat. L'oggetto passa all'altro con tutto (anche la spesa
-- mensile, se ne ha una; «con sé» si toglie) e in chat compare il passaggio.
-- =====================================================================

create or replace function public.item_give(p_character uuid, p_item bigint, p_room uuid, p_to uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  it public.character_items;
  v_to text;
begin
  if not public.owns_character(p_character) then
    raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501';
  end if;
  if not public.can_enter_room(p_room) then
    raise exception 'Non puoi farlo in questa chat.' using errcode = '42501';
  end if;
  if p_to = p_character then
    raise exception 'Scegli un altro personaggio.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.chat_presence where room_id = p_room and character_id = p_character) then
    raise exception 'Prima entra in giocata.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.chat_presence where room_id = p_room and character_id = p_to) then
    raise exception 'Puoi cedere un oggetto solo a chi è in giocata con te in questa chat.' using errcode = 'P0001';
  end if;
  select public.first_name(c.name) into v_to from public.characters c where c.id = p_to and c.status = 'approvata';
  if v_to is null then
    raise exception 'Personaggio non trovato.' using errcode = 'P0001';
  end if;

  select * into it from public.character_items where id = p_item and character_id = p_character for update;
  if it.id is null then
    raise exception 'Oggetto non trovato.' using errcode = 'P0001';
  end if;

  update public.character_items
  set character_id = p_to, carried = false, acquired_at = now()
  where id = it.id;

  insert into public.messages (room_id, character_id, kind, content)
  values (p_room, p_character, 'sistema',
    'cede ' || it.name
    || case when it.charges_left is not null then ' (' || it.charges_left || case when it.charges_left = 1 then ' carica' else ' cariche' end || ')' else '' end
    || ' a ' || v_to || '.');
end;
$$;
revoke execute on function public.item_give(uuid, bigint, uuid, uuid) from public, anon;
grant execute on function public.item_give(uuid, bigint, uuid, uuid) to authenticated;

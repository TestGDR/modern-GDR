-- =====================================================================
-- PNG (personaggi non giocanti)
-- - PNG di ambientazione: li crea lo staff (permesso png.gestire).
-- - PNG dei giocatori (Mentore, Coinquilino, Ex, Nemico…): li propone il
--   giocatore dalla sua scheda, lo staff li approva; da lì li interpreta
--   il Master. Ogni modifica del giocatore li rimanda in approvazione.
-- - I PNG segreti (es. un Nemico) li vedono solo il giocatore collegato e lo staff.
-- - In chat chi narra (chat.narrazione) può parlare "come" un PNG approvato:
--   messaggio kind 'png' con nome e ritratto del PNG (scritto da chat_npc_say).
-- =====================================================================

create table public.npcs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 60),
  -- es. "Mentore", "Barista del Lighthouse", "Coinquilino"
  role text not null default '' check (char_length(role) <= 60),
  description text not null default '' check (char_length(description) <= 2000),
  avatar_url text check (avatar_url is null or avatar_url ~ '^https://'),
  kind text not null default 'giocatore' check (kind in ('ambiente', 'giocatore')),
  -- il PG a cui è legato (solo PNG dei giocatori)
  owner_character_id uuid references public.characters (id) on delete cascade,
  secret boolean not null default false,
  status text not null default 'proposto' check (status in ('proposto', 'approvato', 'rifiutato')),
  review_note text not null default '' check (char_length(review_note) <= 500),
  reviewed_by uuid references public.profiles (id) on delete set null,
  active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind = 'ambiente' or owner_character_id is not null)
);
create index npcs_owner_idx on public.npcs (owner_character_id);
create index npcs_created_by_idx on public.npcs (created_by);
create index npcs_reviewed_by_idx on public.npcs (reviewed_by);

-- Chi gestisce i PNG o li interpreta in chat li vede tutti
create or replace function public.npc_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select public.has_permission('png.gestire') or public.has_permission('chat.narrazione') $$;
revoke execute on function public.npc_staff() from public, anon;
grant execute on function public.npc_staff() to authenticated;

-- Il giocatore proprietario del PG collegato
create or replace function public.npc_mine(p_character uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select exists (select 1 from public.characters c where c.id = p_character and c.owner_id = auth.uid()) $$;
revoke execute on function public.npc_mine(uuid) from public, anon;
grant execute on function public.npc_mine(uuid) to authenticated;

alter table public.npcs enable row level security;
revoke all on public.npcs from anon, authenticated;
grant select, insert, update, delete on public.npcs to authenticated;
create policy "PNG: approvati e pubblici per tutti, il resto a proprietario e staff" on public.npcs for select to authenticated
  using (
    (status = 'approvato' and active and not secret)
    or (select public.npc_staff())
    or (owner_character_id is not null and public.npc_mine(owner_character_id))
  );
create policy "PNG: lo staff li crea, i giocatori li propongono" on public.npcs for insert to authenticated
  with check (
    (select public.has_permission('png.gestire'))
    or (kind = 'giocatore' and status = 'proposto' and public.owns_character(owner_character_id))
  );
create policy "PNG: lo staff li modifica, il giocatore i suoi" on public.npcs for update to authenticated
  using ((select public.has_permission('png.gestire')) or (kind = 'giocatore' and public.npc_mine(owner_character_id)))
  with check ((select public.has_permission('png.gestire')) or (kind = 'giocatore' and public.owns_character(owner_character_id)));
create policy "PNG: lo staff li elimina, il giocatore le sue proposte" on public.npcs for delete to authenticated
  using ((select public.has_permission('png.gestire')) or (kind = 'giocatore' and status <> 'approvato' and public.npc_mine(owner_character_id)));

-- Il giocatore non approva da solo: ogni sua modifica torna "proposta"
create or replace function public.npcs_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  -- SQL Editor (nessun utente) o staff: tutto consentito
  if auth.uid() is null or public.has_permission('png.gestire') then
    if tg_op = 'UPDATE' and new.status is distinct from old.status then
      new.reviewed_by := auth.uid();
    end if;
    return new;
  end if;
  new.kind := 'giocatore';
  new.status := 'proposto';
  new.review_note := case when tg_op = 'UPDATE' then old.review_note else '' end;
  new.reviewed_by := null;
  new.active := true;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  else
    new.created_by := old.created_by;
    new.owner_character_id := old.owner_character_id;
  end if;
  return new;
end;
$$;
revoke execute on function public.npcs_guard() from public, anon, authenticated;
create trigger npcs_guard before insert or update on public.npcs
  for each row execute function public.npcs_guard();

create trigger npcs_log after insert or update or delete on public.npcs
  for each row execute function public.log_admin_change();

-- Nuova proposta: avviso allo staff che gestisce i PNG
create or replace function public.npcs_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  u record;
  v_pg text;
begin
  if new.kind <> 'giocatore' then return null; end if;
  select public.first_name(name) into v_pg from public.characters where id = new.owner_character_id;
  -- proposta (nuova o modificata) → staff
  if new.status = 'proposto' and (tg_op = 'INSERT' or old.status is distinct from 'proposto' or old.name <> new.name or old.description <> new.description) then
    for u in
      select p.id from public.profiles p join public.user_levels l on l.id = p.level_id
      where (l.is_admin or 'png.gestire' = any (l.permissions)) and p.id is distinct from auth.uid()
    loop
      perform public.send_system_message(u.id,
        '🎭 PNG da approvare: ' || new.name || coalesce(' (' || nullif(new.role, '') || ')', '') || ', proposto per ' || coalesce(v_pg, 'un personaggio')
        || '. Lo trovi in Utility → PNG.');
    end loop;
  end if;
  -- esito → giocatore
  if tg_op = 'UPDATE' and new.status is distinct from old.status and new.status in ('approvato', 'rifiutato') then
    perform public.send_system_message((select owner_id from public.characters where id = new.owner_character_id),
      case when new.status = 'approvato' then '🎭 Il tuo PNG ' || new.name || ' è stato approvato: da ora il Master può interpretarlo in gioco.'
           else '🎭 Il tuo PNG ' || new.name || ' non è stato approvato' || coalesce(': ' || nullif(new.review_note, ''), '.') || ' Puoi correggerlo e riproporlo da Utility → PNG.' end);
  end if;
  return null;
end;
$$;
revoke execute on function public.npcs_notify() from public, anon, authenticated;
create trigger npcs_notify after insert or update on public.npcs
  for each row execute function public.npcs_notify();

-- Permesso al livello Master (l'Amministratore li ha già tutti)
update public.user_levels
set permissions = array_append(permissions, 'png.gestire')
where name = 'Master' and not ('png.gestire' = any (permissions));

-- ---------------------------------------------------------------------
-- I PNG PARLANO IN CHAT
-- ---------------------------------------------------------------------
alter table public.messages add column if not exists npc_id uuid references public.npcs (id) on delete set null;
create index if not exists messages_npc_idx on public.messages (npc_id);
alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check
  check (kind in ('azione', 'fuori_gioco', 'master', 'dado', 'sistema', 'sussurro', 'combattimento', 'png'));

-- Il nome mostrato è quello del PNG (dopo messages_before_insert, in ordine alfabetico)
create or replace function public.messages_npc_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.npc_id is not null then
    select name into new.character_name from public.npcs where id = new.npc_id;
  end if;
  return new;
end;
$$;
revoke execute on function public.messages_npc_name() from public, anon, authenticated;
drop trigger if exists messages_npc_name on public.messages;
create trigger messages_npc_name before insert on public.messages
  for each row execute function public.messages_npc_name();

-- Chi narra scrive come un PNG approvato (dal proprio personaggio in giocata)
create or replace function public.chat_npc_say(p_room uuid, p_character uuid, p_npc uuid, p_content text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
  v_text text := btrim(coalesce(p_content, ''));
begin
  if not public.owns_character(p_character) then raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501'; end if;
  if not public.has_permission('chat.narrazione') then raise exception 'Solo chi narra può parlare come un PNG.' using errcode = '42501'; end if;
  if not exists (select 1 from public.npcs where id = p_npc and status = 'approvato' and active) then
    raise exception 'PNG non disponibile.' using errcode = 'P0001';
  end if;
  if not public.can_enter_room(p_room) then raise exception 'Non puoi scrivere in questa chat.' using errcode = '42501'; end if;
  if not exists (select 1 from public.rooms where id = p_room and (is_open or public.has_permission('chat.moderare'))) then
    raise exception 'Questa chat è chiusa.' using errcode = 'P0001';
  end if;
  if not (public.i_am_invisible() or exists (select 1 from public.chat_presence where room_id = p_room and character_id = p_character)) then
    raise exception 'Per scrivere devi essere in giocata in questa chat.' using errcode = 'P0001';
  end if;
  if char_length(v_text) = 0 then raise exception 'Scrivi qualcosa.' using errcode = 'P0001'; end if;
  insert into public.messages (room_id, character_id, kind, content, npc_id)
  values (p_room, p_character, 'png', v_text, p_npc)
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.chat_npc_say(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.chat_npc_say(uuid, uuid, uuid, text) to authenticated;

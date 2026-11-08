-- =====================================================================
-- SOTTO-TAG DELLE CHAT
-- Dentro una chat (anche con password) chi ha il permesso chat.sottotag
-- crea dei sotto-tag (es. «Caffetteria» → «Bancone», «Tavoli fuori»).
-- Ogni personaggio in giocata ne sceglie uno (chat_presence.tag_id, nessuno
-- = parte principale); ogni messaggio prende il sotto-tag di chi lo scrive
-- (messages.tag_id, deciso dal database). In chat i messaggi degli altri
-- sotto-tag si vedono più piccoli e sbiaditi.
-- =====================================================================

create table if not exists public.room_tags (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  position int not null default 0,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index if not exists room_tags_room_name_idx on public.room_tags (room_id, lower(btrim(name)));
create index if not exists room_tags_room_idx on public.room_tags (room_id, position);

alter table public.room_tags enable row level security;
revoke all on public.room_tags from anon, authenticated;
grant select, delete on public.room_tags to authenticated;
grant insert (room_id, name, position) on public.room_tags to authenticated;
grant update (name, position) on public.room_tags to authenticated;

drop policy if exists "Sotto-tag: visibili a chi entra nella chat" on public.room_tags;
create policy "Sotto-tag: visibili a chi entra nella chat" on public.room_tags for select to authenticated
  using ((select public.can_enter_room(room_id)) or (select public.has_permission('chat.log')));
drop policy if exists "Sotto-tag: li crea chi ha il permesso" on public.room_tags;
create policy "Sotto-tag: li crea chi ha il permesso" on public.room_tags for insert to authenticated
  with check ((select public.has_permission('chat.sottotag')) and (select public.can_enter_room(room_id)));
drop policy if exists "Sotto-tag: li modifica chi ha il permesso" on public.room_tags;
create policy "Sotto-tag: li modifica chi ha il permesso" on public.room_tags for update to authenticated
  using ((select public.has_permission('chat.sottotag')) and (select public.can_enter_room(room_id)))
  with check ((select public.has_permission('chat.sottotag')) and (select public.can_enter_room(room_id)));
drop policy if exists "Sotto-tag: li elimina chi ha il permesso" on public.room_tags;
create policy "Sotto-tag: li elimina chi ha il permesso" on public.room_tags for delete to authenticated
  using ((select public.has_permission('chat.sottotag')) and (select public.can_enter_room(room_id)));

-- sotto-tag scelto da chi è in giocata e sotto-tag di ogni messaggio
alter table public.chat_presence add column if not exists tag_id uuid references public.room_tags (id) on delete set null;
alter table public.messages add column if not exists tag_id uuid references public.room_tags (id) on delete set null;
create index if not exists messages_tag_idx on public.messages (tag_id);
create index if not exists chat_presence_tag_idx on public.chat_presence (tag_id);

-- Il personaggio sceglie il sotto-tag (null = parte principale della chat)
create or replace function public.chat_set_tag(p_room uuid, p_character uuid, p_tag uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.owns_character(p_character) then
    raise exception 'Non è il tuo personaggio.' using errcode = '42501';
  end if;
  if p_tag is not null and not exists (select 1 from public.room_tags t where t.id = p_tag and t.room_id = p_room) then
    raise exception 'Questo sotto-tag non esiste più.';
  end if;
  update public.chat_presence set tag_id = p_tag
  where room_id = p_room and character_id = p_character;
  if not found then
    raise exception 'Per scegliere un sotto-tag devi essere in giocata in questa chat.';
  end if;
end;
$$;
revoke execute on function public.chat_set_tag(uuid, uuid, uuid) from public, anon;
grant execute on function public.chat_set_tag(uuid, uuid, uuid) to authenticated;

-- Il sotto-tag del messaggio è quello di chi scrive in quel momento (i messaggi di sistema no)
create or replace function public.messages_set_tag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'sistema' then
    new.tag_id := null;
  else
    new.tag_id := (select p.tag_id from public.chat_presence p where p.room_id = new.room_id and p.character_id = new.character_id);
  end if;
  return new;
end;
$$;
drop trigger if exists messages_set_tag on public.messages;
create trigger messages_set_tag before insert on public.messages
  for each row execute function public.messages_set_tag();

-- Tempo reale: chi è in chat vede subito i sotto-tag nuovi
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'room_tags') then
    alter publication supabase_realtime add table public.room_tags;
  end if;
end;
$$;

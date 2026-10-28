-- =====================================================================
-- MONDO E CHAT (fase 3 del documento "Funzioni generiche")
-- Logica ripresa dal Westeros GDR (migrazioni 0021, 0024, 0105, 0109,
-- 0110-0112, 0124-0130), adattata al College:
--
--   maps          mappe (Miami, in futuro p. es. il campus), attivabili
--   locations     i quartieri (prima "districts"), punto x/y in % sulla mappa
--   rooms         le chat dentro i quartieri (prima "places"):
--                 accesso 'pubblica' oppure 'su_invito' (case, appartamenti…)
--   room_groups   gruppi di chat dentro un quartiere ("Locali", "Case"…)
--   room_guests   invitati delle chat su invito
--   messages      i messaggi della chat (sostituisce chat_messages)
--   chat_presence chi è "in giocata" in una chat
--   chat_settings lunghezza massima, durata dei messaggi, uscita automatica
--
-- I vecchi messaggi di prova di chat_messages vengono eliminati.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PERMESSI: nuove chiavi del catalogo del College
--    luoghi.gestire            -> mondo.gestire
--    scene.gestire             -> chat.narrazione
--    messaggi.modificare_altrui -> chat.moderare
--    messaggi.modificare_propri -> tolto (la correzione entro 5 minuti vale per tutti)
-- ---------------------------------------------------------------------
update public.user_levels
set permissions = array(
  select distinct case p
    when 'luoghi.gestire' then 'mondo.gestire'
    when 'scene.gestire' then 'chat.narrazione'
    when 'messaggi.modificare_altrui' then 'chat.moderare'
    else p
  end
  from unnest(permissions) as p
  where p <> 'messaggi.modificare_propri'
)
where permissions && array['luoghi.gestire', 'scene.gestire', 'messaggi.modificare_altrui', 'messaggi.modificare_propri'];

-- ---------------------------------------------------------------------
-- 2. IMPOSTAZIONI DELLA CHAT (Gestione -> Chat)
-- ---------------------------------------------------------------------
create table public.chat_settings (
  id boolean primary key default true check (id),
  -- caratteri massimi di un messaggio (non vale per dadi e avvisi)
  max_length int not null default 1200 check (max_length between 100 and 4000),
  -- per quanti minuti un messaggio resta visibile in chat
  ttl_minutes int not null default 60 check (ttl_minutes between 10 and 1440),
  -- dopo quanti minuti senza scrivere si esce da soli dalla giocata
  idle_minutes int not null default 120 check (idle_minutes between 15 and 1440)
);
insert into public.chat_settings (id) values (true);

alter table public.chat_settings enable row level security;
revoke all on public.chat_settings from anon, authenticated;
grant select on public.chat_settings to authenticated;
grant update (max_length, ttl_minutes, idle_minutes) on public.chat_settings to authenticated;

create policy "Chat: impostazioni visibili" on public.chat_settings for select to authenticated using (true);
create policy "Chat: impostazioni dei gestori" on public.chat_settings for update to authenticated
  using ((select public.has_permission('mondo.gestire')))
  with check ((select public.has_permission('mondo.gestire')));

create trigger chat_settings_log after update on public.chat_settings
  for each row execute function public.log_admin_change();

-- Durate lette dalle impostazioni
create or replace function public.chat_idle()
returns interval
language sql
stable
security definer
set search_path = ''
as $$
  select make_interval(mins => coalesce((select idle_minutes from public.chat_settings limit 1), 120));
$$;

create or replace function public.chat_ttl()
returns interval
language sql
stable
security definer
set search_path = ''
as $$
  select make_interval(mins => coalesce((select ttl_minutes from public.chat_settings limit 1), 60));
$$;

-- ---------------------------------------------------------------------
-- 3. MAPPE
-- ---------------------------------------------------------------------
create table public.maps (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  description text not null default '' check (char_length(description) <= 2000),
  -- immagine caricata dallo staff; senza immagine si vede la Miami disegnata
  image_url text check (image_url is null or image_url ~ '^https://'),
  sort_order int not null default 0,
  active boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.maps enable row level security;
revoke all on public.maps from anon, authenticated;
grant select, insert, update, delete on public.maps to authenticated;

create policy "Mappe: visibili se attive" on public.maps for select to authenticated
  using (active or (select public.has_permission('mondo.gestire')));
create policy "Mappe: le crea chi gestisce il mondo" on public.maps for insert to authenticated
  with check ((select public.has_permission('mondo.gestire')));
create policy "Mappe: le modifica chi gestisce il mondo" on public.maps for update to authenticated
  using ((select public.has_permission('mondo.gestire')))
  with check ((select public.has_permission('mondo.gestire')));
create policy "Mappe: le elimina chi gestisce il mondo" on public.maps for delete to authenticated
  using ((select public.has_permission('mondo.gestire')));

insert into public.maps (name, description, sort_order, active)
values ('Miami', 'La città: quartieri, spiagge e locali affacciati sulla baia.', 1, true);

-- ---------------------------------------------------------------------
-- 4. QUARTIERI: districts diventa locations
-- ---------------------------------------------------------------------
alter table public.districts rename to locations;

alter table public.locations
  add column map_id uuid references public.maps (id) on delete cascade,
  add column x numeric(5, 2),
  add column y numeric(5, 2),
  add column description text not null default '' check (char_length(description) <= 2000);

-- I vecchi punti (disegno 300x400) diventano percentuali
update public.locations
set map_id = (select id from public.maps where name = 'Miami'),
    x = round(map_x / 3.0, 2),
    y = round(map_y / 4.0, 2);

alter table public.locations
  alter column map_id set not null,
  alter column x set not null,
  alter column y set not null,
  alter column x set default 50,
  alter column y set default 50,
  add constraint locations_x_range check (x between 0 and 100),
  add constraint locations_y_range check (y between 0 and 100),
  drop column map_x,
  drop column map_y,
  drop column slug;

create index locations_map_id_idx on public.locations (map_id, sort_order);

-- Quartieri proposti nel documento che mancavano
insert into public.locations (map_id, name, tagline, x, y, gradient, sort_order)
select m.id, v.name, v.tagline, v.x, v.y, v.gradient, v.sort_order
from public.maps m,
(values
  ('Design District', 'Boutique, showroom e architettura', 42.00, 26.00, 'from-orchid via-lavender to-sand',   9),
  ('Little Haiti',    'Colori, mercati e musica kompa',    36.00, 16.50, 'from-flamingo via-orchid to-peach',  10),
  ('Coral Gables',    'Viali alberati e ville mediterranee', 20.00, 67.00, 'from-violet via-orchid to-sand',  11),
  ('Key Biscayne',    'L''isola oltre il ponte',            68.00, 83.00, 'from-dusk via-lavender to-mint',    12)
) as v (name, tagline, x, y, gradient, sort_order)
where m.name = 'Miami';

-- I giocatori vedono solo i quartieri delle mappe attive
revoke all on public.locations from anon, authenticated;
grant select, insert, update, delete on public.locations to authenticated;

drop policy "Quartieri: lettura per tutti" on public.locations;
create policy "Quartieri: visibili sulle mappe attive" on public.locations for select to authenticated
  using (
    exists (select 1 from public.maps m where m.id = map_id and m.active)
    or (select public.has_permission('mondo.gestire'))
  );
alter policy "Quartieri: lo staff li crea" on public.locations
  with check ((select public.has_permission('mondo.gestire')));
alter policy "Quartieri: lo staff li modifica" on public.locations
  using ((select public.has_permission('mondo.gestire'))) with check ((select public.has_permission('mondo.gestire')));
alter policy "Quartieri: lo staff li elimina" on public.locations
  using ((select public.has_permission('mondo.gestire')));

-- ---------------------------------------------------------------------
-- 5. GRUPPI DI CHAT dentro un quartiere (Westeros 0024)
-- ---------------------------------------------------------------------
create table public.room_groups (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index room_groups_location_idx on public.room_groups (location_id, sort_order);

alter table public.room_groups enable row level security;
revoke all on public.room_groups from anon, authenticated;
grant select, insert, update, delete on public.room_groups to authenticated;

create policy "Gruppi: visibili come i quartieri" on public.room_groups for select to authenticated
  using (
    exists (
      select 1 from public.locations l join public.maps m on m.id = l.map_id
      where l.id = location_id and m.active
    )
    or (select public.has_permission('mondo.gestire'))
  );
create policy "Gruppi: li crea chi gestisce il mondo" on public.room_groups for insert to authenticated
  with check ((select public.has_permission('mondo.gestire')));
create policy "Gruppi: li modifica chi gestisce il mondo" on public.room_groups for update to authenticated
  using ((select public.has_permission('mondo.gestire')))
  with check ((select public.has_permission('mondo.gestire')));
create policy "Gruppi: li elimina chi gestisce il mondo" on public.room_groups for delete to authenticated
  using ((select public.has_permission('mondo.gestire')));

-- ---------------------------------------------------------------------
-- 6. CHAT: places diventa rooms
-- ---------------------------------------------------------------------
alter table public.places rename to rooms;
alter table public.rooms rename column district_id to location_id;
alter index public.places_district_id_idx rename to rooms_location_id_idx;

alter table public.rooms drop column slug;
alter table public.rooms drop constraint if exists places_description_check;
update public.rooms set description = '' where description is null;
alter table public.rooms
  alter column description set default '',
  alter column description set not null,
  add constraint rooms_description_len check (char_length(description) <= 2000),
  add column group_id uuid references public.room_groups (id) on delete set null,
  add column image_url text check (image_url is null or image_url ~ '^https://'),
  -- 'pubblica' oppure 'su_invito' (case, appartamenti, locali privati)
  add column access text not null default 'pubblica' check (access in ('pubblica', 'su_invito')),
  -- personaggio che "possiede" la chat su invito: invita e allontana
  add column owner_character_id uuid references public.characters (id) on delete set null,
  -- l'ultima volta che la chat si è svuotata (i messaggi di prima non si vedono più)
  add column cleared_at timestamptz,
  -- modalità master: minimo e massimo di caratteri delle azioni
  add column master_min int check (master_min between 0 and 4000),
  add column master_max int check (master_max between 1 and 4000),
  add column master_by text;

create index rooms_group_id_idx on public.rooms (group_id);
create index rooms_owner_character_id_idx on public.rooms (owner_character_id);

-- I giocatori possono solo leggere; le colonne di stato le cambiano le funzioni
revoke all on public.rooms from anon, authenticated;
grant select on public.rooms to authenticated;
grant insert (location_id, name, description, is_open, sort_order, group_id, image_url, access, owner_character_id)
  on public.rooms to authenticated;
grant update (location_id, name, description, is_open, sort_order, group_id, image_url, access, owner_character_id)
  on public.rooms to authenticated;
grant delete on public.rooms to authenticated;

-- La chat sta su una mappa attiva
create or replace function public.room_on_active_map(r uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.rooms ro
    join public.locations l on l.id = ro.location_id
    join public.maps m on m.id = l.map_id
    where ro.id = r and m.active
  );
$$;

drop policy "Luoghi: lettura per tutti" on public.rooms;
create policy "Chat: visibili sulle mappe attive" on public.rooms for select to authenticated
  using ((select public.room_on_active_map(id)) or (select public.has_permission('mondo.gestire')));
alter policy "Luoghi: lo staff li crea" on public.rooms
  with check ((select public.has_permission('mondo.gestire')));
alter policy "Luoghi: lo staff li modifica" on public.rooms
  using ((select public.has_permission('mondo.gestire'))) with check ((select public.has_permission('mondo.gestire')));
alter policy "Luoghi: lo staff li elimina" on public.rooms
  using ((select public.has_permission('mondo.gestire')));

-- ---------------------------------------------------------------------
-- 7. INVITATI delle chat su invito
-- ---------------------------------------------------------------------
create table public.room_guests (
  room_id uuid not null references public.rooms (id) on delete cascade,
  character_id uuid not null references public.characters (id) on delete cascade,
  invited_by uuid references public.characters (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (room_id, character_id)
);
create index room_guests_character_idx on public.room_guests (character_id);

alter table public.room_guests enable row level security;
revoke all on public.room_guests from anon, authenticated;
grant select on public.room_guests to authenticated;
-- Si scrivono solo con invite_to_room / expel_from_room
create policy "Invitati: visibili" on public.room_guests for select to authenticated using (true);

-- Un personaggio dell'utente è tra gli invitati
create or replace function public.is_room_guest(r uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.room_guests g
    join public.characters c on c.id = g.character_id
    where g.room_id = r and c.owner_id = auth.uid() and c.status = 'approvata'
  );
$$;

-- Personaggio dell'utente che "comanda" la chat su invito (null se nessuno)
create or replace function public.room_controller(r uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id
  from public.rooms ro
  join public.characters c on c.id = ro.owner_character_id
  where ro.id = r and ro.access = 'su_invito'
    and c.owner_id = auth.uid() and c.status = 'approvata';
$$;

-- Chi può entrare in una chat
create or replace function public.can_enter_room(r uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.has_permission('chat.moderare') then exists (select 1 from public.rooms where id = r)
    when not public.room_on_active_map(r) then false
    else coalesce((
      select case ro.access
        when 'pubblica' then true
        when 'su_invito' then public.room_controller(r) is not null or public.is_room_guest(r)
        else false
      end
      from public.rooms ro where ro.id = r), false)
  end;
$$;

-- ---------------------------------------------------------------------
-- 8. STAFF INVISIBILE (Westeros 0112)
-- ---------------------------------------------------------------------
alter table public.profiles add column invisible boolean not null default false;

create or replace function public.i_am_invisible()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_permission('staff.invisibile')
     and exists (select 1 from public.profiles where id = auth.uid() and invisible);
$$;

-- ---------------------------------------------------------------------
-- 9. PRESENTI IN GIOCATA (Westeros 0110-0111)
-- ---------------------------------------------------------------------
create table public.chat_presence (
  room_id uuid not null references public.rooms (id) on delete cascade,
  character_id uuid not null references public.characters (id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  primary key (room_id, character_id)
);
create index chat_presence_character_idx on public.chat_presence (character_id);

alter table public.chat_presence enable row level security;
revoke all on public.chat_presence from anon, authenticated;
grant select on public.chat_presence to authenticated;

-- Le proprie presenze si vedono sempre (link alla giocata in corso)
create policy "Presenti: visibili a chi può entrare" on public.chat_presence for select to authenticated
  using (
    (select public.can_enter_room(room_id))
    or exists (select 1 from public.characters c where c.id = character_id and c.owner_id = (select auth.uid()))
  );

-- Il personaggio dell'utente è in giocata in questa chat
create or replace function public.in_chat(r uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.chat_presence p
    join public.characters c on c.id = p.character_id
    where p.room_id = r and c.owner_id = auth.uid()
      and p.last_active_at > now() - public.chat_idle()
  );
$$;

-- ---------------------------------------------------------------------
-- 10. MESSAGGI DELLA CHAT
-- ---------------------------------------------------------------------
drop table public.chat_messages;

create table public.messages (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms (id) on delete cascade,
  character_id uuid not null references public.characters (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete cascade default auth.uid(),
  character_name text not null default '',
  -- azione | fuori_gioco | master | dado | sistema | sussurro
  kind text not null default 'azione'
    check (kind in ('azione', 'fuori_gioco', 'master', 'dado', 'sistema', 'sussurro')),
  content text not null check (char_length(content) between 1 and 4000),
  -- a chi è rivolto (testo libero o nome di un presente)
  recipient text check (recipient is null or char_length(recipient) between 1 and 60),
  -- sussurro: il personaggio che lo riceve
  recipient_id uuid references public.characters (id) on delete set null,
  -- tiro di dado: i dettagli (dado, caratteristica, abilità, modificatori)
  roll_data jsonb,
  edited_at timestamptz,
  created_at timestamptz not null default now()
);
create index messages_room_created_idx on public.messages (room_id, created_at desc);
create index messages_character_idx on public.messages (character_id);
create index messages_author_idx on public.messages (author_id);
create index messages_recipient_idx on public.messages (recipient_id);

alter table public.messages enable row level security;
revoke all on public.messages from anon, authenticated;
grant select on public.messages to authenticated;
grant insert (room_id, character_id, kind, content, recipient, recipient_id) on public.messages to authenticated;
-- Modifica e cancellazione solo con edit_chat_message / delete_chat_message

-- Autore, nome e ora li decide il database
create or replace function public.messages_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.author_id := auth.uid();
  end if;
  new.created_at := now();
  new.edited_at := null;
  if new.kind <> 'dado' then
    new.roll_data := null;
  end if;
  select c.name into new.character_name from public.characters c where c.id = new.character_id;
  new.character_name := coalesce(new.character_name, '');
  return new;
end;
$$;
create trigger messages_before_insert before insert on public.messages
  for each row execute function public.messages_before_insert();

-- Lettura: chi è in giocata (o modera, o è invisibile);
-- un sussurro lo leggono solo i due personaggi e gli amministratori
create policy "Chat: messaggi visibili a chi è in giocata" on public.messages for select to authenticated
  using (
    (select public.can_enter_room(room_id))
    and (
      (select public.in_chat(room_id))
      or (select public.has_permission('chat.moderare'))
      or (select public.i_am_invisible())
    )
    and (
      kind <> 'sussurro'
      or author_id = (select auth.uid())
      or public.owns_character(recipient_id)
      or (select public.is_admin_user())
    )
  );

-- Scrittura: col proprio personaggio approvato, solo in giocata
create policy "Chat: si scrive in giocata" on public.messages for insert to authenticated
  with check (
    public.owns_character(character_id)
    and (select public.has_permission('chat.scrivere'))
    and kind in ('azione', 'fuori_gioco', 'master', 'sussurro')
    and (kind <> 'master' or (select public.has_permission('chat.narrazione')))
    and (
      kind <> 'sussurro'
      or (
        recipient_id is not null
        and recipient_id <> character_id
        and exists (
          select 1 from public.chat_presence p
          where p.room_id = messages.room_id and p.character_id = messages.recipient_id
        )
      )
    )
    and (kind = 'sussurro' or recipient_id is null)
    and public.can_enter_room(room_id)
    and exists (select 1 from public.rooms ro where ro.id = room_id and (ro.is_open or public.has_permission('chat.moderare')))
    and (
      (select public.i_am_invisible())
      or exists (
        select 1 from public.chat_presence p
        where p.room_id = messages.room_id and p.character_id = messages.character_id
      )
    )
  );

-- Lunghezza massima (impostazioni) e modalità master (Westeros 0109, 0124)
create or replace function public.chat_message_length_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max int;
  r public.rooms;
begin
  if new.kind in ('dado', 'sistema') then return new; end if;
  select max_length into v_max from public.chat_settings limit 1;
  if new.kind = 'azione' then
    select * into r from public.rooms where id = new.room_id;
    if r.master_max is not null then
      if char_length(new.content) > r.master_max then
        raise exception 'Modalità master: l''azione supera il limite di % caratteri.', r.master_max using errcode = 'P0001';
      end if;
      if char_length(new.content) < coalesce(r.master_min, 0) then
        raise exception 'Modalità master: l''azione deve avere almeno % caratteri.', r.master_min using errcode = 'P0001';
      end if;
      return new;
    end if;
  end if;
  if v_max is not null and char_length(new.content) > v_max then
    raise exception 'Il messaggio supera il limite di % caratteri.', v_max using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger messages_length_guard before insert on public.messages
  for each row execute function public.chat_message_length_guard();

-- Blocco di turno: dopo un'azione arrivata al limite dei caratteri tocca a
-- un altro personaggio, oppure si aspettano 10 minuti (Westeros 0128-0129)
create or replace function public.action_turn_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.rooms;
  v_limit int;
  last_msg record;
  v_left int;
begin
  if new.kind <> 'azione' then return new; end if;
  select * into r from public.rooms where id = new.room_id;
  v_limit := coalesce(r.master_max, (select max_length from public.chat_settings limit 1));
  if v_limit is null then return new; end if;

  select m.character_id, m.created_at, char_length(m.content) as len into last_msg
  from public.messages m
  where m.room_id = new.room_id and m.kind = 'azione'
    and m.created_at > coalesce(r.cleared_at, '-infinity'::timestamptz)
  order by m.created_at desc, m.id desc
  limit 1;

  if last_msg.character_id = new.character_id
     and last_msg.created_at > now() - interval '10 minutes'
     and last_msg.len >= v_limit then
    v_left := greatest(1, ceil(extract(epoch from (last_msg.created_at + interval '10 minutes' - now())) / 60)::int);
    raise exception 'Hai appena inviato un''azione al limite dei caratteri: potrai scriverne un''altra quando avrà scritto un altro personaggio, oppure tra % minut%.',
      v_left, case when v_left = 1 then 'o' else 'i' end using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger messages_turn_guard before insert on public.messages
  for each row execute function public.action_turn_guard();

-- Ogni messaggio tiene viva la presenza in giocata
create or replace function public.chat_presence_touch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind <> 'sistema' then
    update public.chat_presence set last_active_at = now()
    where room_id = new.room_id and character_id = new.character_id;
  end if;
  return new;
end;
$$;
create trigger messages_presence_touch after insert on public.messages
  for each row execute function public.chat_presence_touch();

-- ---------------------------------------------------------------------
-- 11. FUNZIONI DELLA CHAT
-- ---------------------------------------------------------------------

-- Svuota la chat se non c'è più nessuno (esce anche chi è inattivo da troppo).
-- p_entering: chi entra scrive subito dopo l'avviso di entrata, che deve
-- restare visibile (la pulizia porta l'ora di un millesimo prima)
create or replace function public.chat_cleanup(p_room uuid, p_entering boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.chat_presence where room_id = p_room and last_active_at <= now() - public.chat_idle();
  if not exists (select 1 from public.chat_presence where room_id = p_room) then
    update public.rooms
    set cleared_at = case when p_entering then now() - interval '1 millisecond' else now() end,
        master_min = null, master_max = null, master_by = null
    where id = p_room;
  end if;
end;
$$;
revoke execute on function public.chat_cleanup(uuid, boolean) from public, anon, authenticated;

-- Entra in giocata (una giocata alla volta)
create or replace function public.join_chat(p_room uuid, p_character uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_other text;
  v_new boolean;
  v_open boolean;
begin
  if not public.owns_character(p_character) then
    raise exception 'Serve un personaggio approvato per giocare.' using errcode = '42501';
  end if;
  if not public.has_permission('chat.scrivere') then
    raise exception 'Il tuo livello non permette di scrivere in chat.' using errcode = '42501';
  end if;
  if not public.can_enter_room(p_room) then
    raise exception 'Non puoi entrare in questa chat.' using errcode = '42501';
  end if;
  select is_open into v_open from public.rooms where id = p_room;
  if not v_open and not public.has_permission('chat.moderare') then
    raise exception 'Questa chat è chiusa dallo staff.' using errcode = 'P0001';
  end if;
  if public.i_am_invisible() then
    raise exception 'Sei invisibile: non serve entrare in giocata.' using errcode = 'P0001';
  end if;
  select r.name into v_other
  from public.chat_presence p join public.rooms r on r.id = p.room_id
  where p.character_id = p_character and p.room_id <> p_room
    and p.last_active_at > now() - public.chat_idle()
  order by p.last_active_at desc limit 1;
  if v_other is not null then
    raise exception 'Hai una giocata in corso in "%": prima esci da quella chat.', v_other using errcode = 'P0001';
  end if;
  delete from public.chat_presence where character_id = p_character and room_id <> p_room;
  perform public.chat_cleanup(p_room, true);
  v_new := not exists (select 1 from public.chat_presence where room_id = p_room and character_id = p_character);
  insert into public.chat_presence (room_id, character_id) values (p_room, p_character)
    on conflict (room_id, character_id) do update set last_active_at = now();
  if v_new then
    insert into public.messages (room_id, character_id, kind, content)
    values (p_room, p_character, 'sistema', 'è entrato in chat.');
  end if;
end;
$$;

-- Esci dalla chat: quando esce l'ultimo la chat si svuota
create or replace function public.leave_chat(p_room uuid, p_character uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.characters where id = p_character and owner_id = auth.uid()) then
    raise exception 'Personaggio non valido.' using errcode = '42501';
  end if;
  if exists (select 1 from public.chat_presence where room_id = p_room and character_id = p_character) then
    insert into public.messages (room_id, character_id, kind, content)
    values (p_room, p_character, 'sistema', 'è uscito dalla chat.');
  end if;
  delete from public.chat_presence where room_id = p_room and character_id = p_character;
  perform public.chat_cleanup(p_room, false);
end;
$$;

-- Presenti in giocata, con i nomi
create or replace function public.chat_present(p_room uuid)
returns table (character_id uuid, name text, avatar_url text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.character_id, c.name, c.avatar_url
  from public.chat_presence p
  join public.characters c on c.id = p.character_id
  where p.room_id = p_room
    and p.last_active_at > now() - public.chat_idle()
    and public.can_enter_room(p_room)
  order by p.joined_at;
$$;

-- Per chi non è entrato: quanti messaggi ci sono (si vedono sfocati, senza testo)
create or replace function public.chat_hidden_count(p_room uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select case when not public.can_enter_room(p_room) then 0 else (
    select count(*)::int from public.messages m
    where m.room_id = p_room
      and m.kind <> 'sussurro'
      and m.created_at > now() - public.chat_ttl()
      and m.created_at > coalesce((select cleared_at from public.rooms where id = p_room), '-infinity'::timestamptz)
  ) end;
$$;

-- Quanti personaggi sono in giocata in ogni chat visibile (mappa, bacheca)
create or replace function public.room_activity()
returns table (room_id uuid, n int)
language sql
stable
security definer
set search_path = ''
as $$
  select p.room_id, count(*)::int
  from public.chat_presence p
  where p.last_active_at > now() - public.chat_idle()
    and public.room_on_active_map(p.room_id)
  group by p.room_id;
$$;

-- Modalità master: minimo e massimo di caratteri delle azioni (p_max null = spenta)
create or replace function public.set_master_mode(p_room uuid, p_character uuid, p_min int, p_max int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  if not (public.has_permission('chat.narrazione') or public.has_permission('chat.moderare')) then
    raise exception 'Solo chi narra o modera può usare la modalità master.' using errcode = '42501';
  end if;
  if not public.can_enter_room(p_room) or not public.owns_character(p_character) then
    raise exception 'Non puoi farlo in questa chat.' using errcode = '42501';
  end if;
  select name into v_name from public.characters where id = p_character;

  if p_max is null then
    update public.rooms set master_min = null, master_max = null, master_by = null where id = p_room;
    insert into public.messages (room_id, character_id, kind, content)
    values (p_room, p_character, 'sistema', 'ha spento la modalità master: tornano i limiti normali.');
    return;
  end if;

  p_min := greatest(0, coalesce(p_min, 0));
  if p_max < 1 or p_max > 4000 or p_min > p_max then
    raise exception 'Limiti non validi: il minimo non può superare il massimo (massimo 4000).' using errcode = 'P0001';
  end if;
  update public.rooms set master_min = p_min, master_max = p_max, master_by = v_name where id = p_room;
  insert into public.messages (room_id, character_id, kind, content)
  values (p_room, p_character, 'sistema',
    'ha attivato la modalità master: azioni ' ||
    case when p_min > 0 then 'da ' || p_min || ' a ' else 'fino a ' end || p_max || ' caratteri.');
end;
$$;

-- Correzione della propria azione: una volta sola, entro 5 minuti
create or replace function public.edit_chat_message(p_id bigint, p_content text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.messages;
  r public.rooms;
  v_max int;
  v_text text := btrim(coalesce(p_content, ''));
begin
  select * into m from public.messages where id = p_id for update;
  if not found or m.author_id is distinct from auth.uid() or m.kind not in ('azione', 'fuori_gioco', 'master', 'sussurro') then
    raise exception 'Puoi modificare solo i tuoi messaggi.' using errcode = '42501';
  end if;
  if m.edited_at is not null then
    raise exception 'Questo messaggio è già stato modificato una volta.' using errcode = 'P0001';
  end if;
  if m.created_at <= now() - interval '5 minutes' then
    raise exception 'Sono passati più di 5 minuti: il messaggio non si può più modificare.' using errcode = 'P0001';
  end if;
  if v_text = '' then
    raise exception 'Il messaggio non può essere vuoto.' using errcode = 'P0001';
  end if;
  select * into r from public.rooms where id = m.room_id;
  if m.kind = 'azione' and r.master_max is not null then
    if char_length(v_text) > r.master_max then
      raise exception 'Modalità master: l''azione supera il limite di % caratteri.', r.master_max using errcode = 'P0001';
    end if;
    if char_length(v_text) < coalesce(r.master_min, 0) then
      raise exception 'Modalità master: l''azione deve avere almeno % caratteri.', r.master_min using errcode = 'P0001';
    end if;
  else
    select max_length into v_max from public.chat_settings limit 1;
    if v_max is not null and char_length(v_text) > v_max then
      raise exception 'Il messaggio supera il limite di % caratteri.', v_max using errcode = 'P0001';
    end if;
  end if;
  update public.messages set content = v_text, edited_at = now() where id = p_id;
end;
$$;

-- Cancellazione: il proprio messaggio, oppure chi modera la chat
create or replace function public.delete_chat_message(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.messages;
begin
  select * into m from public.messages where id = p_id;
  if not found then return; end if;
  if not (
    public.has_permission('chat.moderare')
    or (m.author_id = auth.uid() and m.kind in ('azione', 'fuori_gioco', 'master', 'sussurro'))
  ) then
    raise exception 'Puoi eliminare solo i tuoi messaggi.' using errcode = '42501';
  end if;
  delete from public.messages where id = p_id;
end;
$$;

-- Invisibilità dello staff
create or replace function public.set_invisible(p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_permission('staff.invisibile') then
    raise exception 'Non hai il permesso dell''invisibilità.' using errcode = '42501';
  end if;
  update public.profiles set invisible = coalesce(p_on, false) where id = auth.uid();
  -- da invisibili non si sta "in giocata"
  if p_on then
    delete from public.chat_presence
    where character_id in (select id from public.characters where owner_id = auth.uid());
  end if;
end;
$$;

-- Invitare e allontanare (proprietario della chat su invito o chi modera)
create or replace function public.invite_to_room(p_room uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.room_controller(p_room);
  target uuid;
begin
  if me is null and not public.has_permission('chat.moderare') then
    raise exception 'Non puoi invitare in questa chat.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.rooms where id = p_room and access = 'su_invito') then
    raise exception 'Questa chat è pubblica: non servono inviti.' using errcode = 'P0001';
  end if;
  select id into target from public.characters
  where lower(name) = lower(btrim(p_name)) and status = 'approvata';
  if target is null then
    raise exception 'Nessun personaggio approvato con questo nome.' using errcode = 'P0001';
  end if;
  insert into public.room_guests (room_id, character_id, invited_by)
  values (p_room, target, me)
  on conflict do nothing;
end;
$$;

create or replace function public.expel_from_room(p_room uuid, p_character uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.room_controller(p_room) is null and not public.has_permission('chat.moderare') then
    raise exception 'Non puoi allontanare nessuno da questa chat.' using errcode = '42501';
  end if;
  delete from public.room_guests where room_id = p_room and character_id = p_character;
  -- chi viene allontanato esce anche dalla giocata
  delete from public.chat_presence where room_id = p_room and character_id = p_character;
end;
$$;

-- ---------------------------------------------------------------------
-- 12. DADI INTERLOCK
-- 1d10 + caratteristica (+ abilità) + modificatori di vantaggi/svantaggi
-- (con il tetto dalle impostazioni). Il 10 naturale aggiunge un d10,
-- l'1 naturale lo sottrae. Il tiro lo fa il database: nessuno può barare.
-- ---------------------------------------------------------------------
create or replace function public.roll_dice(p_room uuid, p_character uuid, p_attribute uuid, p_skill uuid default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attr public.attributes;
  v_skill public.skills;
  v_attr_value int;
  v_skill_level int := 0;
  v_cap int := coalesce(public.setting_int('tetto_modificatori'), 3);
  v_mods int;
  v_die int;
  v_extra int := 0;
  v_total int;
  v_text text;
  v_id bigint;
begin
  if not public.owns_character(p_character) then
    raise exception 'Serve un personaggio approvato per tirare.' using errcode = '42501';
  end if;
  if not public.has_permission('dadi.tirare') then
    raise exception 'Il tuo livello non permette di tirare i dadi.' using errcode = '42501';
  end if;
  if not public.can_enter_room(p_room) then
    raise exception 'Non puoi tirare in questa chat.' using errcode = '42501';
  end if;
  if not public.i_am_invisible()
     and not exists (select 1 from public.chat_presence where room_id = p_room and character_id = p_character) then
    raise exception 'Prima entra in giocata.' using errcode = 'P0001';
  end if;

  if p_skill is not null then
    select * into v_skill from public.skills where id = p_skill and active;
    if not found then
      raise exception 'Abilità non valida.' using errcode = 'P0001';
    end if;
    p_attribute := v_skill.attribute_id;
    select coalesce((select level from public.character_skills where character_id = p_character and skill_id = p_skill), 0)
      into v_skill_level;
  end if;
  select * into v_attr from public.attributes where id = p_attribute and active;
  if not found then
    raise exception 'Caratteristica non valida.' using errcode = 'P0001';
  end if;
  select coalesce((select value from public.character_attributes where character_id = p_character and attribute_id = p_attribute), 0)
    into v_attr_value;

  -- vantaggi e svantaggi: quelli di questa abilità e quelli validi per tutti i tiri
  select coalesce(sum(o.roll_modifier), 0) into v_mods
  from public.character_options co
  join public.creation_options o on o.id = co.option_id
  where co.character_id = p_character
    and o.roll_modifier is not null
    and (o.roll_skill_id is null or o.roll_skill_id = p_skill);
  v_mods := greatest(-v_cap, least(v_cap, v_mods));

  v_die := 1 + floor(random() * 10)::int;
  if v_die = 10 then
    v_extra := 1 + floor(random() * 10)::int;
  elsif v_die = 1 then
    v_extra := -(1 + floor(random() * 10)::int);
  end if;
  v_total := v_die + v_extra + v_attr_value + v_skill_level + v_mods;

  v_text := 'tira ' || coalesce(v_skill.name || ' (' || v_attr.code || ')', v_attr.name) || ': '
    || 'd10 ' || v_die
    || case when v_extra > 0 then ' + ' || v_extra when v_extra < 0 then ' − ' || abs(v_extra) else '' end
    || ' + ' || v_attr.code || ' ' || v_attr_value
    || case when v_skill.id is not null then ' + abilità ' || v_skill_level else '' end
    || case when v_mods > 0 then ' + mod ' || v_mods when v_mods < 0 then ' − mod ' || abs(v_mods) else '' end
    || ' = ' || v_total;

  insert into public.messages (room_id, character_id, kind, content, roll_data)
  values (p_room, p_character, 'dado', v_text, jsonb_build_object(
    'die', v_die, 'extra', v_extra,
    'attribute', v_attr.code, 'attribute_value', v_attr_value,
    'skill', v_skill.name, 'skill_level', case when v_skill.id is not null then v_skill_level end,
    'modifiers', v_mods, 'total', v_total))
  returning id into v_id;
  return v_id;
end;
$$;

-- Le funzioni della chat si chiamano solo da utenti collegati
revoke execute on function public.join_chat(uuid, uuid) from public, anon;
revoke execute on function public.leave_chat(uuid, uuid) from public, anon;
revoke execute on function public.chat_present(uuid) from public, anon;
revoke execute on function public.chat_hidden_count(uuid) from public, anon;
revoke execute on function public.room_activity() from public, anon;
revoke execute on function public.set_master_mode(uuid, uuid, int, int) from public, anon;
revoke execute on function public.edit_chat_message(bigint, text) from public, anon;
revoke execute on function public.delete_chat_message(bigint) from public, anon;
revoke execute on function public.set_invisible(boolean) from public, anon;
revoke execute on function public.invite_to_room(uuid, text) from public, anon;
revoke execute on function public.expel_from_room(uuid, uuid) from public, anon;
revoke execute on function public.roll_dice(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.join_chat(uuid, uuid) to authenticated;
grant execute on function public.leave_chat(uuid, uuid) to authenticated;
grant execute on function public.chat_present(uuid) to authenticated;
grant execute on function public.chat_hidden_count(uuid) to authenticated;
grant execute on function public.room_activity() to authenticated;
grant execute on function public.set_master_mode(uuid, uuid, int, int) to authenticated;
grant execute on function public.edit_chat_message(bigint, text) to authenticated;
grant execute on function public.delete_chat_message(bigint) to authenticated;
grant execute on function public.set_invisible(boolean) to authenticated;
grant execute on function public.invite_to_room(uuid, text) to authenticated;
grant execute on function public.expel_from_room(uuid, uuid) to authenticated;
grant execute on function public.roll_dice(uuid, uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 13. REGISTRO DELLE MODIFICHE (solo i cambi fatti dal pannello)
-- ---------------------------------------------------------------------
create trigger maps_log after insert or update or delete on public.maps
  for each row execute function public.log_admin_change();
create trigger locations_log after insert or update or delete on public.locations
  for each row execute function public.log_admin_change();
create trigger room_groups_log after insert or update or delete on public.room_groups
  for each row execute function public.log_admin_change();
create trigger rooms_log after insert or delete or update of
  location_id, name, description, is_open, sort_order, group_id, image_url, access, owner_character_id
  on public.rooms
  for each row execute function public.log_admin_change();

-- ---------------------------------------------------------------------
-- 14. TEMPO REALE
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.chat_presence;

-- ---------------------------------------------------------------------
-- 15. IMMAGINI DI MAPPE E CHAT (archivio "mondo", massimo 5 MB)
-- Le carica dal browser solo chi ha il permesso mondo.gestire.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mondo', 'mondo', true, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

create policy "Mondo: immagini visibili allo staff" on storage.objects for select to authenticated
  using (bucket_id = 'mondo' and (select public.has_permission('mondo.gestire')));
create policy "Mondo: immagini caricate dallo staff" on storage.objects for insert to authenticated
  with check (bucket_id = 'mondo' and (select public.has_permission('mondo.gestire')));
create policy "Mondo: immagini sostituite dallo staff" on storage.objects for update to authenticated
  using (bucket_id = 'mondo' and (select public.has_permission('mondo.gestire')))
  with check (bucket_id = 'mondo' and (select public.has_permission('mondo.gestire')));
create policy "Mondo: immagini eliminate dallo staff" on storage.objects for delete to authenticated
  using (bucket_id = 'mondo' and (select public.has_permission('mondo.gestire')));

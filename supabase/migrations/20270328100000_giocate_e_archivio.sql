-- =====================================================================
-- GIOCATE: ENTRA ED ESCI DALLA CHAT, ARCHIVIO DELLE GIOCATE
-- (adattato dal documento «Chat e giocate» di Westeros: niente casate,
-- viaggi né PNG; in più le chat con password)
-- - In giocata si entra col pulsante «Entra in chat» (join_chat) e si esce
--   con «Esci dalla chat» (leave_chat, con o senza salvataggio): niente più
--   entrata/uscita automatica aprendo e lasciando la pagina.
-- - Una giocata alla volta; dopo giocata_inattiva_minuti (60) senza scrivere
--   la giocata è chiusa da sola (niente avviso, niente salvataggio).
-- - Presenti e «N in gioco» = chi è in giocata (chat_presence ancora viva).
-- - Quando la chat si svuota si pulisce (rooms.cleared_at) e la modalità
--   master si spegne; una chat con password vuota si distrugge subito.
-- - Archivio delle giocate (play_archives): lo vede solo chi l'ha salvata;
--   ogni 6 mesi si svuota tutto, con un avviso al quinto mese.
-- =====================================================================

-- 1. dopo quanto tempo senza scrivere la giocata si chiude
insert into public.game_settings (key, value, kind, label, description, sort_order) values
  ('giocata_inattiva_minuti', '60', 'number', 'Chat · Giocata chiusa dopo (minuti)',
   'Minuti senza scrivere dopo i quali il personaggio non è più in giocata.', 410)
on conflict (key) do nothing;

create or replace function public.giocata_idle()
returns interval
language sql
stable
security definer
set search_path = ''
as $$
  select make_interval(mins => greatest(5, coalesce(public.setting_int('giocata_inattiva_minuti'), 60)));
$$;
revoke execute on function public.giocata_idle() from public, anon, authenticated;

-- 2. in giocata = presenza viva (non più la pagina aperta)
create or replace function public.in_chat_now(p_character uuid, p_room uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.chat_presence p
    where p.character_id = p_character and p.room_id = p_room
      and p.last_active_at > now() - public.giocata_idle()
  );
$$;

create or replace function public.room_activity()
returns table (room_id uuid, n int)
language sql
stable
security definer
set search_path = ''
as $$
  select p.room_id, count(*)::int
  from public.chat_presence p
  where p.last_active_at > now() - public.giocata_idle()
    and public.room_on_active_map(p.room_id)
  group by p.room_id;
$$;

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
    and p.last_active_at > now() - public.giocata_idle()
    and public.can_enter_room(p_room)
  order by p.joined_at;
$$;

-- I messaggi della chat li legge chi è in giocata (policy della tabella messages)
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
      and p.last_active_at > now() - public.giocata_idle()
  );
$$;

-- La giocata in corso del proprio personaggio (per «Aggiorna» e per l'avviso)
create or replace function public.my_giocata()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('room_id', r.id, 'name', r.name)
  from public.chat_presence p
  join public.characters c on c.id = p.character_id
  join public.rooms r on r.id = p.room_id
  where c.owner_id = auth.uid() and p.last_active_at > now() - public.giocata_idle()
  order by p.last_active_at desc
  limit 1;
$$;
revoke execute on function public.my_giocata() from public, anon;
grant execute on function public.my_giocata() to authenticated;

-- 3. pulizia della chat vuota: azioni nascoste (restano nel Log), modalità master spenta
create or replace function public.chat_cleanup(p_room uuid, p_entering boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.chat_presence where room_id = p_room and last_active_at <= now() - public.giocata_idle();
  if not exists (select 1 from public.chat_presence where room_id = p_room) then
    update public.rooms
    set cleared_at = case when p_entering then now() - interval '1 millisecond' else now() end,
        master_min = null, master_max = null, master_by = null
    where id = p_room;
  end if;
end;
$$;
revoke execute on function public.chat_cleanup(uuid, boolean) from public, anon, authenticated;

-- Distrugge una chat con password: password liberata, chiavi tolte (i messaggi restano per il Log)
create or replace function public.secret_room_destroy(p_room uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.chat_presence where room_id = p_room;
  delete from public.room_keys where room_id = p_room;
  delete from public.room_secrets where room_id = p_room;
  update public.rooms set destroyed_at = now(), is_open = false where id = p_room and access = 'password' and destroyed_at is null;
end;
$$;
revoke execute on function public.secret_room_destroy(uuid) from public, anon, authenticated;

-- Chat con password senza nessuno in giocata: distrutte (con 15 minuti di tempo
-- per entrare dopo averle aperte con la password)
create or replace function public.purge_secret_rooms()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select ro.id from public.rooms ro
    where ro.access = 'password' and ro.destroyed_at is null
      and not exists (
        select 1 from public.chat_presence p
        where p.room_id = ro.id and p.last_active_at > now() - public.giocata_idle()
      )
      and greatest(ro.created_at, coalesce((select max(m.created_at) from public.messages m where m.room_id = ro.id), ro.created_at))
          < now() - interval '15 minutes'
  loop
    perform public.secret_room_destroy(r.id);
  end loop;
end;
$$;
revoke execute on function public.purge_secret_rooms() from public, anon, authenticated;

-- 4. entrare in giocata (col pulsante «Entra in chat»)
create or replace function public.join_chat(p_room uuid, p_character uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_other uuid;
  v_other_name text;
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
  -- una giocata alla volta: il link alla chat aperta va nel suggerimento dell'errore
  select r.id, r.name into v_other, v_other_name
  from public.chat_presence p join public.rooms r on r.id = p.room_id
  where p.character_id = p_character and p.room_id <> p_room
    and p.last_active_at > now() - public.giocata_idle()
  order by p.last_active_at desc limit 1;
  if v_other is not null then
    raise exception 'Hai una giocata in corso in «%»: prima vai lì e premi «Esci dalla chat».', v_other_name
      using errcode = 'P0001', hint = v_other::text;
  end if;
  -- giocate scadute altrove: chiuse senza avviso
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
revoke execute on function public.join_chat(uuid, uuid) from public, anon;
grant execute on function public.join_chat(uuid, uuid) to authenticated;

-- 5. archivio delle giocate
create table if not exists public.play_archives (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  character_id uuid references public.characters (id) on delete set null,
  character_name text not null default '',
  room_id uuid references public.rooms (id) on delete set null,
  room_name text not null default '',
  place_name text not null default '',
  started_at timestamptz not null,
  ended_at timestamptz not null default now(),
  -- [{ id, name, avatar }] com'erano quel giorno
  characters jsonb not null default '[]'::jsonb,
  -- [{ kind, name, content, recipient, at }]
  messages jsonb not null default '[]'::jsonb,
  message_count int not null default 0,
  -- testo semplice di tutta la giocata, per cercare
  search_text text not null default '',
  note text not null default '' check (char_length(note) <= 1000),
  created_at timestamptz not null default now()
);
create index if not exists play_archives_user on public.play_archives (user_id, ended_at desc);
alter table public.play_archives enable row level security;
revoke all on public.play_archives from anon, authenticated;
grant select, delete on public.play_archives to authenticated;
grant update (note) on public.play_archives to authenticated;
drop policy if exists "Archivio: le proprie giocate" on public.play_archives;
create policy "Archivio: le proprie giocate" on public.play_archives for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "Archivio: solo dall'uscita dalla chat" on public.play_archives;
create policy "Archivio: solo dall'uscita dalla chat" on public.play_archives for insert to authenticated with check (false);
drop policy if exists "Archivio: nota sulle proprie giocate" on public.play_archives;
create policy "Archivio: nota sulle proprie giocate" on public.play_archives for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "Archivio: si eliminano le proprie" on public.play_archives;
create policy "Archivio: si eliminano le proprie" on public.play_archives for delete to authenticated
  using (user_id = (select auth.uid()));

-- Copia nell'archivio quello che il personaggio ha visto da quando è entrato
-- (niente OFF né sussurri; al massimo gli ultimi 3000 messaggi)
create or replace function public.play_archive_save(p_room uuid, p_character uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.chat_presence;
  ro record;
  v_from timestamptz;
  v_msgs jsonb;
  v_chars jsonb;
  v_text text;
  v_n int;
  v_id bigint;
begin
  select * into p from public.chat_presence where room_id = p_room and character_id = p_character;
  if p.room_id is null then raise exception 'Non sei in giocata in questa chat.' using errcode = 'P0001'; end if;
  select r.name, coalesce(l.name, '') as place, r.cleared_at into ro
  from public.rooms r left join public.locations l on l.id = r.location_id where r.id = p_room;
  v_from := greatest(p.joined_at, coalesce(ro.cleared_at, '-infinity'::timestamptz));

  if not exists (select 1 from public.messages m where m.room_id = p_room and m.created_at >= v_from
                 and m.kind in ('azione', 'master', 'png')) then
    raise exception 'Non c''è niente da salvare: serve almeno un''azione o una narrazione.' using errcode = 'P0001';
  end if;

  with last_msgs as (
    select m.* from public.messages m
    where m.room_id = p_room and m.created_at >= v_from and m.kind not in ('fuori_gioco', 'sussurro')
    order by m.created_at desc, m.id desc limit 3000
  ), named as (
    select lm.*, case when lm.kind = 'png' then coalesce((select n.name from public.npcs n where n.id = lm.npc_id), lm.character_name)
                      else coalesce(nullif(lm.character_name, ''), (select c.name from public.characters c where c.id = lm.character_id), '') end as who
    from last_msgs lm
  )
  select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'name', who, 'content', content, 'recipient', recipient, 'at', created_at)
                            order by created_at, id), '[]'::jsonb),
         coalesce(string_agg(who || ': ' || content, E'\n' order by created_at, id), ''),
         count(*)::int
    into v_msgs, v_text, v_n
  from named;

  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'avatar', c.avatar_url) order by c.name), '[]'::jsonb)
    into v_chars
  from public.characters c
  where c.id in (select m.character_id from public.messages m where m.room_id = p_room and m.created_at >= v_from
                 and m.kind in ('azione', 'master', 'png', 'dado', 'sistema', 'combattimento', 'incidente'));

  insert into public.play_archives (user_id, character_id, character_name, room_id, room_name, place_name, started_at, ended_at,
    characters, messages, message_count, search_text)
  select c.owner_id, c.id, c.name, p_room, ro.name, ro.place, v_from, now(), v_chars, v_msgs, v_n, left(v_text, 500000)
  from public.characters c where c.id = p_character
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.play_archive_save(uuid, uuid) from public, anon, authenticated;

-- 6. uscire dalla giocata (col pulsante «Esci dalla chat»), salvando o no.
-- Se il salvataggio non riesce non si esce, così la giocata non va persa.
drop function if exists public.leave_chat(uuid, uuid);
create or replace function public.leave_chat(p_room uuid, p_character uuid, p_save boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_archive bigint;
  v_secret boolean;
begin
  if not exists (select 1 from public.characters where id = p_character and owner_id = auth.uid()) then
    raise exception 'Personaggio non valido.' using errcode = '42501';
  end if;
  if p_save then
    v_archive := public.play_archive_save(p_room, p_character);
  end if;
  if exists (select 1 from public.chat_presence where room_id = p_room and character_id = p_character) then
    insert into public.messages (room_id, character_id, kind, content)
    values (p_room, p_character, 'sistema', 'è uscito dalla chat.');
  end if;
  delete from public.chat_presence where room_id = p_room and character_id = p_character;
  perform public.chat_cleanup(p_room, false);
  -- chat con password rimasta vuota: si distrugge subito (password libera)
  select access = 'password' into v_secret from public.rooms where id = p_room;
  if coalesce(v_secret, false) and not exists (select 1 from public.chat_presence where room_id = p_room) then
    perform public.secret_room_destroy(p_room);
  end if;
  return jsonb_build_object('archive_id', v_archive);
end;
$$;
revoke execute on function public.leave_chat(uuid, uuid, boolean) from public, anon;
grant execute on function public.leave_chat(uuid, uuid, boolean) to authenticated;

-- 7. pulizia dell'archivio ogni 6 mesi, avviso al quinto mese
create table if not exists public.play_archive_cycle (
  id int primary key default 1 check (id = 1),
  started_at timestamptz not null default now(),
  warned_at timestamptz
);
insert into public.play_archive_cycle (id) values (1) on conflict (id) do nothing;
alter table public.play_archive_cycle enable row level security;
revoke all on public.play_archive_cycle from anon, authenticated;
grant select on public.play_archive_cycle to authenticated;
drop policy if exists "Ciclo dell'archivio: lo leggono tutti" on public.play_archive_cycle;
create policy "Ciclo dell'archivio: lo leggono tutti" on public.play_archive_cycle for select to authenticated using (true);
drop policy if exists "Ciclo dell'archivio: solo dalle funzioni" on public.play_archive_cycle;
create policy "Ciclo dell'archivio: solo dalle funzioni" on public.play_archive_cycle for insert to authenticated with check (false);
drop policy if exists "Ciclo dell'archivio: non si modifica" on public.play_archive_cycle;
create policy "Ciclo dell'archivio: non si modifica" on public.play_archive_cycle for update to authenticated using (false);
drop policy if exists "Ciclo dell'archivio: non si elimina" on public.play_archive_cycle;
create policy "Ciclo dell'archivio: non si elimina" on public.play_archive_cycle for delete to authenticated using (false);

-- Per la pagina dell'archivio: quando si svuota e se siamo nel mese dell'avviso
create or replace function public.play_archive_info()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'purge_at', c.started_at + interval '6 months',
    'warning', now() >= c.started_at + interval '5 months')
  from public.play_archive_cycle c where c.id = 1;
$$;
revoke execute on function public.play_archive_info() from public, anon;
grant execute on function public.play_archive_info() to authenticated;

create or replace function public.play_archive_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.play_archive_cycle;
begin
  select * into c from public.play_archive_cycle where id = 1 for update;
  if c.id is null then return; end if;
  if now() >= c.started_at + interval '6 months' then
    delete from public.play_archives;
    update public.play_archive_cycle set started_at = now(), warned_at = null where id = 1;
  elsif now() >= c.started_at + interval '5 months' and c.warned_at is null then
    insert into public.system_messages (user_id, body)
    select distinct a.user_id,
      '🗂️ Archivio giocate: il ' || to_char((c.started_at + interval '6 months') at time zone 'Europe/Rome', 'DD/MM/YYYY')
      || ' tutte le giocate salvate verranno cancellate. Scarica (.txt) quelle che vuoi tenere da Utility → Archivio giocate.'
    from public.play_archives a;
    update public.play_archive_cycle set warned_at = now() where id = 1;
  end if;
end;
$$;
revoke execute on function public.play_archive_tick() from public, anon, authenticated;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('archivio-giocate', '20 4 * * *', 'select public.play_archive_tick()');
exception when others then
  raise notice 'pg_cron non disponibile: %', sqlerrm;
end;
$$;

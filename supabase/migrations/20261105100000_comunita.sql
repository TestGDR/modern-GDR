-- =====================================================================
-- COMUNITÀ (fase 6 del documento "Funzioni generiche")
-- Logica ripresa dal Westeros GDR (migrazioni 0038, 0039, 0076,
-- 0080-0082, 0166, 0170), adattata al College:
--
--   absences            assenze dichiarate dai giocatori (avviso SISTEMA a tutti)
--   play_requests       ricerca di gioco con inizio e fine, si pulisce da sola
--   gossip_*            pettegolezzi di fine giocata, approvati dallo staff
--   forum               permessi propri, non letti, discussioni importanti,
--                       post segnalati a tutti
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PERMESSI
--    forum.moderare / forum.sezioni / forum.segnalare a chi moderava i contenuti;
--    pettegolezzi.gestire a chi narra; assenze.gestire e ricerca.moderare a chi modera le chat
-- ---------------------------------------------------------------------
update public.user_levels
set permissions = array(select distinct unnest(permissions || array['forum.moderare', 'forum.sezioni', 'forum.segnalare']))
where 'contenuti.moderare' = any (permissions);
update public.user_levels
set permissions = array(select distinct unnest(permissions || array['pettegolezzi.gestire']))
where 'chat.narrazione' = any (permissions);
update public.user_levels
set permissions = array(select distinct unnest(permissions || array['assenze.gestire', 'ricerca.moderare']))
where 'chat.moderare' = any (permissions);

-- ---------------------------------------------------------------------
-- 2. ASSENZE (Westeros 0038, 0170)
-- ---------------------------------------------------------------------
create table public.absences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  from_date date not null,
  to_date date not null,
  note text not null default '' check (char_length(note) <= 300),
  created_at timestamptz not null default now(),
  check (to_date >= from_date and to_date <= from_date + 365)
);
create index absences_to_date_idx on public.absences (to_date);
create index absences_user_idx on public.absences (user_id);

alter table public.absences enable row level security;
revoke all on public.absences from anon, authenticated;
grant select, insert (from_date, to_date, note), delete on public.absences to authenticated;

create policy "Assenze: visibili a tutti i registrati" on public.absences for select to authenticated using (true);
create policy "Assenze: si dichiarano le proprie" on public.absences for insert to authenticated
  with check (user_id = (select auth.uid()) and from_date >= current_date - 1);
create policy "Assenze: si tolgono le proprie, lo staff tutte" on public.absences for delete to authenticated
  using (user_id = (select auth.uid()) or (select public.has_permission('assenze.gestire')));
-- (nessuna modifica: un'assenza si toglie e si dichiara di nuovo)

create table public.absences_seen (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  seen_at timestamptz not null default now()
);
alter table public.absences_seen enable row level security;
revoke all on public.absences_seen from anon, authenticated;
grant select, insert, update on public.absences_seen to authenticated;
create policy "Assenze viste: il proprio segno" on public.absences_seen for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Assenze viste: si crea il proprio segno" on public.absences_seen for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Assenze viste: si aggiorna il proprio segno" on public.absences_seen for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Nuova assenza: avviso di SISTEMA a tutti gli altri giocatori
create or replace function public.absence_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_when text;
begin
  select coalesce(c.name, p.username) into v_name
  from public.profiles p
  left join public.characters c on c.owner_id = p.id and c.status = 'approvata'
  where p.id = new.user_id;
  v_when := case when new.from_date = new.to_date
                 then 'il ' || to_char(new.from_date, 'DD/MM/YYYY')
                 else 'dal ' || to_char(new.from_date, 'DD/MM/YYYY') || ' al ' || to_char(new.to_date, 'DD/MM/YYYY') end;
  insert into public.system_messages (user_id, body)
  select p.id,
         'Nuova assenza: ' || coalesce(v_name, 'un giocatore') || ' sarà assente ' || v_when || '.'
         || case when btrim(new.note) <> '' then ' Nota: ' || btrim(new.note) else '' end
  from public.profiles p
  where p.id is distinct from new.user_id;
  return new;
end;
$$;

create or replace function public.absences_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then new.user_id := auth.uid(); end if;
  new.created_at := now();
  new.note := btrim(new.note);
  return new;
end;
$$;
create trigger absences_before_insert before insert on public.absences
  for each row execute function public.absences_before_insert();
create trigger absences_notify after insert on public.absences
  for each row execute function public.absence_notify();

-- ---------------------------------------------------------------------
-- 3. RICERCA DI GIOCO (Westeros 0038, 0039): con inizio e fine,
--    finita la giocata si elimina da sola (controllo ogni 5 minuti)
-- ---------------------------------------------------------------------
create table public.play_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  text text not null check (char_length(text) between 1 and 500),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint play_requests_orari check (
    ends_at > starts_at
    and ends_at <= starts_at + interval '24 hours'
    and ends_at > created_at
    and starts_at <= created_at + interval '60 days'
  )
);
create index play_requests_ends_idx on public.play_requests (ends_at);
create index play_requests_user_idx on public.play_requests (user_id);

alter table public.play_requests enable row level security;
revoke all on public.play_requests from anon, authenticated;
grant select, insert (text, starts_at, ends_at), delete on public.play_requests to authenticated;

create policy "Ricerca: visibile a tutti i registrati" on public.play_requests for select to authenticated using (true);
create policy "Ricerca: la pubblica chi ha un personaggio approvato" on public.play_requests for insert to authenticated
  with check (user_id = (select auth.uid()) and public.has_active_character((select auth.uid())));
create policy "Ricerca: si tolgono le proprie, o modera lo staff" on public.play_requests for delete to authenticated
  using (user_id = (select auth.uid()) or (select public.has_permission('ricerca.moderare')));

create or replace function public.play_requests_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then new.user_id := auth.uid(); end if;
  new.created_at := now();
  new.text := btrim(new.text);
  return new;
end;
$$;
create trigger play_requests_before_insert before insert on public.play_requests
  for each row execute function public.play_requests_before_insert();

create table public.play_requests_seen (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  seen_at timestamptz not null default now()
);
alter table public.play_requests_seen enable row level security;
revoke all on public.play_requests_seen from anon, authenticated;
grant select, insert, update on public.play_requests_seen to authenticated;
create policy "Ricerca vista: il proprio segno" on public.play_requests_seen for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Ricerca vista: si crea il proprio segno" on public.play_requests_seen for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Ricerca vista: si aggiorna il proprio segno" on public.play_requests_seen for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Pulizia delle giocate finite
create or replace function public.purge_ended_play_requests()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.play_requests where ends_at < now();
$$;
revoke execute on function public.purge_ended_play_requests() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. PETTEGOLEZZI (Westeros 0080-0082)
-- A fine giocata un personaggio tira il dado (lo decide il database).
-- Notati: il giocatore scrive riassunto, zona e presenti; si apre un ticket
-- nella sezione "Pettegolezzi". Lo staff (pettegolezzi.gestire) approva,
-- anche modificando il testo, o rifiuta. Le voci approvate le leggono tutti.
-- Il numero uscito lo vede solo lo staff.
-- ---------------------------------------------------------------------
create table public.gossip_settings (
  id boolean primary key default true check (id),
  die_sides int not null default 20 check (die_sides between 2 and 100),
  seen_from int not null default 7 check (seen_from between 1 and 100)
);
insert into public.gossip_settings (id) values (true);

create table public.gossip_rolls (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  roll int not null,
  sides int not null,
  seen boolean not null,
  created_at timestamptz not null default now()
);
create index gossip_rolls_character_idx on public.gossip_rolls (character_id, created_at desc);
create index gossip_rolls_user_idx on public.gossip_rolls (user_id);

create table public.gossip_reports (
  id uuid primary key default gen_random_uuid(),
  roll_id uuid not null unique references public.gossip_rolls (id) on delete cascade,
  character_id uuid not null references public.characters (id) on delete cascade,
  author_name text not null default '',
  participants uuid[] not null default '{}',
  participant_names text not null default '',
  location_id uuid references public.locations (id) on delete set null,
  room_id uuid references public.rooms (id) on delete set null,
  zone_name text not null default '',
  summary text not null check (char_length(summary) between 1 and 2000),
  status text not null default 'attesa' check (status in ('attesa', 'approvato', 'rifiutato')),
  published_text text,
  reviewed_by_name text,
  reviewed_at timestamptz,
  ticket_id uuid references public.tickets (id) on delete set null,
  created_at timestamptz not null default now()
);
create index gossip_reports_status_idx on public.gossip_reports (status, created_at desc);
create index gossip_reports_character_idx on public.gossip_reports (character_id);
create index gossip_reports_location_idx on public.gossip_reports (location_id);
create index gossip_reports_room_idx on public.gossip_reports (room_id);
create index gossip_reports_ticket_idx on public.gossip_reports (ticket_id);

alter table public.gossip_settings enable row level security;
alter table public.gossip_rolls enable row level security;
alter table public.gossip_reports enable row level security;
revoke all on public.gossip_settings, public.gossip_rolls, public.gossip_reports from anon, authenticated;
grant select, update (die_sides, seen_from) on public.gossip_settings to authenticated;
grant select on public.gossip_rolls to authenticated;
grant select, delete on public.gossip_reports to authenticated;

create policy "Pettegolezzi: impostazioni visibili" on public.gossip_settings for select to authenticated using (true);
create policy "Pettegolezzi: impostazioni dello staff" on public.gossip_settings for update to authenticated
  using ((select public.has_permission('pettegolezzi.gestire'))) with check ((select public.has_permission('pettegolezzi.gestire')));
-- I tiri (con il numero) li legge solo lo staff
create policy "Pettegolezzi: tiri allo staff" on public.gossip_rolls for select to authenticated
  using ((select public.has_permission('pettegolezzi.gestire')));
create policy "Pettegolezzi: voci visibili" on public.gossip_reports for select to authenticated
  using (
    status = 'approvato'
    or public.owns_character(character_id)
    or exists (select 1 from public.characters c where c.owner_id = (select auth.uid()) and c.id = any (participants))
    or (select public.has_permission('pettegolezzi.gestire'))
  );
create policy "Pettegolezzi: li elimina lo staff" on public.gossip_reports for delete to authenticated
  using ((select public.has_permission('pettegolezzi.gestire')));

create trigger gossip_settings_log after update on public.gossip_settings
  for each row execute function public.log_admin_change();

insert into public.ticket_sections (name, instructions, sort_order, active)
select 'Pettegolezzi', 'Ticket aperti in automatico quando, a fine giocata, i personaggi vengono notati.', 99, false
where not exists (select 1 from public.ticket_sections where name = 'Pettegolezzi');

-- Tiro di fine giocata: restituisce solo se si è stati notati
create or replace function public.gossip_roll(p_character uuid)
returns table (id uuid, seen boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.gossip_settings;
  v_roll int;
  v_id uuid;
begin
  if not public.owns_character(p_character) then
    raise exception 'Serve un personaggio approvato.' using errcode = 'P0001';
  end if;
  select * into s from public.gossip_settings;
  v_roll := 1 + floor(random() * s.die_sides)::int;
  insert into public.gossip_rolls (character_id, user_id, roll, sides, seen)
  values (p_character, auth.uid(), v_roll, s.die_sides, v_roll >= s.seen_from)
  returning gossip_rolls.id into v_id;
  return query select v_id, v_roll >= s.seen_from;
end;
$$;

-- Tiro "notati" ancora senza pettegolezzo (degli ultimi 2 giorni)
create or replace function public.gossip_pending(p_character uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select r.id from public.gossip_rolls r
  where r.character_id = p_character and public.owns_character(p_character)
    and r.seen and r.created_at > now() - interval '2 days'
    and not exists (select 1 from public.gossip_reports g where g.roll_id = r.id)
  order by r.created_at desc
  limit 1;
$$;

-- Notati: riassunto, zona e personaggi presenti -> ticket allo staff
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
  v_section uuid;
  v_ticket uuid;
  v_report uuid;
  v_others uuid[];
  v_other_users uuid[];
begin
  select * into r from public.gossip_rolls where id = p_roll;
  if r.id is null or not public.owns_character(r.character_id) then raise exception 'Tiro non trovato.' using errcode = 'P0001'; end if;
  if not r.seen then raise exception 'I personaggi non sono stati notati: niente pettegolezzo.' using errcode = 'P0001'; end if;
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
  v_other_users := array(select distinct c.owner_id from public.characters c where c.id = any (v_others));
  select coalesce(string_agg(c.name, ', ' order by c.name), '') into v_names
  from public.characters c where c.id = any (v_others);

  select id into v_section from public.ticket_sections where name = 'Pettegolezzi' limit 1;
  update public.ticket_sections set active = true where id = v_section;
  v_ticket := public.open_ticket(
    'Pettegolezzo: ' || left(v_zone, 100),
    v_section,
    'Pettegolezzo di fine giocata: i personaggi sono stati notati.' || E'\n\n'
      || 'Zona: ' || v_zone || E'\n'
      || 'Presenti: ' || v_author || case when v_names <> '' then ', ' || v_names else '' end || E'\n\n'
      || 'Riassunto:' || E'\n' || btrim(p_summary) || E'\n\n'
      || 'Lo staff lo controlla e lo approva (anche modificandolo) o lo rifiuta da Pettegolezzi.',
    v_other_users
  );
  update public.ticket_sections set active = false where id = v_section;

  insert into public.gossip_reports (roll_id, character_id, author_name, participants, participant_names,
                                     location_id, room_id, zone_name, summary, ticket_id)
  values (p_roll, r.character_id, v_author, v_others, v_names, p_location, p_room, v_zone, btrim(p_summary), v_ticket)
  returning id into v_report;
  return v_report;
end;
$$;

-- Staff: approva (anche modificando il testo) o rifiuta
create or replace function public.gossip_review(p_report uuid, p_approve boolean, p_text text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.gossip_reports;
  v_master text := public.my_display_name();
  v_user uuid;
  v_msg text;
begin
  if not public.has_permission('pettegolezzi.gestire') then raise exception 'Solo lo staff approva i pettegolezzi.' using errcode = '42501'; end if;
  select * into g from public.gossip_reports where id = p_report;
  if g.id is null then raise exception 'Pettegolezzo non trovato.' using errcode = 'P0001'; end if;
  if p_approve and char_length(btrim(coalesce(p_text, ''))) not between 1 and 2000 then
    raise exception 'Il testo della voce non è valido.' using errcode = 'P0001';
  end if;

  update public.gossip_reports
  set status = case when p_approve then 'approvato' else 'rifiutato' end,
      published_text = case when p_approve then btrim(p_text) else published_text end,
      reviewed_by_name = v_master, reviewed_at = now()
  where id = p_report;

  v_msg := case when p_approve
    then 'Il pettegolezzo sulla vostra giocata (' || g.zone_name || ') è stato approvato: ora è tra le voci che girano.'
    else 'Il pettegolezzo sulla vostra giocata (' || g.zone_name || ') non è stato approvato.' end;

  -- risposta nel ticket e chiusura
  if g.ticket_id is not null then
    insert into public.ticket_messages (ticket_id, author_id, author_name, from_staff, body)
    values (g.ticket_id, auth.uid(), v_master, true,
            v_msg || case when p_approve then E'\n\n«' || btrim(p_text) || '»' else '' end);
    update public.tickets set status = 'chiuso', last_message_at = now(), last_author_name = v_master where id = g.ticket_id;
  end if;

  -- avviso di SISTEMA a chi ha giocato
  for v_user in
    select distinct c.owner_id from public.characters c where c.id = any (g.participants || g.character_id)
  loop
    perform public.send_system_message(v_user, v_msg);
  end loop;
end;
$$;

-- Quanti pettegolezzi aspettano lo staff (per l'avviso)
create or replace function public.gossip_waiting()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.has_permission('pettegolezzi.gestire')
    then (select count(*)::int from public.gossip_reports where status = 'attesa') else 0 end;
$$;

-- ---------------------------------------------------------------------
-- 5. FORUM: permessi propri, discussioni importanti, non letti, segnalati
-- ---------------------------------------------------------------------
alter table public.forum_threads add column is_important boolean not null default false;

-- Fissare, chiudere e rendere importante: solo chi modera il forum
create or replace function public.protect_thread_flags()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.has_permission('forum.moderare') or auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.is_pinned = false;
    new.is_locked = false;
    new.is_important = false;
  elsif new.is_pinned is distinct from old.is_pinned
     or new.is_locked is distinct from old.is_locked
     or new.is_important is distinct from old.is_important then
    raise exception 'Solo chi modera il forum può fissare, chiudere o rendere importante una discussione';
  end if;
  return new;
end;
$$;

alter policy "Forum sezioni: lo staff le crea" on public.forum_sections
  with check ((select public.has_permission('forum.sezioni')));
alter policy "Forum sezioni: lo staff le modifica" on public.forum_sections
  using ((select public.has_permission('forum.sezioni'))) with check ((select public.has_permission('forum.sezioni')));
alter policy "Forum sezioni: lo staff le elimina" on public.forum_sections
  using ((select public.has_permission('forum.sezioni')));
alter policy "Forum bacheche: lo staff le crea" on public.forum_boards
  with check ((select public.has_permission('forum.sezioni')));
alter policy "Forum bacheche: lo staff le modifica" on public.forum_boards
  using ((select public.has_permission('forum.sezioni'))) with check ((select public.has_permission('forum.sezioni')));
alter policy "Forum bacheche: lo staff le elimina" on public.forum_boards
  using ((select public.has_permission('forum.sezioni')));
alter policy "Forum discussioni: modifica dell'autore o dello staff" on public.forum_threads
  using (author_id = (select auth.uid()) or (select public.has_permission('forum.moderare')))
  with check (author_id = (select auth.uid()) or (select public.has_permission('forum.moderare')));
alter policy "Forum discussioni: lo staff le elimina" on public.forum_threads
  using ((select public.has_permission('forum.moderare')));
alter policy "Forum messaggi: si risponde nelle discussioni aperte" on public.forum_posts
  with check (
    author_id = (select auth.uid())
    and (character_id is null or public.owns_character(character_id))
    and (
      (select public.has_permission('forum.moderare'))
      or exists (select 1 from public.forum_threads t where t.id = thread_id and not t.is_locked)
    )
  );
alter policy "Forum messaggi: modifica dell'autore o dello staff" on public.forum_posts
  using (author_id = (select auth.uid()) or (select public.has_permission('forum.moderare')))
  with check (author_id = (select auth.uid()) or (select public.has_permission('forum.moderare')));
alter policy "Forum messaggi: eliminazione dell'autore o dello staff" on public.forum_posts
  using (author_id = (select auth.uid()) or (select public.has_permission('forum.moderare')));

create trigger forum_sections_log after insert or update or delete on public.forum_sections
  for each row execute function public.log_admin_change();
create trigger forum_boards_log after insert or update or delete on public.forum_boards
  for each row execute function public.log_admin_change();

-- Letti e non letti (Westeros 0076)
create table public.forum_reads (
  user_id uuid not null references public.profiles (id) on delete cascade,
  thread_id uuid not null references public.forum_threads (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, thread_id)
);
create index forum_reads_thread_idx on public.forum_reads (thread_id);

-- Da quando un utente "legge" il forum: le discussioni più vecchie non risultano nuove
create table public.forum_users (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  first_seen timestamptz not null default now()
);

alter table public.forum_reads enable row level security;
alter table public.forum_users enable row level security;
revoke all on public.forum_reads, public.forum_users from anon, authenticated;
grant select on public.forum_reads, public.forum_users to authenticated;
create policy "Forum letti: i propri" on public.forum_reads for select to authenticated using (user_id = (select auth.uid()));
create policy "Forum prima visita: la propria" on public.forum_users for select to authenticated using (user_id = (select auth.uid()));
-- Si scrivono con forum_mark_read / forum_touch

-- Chi c'è già parte da adesso
insert into public.forum_users (user_id) select id from public.profiles on conflict do nothing;

create or replace function public.forum_unread()
returns table (thread_id uuid, board_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.board_id
  from public.forum_threads t
  left join public.forum_reads r on r.thread_id = t.id and r.user_id = auth.uid()
  left join public.forum_users u on u.user_id = auth.uid()
  where auth.uid() is not null
    and t.updated_at > coalesce(r.last_read_at, u.first_seen, now())
    and exists (
      select 1 from public.forum_posts p
      where p.thread_id = t.id and p.author_id is distinct from auth.uid()
        and p.created_at > coalesce(r.last_read_at, u.first_seen, now())
    );
$$;

-- Segna come letta una discussione (o tutte)
create or replace function public.forum_mark_read(p_thread uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then return; end if;
  if p_thread is null then
    insert into public.forum_reads (user_id, thread_id, last_read_at)
    select auth.uid(), t.id, now() from public.forum_threads t
    on conflict (user_id, thread_id) do update set last_read_at = now();
  else
    insert into public.forum_reads (user_id, thread_id, last_read_at) values (auth.uid(), p_thread, now())
    on conflict (user_id, thread_id) do update set last_read_at = now();
  end if;
end;
$$;

-- Prima visita: da qui le discussioni nuove contano come non lette
create or replace function public.forum_touch()
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.forum_users (user_id) select auth.uid() where auth.uid() is not null on conflict (user_id) do nothing;
$$;

-- Post segnalati a tutti (Westeros 0166): a tutti compare un avviso, una volta
alter table public.forum_posts
  add column highlighted_at timestamptz,
  add column highlighted_by text;
create index forum_posts_highlighted_idx on public.forum_posts (highlighted_at) where highlighted_at is not null;

create table public.forum_highlight_seen (
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id bigint not null references public.forum_posts (id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index forum_highlight_seen_post_idx on public.forum_highlight_seen (post_id);
alter table public.forum_highlight_seen enable row level security;
revoke all on public.forum_highlight_seen from anon, authenticated;
grant select, insert on public.forum_highlight_seen to authenticated;
create policy "Segnalati visti: i propri" on public.forum_highlight_seen for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Segnalati visti: si segna il proprio" on public.forum_highlight_seen for insert to authenticated
  with check (user_id = (select auth.uid()));

create or replace function public.forum_highlight_post(p_post bigint, p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_permission('forum.segnalare') then
    raise exception 'Non hai il permesso di segnalare i post.' using errcode = '42501';
  end if;
  update public.forum_posts
  set highlighted_at = case when p_on then now() else null end,
      highlighted_by = case when p_on then public.my_display_name() else null end
  where id = p_post;
  -- segnalato di nuovo: torna a comparire a tutti (non a chi segnala)
  if p_on then
    delete from public.forum_highlight_seen where post_id = p_post;
    insert into public.forum_highlight_seen (user_id, post_id) values (auth.uid(), p_post);
  end if;
end;
$$;

create or replace function public.forum_pending_highlights()
returns table (post_id bigint, thread_id uuid, board_slug text, title text, highlighted_by text, highlighted_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, t.id, b.slug, t.title, p.highlighted_by, p.highlighted_at
  from public.forum_posts p
  join public.forum_threads t on t.id = p.thread_id
  join public.forum_boards b on b.id = t.board_id
  where auth.uid() is not null
    and p.highlighted_at > now() - interval '30 days'
    and not exists (select 1 from public.forum_highlight_seen v where v.post_id = p.id and v.user_id = auth.uid())
  order by p.highlighted_at desc
  limit 10;
$$;

-- ---------------------------------------------------------------------
-- 6. FUNZIONI: chi le può chiamare
-- ---------------------------------------------------------------------
revoke execute on function public.gossip_roll(uuid) from public, anon;
revoke execute on function public.gossip_pending(uuid) from public, anon;
revoke execute on function public.gossip_report(uuid, text, uuid, uuid, uuid[]) from public, anon;
revoke execute on function public.gossip_review(uuid, boolean, text) from public, anon;
revoke execute on function public.gossip_waiting() from public, anon;
revoke execute on function public.forum_unread() from public, anon;
revoke execute on function public.forum_mark_read(uuid) from public, anon;
revoke execute on function public.forum_touch() from public, anon;
revoke execute on function public.forum_highlight_post(bigint, boolean) from public, anon;
revoke execute on function public.forum_pending_highlights() from public, anon;
grant execute on function public.gossip_roll(uuid) to authenticated;
grant execute on function public.gossip_pending(uuid) to authenticated;
grant execute on function public.gossip_report(uuid, text, uuid, uuid, uuid[]) to authenticated;
grant execute on function public.gossip_review(uuid, boolean, text) to authenticated;
grant execute on function public.gossip_waiting() to authenticated;
grant execute on function public.forum_unread() to authenticated;
grant execute on function public.forum_mark_read(uuid) to authenticated;
grant execute on function public.forum_touch() to authenticated;
grant execute on function public.forum_highlight_post(bigint, boolean) to authenticated;
grant execute on function public.forum_pending_highlights() to authenticated;

-- ---------------------------------------------------------------------
-- 7. TEMPO REALE
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.absences;
alter publication supabase_realtime add table public.play_requests;
alter publication supabase_realtime add table public.gossip_reports;
alter publication supabase_realtime add table public.forum_posts;

-- ---------------------------------------------------------------------
-- 8. LAVORO AUTOMATICO (pg_cron): pulizia della ricerca di gioco ogni 5 minuti.
-- Se pg_cron non è disponibile la migrazione prosegue: le giocate finite
-- non si vedono comunque (il sito mostra solo quelle non ancora finite).
-- ---------------------------------------------------------------------
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('pulizia-ricerca-gioco', '*/5 * * * *', 'select public.purge_ended_play_requests()');
exception when others then
  raise notice 'pg_cron non disponibile: %', sqlerrm;
end $$;

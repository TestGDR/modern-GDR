-- =====================================================================
-- MESSAGGI ON E OFF (fase 5a del documento "Funzioni generiche")
-- Logica ripresa dal Westeros GDR (migrazioni 0006, 0042, 0044, 0045).
--
-- Due canali con le stesse funzioni:
--   ON  = tra personaggi (in gioco): servono personaggi approvati
--   OFF = tra giocatori (fuori gioco): basta essere registrati
-- I messaggi sono legati all'utente (profiles): nei messaggi ON si mostra
-- il nome del personaggio.
--
--   private_messages     messaggi diretti, con kind 'on' / 'off'
--   off_groups           gruppi (colonna channel), con membri e messaggi
--   off_broadcasts       messaggi dello staff a tutti (permesso annunci.globali)
--   system_messages      la conversazione SISTEMA (solo canale OFF, sola lettura)
--   off_hidden           conversazioni tolte dal proprio elenco
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PERMESSI: annunci.pubblicare diventa annunci.globali (catalogo del College)
-- ---------------------------------------------------------------------
update public.user_levels
set permissions = array(
  select distinct case p when 'annunci.pubblicare' then 'annunci.globali' else p end
  from unnest(permissions) as p
)
where 'annunci.pubblicare' = any (permissions);

alter policy "Notizie: lo staff le pubblica" on public.city_news
  with check ((select public.has_permission('annunci.globali')));
alter policy "Notizie: lo staff le modifica" on public.city_news
  using ((select public.has_permission('annunci.globali'))) with check ((select public.has_permission('annunci.globali')));
alter policy "Notizie: lo staff le elimina" on public.city_news
  using ((select public.has_permission('annunci.globali')));
alter policy "Forum discussioni: gli utenti registrati le aprono" on public.forum_threads
  with check (
    author_id = (select auth.uid())
    and (character_id is null or public.owns_character(character_id))
    and (
      (select public.has_permission('annunci.globali'))
      or not exists (select 1 from public.forum_boards b where b.id = board_id and b.staff_only)
    )
  );

-- L'utente ha un personaggio approvato (serve per il canale ON)
create or replace function public.has_active_character(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.characters where owner_id = p_user and status = 'approvata');
$$;

-- Si può usare questo canale? ON: personaggio approvato; OFF: chiunque sia registrato
create or replace function public.can_use_channel(p_channel text, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_channel
    when 'off' then exists (select 1 from public.profiles where id = p_user)
    when 'on' then public.has_active_character(p_user)
    else false
  end;
$$;

-- ---------------------------------------------------------------------
-- 2. MESSAGGI DIRETTI: dai personaggi agli utenti, con il canale
-- ---------------------------------------------------------------------
drop policy "Messaggi privati: lettura solo di mittente e destinatario" on public.private_messages;
drop policy "Messaggi privati: invio dal proprio personaggio" on public.private_messages;
drop policy "Messaggi privati: il destinatario li segna come letti" on public.private_messages;

alter table public.private_messages
  add column kind text not null default 'on' check (kind in ('on', 'off')),
  add column from_user uuid references public.profiles (id) on delete cascade,
  add column to_user uuid references public.profiles (id) on delete cascade;

-- I messaggi già scritti erano tra personaggi: restano nel canale ON
update public.private_messages m
set from_user = s.owner_id, to_user = r.owner_id
from public.characters s, public.characters r
where s.id = m.sender_id and r.id = m.recipient_id;
delete from public.private_messages where from_user is null or to_user is null;

drop index if exists public.private_messages_sender_idx;
drop index if exists public.private_messages_recipient_idx;
alter table public.private_messages drop constraint if exists private_messages_not_to_self;
alter table public.private_messages drop column sender_id, drop column recipient_id;
alter table public.private_messages rename column from_user to sender_id;
alter table public.private_messages rename column to_user to recipient_id;
alter table public.private_messages
  alter column sender_id set not null,
  alter column recipient_id set not null,
  alter column sender_id set default auth.uid(),
  add constraint private_messages_not_to_self check (sender_id <> recipient_id);

create index private_messages_sender_idx on public.private_messages (sender_id, kind, created_at desc);
create index private_messages_recipient_idx on public.private_messages (recipient_id, kind, read_at);

revoke all on public.private_messages from anon, authenticated;
grant select on public.private_messages to authenticated;
grant insert (recipient_id, kind, body) on public.private_messages to authenticated;
grant update (read_at) on public.private_messages to authenticated;

-- Data, mittente e "non letto" li decide il database
create or replace function public.private_messages_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.sender_id := auth.uid();
  new.created_at := now();
  new.read_at := null;
  return new;
end;
$$;
create trigger private_messages_before_insert before insert on public.private_messages
  for each row execute function public.private_messages_before_insert();

create policy "Messaggi: li leggono mittente e destinatario" on public.private_messages for select to authenticated
  using (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()));
create policy "Messaggi: si scrivono nel proprio canale" on public.private_messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and public.can_use_channel(kind, (select auth.uid()))
    and public.can_use_channel(kind, recipient_id)
  );
create policy "Messaggi: il destinatario li segna come letti" on public.private_messages for update to authenticated
  using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));
-- Nessuna cancellazione: "Elimina" toglie la conversazione solo dal proprio elenco (off_hidden)

-- ---------------------------------------------------------------------
-- 3. GRUPPI (Westeros 0042), uno per canale
-- ---------------------------------------------------------------------
create table public.off_groups (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('on', 'off')),
  name text not null check (char_length(name) between 1 and 60),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.off_group_members (
  group_id uuid not null references public.off_groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index off_group_members_user_idx on public.off_group_members (user_id);

create table public.off_group_messages (
  id bigint generated always as identity primary key,
  group_id uuid not null references public.off_groups (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  body text not null check (char_length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index off_group_messages_group_idx on public.off_group_messages (group_id, created_at desc);
create index off_group_messages_sender_idx on public.off_group_messages (sender_id);

create or replace function public.is_off_group_member(p_group uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.off_group_members where group_id = p_group and user_id = auth.uid());
$$;

create or replace function public.is_off_group_owner(p_group uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.off_groups where id = p_group and created_by = auth.uid());
$$;

alter table public.off_groups enable row level security;
alter table public.off_group_members enable row level security;
alter table public.off_group_messages enable row level security;
revoke all on public.off_groups, public.off_group_members, public.off_group_messages from anon, authenticated;
grant select, update (name) on public.off_groups to authenticated;
grant select, update (last_read_at) on public.off_group_members to authenticated;
grant select, insert (group_id, body) on public.off_group_messages to authenticated;

create policy "Gruppi: li vedono i membri" on public.off_groups for select to authenticated
  using ((select public.is_off_group_member(id)));
create policy "Gruppi: chi li ha creati li rinomina" on public.off_groups for update to authenticated
  using ((select public.is_off_group_owner(id))) with check ((select public.is_off_group_owner(id)));
-- Creazione ed eliminazione: con create_off_group / delete_off_group

create policy "Gruppi: i membri vedono i membri" on public.off_group_members for select to authenticated
  using ((select public.is_off_group_member(group_id)));
create policy "Gruppi: ognuno segna come letto per sé" on public.off_group_members for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- Membri aggiunti e tolti con add_off_group_member / remove_off_group_member

create policy "Gruppi: i membri leggono i messaggi" on public.off_group_messages for select to authenticated
  using ((select public.is_off_group_member(group_id)));
create policy "Gruppi: i membri scrivono" on public.off_group_messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and (select public.is_off_group_member(group_id))
    and exists (select 1 from public.off_groups g where g.id = group_id and public.can_use_channel(g.channel, (select auth.uid())))
  );
-- I messaggi dei gruppi non si cancellano singolarmente

-- Crea un gruppo con i membri scelti (chi lo crea è sempre dentro)
create or replace function public.create_off_group(p_channel text, p_name text, p_members uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_bad text;
begin
  if not public.can_use_channel(p_channel, auth.uid()) then
    raise exception 'Per i gruppi ON serve un personaggio approvato.' using errcode = '42501';
  end if;
  if char_length(v_name) not between 1 and 60 then
    raise exception 'Il nome del gruppo deve avere da 1 a 60 caratteri.' using errcode = 'P0001';
  end if;
  select p.username into v_bad from public.profiles p
  where p.id = any (coalesce(p_members, '{}')) and not public.can_use_channel(p_channel, p.id) limit 1;
  if v_bad is not null then
    raise exception '% non ha un personaggio approvato: nei gruppi ON non si può aggiungere.', v_bad using errcode = 'P0001';
  end if;
  insert into public.off_groups (channel, name, created_by) values (p_channel, v_name, auth.uid()) returning id into v_id;
  insert into public.off_group_members (group_id, user_id)
  select v_id, p.id from public.profiles p
  where p.id = auth.uid() or p.id = any (coalesce(p_members, '{}'))
  on conflict do nothing;
  return v_id;
end;
$$;

-- Aggiunge un membro (solo chi ha creato il gruppo)
create or replace function public.add_off_group_member(p_group uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_channel text;
begin
  if not public.is_off_group_owner(p_group) then
    raise exception 'Solo chi ha creato il gruppo può aggiungere membri.' using errcode = '42501';
  end if;
  select channel into v_channel from public.off_groups where id = p_group;
  if not public.can_use_channel(v_channel, p_user) then
    raise exception 'Nei gruppi ON si aggiungono solo giocatori con un personaggio approvato.' using errcode = 'P0001';
  end if;
  insert into public.off_group_members (group_id, user_id) values (p_group, p_user) on conflict do nothing;
end;
$$;

-- Toglie un membro: chi ha creato il gruppo toglie chiunque, gli altri solo sé stessi (escono)
create or replace function public.remove_off_group_member(p_group uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (public.is_off_group_owner(p_group) or p_user = auth.uid()) then
    raise exception 'Operazione non permessa.' using errcode = '42501';
  end if;
  delete from public.off_group_members where group_id = p_group and user_id = p_user;
  -- gruppo rimasto vuoto: si elimina
  delete from public.off_groups g where g.id = p_group
    and not exists (select 1 from public.off_group_members m where m.group_id = p_group);
end;
$$;

-- Elimina un gruppo per tutti (solo chi l'ha creato)
create or replace function public.delete_off_group(p_group uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_off_group_owner(p_group) then
    raise exception 'Solo chi ha creato il gruppo può eliminarlo.' using errcode = '42501';
  end if;
  delete from public.off_groups where id = p_group;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. MESSAGGI A TUTTI (staff con annunci.globali o messaggi.tutti)
-- ---------------------------------------------------------------------
create table public.off_broadcasts (
  id bigint generated always as identity primary key,
  channel text not null check (channel in ('on', 'off')),
  sender_id uuid references public.profiles (id) on delete set null default auth.uid(),
  body text not null check (char_length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index off_broadcasts_created_idx on public.off_broadcasts (channel, created_at desc);
create index off_broadcasts_sender_idx on public.off_broadcasts (sender_id);

create table public.off_broadcast_reads (
  user_id uuid not null references public.profiles (id) on delete cascade,
  channel text not null check (channel in ('on', 'off')),
  last_read_at timestamptz not null default now(),
  primary key (user_id, channel)
);

create or replace function public.can_broadcast()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_permission('annunci.globali') or public.has_permission('messaggi.tutti');
$$;

alter table public.off_broadcasts enable row level security;
alter table public.off_broadcast_reads enable row level security;
revoke all on public.off_broadcasts, public.off_broadcast_reads from anon, authenticated;
grant select, insert (channel, body), delete on public.off_broadcasts to authenticated;
grant select, insert, update on public.off_broadcast_reads to authenticated;

create policy "A tutti: li leggono tutti i registrati" on public.off_broadcasts for select to authenticated using (true);
create policy "A tutti: li scrive lo staff" on public.off_broadcasts for insert to authenticated
  with check (sender_id = (select auth.uid()) and (select public.can_broadcast()));
create policy "A tutti: li elimina lo staff" on public.off_broadcasts for delete to authenticated
  using ((select public.can_broadcast()));
-- (nessuna modifica: un messaggio a tutti si elimina e si riscrive)

create policy "A tutti: il proprio segno di lettura" on public.off_broadcast_reads for select to authenticated
  using (user_id = (select auth.uid()));
create policy "A tutti: si crea il proprio segno" on public.off_broadcast_reads for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "A tutti: si aggiorna il proprio segno" on public.off_broadcast_reads for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Chi c'è già ha letto tutto; i nuovi utenti partono da quando si registrano
insert into public.off_broadcast_reads (user_id, channel)
select p.id, c.channel from public.profiles p, (values ('on'), ('off')) as c (channel)
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 5. SISTEMA (Westeros 0044): avvisi automatici del sito, sola lettura
-- ---------------------------------------------------------------------
create table public.system_messages (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 8000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index system_messages_user_idx on public.system_messages (user_id, created_at desc);

alter table public.system_messages enable row level security;
revoke all on public.system_messages from anon, authenticated;
grant select, update (read_at), delete on public.system_messages to authenticated;

create policy "Sistema: i propri messaggi" on public.system_messages for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Sistema: si segnano come letti" on public.system_messages for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Sistema: si eliminano i propri" on public.system_messages for delete to authenticated
  using (user_id = (select auth.uid()));
-- Nessuno scrive a nome del SISTEMA: solo le funzioni del database

create or replace function public.send_system_message(p_user uuid, p_body text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.system_messages (user_id, body) values (p_user, left(p_body, 8000));
$$;
revoke execute on function public.send_system_message(uuid, text) from public, anon, authenticated;

-- Nuovo utente: segno di lettura dei messaggi a tutti e benvenuto
create or replace function public.profiles_messages_welcome()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.off_broadcast_reads (user_id, channel) values (new.id, 'on'), (new.id, 'off') on conflict do nothing;
  perform public.send_system_message(new.id, $testo$Benvenuto o benvenuta a Miami!

Questo è un gioco di ruolo play by chat ambientato in un college della Florida: lezioni, spiaggia, locali al tramonto e tutto quello che succede in mezzo.

Per cominciare:
- apri Scheda dalla barra laterale e premi «Crea personaggio»: sei passaggi e la scheda va allo staff per l'approvazione;
- leggi la Guida e l'Ambientazione in alto a sinistra;
- quando la scheda è approvata, scegli un quartiere sulla mappa ed entra in una chat.

Qui riceverai gli avvisi automatici del sito. Per qualsiasi dubbio scrivi allo staff.

Buon gioco!$testo$);
  return new;
end;
$$;
create trigger profiles_messages_welcome after insert on public.profiles
  for each row execute function public.profiles_messages_welcome();

-- Scheda approvata o rifiutata: avviso di SISTEMA al proprietario
create or replace function public.characters_review_notice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'approvata' and old.status is distinct from 'approvata' then
    perform public.send_system_message(new.owner_id,
      'La scheda di ' || new.name || ' è stata approvata: ora puoi giocare! Scegli un quartiere sulla mappa ed entra in una chat.');
  elsif new.status = 'rifiutata' and old.status is distinct from 'rifiutata' then
    perform public.send_system_message(new.owner_id,
      'La scheda di ' || new.name || ' è stata rifiutata.' ||
      coalesce(E'\n\nMotivo: ' || nullif(btrim(new.rejection_reason), ''), '') ||
      E'\n\nPuoi correggerla da Scheda e inviarla di nuovo.');
  end if;
  return new;
end;
$$;
create trigger characters_review_notice after update of status on public.characters
  for each row execute function public.characters_review_notice();

-- ---------------------------------------------------------------------
-- 6. CONVERSAZIONI TOLTE DAL PROPRIO ELENCO (Westeros 0045)
-- Si toglie solo dal proprio elenco: l'altro la conserva. Con un messaggio
-- nuovo la conversazione ricompare, con i soli messaggi nuovi.
-- ---------------------------------------------------------------------
create table public.off_hidden (
  user_id uuid not null references public.profiles (id) on delete cascade,
  channel text not null check (channel in ('on', 'off')),
  conv_key text not null check (conv_key ~ '^(dm:[0-9a-f-]{36}|global)$'),
  hidden_at timestamptz not null default now(),
  primary key (user_id, channel, conv_key)
);

alter table public.off_hidden enable row level security;
revoke all on public.off_hidden from anon, authenticated;
grant select, insert, update, delete on public.off_hidden to authenticated;

create policy "Nascoste: le proprie" on public.off_hidden for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Nascoste: si aggiungono le proprie" on public.off_hidden for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Nascoste: si aggiornano le proprie" on public.off_hidden for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Nascoste: si tolgono le proprie" on public.off_hidden for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- 7. NON LETTI per canale (icone ON e OFF)
-- ---------------------------------------------------------------------
create or replace function public.off_unread(p_channel text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when auth.uid() is null or p_channel not in ('on', 'off') then 0 else
    (select count(*)::int from public.private_messages m
      where m.recipient_id = auth.uid() and m.kind = p_channel and m.read_at is null)
    +
    (select count(*)::int from public.off_group_messages gm
       join public.off_groups g on g.id = gm.group_id and g.channel = p_channel
       join public.off_group_members mb on mb.group_id = gm.group_id and mb.user_id = auth.uid()
      where gm.sender_id <> auth.uid() and gm.created_at > mb.last_read_at)
    +
    (select count(*)::int from public.off_broadcasts b
      where b.channel = p_channel and b.sender_id is distinct from auth.uid()
        and b.created_at > coalesce((select r.last_read_at from public.off_broadcast_reads r
                                      where r.user_id = auth.uid() and r.channel = p_channel), now()))
    +
    (case when p_channel = 'off' then
      (select count(*)::int from public.system_messages s where s.user_id = auth.uid() and s.read_at is null)
     else 0 end)
  end;
$$;

-- Trova un utente per nome (nome del personaggio = nome dell'account), per scrivergli
create or replace function public.find_player(p_name text)
returns table (user_id uuid, name text, avatar_url text, has_character boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, coalesce(c.name, p.username), c.avatar_url, c.id is not null
  from public.profiles p
  left join public.characters c on c.owner_id = p.id and c.status = 'approvata'
  where auth.uid() is not null and lower(p.username) = lower(btrim(p_name))
  limit 1;
$$;

-- Nomi e ritratti delle persone delle proprie conversazioni
create or replace function public.player_cards(p_users uuid[])
returns table (user_id uuid, name text, avatar_url text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, coalesce(c.name, p.username), c.avatar_url
  from public.profiles p
  left join public.characters c on c.owner_id = p.id and c.status = 'approvata'
  where auth.uid() is not null and p.id = any (coalesce(p_users, '{}'))
  limit 500;
$$;

revoke execute on function public.has_active_character(uuid) from public, anon;
revoke execute on function public.can_use_channel(text, uuid) from public, anon;
revoke execute on function public.create_off_group(text, text, uuid[]) from public, anon;
revoke execute on function public.add_off_group_member(uuid, uuid) from public, anon;
revoke execute on function public.remove_off_group_member(uuid, uuid) from public, anon;
revoke execute on function public.delete_off_group(uuid) from public, anon;
revoke execute on function public.off_unread(text) from public, anon;
revoke execute on function public.find_player(text) from public, anon;
revoke execute on function public.player_cards(uuid[]) from public, anon;
grant execute on function public.has_active_character(uuid) to authenticated;
grant execute on function public.can_use_channel(text, uuid) to authenticated;
grant execute on function public.create_off_group(text, text, uuid[]) to authenticated;
grant execute on function public.add_off_group_member(uuid, uuid) to authenticated;
grant execute on function public.remove_off_group_member(uuid, uuid) to authenticated;
grant execute on function public.delete_off_group(uuid) to authenticated;
grant execute on function public.off_unread(text) to authenticated;
grant execute on function public.find_player(text) to authenticated;
grant execute on function public.player_cards(uuid[]) to authenticated;

-- ---------------------------------------------------------------------
-- 8. DATA DAL DATABASE E PRESENZE (scrivere conta come azione)
-- ---------------------------------------------------------------------
create or replace function public.set_created_now()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := now();
  if tg_table_name in ('off_group_messages', 'off_broadcasts') and auth.uid() is not null then
    new.sender_id := auth.uid();
  end if;
  return new;
end;
$$;
create trigger off_group_messages_now before insert on public.off_group_messages
  for each row execute function public.set_created_now();
create trigger off_broadcasts_now before insert on public.off_broadcasts
  for each row execute function public.set_created_now();
create trigger off_group_messages_online_action after insert on public.off_group_messages
  for each row execute function public.online_mark_action();
create trigger off_broadcasts_online_action after insert on public.off_broadcasts
  for each row execute function public.online_mark_action();

-- ---------------------------------------------------------------------
-- 9. TEMPO REALE (private_messages c'è già)
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.off_group_messages;
alter publication supabase_realtime add table public.off_group_members;
alter publication supabase_realtime add table public.off_broadcasts;
alter publication supabase_realtime add table public.off_broadcast_reads;
alter publication supabase_realtime add table public.system_messages;

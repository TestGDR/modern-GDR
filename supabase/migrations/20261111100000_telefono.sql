-- =====================================================================
-- TELEFONO (al posto dei messaggi ON)
--
-- - Solo i personaggi approvati attivano un numero di telefono (anche più
--   di uno, fino a "max_numeri_telefono"). Il numero è casuale, di Miami.
-- - Si scrive solo a chi si conosce il numero (o a chi ci ha già scritto).
-- - Rubrica, gruppi, foto e nome del profilo, numeri bloccati: i messaggi
--   e le chiamate dei numeri bloccati non arrivano, nemmeno sbloccandoli
--   dopo (chi scrive non lo sa). I messaggi di prima del blocco restano.
-- - Messaggi: testo, vocale; chiamate e videochiamate (solo a due) che
--   squillano: si risponde o si rifiuta, dopo 2 minuti "Chiamata persa".
--   Durante la chiamata i messaggi sono "in chiamata". Tutto è scritto.
-- - I vecchi messaggi ON (tra giocatori) si cancellano: restano solo OFF.
-- - Lo staff con "messaggi.log" li rilegge (Gestione → Log).
-- =====================================================================

insert into public.game_settings (key, value, kind, label, description, sort_order) values
  ('max_numeri_telefono', '3', 'number', 'Numeri di telefono per personaggio',
   'Quanti numeri di telefono può attivare al massimo un personaggio approvato.', 40)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- 1. VIA I VECCHI MESSAGGI ON (i messaggi OFF restano)
-- ---------------------------------------------------------------------
delete from public.private_messages where kind = 'on';
delete from public.off_groups where channel = 'on';
delete from public.off_broadcasts where channel = 'on';
delete from public.off_broadcast_reads where channel = 'on';
delete from public.off_hidden where channel = 'on';
alter table public.private_messages add constraint private_messages_solo_off check (kind = 'off');
alter table public.off_groups add constraint off_groups_solo_off check (channel = 'off');
alter table public.off_broadcasts add constraint off_broadcasts_solo_off check (channel = 'off');

-- ---------------------------------------------------------------------
-- 2. TABELLE
-- ---------------------------------------------------------------------
create table public.phone_numbers (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters (id) on delete cascade,
  -- solo cifre, con il prefisso 1: es. 13054821937 = +1 (305) 482-1937
  digits text not null unique check (digits ~ '^1[0-9]{10}$'),
  display_name text not null check (char_length(display_name) between 1 and 40),
  avatar_url text check (avatar_url is null or char_length(avatar_url) <= 500),
  status_text text not null default '' check (char_length(status_text) <= 140),
  created_at timestamptz not null default now()
);
create index phone_numbers_character_idx on public.phone_numbers (character_id);

create table public.phone_contacts (
  id uuid primary key default gen_random_uuid(),
  number_id uuid not null references public.phone_numbers (id) on delete cascade,
  digits text not null check (digits ~ '^1[0-9]{10}$'),
  name text not null check (char_length(name) between 1 and 40),
  created_at timestamptz not null default now(),
  unique (number_id, digits)
);

create table public.phone_blocks (
  number_id uuid not null references public.phone_numbers (id) on delete cascade,
  digits text not null check (digits ~ '^1[0-9]{10}$'),
  created_at timestamptz not null default now(),
  primary key (number_id, digits)
);

create table public.phone_threads (
  id uuid primary key default gen_random_uuid(),
  is_group boolean not null default false,
  name text not null default '' check (char_length(name) <= 60),
  avatar_url text check (avatar_url is null or char_length(avatar_url) <= 500),
  created_by uuid references public.phone_numbers (id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);
create index phone_threads_created_by_idx on public.phone_threads (created_by);

create table public.phone_members (
  thread_id uuid not null references public.phone_threads (id) on delete cascade,
  number_id uuid not null references public.phone_numbers (id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (thread_id, number_id)
);
create index phone_members_number_idx on public.phone_members (number_id);

create table public.phone_messages (
  id bigint generated always as identity primary key,
  thread_id uuid not null references public.phone_threads (id) on delete cascade,
  -- per gli avvisi di chiamata: il numero che ha chiamato
  sender_number_id uuid references public.phone_numbers (id) on delete set null,
  mode text not null check (mode in ('testo', 'vocale', 'chiamata', 'videochiamata', 'evento')),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  -- numeri che avevano bloccato il mittente al momento dell'invio: non lo vedranno mai
  blocked_for uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
create index phone_messages_thread_idx on public.phone_messages (thread_id, created_at desc);
create index phone_messages_sender_idx on public.phone_messages (sender_number_id);

create table public.phone_calls (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.phone_threads (id) on delete cascade,
  caller_number_id uuid references public.phone_numbers (id) on delete set null,
  callee_number_id uuid references public.phone_numbers (id) on delete set null,
  video boolean not null default false,
  status text not null default 'squilla' check (status in ('squilla', 'attiva', 'terminata', 'rifiutata', 'persa')),
  -- il destinatario ha bloccato chi chiama: non vede nulla
  blocked boolean not null default false,
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz
);
create index phone_calls_thread_idx on public.phone_calls (thread_id);
create index phone_calls_caller_idx on public.phone_calls (caller_number_id);
create index phone_calls_callee_idx on public.phone_calls (callee_number_id);
create index phone_calls_open_idx on public.phone_calls (status) where status in ('squilla', 'attiva');

-- ---------------------------------------------------------------------
-- 3. FUNZIONI DI CONTROLLO
-- ---------------------------------------------------------------------
-- Il numero è di un mio personaggio approvato
create or replace function public.phone_owned(p_number uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.phone_numbers n join public.characters c on c.id = n.character_id
    where n.id = p_number and c.owner_id = auth.uid() and c.status = 'approvata'
  )
$$;

-- Uno dei miei numeri è nella conversazione
create or replace function public.phone_is_member(p_thread uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.phone_members m
    join public.phone_numbers n on n.id = m.number_id
    join public.characters c on c.id = n.character_id
    where m.thread_id = p_thread and c.owner_id = auth.uid()
  )
$$;

-- I numeri dei miei personaggi
create or replace function public.phone_my_numbers()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(n.id), '{}')
  from public.phone_numbers n join public.characters c on c.id = n.character_id
  where c.owner_id = auth.uid()
$$;

-- Numero scritto in qualsiasi modo → solo cifre con il prefisso 1
create or replace function public.phone_normalize(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when d ~ '^[0-9]{10}$' then '1' || d
    when d ~ '^1[0-9]{10}$' then d
    else null end
  from (select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as d) x
$$;

revoke execute on function public.phone_owned(uuid) from public, anon;
revoke execute on function public.phone_is_member(uuid) from public, anon;
revoke execute on function public.phone_my_numbers() from public, anon;
grant execute on function public.phone_owned(uuid), public.phone_is_member(uuid), public.phone_my_numbers() to authenticated;

-- ---------------------------------------------------------------------
-- 4. SICUREZZA: si legge solo ciò che riguarda i propri numeri (più lo
--    staff dei log); si scrive con le funzioni, tranne rubrica e blocchi
-- ---------------------------------------------------------------------
alter table public.phone_numbers enable row level security;
alter table public.phone_contacts enable row level security;
alter table public.phone_blocks enable row level security;
alter table public.phone_threads enable row level security;
alter table public.phone_members enable row level security;
alter table public.phone_messages enable row level security;
alter table public.phone_calls enable row level security;

revoke all on public.phone_numbers, public.phone_contacts, public.phone_blocks, public.phone_threads,
  public.phone_members, public.phone_messages, public.phone_calls from anon, authenticated;
grant select on public.phone_numbers, public.phone_threads, public.phone_members, public.phone_messages, public.phone_calls to authenticated;
grant select, delete on public.phone_contacts, public.phone_blocks to authenticated;
grant insert (number_id, digits, name), update (name) on public.phone_contacts to authenticated;
grant insert (number_id, digits) on public.phone_blocks to authenticated;

create policy "Telefono: i propri numeri" on public.phone_numbers for select to authenticated
  using ((select public.phone_owned(id)) or (select public.has_permission('messaggi.log')));
create policy "Telefono: numeri creati solo dalla funzione" on public.phone_numbers for insert to authenticated with check (false);
create policy "Telefono: numeri modificati solo dalla funzione" on public.phone_numbers for update to authenticated using (false);
create policy "Telefono: numeri non si eliminano" on public.phone_numbers for delete to authenticated using (false);

create policy "Rubrica: la propria" on public.phone_contacts for select to authenticated using ((select public.phone_owned(number_id)));
create policy "Rubrica: si aggiunge alla propria" on public.phone_contacts for insert to authenticated with check ((select public.phone_owned(number_id)));
create policy "Rubrica: si modifica la propria" on public.phone_contacts for update to authenticated
  using ((select public.phone_owned(number_id))) with check ((select public.phone_owned(number_id)));
create policy "Rubrica: si elimina dalla propria" on public.phone_contacts for delete to authenticated using ((select public.phone_owned(number_id)));

create policy "Bloccati: i propri" on public.phone_blocks for select to authenticated using ((select public.phone_owned(number_id)));
create policy "Bloccati: si blocca dal proprio numero" on public.phone_blocks for insert to authenticated with check ((select public.phone_owned(number_id)));
create policy "Bloccati: nessuna modifica" on public.phone_blocks for update to authenticated using (false);
create policy "Bloccati: si sblocca dal proprio numero" on public.phone_blocks for delete to authenticated using ((select public.phone_owned(number_id)));

create policy "Conversazioni: le proprie" on public.phone_threads for select to authenticated
  using ((select public.phone_is_member(id)) or (select public.has_permission('messaggi.log')));
create policy "Conversazioni: create dalle funzioni" on public.phone_threads for insert to authenticated with check (false);
create policy "Conversazioni: modificate dalle funzioni" on public.phone_threads for update to authenticated using (false);
create policy "Conversazioni: non si eliminano" on public.phone_threads for delete to authenticated using (false);

create policy "Partecipanti: delle proprie conversazioni" on public.phone_members for select to authenticated
  using ((select public.phone_is_member(thread_id)) or (select public.has_permission('messaggi.log')));
create policy "Partecipanti: aggiunti dalle funzioni" on public.phone_members for insert to authenticated with check (false);
create policy "Partecipanti: aggiornati dalle funzioni" on public.phone_members for update to authenticated using (false);
create policy "Partecipanti: tolti dalle funzioni" on public.phone_members for delete to authenticated using (false);

create policy "Messaggi del telefono: delle proprie conversazioni" on public.phone_messages for select to authenticated
  using (
    ((select public.phone_is_member(thread_id)) and not (blocked_for && (select public.phone_my_numbers())))
    or (select public.has_permission('messaggi.log'))
  );
create policy "Messaggi del telefono: scritti dalle funzioni" on public.phone_messages for insert to authenticated with check (false);
create policy "Messaggi del telefono: non si modificano" on public.phone_messages for update to authenticated using (false);
create policy "Messaggi del telefono: non si eliminano" on public.phone_messages for delete to authenticated using (false);

create policy "Chiamate: le proprie" on public.phone_calls for select to authenticated
  using (
    (select public.phone_owned(caller_number_id))
    or ((select public.phone_owned(callee_number_id)) and not blocked)
    or (select public.has_permission('messaggi.log'))
  );
create policy "Chiamate: create dalle funzioni" on public.phone_calls for insert to authenticated with check (false);
create policy "Chiamate: aggiornate dalle funzioni" on public.phone_calls for update to authenticated using (false);
create policy "Chiamate: non si eliminano" on public.phone_calls for delete to authenticated using (false);

-- Chi ha bloccato il mittente non riceverà questo messaggio (nemmeno sbloccandolo)
create or replace function public.phone_messages_blocked_for()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.sender_number_id is not null then
    select coalesce(array_agg(m.number_id), '{}') into new.blocked_for
    from public.phone_members m
    join public.phone_numbers s on s.id = new.sender_number_id
    join public.phone_blocks b on b.number_id = m.number_id and b.digits = s.digits
    where m.thread_id = new.thread_id;
  end if;
  return new;
end;
$$;
revoke execute on function public.phone_messages_blocked_for() from public, anon, authenticated;
create trigger phone_messages_blocked_for before insert on public.phone_messages
  for each row execute function public.phone_messages_blocked_for();

alter publication supabase_realtime add table public.phone_messages;
alter publication supabase_realtime add table public.phone_calls;
alter publication supabase_realtime add table public.phone_members;
alter publication supabase_realtime add table public.phone_threads;

-- ---------------------------------------------------------------------
-- 5. NUMERI E PROFILO
-- ---------------------------------------------------------------------
create or replace function public.phone_create_number(p_character uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.characters;
  v_max int := greatest(1, coalesce(public.setting_int('max_numeri_telefono'), 3));
  v_digits text;
  v_id uuid;
  i int := 0;
begin
  select * into c from public.characters where id = p_character for update;
  if c.id is null or c.owner_id is distinct from auth.uid() or c.status <> 'approvata' then
    raise exception 'Il telefono si attiva solo con un tuo personaggio approvato.' using errcode = '42501';
  end if;
  if (select count(*) from public.phone_numbers where character_id = p_character) >= v_max then
    raise exception 'Hai già % numeri: è il massimo.', v_max using errcode = 'P0001';
  end if;
  loop
    i := i + 1;
    -- prefissi di Miami: 305 e 786
    v_digits := '1' || (array['305', '786'])[1 + floor(random() * 2)::int]
                || (200 + floor(random() * 800))::int::text
                || lpad(floor(random() * 10000)::int::text, 4, '0');
    exit when not exists (select 1 from public.phone_numbers where digits = v_digits);
    if i > 50 then raise exception 'Riprova fra un attimo.' using errcode = 'P0001'; end if;
  end loop;
  insert into public.phone_numbers (character_id, digits, display_name, avatar_url)
  values (p_character, v_digits, left(c.name, 40), c.avatar_url)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.phone_update_profile(p_number uuid, p_name text, p_avatar text, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := left(btrim(coalesce(p_name, '')), 40);
  v_avatar text := nullif(btrim(coalesce(p_avatar, '')), '');
begin
  if not public.phone_owned(p_number) then
    raise exception 'Questo numero non è tuo.' using errcode = '42501';
  end if;
  if v_name = '' then raise exception 'Scrivi il nome del profilo.' using errcode = 'P0001'; end if;
  if v_avatar is not null and v_avatar !~ '^https://' then raise exception 'Foto non valida.' using errcode = 'P0001'; end if;
  update public.phone_numbers
  set display_name = v_name, avatar_url = left(v_avatar, 500), status_text = left(btrim(coalesce(p_status, '')), 140)
  where id = p_number;
end;
$$;

-- Profili dei numeri con cui ho una conversazione (più quelli cercati)
create or replace function public.phone_directory(p_digits text[] default '{}')
returns table (number_id uuid, digits text, display_name text, avatar_url text, status_text text)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.digits, n.display_name, n.avatar_url, n.status_text
  from public.phone_numbers n
  where auth.uid() is not null and (
    n.id in (
      select m2.number_id from public.phone_members m1
      join public.phone_numbers mine on mine.id = m1.number_id
      join public.characters c on c.id = mine.character_id and c.owner_id = auth.uid()
      join public.phone_members m2 on m2.thread_id = m1.thread_id
    )
    or n.digits = any (coalesce(p_digits, '{}'))
  )
$$;

-- ---------------------------------------------------------------------
-- 6. CONVERSAZIONI E GRUPPI
-- ---------------------------------------------------------------------
create or replace function public.phone_open_chat(p_from uuid, p_to text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_to uuid;
  v_thread uuid;
begin
  if not public.phone_owned(p_from) then
    raise exception 'Questo numero non è tuo.' using errcode = '42501';
  end if;
  select id into v_to from public.phone_numbers where digits = public.phone_normalize(p_to);
  if v_to is null then
    raise exception 'Il numero selezionato è inesistente.' using errcode = 'P0001';
  end if;
  if v_to = p_from then
    raise exception 'Non puoi scrivere a te stesso.' using errcode = 'P0001';
  end if;
  -- c'è già una conversazione a due tra questi numeri?
  select t.id into v_thread from public.phone_threads t
  where not t.is_group
    and exists (select 1 from public.phone_members where thread_id = t.id and number_id = p_from)
    and exists (select 1 from public.phone_members where thread_id = t.id and number_id = v_to)
  limit 1;
  if v_thread is null then
    insert into public.phone_threads (is_group, created_by) values (false, p_from) returning id into v_thread;
    insert into public.phone_members (thread_id, number_id) values (v_thread, p_from), (v_thread, v_to);
  end if;
  return v_thread;
end;
$$;

create or replace function public.phone_create_group(p_from uuid, p_name text, p_to text[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := left(btrim(coalesce(p_name, '')), 60);
  v_thread uuid;
  v_digits text;
  v_id uuid;
  v_me text;
begin
  if not public.phone_owned(p_from) then
    raise exception 'Questo numero non è tuo.' using errcode = '42501';
  end if;
  if v_name = '' then raise exception 'Scrivi il nome del gruppo.' using errcode = 'P0001'; end if;
  if coalesce(array_length(p_to, 1), 0) = 0 then raise exception 'Aggiungi almeno un numero.' using errcode = 'P0001'; end if;
  if array_length(p_to, 1) > 50 then raise exception 'Al massimo 50 numeri.' using errcode = 'P0001'; end if;
  select digits into v_me from public.phone_numbers where id = p_from;
  insert into public.phone_threads (is_group, name, created_by) values (true, v_name, p_from) returning id into v_thread;
  insert into public.phone_members (thread_id, number_id) values (v_thread, p_from);
  foreach v_digits in array p_to loop
    select id into v_id from public.phone_numbers where digits = public.phone_normalize(v_digits);
    if v_id is null then
      raise exception 'Il numero % è inesistente.', v_digits using errcode = 'P0001';
    end if;
    insert into public.phone_members (thread_id, number_id) values (v_thread, v_id) on conflict do nothing;
  end loop;
  insert into public.phone_messages (thread_id, sender_number_id, mode, body)
  values (v_thread, null, 'evento', 'Gruppo «' || v_name || '» creato');
  return v_thread;
end;
$$;

-- Aggiunge un numero a un gruppo (chi ne fa parte)
create or replace function public.phone_group_add(p_thread uuid, p_from uuid, p_to text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_name text;
begin
  if not public.phone_owned(p_from) or not exists (
    select 1 from public.phone_members m join public.phone_threads t on t.id = m.thread_id and t.is_group
    where m.thread_id = p_thread and m.number_id = p_from
  ) then
    raise exception 'Non fai parte di questo gruppo.' using errcode = '42501';
  end if;
  select id, display_name into v_id, v_name from public.phone_numbers where digits = public.phone_normalize(p_to);
  if v_id is null then raise exception 'Il numero selezionato è inesistente.' using errcode = 'P0001'; end if;
  insert into public.phone_members (thread_id, number_id) values (p_thread, v_id) on conflict do nothing;
  insert into public.phone_messages (thread_id, sender_number_id, mode, body)
  values (p_thread, null, 'evento', v_name || ' è stato aggiunto al gruppo');
end;
$$;

create or replace function public.phone_group_leave(p_thread uuid, p_from uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  if not public.phone_owned(p_from) then
    raise exception 'Questo numero non è tuo.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.phone_threads where id = p_thread and is_group) then
    raise exception 'Si esce solo dai gruppi.' using errcode = 'P0001';
  end if;
  select display_name into v_name from public.phone_numbers where id = p_from;
  delete from public.phone_members where thread_id = p_thread and number_id = p_from;
  if found then
    insert into public.phone_messages (thread_id, sender_number_id, mode, body)
    values (p_thread, null, 'evento', v_name || ' ha lasciato il gruppo');
  end if;
end;
$$;

create or replace function public.phone_group_update(p_thread uuid, p_from uuid, p_name text, p_avatar text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := left(btrim(coalesce(p_name, '')), 60);
  v_avatar text := nullif(btrim(coalesce(p_avatar, '')), '');
begin
  if not public.phone_owned(p_from) or not exists (
    select 1 from public.phone_members m join public.phone_threads t on t.id = m.thread_id and t.is_group
    where m.thread_id = p_thread and m.number_id = p_from
  ) then
    raise exception 'Non fai parte di questo gruppo.' using errcode = '42501';
  end if;
  if v_name = '' then raise exception 'Scrivi il nome del gruppo.' using errcode = 'P0001'; end if;
  if v_avatar is not null and v_avatar !~ '^https://' then raise exception 'Foto non valida.' using errcode = 'P0001'; end if;
  update public.phone_threads set name = v_name, avatar_url = left(v_avatar, 500) where id = p_thread;
end;
$$;

-- ---------------------------------------------------------------------
-- 7. MESSAGGI
-- ---------------------------------------------------------------------
create or replace function public.phone_send(p_thread uuid, p_from uuid, p_body text, p_mode text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_body text := btrim(coalesce(p_body, ''));
  v_mode text := coalesce(p_mode, 'testo');
  v_call public.phone_calls;
begin
  if not public.phone_owned(p_from) or not exists (select 1 from public.phone_members where thread_id = p_thread and number_id = p_from) then
    raise exception 'Non fai parte di questa conversazione.' using errcode = '42501';
  end if;
  if char_length(v_body) not between 1 and 4000 then
    raise exception 'Il messaggio va da 1 a 4000 caratteri.' using errcode = 'P0001';
  end if;
  if v_mode not in ('testo', 'vocale') then v_mode := 'testo'; end if;
  -- durante una chiamata attiva si parla "in chiamata"
  select * into v_call from public.phone_calls
  where thread_id = p_thread and status = 'attiva' and p_from in (caller_number_id, callee_number_id)
  order by created_at desc limit 1;
  if v_call.id is not null then
    v_mode := case when v_call.video then 'videochiamata' else 'chiamata' end;
  end if;
  insert into public.phone_messages (thread_id, sender_number_id, mode, body) values (p_thread, p_from, v_mode, v_body);
  update public.phone_threads set last_message_at = now() where id = p_thread;
  update public.phone_members set last_read_at = now() where thread_id = p_thread and number_id = p_from;
end;
$$;

create or replace function public.phone_mark_read(p_thread uuid, p_from uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.phone_owned(p_from) then
    raise exception 'Questo numero non è tuo.' using errcode = '42501';
  end if;
  update public.phone_members set last_read_at = now() where thread_id = p_thread and number_id = p_from;
end;
$$;

-- ---------------------------------------------------------------------
-- 8. CHIAMATE E VIDEOCHIAMATE (solo a due)
-- ---------------------------------------------------------------------
-- Chiude le chiamate scadute: squilli senza risposta da 2 minuti, chiamate
-- attive senza messaggi da 30 minuti
create or replace function public.phone_expire_calls()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  k public.phone_calls;
begin
  for k in select * from public.phone_calls where status = 'squilla' and created_at < now() - interval '2 minutes' for update skip locked loop
    update public.phone_calls set status = 'persa', ended_at = now() where id = k.id;
    insert into public.phone_messages (thread_id, sender_number_id, mode, body)
    values (k.thread_id, k.caller_number_id, 'evento', case when k.video then 'Videochiamata persa' else 'Chiamata persa' end);
    update public.phone_threads set last_message_at = now() where id = k.thread_id;
  end loop;
  for k in select * from public.phone_calls c where c.status = 'attiva'
      and greatest(c.answered_at, coalesce((select max(m.created_at) from public.phone_messages m where m.thread_id = c.thread_id), c.answered_at))
          < now() - interval '30 minutes'
      for update skip locked loop
    update public.phone_calls set status = 'terminata', ended_at = now() where id = k.id;
    insert into public.phone_messages (thread_id, sender_number_id, mode, body)
    values (k.thread_id, k.caller_number_id, 'evento',
            case when k.video then 'Videochiamata terminata' else 'Chiamata terminata' end || ' (linea caduta)');
  end loop;
end;
$$;
revoke execute on function public.phone_expire_calls() from public, anon, authenticated;

create or replace function public.phone_call(p_thread uuid, p_from uuid, p_video boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_to uuid;
  v_blocked boolean;
  v_id uuid;
begin
  perform public.phone_expire_calls();
  if not public.phone_owned(p_from) or not exists (select 1 from public.phone_members where thread_id = p_thread and number_id = p_from) then
    raise exception 'Non fai parte di questa conversazione.' using errcode = '42501';
  end if;
  if exists (select 1 from public.phone_threads where id = p_thread and is_group) then
    raise exception 'Le chiamate si fanno solo a due.' using errcode = 'P0001';
  end if;
  select number_id into v_to from public.phone_members where thread_id = p_thread and number_id <> p_from limit 1;
  if v_to is null then raise exception 'Nessuno da chiamare.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.phone_calls where status in ('squilla', 'attiva') and p_from in (caller_number_id, callee_number_id)) then
    raise exception 'Sei già in una chiamata.' using errcode = 'P0001';
  end if;
  v_blocked := exists (
    select 1 from public.phone_blocks b join public.phone_numbers f on f.id = p_from
    where b.number_id = v_to and b.digits = f.digits
  );
  insert into public.phone_calls (thread_id, caller_number_id, callee_number_id, video, blocked)
  values (p_thread, p_from, v_to, coalesce(p_video, false), v_blocked)
  returning id into v_id;
  -- occupato: chi è già al telefono non riceve (resta "Numero occupato")
  if exists (select 1 from public.phone_calls where id <> v_id and status in ('squilla', 'attiva') and v_to in (caller_number_id, callee_number_id)) then
    update public.phone_calls set status = 'persa', ended_at = now() where id = v_id;
    insert into public.phone_messages (thread_id, sender_number_id, mode, body)
    values (p_thread, p_from, 'evento', 'Numero occupato');
  end if;
  return v_id;
end;
$$;

create or replace function public.phone_answer(p_call uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  k public.phone_calls;
begin
  perform public.phone_expire_calls();
  select * into k from public.phone_calls where id = p_call for update;
  if k.id is null or not public.phone_owned(k.callee_number_id) or k.blocked then
    raise exception 'Chiamata non trovata.' using errcode = '42501';
  end if;
  if k.status <> 'squilla' then
    raise exception 'La chiamata non squilla più.' using errcode = 'P0001';
  end if;
  if p_accept then
    update public.phone_calls set status = 'attiva', answered_at = now() where id = p_call;
    insert into public.phone_messages (thread_id, sender_number_id, mode, body)
    values (k.thread_id, k.caller_number_id, 'evento', case when k.video then 'Videochiamata iniziata' else 'Chiamata iniziata' end);
  else
    update public.phone_calls set status = 'rifiutata', ended_at = now() where id = p_call;
    insert into public.phone_messages (thread_id, sender_number_id, mode, body)
    values (k.thread_id, k.caller_number_id, 'evento', case when k.video then 'Videochiamata rifiutata' else 'Chiamata rifiutata' end);
  end if;
  update public.phone_threads set last_message_at = now() where id = k.thread_id;
end;
$$;

-- Riaggancia: chi chiama (anche mentre squilla) o chi ha risposto
create or replace function public.phone_hangup(p_call uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  k public.phone_calls;
  v_min int;
begin
  select * into k from public.phone_calls where id = p_call for update;
  if k.id is null or not (public.phone_owned(k.caller_number_id) or (public.phone_owned(k.callee_number_id) and not k.blocked)) then
    raise exception 'Chiamata non trovata.' using errcode = '42501';
  end if;
  if k.status = 'squilla' then
    update public.phone_calls set status = 'persa', ended_at = now() where id = p_call;
    insert into public.phone_messages (thread_id, sender_number_id, mode, body)
    values (k.thread_id, k.caller_number_id, 'evento', case when k.video then 'Videochiamata persa' else 'Chiamata persa' end);
  elsif k.status = 'attiva' then
    v_min := greatest(1, ceil(extract(epoch from now() - k.answered_at) / 60)::int);
    update public.phone_calls set status = 'terminata', ended_at = now() where id = p_call;
    insert into public.phone_messages (thread_id, sender_number_id, mode, body)
    values (k.thread_id, k.caller_number_id, 'evento',
            case when k.video then 'Videochiamata terminata' else 'Chiamata terminata' end || ' · ' || v_min || ' min');
  else
    return;
  end if;
  update public.phone_threads set last_message_at = now() where id = k.thread_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 9. STATO PER L'ICONA "TELEFONO": non letti e chiamata in corso
-- ---------------------------------------------------------------------
create or replace function public.phone_state()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unread int;
  k record;
begin
  if auth.uid() is null then return jsonb_build_object('unread', 0, 'call', null); end if;
  perform public.phone_expire_calls();
  select count(*)::int into v_unread
  from public.phone_messages pm
  join public.phone_members m on m.thread_id = pm.thread_id
  join public.phone_numbers mine on mine.id = m.number_id
  join public.characters c on c.id = mine.character_id and c.owner_id = auth.uid() and c.status = 'approvata'
  where pm.created_at > m.last_read_at
    and pm.sender_number_id is distinct from m.number_id
    and not (m.number_id = any (pm.blocked_for));

  select pc.id, pc.thread_id, pc.status, pc.video,
         public.phone_owned(pc.callee_number_id) and not public.phone_owned(pc.caller_number_id) as incoming,
         case when public.phone_owned(pc.caller_number_id) then pc.caller_number_id else pc.callee_number_id end as my_number,
         o.display_name as other_name, o.digits as other_digits
  into k
  from public.phone_calls pc
  join public.phone_numbers o on o.id = case when public.phone_owned(pc.caller_number_id) then pc.callee_number_id else pc.caller_number_id end
  where pc.status in ('squilla', 'attiva')
    and (public.phone_owned(pc.caller_number_id) or (public.phone_owned(pc.callee_number_id) and not pc.blocked))
  order by pc.created_at desc
  limit 1;

  return jsonb_build_object(
    'unread', v_unread,
    'call', case when k.id is null then null else jsonb_build_object(
      'id', k.id, 'thread_id', k.thread_id, 'status', k.status, 'video', k.video, 'incoming', k.incoming,
      'my_number', k.my_number, 'other_name', k.other_name, 'other_digits', k.other_digits) end
  );
end;
$$;

revoke execute on function public.phone_create_number(uuid), public.phone_update_profile(uuid, text, text, text),
  public.phone_directory(text[]), public.phone_open_chat(uuid, text), public.phone_create_group(uuid, text, text[]),
  public.phone_group_add(uuid, uuid, text), public.phone_group_leave(uuid, uuid), public.phone_group_update(uuid, uuid, text, text),
  public.phone_send(uuid, uuid, text, text), public.phone_mark_read(uuid, uuid), public.phone_call(uuid, uuid, boolean),
  public.phone_answer(uuid, boolean), public.phone_hangup(uuid), public.phone_state() from public, anon;
grant execute on function public.phone_create_number(uuid), public.phone_update_profile(uuid, text, text, text),
  public.phone_directory(text[]), public.phone_open_chat(uuid, text), public.phone_create_group(uuid, text, text[]),
  public.phone_group_add(uuid, uuid, text), public.phone_group_leave(uuid, uuid), public.phone_group_update(uuid, uuid, text, text),
  public.phone_send(uuid, uuid, text, text), public.phone_mark_read(uuid, uuid), public.phone_call(uuid, uuid, boolean),
  public.phone_answer(uuid, boolean), public.phone_hangup(uuid), public.phone_state() to authenticated;

-- ---------------------------------------------------------------------
-- 10. FOTO DEL PROFILO (archivio "telefono": ognuno nella sua cartella)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('telefono', 'telefono', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

create policy "Telefono: foto visibili" on storage.objects for select to authenticated
  using (bucket_id = 'telefono');
create policy "Telefono: foto nella propria cartella" on storage.objects for insert to authenticated
  with check (bucket_id = 'telefono' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Telefono: foto sostituite nella propria cartella" on storage.objects for update to authenticated
  using (bucket_id = 'telefono' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'telefono' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Telefono: foto eliminate dalla propria cartella" on storage.objects for delete to authenticated
  using (bucket_id = 'telefono' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------
-- 11. LAVORO AUTOMATICO: chiamate scadute ogni minuto
-- ---------------------------------------------------------------------
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('telefono-chiamate-scadute', '* * * * *', 'select public.phone_expire_calls()');
exception when others then
  raise notice 'pg_cron non disponibile: %', sqlerrm;
end $$;

-- =====================================================================
-- TELEFONO: ELIMINA MESSAGGIO, SVUOTA CHAT, ELIMINA CHAT, ELENCO LEGGERO
-- - Elimina messaggio: solo i propri. Resta "Messaggio eliminato"; il testo
--   originale lo legge solo lo staff con messaggi.log (Gestione → Log).
-- - Svuota chat: solo per chi la svuota; i messaggi precedenti spariscono
--   per lui (cleared_at sul partecipante).
-- - Elimina chat: si esce e non si può più rientrare (phone_left).
--   In una chat a due l'altro non può più scriverci: ne apre una nuova.
-- - phone_inbox(): ultimo messaggio e non letti per l'elenco delle chat,
--   senza scaricare tutti i messaggi.
-- =====================================================================

alter table public.phone_messages add column if not exists deleted_at timestamptz;
alter table public.phone_members add column if not exists cleared_at timestamptz;

-- Chi ha eliminato una chat (non può rientrarci)
create table if not exists public.phone_left (
  thread_id uuid not null references public.phone_threads (id) on delete cascade,
  number_id uuid not null references public.phone_numbers (id) on delete cascade,
  left_at timestamptz not null default now(),
  primary key (thread_id, number_id)
);
create index if not exists phone_left_number_idx on public.phone_left (number_id);
alter table public.phone_left enable row level security;
revoke all on public.phone_left from anon, authenticated;
grant select on public.phone_left to authenticated;
create policy "Chat eliminate: le proprie" on public.phone_left for select to authenticated
  using ((select public.phone_owned(number_id)) or (select public.has_permission('messaggi.log')));
create policy "Chat eliminate: scritte dalle funzioni" on public.phone_left for insert to authenticated with check (false);
create policy "Chat eliminate: non si modificano" on public.phone_left for update to authenticated using (false);
create policy "Chat eliminate: non si cancellano" on public.phone_left for delete to authenticated using (false);

-- Testo originale dei messaggi eliminati: solo per lo staff con messaggi.log
create table if not exists public.phone_deleted_bodies (
  message_id bigint primary key references public.phone_messages (id) on delete cascade,
  body text not null,
  deleted_at timestamptz not null default now()
);
alter table public.phone_deleted_bodies enable row level security;
revoke all on public.phone_deleted_bodies from anon, authenticated;
grant select on public.phone_deleted_bodies to authenticated;
create policy "Messaggi eliminati: solo lo staff dei log" on public.phone_deleted_bodies for select to authenticated
  using ((select public.has_permission('messaggi.log')));
create policy "Messaggi eliminati: scritti dalle funzioni" on public.phone_deleted_bodies for insert to authenticated with check (false);
create policy "Messaggi eliminati: non si modificano" on public.phone_deleted_bodies for update to authenticated using (false);
create policy "Messaggi eliminati: non si cancellano" on public.phone_deleted_bodies for delete to authenticated using (false);

-- Da quando vedo i messaggi di una chat (dopo l'ultima "svuotatura")
create or replace function public.phone_visible_after(p_thread uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(max(m.cleared_at), '-infinity'::timestamptz)
  from public.phone_members m
  join public.phone_numbers n on n.id = m.number_id
  join public.characters c on c.id = n.character_id
  where m.thread_id = p_thread and c.owner_id = auth.uid()
$$;
revoke execute on function public.phone_visible_after(uuid) from public, anon;
grant execute on function public.phone_visible_after(uuid) to authenticated;

alter policy "Messaggi del telefono: delle proprie conversazioni" on public.phone_messages
  using (
    (
      (select public.phone_is_member(thread_id))
      and not (blocked_for && (select public.phone_my_numbers()))
      and created_at > public.phone_visible_after(thread_id)
    )
    or (select public.has_permission('messaggi.log'))
  );

-- Elimina un proprio messaggio
create or replace function public.phone_delete_message(p_message bigint, p_from uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.phone_messages;
begin
  if not public.phone_owned(p_from) then
    raise exception 'Questo numero non è tuo.' using errcode = '42501';
  end if;
  select * into v from public.phone_messages where id = p_message for update;
  if v.id is null then raise exception 'Messaggio non trovato.' using errcode = 'P0001'; end if;
  if v.sender_number_id is distinct from p_from or v.mode = 'evento' then
    raise exception 'Puoi eliminare solo i tuoi messaggi.' using errcode = '42501';
  end if;
  if v.deleted_at is not null then return; end if;
  insert into public.phone_deleted_bodies (message_id, body) values (v.id, v.body) on conflict do nothing;
  update public.phone_messages set body = 'Messaggio eliminato', deleted_at = now() where id = v.id;
end;
$$;

-- Svuota la chat (solo per me)
create or replace function public.phone_clear_chat(p_thread uuid, p_from uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.phone_owned(p_from) or not exists (select 1 from public.phone_members where thread_id = p_thread and number_id = p_from) then
    raise exception 'Non fai parte di questa conversazione.' using errcode = '42501';
  end if;
  update public.phone_members set cleared_at = now(), last_read_at = now() where thread_id = p_thread and number_id = p_from;
end;
$$;

-- Elimina la chat: si esce e non si rientra più
create or replace function public.phone_delete_chat(p_thread uuid, p_from uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_group boolean;
begin
  if not public.phone_owned(p_from) or not exists (select 1 from public.phone_members where thread_id = p_thread and number_id = p_from) then
    raise exception 'Non fai parte di questa conversazione.' using errcode = '42501';
  end if;
  select is_group into v_group from public.phone_threads where id = p_thread;
  select display_name into v_name from public.phone_numbers where id = p_from;
  insert into public.phone_left (thread_id, number_id) values (p_thread, p_from) on conflict do nothing;
  delete from public.phone_members where thread_id = p_thread and number_id = p_from;
  -- chiamate aperte in questa chat: si chiudono
  update public.phone_calls set status = 'terminata', ended_at = now()
  where thread_id = p_thread and status in ('squilla', 'attiva') and p_from in (caller_number_id, callee_number_id);
  insert into public.phone_messages (thread_id, sender_number_id, mode, body)
  values (p_thread, null, 'evento', v_name || case when v_group then ' ha eliminato la chat e ha lasciato il gruppo' else ' ha eliminato la chat' end);
end;
$$;

-- Aggiungere a un gruppo: chi l'ha eliminato non rientra
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
  if exists (select 1 from public.phone_left where thread_id = p_thread and number_id = v_id) then
    raise exception 'Questo numero ha eliminato la chat: non può rientrare nel gruppo.' using errcode = 'P0001';
  end if;
  insert into public.phone_members (thread_id, number_id) values (p_thread, v_id) on conflict do nothing;
  insert into public.phone_messages (thread_id, sender_number_id, mode, body)
  values (p_thread, null, 'evento', v_name || ' è stato aggiunto al gruppo');
end;
$$;

-- Scrivere: in una chat a due eliminata dall'altro non si scrive più
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
  if exists (select 1 from public.phone_threads where id = p_thread and not is_group)
     and exists (select 1 from public.phone_left where thread_id = p_thread) then
    raise exception 'L''altra persona ha eliminato questa chat: scrivile di nuovo dal suo numero per aprirne una nuova.' using errcode = 'P0001';
  end if;
  if char_length(v_body) not between 1 and 4000 then
    raise exception 'Il messaggio va da 1 a 4000 caratteri.' using errcode = 'P0001';
  end if;
  if v_mode not in ('testo', 'vocale') then v_mode := 'testo'; end if;
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

-- Aprire una chat a due: si salta quella eliminata da uno dei due (se ne apre una nuova)
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
  select t.id into v_thread from public.phone_threads t
  where not t.is_group
    and exists (select 1 from public.phone_members where thread_id = t.id and number_id = p_from)
    and exists (select 1 from public.phone_members where thread_id = t.id and number_id = v_to)
    and not exists (select 1 from public.phone_left where thread_id = t.id)
  limit 1;
  if v_thread is null then
    insert into public.phone_threads (is_group, created_by) values (false, p_from) returning id into v_thread;
    insert into public.phone_members (thread_id, number_id) values (v_thread, p_from), (v_thread, v_to);
  end if;
  return v_thread;
end;
$$;

-- Elenco delle chat: ultimo messaggio visibile e non letti, chat per chat
create or replace function public.phone_inbox(p_from uuid)
returns table (
  thread_id uuid,
  last_id bigint,
  last_sender uuid,
  last_mode text,
  last_body text,
  last_at timestamptz,
  last_deleted boolean,
  unread int,
  cleared_at timestamptz,
  closed boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.thread_id, l.id, l.sender_number_id, l.mode, l.body, l.created_at, l.deleted_at is not null,
    (select count(*)::int from public.phone_messages x
      where x.thread_id = m.thread_id
        and x.created_at > greatest(m.last_read_at, coalesce(m.cleared_at, '-infinity'::timestamptz))
        and x.sender_number_id is distinct from p_from
        and not (p_from = any (x.blocked_for))),
    m.cleared_at,
    (not t.is_group and exists (select 1 from public.phone_left pl where pl.thread_id = m.thread_id))
  from public.phone_members m
  join public.phone_threads t on t.id = m.thread_id
  left join lateral (
    select pm.id, pm.sender_number_id, pm.mode, pm.body, pm.created_at, pm.deleted_at
    from public.phone_messages pm
    where pm.thread_id = m.thread_id
      and pm.created_at > coalesce(m.cleared_at, '-infinity'::timestamptz)
      and not (p_from = any (pm.blocked_for))
    order by pm.created_at desc, pm.id desc
    limit 1
  ) l on true
  where m.number_id = p_from and public.phone_owned(p_from)
$$;

revoke execute on function public.phone_delete_message(bigint, uuid), public.phone_clear_chat(uuid, uuid), public.phone_delete_chat(uuid, uuid),
  public.phone_group_add(uuid, uuid, text), public.phone_send(uuid, uuid, text, text), public.phone_open_chat(uuid, text), public.phone_inbox(uuid) from public, anon;
grant execute on function public.phone_delete_message(bigint, uuid), public.phone_clear_chat(uuid, uuid), public.phone_delete_chat(uuid, uuid),
  public.phone_group_add(uuid, uuid, text), public.phone_send(uuid, uuid, text, text), public.phone_open_chat(uuid, text), public.phone_inbox(uuid) to authenticated;

-- =====================================================================
-- 05 · MESSAGGI PRIVATI
-- Messaggi tra personaggi. Li possono leggere SOLO mittente e destinatario
-- (nemmeno lo staff). Il destinatario può solo segnarli come letti.
-- =====================================================================

create table public.private_messages (
  id bigint generated always as identity primary key,
  sender_id uuid not null references public.characters (id) on delete cascade,
  recipient_id uuid not null references public.characters (id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint private_messages_not_to_self check (sender_id <> recipient_id)
);

create index private_messages_sender_idx on public.private_messages (sender_id, created_at desc);
create index private_messages_recipient_idx on public.private_messages (recipient_id, created_at desc);

alter table public.private_messages enable row level security;

revoke all on public.private_messages from anon, authenticated;
grant select, insert on public.private_messages to authenticated;
-- Solo la data di lettura è modificabile
grant update (read_at) on public.private_messages to authenticated;

create policy "Messaggi privati: lettura solo di mittente e destinatario"
  on public.private_messages for select
  to authenticated
  using (public.owns_character(sender_id) or public.owns_character(recipient_id));

create policy "Messaggi privati: invio dal proprio personaggio"
  on public.private_messages for insert
  to authenticated
  with check (public.owns_character(sender_id) and read_at is null);

create policy "Messaggi privati: il destinatario li segna come letti"
  on public.private_messages for update
  to authenticated
  using (public.owns_character(recipient_id))
  with check (public.owns_character(recipient_id));

-- Nessuna policy di delete: i messaggi privati non si cancellano.

-- Tempo reale (Realtime rispetta le policy: ognuno riceve solo i propri)
alter publication supabase_realtime add table public.private_messages;

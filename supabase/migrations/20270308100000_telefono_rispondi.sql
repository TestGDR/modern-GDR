-- =====================================================================
-- TELEFONO: RISPONDI A UN MESSAGGIO (citazione, come su WhatsApp)
-- phone_messages.reply_to_id: il messaggio citato, della stessa chat.
-- phone_send riceve p_reply (facoltativo). Se il messaggio citato viene
-- eliminato, la citazione mostra «Messaggio eliminato» (il testo vero
-- resta solo in phone_deleted_bodies, per lo staff).
-- =====================================================================
alter table public.phone_messages add column if not exists reply_to_id bigint references public.phone_messages (id) on delete set null;
create index if not exists phone_messages_reply_idx on public.phone_messages (reply_to_id);

drop function if exists public.phone_send(uuid, uuid, text, text);
create or replace function public.phone_send(p_thread uuid, p_from uuid, p_body text, p_mode text, p_reply bigint default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_body text := btrim(coalesce(p_body, ''));
  v_mode text := coalesce(p_mode, 'testo');
  v_call public.phone_calls;
  v_reply bigint;
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
  -- si cita solo un messaggio della stessa chat (non gli avvisi di chiamata)
  if p_reply is not null then
    select id into v_reply from public.phone_messages where id = p_reply and thread_id = p_thread and mode <> 'evento';
  end if;
  select * into v_call from public.phone_calls
  where thread_id = p_thread and status = 'attiva' and p_from in (caller_number_id, callee_number_id)
  order by created_at desc limit 1;
  if v_call.id is not null then
    v_mode := case when v_call.video then 'videochiamata' else 'chiamata' end;
  end if;
  insert into public.phone_messages (thread_id, sender_number_id, mode, body, reply_to_id) values (p_thread, p_from, v_mode, v_body, v_reply);
  update public.phone_threads set last_message_at = now() where id = p_thread;
  update public.phone_members set last_read_at = now() where thread_id = p_thread and number_id = p_from;
end;
$$;
revoke execute on function public.phone_send(uuid, uuid, text, text, bigint) from public, anon;
grant execute on function public.phone_send(uuid, uuid, text, text, bigint) to authenticated;

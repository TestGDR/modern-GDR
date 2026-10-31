-- Chat: i giocatori non eliminano più i propri messaggi (li correggono una volta
-- entro 5 minuti). Eliminano solo amministratori e moderatori (permesso chat.moderare).
create or replace function public.delete_chat_message(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_permission('chat.moderare') then
    raise exception 'Solo amministratori e moderatori possono eliminare i messaggi della chat.' using errcode = '42501';
  end if;
  delete from public.messages where id = p_id;
end;
$$;

revoke execute on function public.delete_chat_message(bigint) from public, anon;
grant execute on function public.delete_chat_message(bigint) to authenticated;

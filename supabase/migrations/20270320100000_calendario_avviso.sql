-- =====================================================================
-- CALENDARIO: AVVISO DI SISTEMA PER OGNI EVENTO NUOVO
-- Quando lo staff aggiunge un evento al Calendario, tutti gli iscritti
-- (tranne chi l'ha creato) ricevono un messaggio di SISTEMA con titolo,
-- giorno e ora (ora italiana) e luogo. Le gare sportive hanno già i loro
-- avvisi e non passano da qui.
-- =====================================================================

create or replace function public.calendar_events_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_when text;
  v_place text;
  v_body text;
begin
  v_when := to_char(new.starts_at at time zone 'Europe/Rome', 'DD/MM/YYYY "alle" HH24:MI');
  v_place := coalesce(nullif(btrim(new.location), ''), (select name from public.rooms where id = new.room_id));
  v_body := '📅 Nuovo evento nel Calendario: ' || new.title || ' — ' || v_when
    || coalesce(' · ' || v_place, '') || '.'
    || case when btrim(new.description) <> '' then ' ' || left(btrim(new.description), 300) else '' end
    || ' Lo trovi nel Calendario.';
  insert into public.system_messages (user_id, body)
  select p.id, left(v_body, 8000)
  from public.profiles p
  where p.id is distinct from new.created_by;
  return null;
end;
$$;
revoke execute on function public.calendar_events_notify() from public, anon, authenticated;

drop trigger if exists calendar_events_notify on public.calendar_events;
create trigger calendar_events_notify after insert on public.calendar_events
  for each row execute function public.calendar_events_notify();

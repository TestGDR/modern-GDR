-- =====================================================================
-- APPROVAZIONE DELLE SCHEDE CON TICKET (come nel Westeros, migrazione 0102)
--
-- - Quando il giocatore invia la scheda si apre da solo un ticket nella
--   sezione "Approvazione PG": lo staff lo vede tra i ticket da leggere e
--   dal ticket apre la scheda per approvarla o rifiutarla.
-- - Approvata: risposta nel ticket e ticket chiuso. Rifiutata: risposta con
--   il motivo; quando il giocatore la corregge e la rimanda si continua
--   nello stesso ticket.
-- =====================================================================

alter table public.characters
  add column review_ticket_id uuid references public.tickets (id) on delete set null;
create index characters_review_ticket_idx on public.characters (review_ticket_id);

-- Il ticket sa di quale scheda parla (pulsante "Apri la scheda")
alter table public.tickets
  add column character_id uuid references public.characters (id) on delete set null;
create index tickets_character_idx on public.tickets (character_id);

-- Sezione dei ticket automatici (non si sceglie a mano)
insert into public.ticket_sections (name, instructions, sort_order, active)
select 'Approvazione PG', 'Le richieste di approvazione delle schede arrivano qui da sole, quando il giocatore invia la scheda.', 0, false
where not exists (select 1 from public.ticket_sections where name = 'Approvazione PG');

create or replace function public.characters_review_ticket()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_section uuid;
  v_ticket uuid;
  v_staff text;
begin
  if new.status is not distinct from old.status then return new; end if;

  -- Scheda inviata (o rimandata dopo un rifiuto)
  if new.status = 'in_attesa' then
    -- si riusa il ticket solo se è davvero di questo giocatore
    select t.id into v_ticket from public.tickets t
    where t.id = new.review_ticket_id and t.opened_by = new.owner_id;
    if v_ticket is not null then
      insert into public.ticket_messages (ticket_id, author_id, author_name, from_staff, body)
      values (v_ticket, new.owner_id, new.name, false, 'Ho corretto la scheda e l''ho inviata di nuovo in approvazione.');
      update public.tickets set status = 'attesa', last_message_at = now(), last_author_name = new.name where id = v_ticket;
    else
      select id into v_section from public.ticket_sections where name = 'Approvazione PG' order by sort_order limit 1;
      insert into public.tickets (title, section_id, opened_by, opener_name, last_author_name, character_id)
      values ('Approvazione PG: ' || left(new.name, 90), v_section, new.owner_id, new.name, new.name, new.id)
      returning id into v_ticket;
      insert into public.ticket_participants (ticket_id, user_id, last_read_at) values (v_ticket, new.owner_id, now());
      insert into public.ticket_messages (ticket_id, author_id, author_name, from_staff, body)
      values (v_ticket, new.owner_id, new.name, false,
              'Ho completato la scheda di ' || new.name || ' e la invio in approvazione.' || E'\n\n'
              || 'Staff: aprite la scheda con il pulsante «Apri la scheda» qui sopra e premete Approva o Rifiuta.');
      update public.characters set review_ticket_id = v_ticket where id = new.id;
    end if;
    return new;
  end if;

  -- Approvata o rifiutata: risposta dello staff nel ticket
  if new.status in ('approvata', 'rifiutata') and new.review_ticket_id is not null then
    v_staff := coalesce(public.my_display_name(), 'Staff');
    insert into public.ticket_messages (ticket_id, author_id, author_name, from_staff, body)
    values (new.review_ticket_id, auth.uid(), v_staff, true,
            case when new.status = 'approvata'
              then 'Scheda approvata: ' || new.name || ' ora può giocare. Buon divertimento!'
              else 'Scheda rifiutata.' || coalesce(E'\n\nMotivo: ' || nullif(btrim(new.rejection_reason), ''), '')
                   || E'\n\nCorreggila da Scheda e inviala di nuovo: continueremo in questo ticket.'
            end);
    update public.tickets
    set status = case when new.status = 'approvata' then 'chiuso' else 'in_carico' end,
        last_message_at = now(), last_author_name = v_staff,
        assigned_to = coalesce(assigned_to, auth.uid()), assigned_name = coalesce(assigned_name, v_staff)
    where id = new.review_ticket_id;
  end if;
  return new;
end;
$$;
revoke execute on function public.characters_review_ticket() from public, anon, authenticated;

create trigger characters_review_ticket after update of status on public.characters
  for each row execute function public.characters_review_ticket();

-- Le schede già in attesa (inviate prima di oggi) ricevono subito il loro ticket
do $$
declare
  c record;
  v_section uuid;
  v_ticket uuid;
begin
  select id into v_section from public.ticket_sections where name = 'Approvazione PG' order by sort_order limit 1;
  for c in select * from public.characters where status = 'in_attesa' and review_ticket_id is null loop
    insert into public.tickets (title, section_id, opened_by, opener_name, last_author_name, character_id)
    values ('Approvazione PG: ' || left(c.name, 90), v_section, c.owner_id, c.name, c.name, c.id)
    returning id into v_ticket;
    insert into public.ticket_participants (ticket_id, user_id, last_read_at) values (v_ticket, c.owner_id, now());
    insert into public.ticket_messages (ticket_id, author_id, author_name, from_staff, body)
    values (v_ticket, c.owner_id, c.name, false,
            'Ho completato la scheda di ' || c.name || ' e la invio in approvazione.' || E'\n\n'
            || 'Staff: aprite la scheda con il pulsante «Apri la scheda» qui sopra e premete Approva o Rifiuta.');
    update public.characters set review_ticket_id = v_ticket where id = c.id;
  end loop;
end $$;

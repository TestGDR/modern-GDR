-- =====================================================================
-- NOTIZIE E TICKET (fase 5b del documento "Funzioni generiche")
-- Logica ripresa dal Westeros GDR (migrazioni 0038, 0043, 0046-0049,
-- 0063, 0137), adattata al College:
--
--   news                 comunicazioni dello staff (solo OFF: niente notizie ON)
--   news_seen            quando ognuno ha aperto le notizie l'ultima volta
--   ticket_sections      categorie dei ticket con istruzioni (permesso ticket.categorie)
--   tickets              richieste allo staff, stati attesa / in_carico / sospeso / chiuso
--   ticket_participants  chi partecipa (utenti), con l'ultima lettura
--   ticket_messages      messaggi del ticket, anche tiri di dado Interlock
--   ticket_staff_reads   lettura dello staff che non partecipa
--
-- Le vecchie "notizie dalla città" (city_news) passano in news.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PERMESSI: lo staff che gestisce i ticket
-- ---------------------------------------------------------------------
update public.user_levels
set permissions = array(select distinct unnest(permissions || array['ticket.gestire']))
where name in ('Master', 'Moderatore') and not ('ticket.gestire' = any (permissions));

-- ---------------------------------------------------------------------
-- 2. NOTIZIE (solo OFF)
-- ---------------------------------------------------------------------
create table public.news (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 150),
  body text not null default '' check (char_length(body) <= 20000),
  author_id uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index news_created_idx on public.news (created_at desc);
create index news_author_idx on public.news (author_id);

alter table public.news enable row level security;
revoke all on public.news from anon, authenticated;
grant select on public.news to authenticated;
grant insert (title, body), update (title, body), delete on public.news to authenticated;

create policy "Notizie: le leggono tutti i registrati" on public.news for select to authenticated using (true);
create policy "Notizie: le pubblica lo staff" on public.news for insert to authenticated
  with check ((select public.has_permission('annunci.globali')));
create policy "Notizie: le modifica lo staff" on public.news for update to authenticated
  using ((select public.has_permission('annunci.globali'))) with check ((select public.has_permission('annunci.globali')));
create policy "Notizie: le elimina lo staff" on public.news for delete to authenticated
  using ((select public.has_permission('annunci.globali')));

-- Autore e date li decide il database
create or replace function public.news_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    if auth.uid() is not null then new.author_id := auth.uid(); end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger news_before_write before insert or update on public.news
  for each row execute function public.news_before_write();

-- Le notizie della città già scritte diventano notizie dello staff
insert into public.news (title, body, author_id, created_at, updated_at)
select title, coalesce(body, ''), author_id, published_at, published_at from public.city_news;
drop table public.city_news;

create table public.news_seen (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  seen_at timestamptz not null default now()
);

alter table public.news_seen enable row level security;
revoke all on public.news_seen from anon, authenticated;
grant select, insert, update on public.news_seen to authenticated;

create policy "Notizie viste: il proprio segno" on public.news_seen for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Notizie viste: si crea il proprio segno" on public.news_seen for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Notizie viste: si aggiorna il proprio segno" on public.news_seen for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Chi c'è già ha visto le notizie pubblicate finora
insert into public.news_seen (user_id) select id from public.profiles on conflict do nothing;

-- ---------------------------------------------------------------------
-- 3. TIRO INTERLOCK condiviso da chat e ticket
-- 1d10 (+ caratteristica, + abilità, + vantaggi e svantaggi col tetto).
-- Il 10 naturale aggiunge un d10, l'1 naturale lo sottrae.
-- Senza caratteristica: il solo d10 con la stessa regola.
-- ---------------------------------------------------------------------
create or replace function public.interlock_roll(p_character uuid, p_attribute uuid, p_skill uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attr public.attributes;
  v_skill public.skills;
  v_attr_value int := 0;
  v_skill_level int := 0;
  v_cap int := coalesce(public.setting_int('tetto_modificatori'), 3);
  v_mods int := 0;
  v_die int := 1 + floor(random() * 10)::int;
  v_extra int := 0;
  v_total int;
  v_label text := 'd10';
  v_text text;
begin
  if p_skill is not null then
    select * into v_skill from public.skills where id = p_skill and active;
    if not found then raise exception 'Abilità non valida.' using errcode = 'P0001'; end if;
    p_attribute := v_skill.attribute_id;
    select coalesce((select level from public.character_skills where character_id = p_character and skill_id = p_skill), 0)
      into v_skill_level;
  end if;
  if p_attribute is not null then
    select * into v_attr from public.attributes where id = p_attribute and active;
    if not found then raise exception 'Caratteristica non valida.' using errcode = 'P0001'; end if;
    select coalesce((select value from public.character_attributes where character_id = p_character and attribute_id = p_attribute), 0)
      into v_attr_value;
    select coalesce(sum(o.roll_modifier), 0) into v_mods
    from public.character_options co
    join public.creation_options o on o.id = co.option_id
    where co.character_id = p_character
      and o.roll_modifier is not null
      and (o.roll_skill_id is null or o.roll_skill_id = p_skill);
    v_mods := greatest(-v_cap, least(v_cap, v_mods));
    v_label := coalesce(v_skill.name || ' (' || v_attr.code || ')', v_attr.name);
  end if;

  if v_die = 10 then
    v_extra := 1 + floor(random() * 10)::int;
  elsif v_die = 1 then
    v_extra := -(1 + floor(random() * 10)::int);
  end if;
  v_total := v_die + v_extra + v_attr_value + v_skill_level + v_mods;

  v_text := 'tira ' || v_label || ': d10 ' || v_die
    || case when v_extra > 0 then ' + ' || v_extra when v_extra < 0 then ' − ' || abs(v_extra) else '' end
    || case when v_attr.id is not null then ' + ' || v_attr.code || ' ' || v_attr_value else '' end
    || case when v_skill.id is not null then ' + abilità ' || v_skill_level else '' end
    || case when v_mods > 0 then ' + mod ' || v_mods when v_mods < 0 then ' − mod ' || abs(v_mods) else '' end
    || ' = ' || v_total;

  return jsonb_build_object(
    'die', v_die, 'extra', v_extra,
    'attribute', v_attr.code, 'attribute_value', case when v_attr.id is not null then v_attr_value end,
    'skill', v_skill.name, 'skill_level', case when v_skill.id is not null then v_skill_level end,
    'modifiers', v_mods, 'total', v_total, 'text', v_text);
end;
$$;
revoke execute on function public.interlock_roll(uuid, uuid, uuid) from public, anon, authenticated;

-- Il tiro in chat usa la stessa funzione
create or replace function public.roll_dice(p_room uuid, p_character uuid, p_attribute uuid, p_skill uuid default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_roll jsonb;
  v_id bigint;
begin
  if not public.owns_character(p_character) then
    raise exception 'Serve un personaggio approvato per tirare.' using errcode = '42501';
  end if;
  if not public.has_permission('dadi.tirare') then
    raise exception 'Il tuo livello non permette di tirare i dadi.' using errcode = '42501';
  end if;
  if not public.can_enter_room(p_room) then
    raise exception 'Non puoi tirare in questa chat.' using errcode = '42501';
  end if;
  if not public.i_am_invisible()
     and not exists (select 1 from public.chat_presence where room_id = p_room and character_id = p_character) then
    raise exception 'Prima entra in giocata.' using errcode = 'P0001';
  end if;
  if p_attribute is null and p_skill is null then
    raise exception 'Scegli una caratteristica o un''abilità.' using errcode = 'P0001';
  end if;
  v_roll := public.interlock_roll(p_character, p_attribute, p_skill);
  insert into public.messages (room_id, character_id, kind, content, roll_data)
  values (p_room, p_character, 'dado', v_roll ->> 'text', v_roll - 'text')
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. TICKET: sezioni
-- ---------------------------------------------------------------------
create table public.ticket_sections (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 1 and 60),
  instructions text not null default '' check (char_length(instructions) <= 4000),
  sort_order int not null default 0,
  active boolean not null default true
);

alter table public.ticket_sections enable row level security;
revoke all on public.ticket_sections from anon, authenticated;
grant select on public.ticket_sections to authenticated;
grant insert (name, instructions, sort_order, active), update (name, instructions, sort_order, active), delete
  on public.ticket_sections to authenticated;

create policy "Ticket sezioni: visibili" on public.ticket_sections for select to authenticated using (true);
create policy "Ticket sezioni: le crea chi gestisce le categorie" on public.ticket_sections for insert to authenticated
  with check ((select public.has_permission('ticket.categorie')));
create policy "Ticket sezioni: le modifica chi gestisce le categorie" on public.ticket_sections for update to authenticated
  using ((select public.has_permission('ticket.categorie'))) with check ((select public.has_permission('ticket.categorie')));
create policy "Ticket sezioni: le elimina chi gestisce le categorie" on public.ticket_sections for delete to authenticated
  using ((select public.has_permission('ticket.categorie')));

create trigger ticket_sections_log after insert or update or delete on public.ticket_sections
  for each row execute function public.log_admin_change();

insert into public.ticket_sections (name, sort_order, instructions) values
  ('Tecnico e sito', 1, $t$Qualcosa nel sito non funziona?

Descrivi cosa stavi facendo, cosa ti aspettavi e cosa è successo invece. Indica se usi computer o telefono e quale browser.$t$),
  ('Scheda e approvazione', 2, $t$Domande sulla creazione del personaggio o sull'approvazione della scheda.

Indica il nome del personaggio e cosa ti serve: un dubbio sul regolamento Interlock, una correzione, un chiarimento sul rifiuto.$t$),
  ('Regole e dubbi', 3, $t$Dubbi sul regolamento, sul sistema Interlock o sull'ambientazione.

Prima di scrivere dai un'occhiata alla Guida e all'Ambientazione: molte risposte sono già lì.$t$),
  ('Segnalazioni tra giocatori', 4, $t$Per segnalare comportamenti scorretti o violazioni del regolamento.

Indica chi è coinvolto, dove e quando è successo (chat, data e ora). Se puoi, riporta il testo dei messaggi.
Le segnalazioni restano riservate tra te e lo staff.$t$),
  ('Eventi e trame', 5, $t$Hai un'idea per una giocata, un evento al college o una trama?

Descrivi l'idea in poche righe, i personaggi coinvolti (puoi includerli nel ticket) e quando vorreste giocare.$t$),
  ('Altro', 6, $t$Per tutto ciò che non rientra nelle altre sezioni.$t$);

-- ---------------------------------------------------------------------
-- 5. TICKET: ticket, partecipanti, messaggi
-- ---------------------------------------------------------------------
create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  section_id uuid references public.ticket_sections (id) on delete set null,
  opened_by uuid references public.profiles (id) on delete set null,
  opener_name text not null,
  status text not null default 'attesa' check (status in ('attesa', 'in_carico', 'sospeso', 'chiuso')),
  assigned_to uuid references public.profiles (id) on delete set null,
  assigned_name text,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  last_author_name text not null default ''
);
create index tickets_last_idx on public.tickets (last_message_at desc);
create index tickets_section_idx on public.tickets (section_id);
create index tickets_opened_by_idx on public.tickets (opened_by);
create index tickets_assigned_idx on public.tickets (assigned_to);

create table public.ticket_participants (
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (ticket_id, user_id)
);
create index ticket_participants_user_idx on public.ticket_participants (user_id);

create table public.ticket_messages (
  id bigint generated always as identity primary key,
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  author_name text not null,
  from_staff boolean not null default false,
  body text not null check (char_length(body) between 1 and 8000),
  -- tiro Interlock (dettagli come in chat)
  roll_data jsonb,
  created_at timestamptz not null default now()
);
create index ticket_messages_ticket_idx on public.ticket_messages (ticket_id, created_at);
create index ticket_messages_author_idx on public.ticket_messages (author_id);

-- Lettura dello staff nei ticket in cui non partecipa
create table public.ticket_staff_reads (
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (ticket_id, user_id)
);
create index ticket_staff_reads_user_idx on public.ticket_staff_reads (user_id);

create or replace function public.is_ticket_participant(p_ticket uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.ticket_participants where ticket_id = p_ticket and user_id = auth.uid());
$$;

create or replace function public.can_see_ticket(p_ticket uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_ticket_participant(p_ticket) or public.has_permission('ticket.gestire');
$$;

alter table public.tickets enable row level security;
alter table public.ticket_participants enable row level security;
alter table public.ticket_messages enable row level security;
alter table public.ticket_staff_reads enable row level security;
revoke all on public.tickets, public.ticket_participants, public.ticket_messages, public.ticket_staff_reads from anon, authenticated;
grant select on public.tickets, public.ticket_participants, public.ticket_messages, public.ticket_staff_reads to authenticated;

-- Si legge solo; si scrive con le funzioni qui sotto
create policy "Ticket: li vede chi partecipa o lo staff" on public.tickets for select to authenticated
  using ((select public.can_see_ticket(id)));
create policy "Ticket: partecipanti visibili" on public.ticket_participants for select to authenticated
  using ((select public.can_see_ticket(ticket_id)));
create policy "Ticket: messaggi visibili" on public.ticket_messages for select to authenticated
  using ((select public.can_see_ticket(ticket_id)));
create policy "Ticket: la propria lettura" on public.ticket_staff_reads for select to authenticated
  using (user_id = (select auth.uid()));

-- Nome di chi scrive: il personaggio approvato, altrimenti il nome dell'account
create or replace function public.my_display_name()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select c.name from public.characters c where c.owner_id = auth.uid() and c.status = 'approvata' order by c.created_at limit 1),
    (select p.username from public.profiles p where p.id = auth.uid()),
    'Staff');
$$;

-- Avviso di SISTEMA agli altri partecipanti
create or replace function public.ticket_notify_others(p_ticket uuid, p_text text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  for v_user in
    select user_id from public.ticket_participants where ticket_id = p_ticket and user_id is distinct from auth.uid()
  loop
    perform public.send_system_message(v_user, p_text);
  end loop;
end;
$$;
revoke execute on function public.ticket_notify_others(uuid, text) from public, anon, authenticated;

-- Chi scrive ha letto
create or replace function public.ticket_mark_mine(p_ticket uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_ticket_participant(p_ticket) then
    update public.ticket_participants set last_read_at = now() where ticket_id = p_ticket and user_id = auth.uid();
  elsif public.has_permission('ticket.gestire') then
    insert into public.ticket_staff_reads (ticket_id, user_id, last_read_at) values (p_ticket, auth.uid(), now())
    on conflict (ticket_id, user_id) do update set last_read_at = now();
  end if;
end;
$$;
revoke execute on function public.ticket_mark_mine(uuid) from public, anon, authenticated;

-- Aprire un ticket (chiunque sia registrato), includendo altri giocatori
create or replace function public.open_ticket(p_title text, p_section uuid, p_body text, p_others uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_name text := public.my_display_name();
  v_title text := btrim(coalesce(p_title, ''));
begin
  if auth.uid() is null then raise exception 'Serve l''accesso.' using errcode = '42501'; end if;
  if char_length(v_title) not between 1 and 120 then raise exception 'Il titolo deve avere da 1 a 120 caratteri.' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 8000 then raise exception 'Scrivi il testo del ticket (massimo 8000 caratteri).' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.ticket_sections where id = p_section and active) then raise exception 'Scegli una sezione.' using errcode = 'P0001'; end if;

  insert into public.tickets (title, section_id, opened_by, opener_name, last_author_name)
  values (v_title, p_section, auth.uid(), v_name, v_name)
  returning id into v_id;

  -- chi apre ha letto; gli altri inclusi no
  insert into public.ticket_participants (ticket_id, user_id, last_read_at)
  select v_id, p.id, case when p.id = auth.uid() then now() else '-infinity'::timestamptz end
  from public.profiles p
  where p.id = auth.uid() or p.id = any (coalesce(p_others, '{}'))
  on conflict do nothing;

  insert into public.ticket_messages (ticket_id, author_id, author_name, from_staff, body)
  values (v_id, auth.uid(), v_name, false, btrim(p_body));

  perform public.ticket_notify_others(v_id, v_name || ' ti ha incluso nel ticket «' || v_title || '». Lo trovi tra i Ticket.');
  return v_id;
end;
$$;

-- Rispondere: i partecipanti (se il ticket non è chiuso) e lo staff; avvisa tutti gli altri
create or replace function public.reply_ticket(p_ticket uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_participant boolean := public.is_ticket_participant(p_ticket);
  v_staff boolean := public.has_permission('ticket.gestire');
  v_ticket public.tickets;
  v_name text := public.my_display_name();
begin
  select * into v_ticket from public.tickets where id = p_ticket;
  if v_ticket.id is null or not (v_participant or v_staff) then raise exception 'Ticket non trovato.' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 8000 then raise exception 'Scrivi la risposta (massimo 8000 caratteri).' using errcode = 'P0001'; end if;
  if v_ticket.status = 'chiuso' and not v_staff then raise exception 'Il ticket è chiuso.' using errcode = 'P0001'; end if;

  insert into public.ticket_messages (ticket_id, author_id, author_name, from_staff, body)
  values (p_ticket, auth.uid(), v_name, not v_participant, btrim(p_body));

  update public.tickets set
    last_message_at = now(),
    last_author_name = v_name,
    -- la prima risposta dello staff prende in carico il ticket
    status = case when not v_participant and status = 'attesa' then 'in_carico' else status end,
    assigned_to = case when not v_participant and assigned_to is null then auth.uid() else assigned_to end,
    assigned_name = case when not v_participant and assigned_to is null then v_name else assigned_name end
  where id = p_ticket;

  perform public.ticket_notify_others(p_ticket,
    case when v_participant then v_name || ' ha risposto al ticket «' else 'Lo staff ha risposto al ticket «' end
    || v_ticket.title || '». Lo trovi tra i Ticket.');
  perform public.ticket_mark_mine(p_ticket);
end;
$$;

-- Tiro di dado nel ticket: Interlock col proprio personaggio approvato, oppure il solo d10
create or replace function public.roll_ticket_dice(p_ticket uuid, p_attribute uuid, p_skill uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_participant boolean := public.is_ticket_participant(p_ticket);
  v_staff boolean := public.has_permission('ticket.gestire');
  v_ticket public.tickets;
  v_name text := public.my_display_name();
  v_character uuid;
  v_roll jsonb;
begin
  select * into v_ticket from public.tickets where id = p_ticket;
  if v_ticket.id is null or not (v_participant or v_staff) then raise exception 'Ticket non trovato.' using errcode = '42501'; end if;
  if v_ticket.status = 'chiuso' and not v_staff then raise exception 'Il ticket è chiuso.' using errcode = 'P0001'; end if;
  if p_attribute is not null or p_skill is not null then
    select id into v_character from public.characters where owner_id = auth.uid() and status = 'approvata' order by created_at limit 1;
    if v_character is null then
      raise exception 'Per tirare caratteristiche e abilità serve un personaggio approvato: tira il solo d10.' using errcode = 'P0001';
    end if;
  end if;
  v_roll := public.interlock_roll(v_character, p_attribute, p_skill);

  insert into public.ticket_messages (ticket_id, author_id, author_name, from_staff, body, roll_data)
  values (p_ticket, auth.uid(), v_name, not v_participant, v_name || ' ' || (v_roll ->> 'text'), v_roll - 'text');
  update public.tickets set last_message_at = now(), last_author_name = v_name where id = p_ticket;
  perform public.ticket_notify_others(p_ticket, v_name || ' ha tirato un dado nel ticket «' || v_ticket.title || '».');
  perform public.ticket_mark_mine(p_ticket);
end;
$$;

-- Stato (solo staff): in carico, sospeso, chiuso, riaperto
create or replace function public.set_ticket_status(p_ticket uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket public.tickets;
  v_label text;
begin
  if not public.has_permission('ticket.gestire') then raise exception 'Solo lo staff cambia lo stato dei ticket.' using errcode = '42501'; end if;
  if p_status not in ('attesa', 'in_carico', 'sospeso', 'chiuso') then raise exception 'Stato non valido.' using errcode = 'P0001'; end if;
  update public.tickets set
    status = p_status,
    assigned_to = case when p_status = 'in_carico' then auth.uid() else assigned_to end,
    assigned_name = case when p_status = 'in_carico' then public.my_display_name() else assigned_name end
  where id = p_ticket
  returning * into v_ticket;
  if v_ticket.id is null then raise exception 'Ticket non trovato.' using errcode = 'P0001'; end if;
  v_label := case p_status when 'attesa' then 'riaperto' when 'in_carico' then 'preso in carico' when 'sospeso' then 'sospeso' else 'chiuso' end;
  perform public.ticket_notify_others(p_ticket, 'Il ticket «' || v_ticket.title || '» è stato ' || v_label || ' dallo staff.');
end;
$$;

-- Eliminazione definitiva (solo staff, solo ticket in archivio: sospesi o chiusi)
create or replace function public.delete_ticket(p_ticket uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_permission('ticket.gestire') then raise exception 'Solo lo staff elimina i ticket.' using errcode = '42501'; end if;
  delete from public.tickets where id = p_ticket and status in ('sospeso', 'chiuso');
  if not found then raise exception 'Si possono eliminare solo i ticket sospesi o chiusi.' using errcode = 'P0001'; end if;
end;
$$;

-- Letto (all'apertura del ticket)
create or replace function public.mark_ticket_read(p_ticket uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select public.ticket_mark_mine(p_ticket);
$$;

-- Ticket da leggere: messaggi scritti da altri dopo la propria lettura;
-- lo staff che non partecipa vede i messaggi dei giocatori nei ticket aperti
create or replace function public.ticket_unread_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select tp.ticket_id from public.ticket_participants tp
  where tp.user_id = auth.uid()
    and exists (
      select 1 from public.ticket_messages m
      where m.ticket_id = tp.ticket_id and m.author_id is distinct from auth.uid() and m.created_at > tp.last_read_at
    )
  union
  select t.id from public.tickets t
  where public.has_permission('ticket.gestire')
    and t.status <> 'chiuso'
    and not public.is_ticket_participant(t.id)
    and exists (
      select 1 from public.ticket_messages m
      where m.ticket_id = t.id and not m.from_staff
        and m.created_at > coalesce((select r.last_read_at from public.ticket_staff_reads r where r.ticket_id = t.id and r.user_id = auth.uid()), '-infinity'::timestamptz)
    );
$$;

revoke execute on function public.open_ticket(text, uuid, text, uuid[]) from public, anon;
revoke execute on function public.reply_ticket(uuid, text) from public, anon;
revoke execute on function public.roll_ticket_dice(uuid, uuid, uuid) from public, anon;
revoke execute on function public.set_ticket_status(uuid, text) from public, anon;
revoke execute on function public.delete_ticket(uuid) from public, anon;
revoke execute on function public.mark_ticket_read(uuid) from public, anon;
revoke execute on function public.ticket_unread_ids() from public, anon;
revoke execute on function public.my_display_name() from public, anon;
grant execute on function public.open_ticket(text, uuid, text, uuid[]) to authenticated;
grant execute on function public.reply_ticket(uuid, text) to authenticated;
grant execute on function public.roll_ticket_dice(uuid, uuid, uuid) to authenticated;
grant execute on function public.set_ticket_status(uuid, text) to authenticated;
grant execute on function public.delete_ticket(uuid) to authenticated;
grant execute on function public.mark_ticket_read(uuid) to authenticated;
grant execute on function public.ticket_unread_ids() to authenticated;
grant execute on function public.my_display_name() to authenticated;

-- ---------------------------------------------------------------------
-- 6. TEMPO REALE
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.news;
alter publication supabase_realtime add table public.tickets;
alter publication supabase_realtime add table public.ticket_messages;

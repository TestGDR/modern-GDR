-- =====================================================================
-- SOCIAL: EVENTI DEI PERSONAGGI
-- - social_events: titolo, copertina, data e ora, luogo (una chat della
--   mappa o un testo libero, es. «Casa di Santiago»), visibilità
--   pubblico / follower / su invito. Li crea qualsiasi personaggio
--   approvato, solo con le funzioni social_event_*.
-- - social_event_secrets: password facoltativa della festa (feste in
--   casa): apre la chat con password della mappa (open_secret_room). La
--   leggono solo l'organizzatore e gli ospiti (social_event_password).
-- - social_event_guests: invitato / partecipo / forse / non vengo.
-- - Notifiche del social (social_notifications.event_id): invito, nuovo
--   evento di chi segui, qualcuno partecipa, promemoria il giorno stesso.
-- - Fama: finito l'evento, con abbastanza partecipanti (di altri
--   giocatori) l'organizzatore riceve una voce di fama
--   (social_eventi_soglie / social_eventi_fama, al massimo
--   social_eventi_fama_mese eventi ogni 30 giorni).
-- - Post dall'evento: social_posts.event_id (solo organizzatore e chi
--   partecipa); le foto si vedono nella pagina dell'evento.
-- - Gli eventi pubblici compaiono nel Calendario (calendar_range).
-- - pg_cron «social-eventi» ogni ora (social_events_tick).
-- =====================================================================

-- 1. IMPOSTAZIONI (Gestione → Fama → Social)
insert into public.game_settings (key, value, kind, label, description, sort_order) values
  ('social_eventi_soglie', '[5, 10]', 'numbers', 'Social · Eventi: partecipanti per la fama', 'Finito un evento, se i partecipanti (di altri giocatori) arrivano a queste soglie l''organizzatore riceve una voce di fama.', 430),
  ('social_eventi_fama', '[2, 5]', 'numbers', 'Social · Eventi: fama per soglia', 'Punti di fama dell''organizzatore per ogni soglia, nello stesso ordine (vale la più alta raggiunta).', 431),
  ('social_eventi_fama_mese', '2', 'number', 'Social · Eventi che danno fama ogni 30 giorni', 'Quanti eventi di uno stesso organizzatore possono dare fama ogni 30 giorni. 0 = nessuno.', 432)
on conflict (key) do nothing;

-- 2. TABELLE
create table if not exists public.social_events (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 3 and 100),
  description text not null default '' check (char_length(description) <= 3000),
  cover_url text check (cover_url is null or (cover_url ~ '^https://' and char_length(cover_url) <= 500)),
  starts_at timestamptz not null,
  ends_at timestamptz check (ends_at is null or ends_at > starts_at),
  room_id uuid references public.rooms (id) on delete set null,
  place text not null default '' check (char_length(place) <= 80),
  visibility text not null default 'pubblico' check (visibility in ('pubblico', 'follower', 'invito')),
  has_password boolean not null default false,
  reminded boolean not null default false,
  fame_done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists social_events_character_idx on public.social_events (character_id, starts_at desc);
create index if not exists social_events_starts_idx on public.social_events (starts_at);

create table if not exists public.social_event_secrets (
  event_id uuid primary key references public.social_events (id) on delete cascade,
  map_id uuid not null references public.maps (id) on delete cascade,
  password text not null check (char_length(password) between 4 and 64)
);

create table if not exists public.social_event_guests (
  event_id uuid not null references public.social_events (id) on delete cascade,
  character_id uuid not null references public.characters (id) on delete cascade,
  status text not null default 'invitato' check (status in ('invitato', 'partecipo', 'forse', 'non_vengo')),
  updated_at timestamptz not null default now(),
  primary key (event_id, character_id)
);
create index if not exists social_event_guests_character_idx on public.social_event_guests (character_id);

alter table public.social_posts add column if not exists event_id uuid references public.social_events (id) on delete set null;
create index if not exists social_posts_event_idx on public.social_posts (event_id);
grant update (event_id) on public.social_posts to authenticated;

alter table public.social_notifications add column if not exists event_id uuid references public.social_events (id) on delete cascade;
alter table public.social_notifications drop constraint if exists social_notifications_kind_check;
alter table public.social_notifications add constraint social_notifications_kind_check
  check (kind in ('follow', 'reaction', 'comment', 'tag', 'evento_invito', 'evento_nuovo', 'evento_partecipa', 'evento_promemoria'));

-- 3. CHI VEDE UN EVENTO
create or replace function public.can_see_social_event(p_event uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.social_events e
    where e.id = p_event and (
      e.visibility = 'pubblico'
      or public.has_permission('contenuti.moderare')
      or exists (select 1 from public.characters c where c.id = e.character_id and c.owner_id = auth.uid())
      or exists (select 1 from public.social_event_guests g join public.characters c on c.id = g.character_id
                 where g.event_id = e.id and c.owner_id = auth.uid())
      or (e.visibility = 'follower' and exists (
            select 1 from public.social_follows f join public.characters c on c.id = f.follower_id
            where f.followed_id = e.character_id and c.owner_id = auth.uid()))
    ))
$$;
revoke execute on function public.can_see_social_event(uuid) from public, anon;
grant execute on function public.can_see_social_event(uuid) to authenticated;

-- 4. RLS: si legge con le regole di visibilità, si scrive solo con le funzioni
alter table public.social_events enable row level security;
alter table public.social_event_secrets enable row level security;
alter table public.social_event_guests enable row level security;
revoke all on public.social_events, public.social_event_secrets, public.social_event_guests from anon;

drop policy if exists "Eventi social: chi può vederli" on public.social_events;
create policy "Eventi social: chi può vederli" on public.social_events for select to authenticated
  using ((select public.can_see_social_event(id)));
drop policy if exists "Eventi social: solo dalle funzioni (nuovi)" on public.social_events;
create policy "Eventi social: solo dalle funzioni (nuovi)" on public.social_events for insert to authenticated with check (false);
drop policy if exists "Eventi social: solo dalle funzioni (modifiche)" on public.social_events;
create policy "Eventi social: solo dalle funzioni (modifiche)" on public.social_events for update to authenticated using (false);
drop policy if exists "Eventi social: solo dalle funzioni (eliminazione)" on public.social_events;
create policy "Eventi social: solo dalle funzioni (eliminazione)" on public.social_events for delete to authenticated using (false);

drop policy if exists "Password eventi: mai lette direttamente" on public.social_event_secrets;
create policy "Password eventi: mai lette direttamente" on public.social_event_secrets for select to authenticated using (false);
drop policy if exists "Password eventi: solo dalle funzioni (nuove)" on public.social_event_secrets;
create policy "Password eventi: solo dalle funzioni (nuove)" on public.social_event_secrets for insert to authenticated with check (false);
drop policy if exists "Password eventi: solo dalle funzioni (modifiche)" on public.social_event_secrets;
create policy "Password eventi: solo dalle funzioni (modifiche)" on public.social_event_secrets for update to authenticated using (false);
drop policy if exists "Password eventi: solo dalle funzioni (eliminazione)" on public.social_event_secrets;
create policy "Password eventi: solo dalle funzioni (eliminazione)" on public.social_event_secrets for delete to authenticated using (false);

drop policy if exists "Ospiti eventi: chi vede l'evento" on public.social_event_guests;
create policy "Ospiti eventi: chi vede l'evento" on public.social_event_guests for select to authenticated
  using ((select public.can_see_social_event(event_id)));
drop policy if exists "Ospiti eventi: solo dalle funzioni (nuovi)" on public.social_event_guests;
create policy "Ospiti eventi: solo dalle funzioni (nuovi)" on public.social_event_guests for insert to authenticated with check (false);
drop policy if exists "Ospiti eventi: solo dalle funzioni (modifiche)" on public.social_event_guests;
create policy "Ospiti eventi: solo dalle funzioni (modifiche)" on public.social_event_guests for update to authenticated using (false);
drop policy if exists "Ospiti eventi: solo dalle funzioni (eliminazione)" on public.social_event_guests;
create policy "Ospiti eventi: solo dalle funzioni (eliminazione)" on public.social_event_guests for delete to authenticated using (false);

-- notifica di un evento (a sé stessi no)
create or replace function public.social_event_notify(p_to uuid, p_actor uuid, p_kind text, p_event uuid, p_detail text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.social_notifications (character_id, actor_id, kind, event_id, detail)
  select p_to, p_actor, p_kind, p_event, left(coalesce(p_detail, ''), 200)
  where p_to is not null and p_to <> p_actor
$$;
revoke execute on function public.social_event_notify(uuid, uuid, text, uuid, text) from public, anon, authenticated;

-- 5. CREA O MODIFICA (p_event null = nuovo); p_password '' = nessuna password
create or replace function public.social_event_save(
  p_event uuid, p_character uuid, p_title text, p_description text, p_cover text,
  p_starts timestamptz, p_ends timestamptz, p_room uuid, p_place text, p_visibility text, p_password text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.social_events;
  v_id uuid;
  v_pass text := btrim(coalesce(p_password, ''));
  v_map uuid;
  r record;
begin
  if not public.owns_character(p_character) then raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501'; end if;
  if not exists (select 1 from public.social_profiles where character_id = p_character) then
    raise exception 'Prima scegli il tuo @nome nel social.' using errcode = 'P0001';
  end if;
  if p_visibility not in ('pubblico', 'follower', 'invito') then raise exception 'Visibilità non valida.' using errcode = 'P0001'; end if;
  if p_starts is null then raise exception 'Scegli data e ora dell''evento.' using errcode = 'P0001'; end if;
  if p_starts > now() + interval '1 year' then raise exception 'L''evento è troppo lontano nel tempo.' using errcode = 'P0001'; end if;
  if p_ends is not null and p_ends <= p_starts then raise exception 'La fine deve venire dopo l''inizio.' using errcode = 'P0001'; end if;
  if p_room is not null and not exists (select 1 from public.rooms where id = p_room and access <> 'password') then
    raise exception 'Chat non valida.' using errcode = 'P0001';
  end if;
  if v_pass <> '' and char_length(v_pass) not between 4 and 64 then
    raise exception 'La password della festa va da 4 a 64 caratteri.' using errcode = 'P0001';
  end if;

  if p_event is null then
    if p_starts < now() - interval '1 hour' then raise exception 'L''evento non può iniziare nel passato.' using errcode = 'P0001'; end if;
    insert into public.social_events (character_id, title, description, cover_url, starts_at, ends_at, room_id, place, visibility, has_password)
    values (p_character, btrim(p_title), coalesce(p_description, ''), nullif(btrim(coalesce(p_cover, '')), ''), p_starts, p_ends, p_room,
            btrim(coalesce(p_place, '')), p_visibility, v_pass <> '')
    returning id into v_id;
    -- i follower sanno del nuovo evento (non quelli su invito)
    if p_visibility <> 'invito' then
      for r in select follower_id from public.social_follows where followed_id = p_character loop
        perform public.social_event_notify(r.follower_id, p_character, 'evento_nuovo', v_id, btrim(p_title));
      end loop;
    end if;
  else
    select * into e from public.social_events where id = p_event;
    if e.id is null or e.character_id <> p_character then raise exception 'Puoi modificare solo i tuoi eventi.' using errcode = '42501'; end if;
    update public.social_events
    set title = btrim(p_title), description = coalesce(p_description, ''), cover_url = nullif(btrim(coalesce(p_cover, '')), ''),
        starts_at = p_starts, ends_at = p_ends, room_id = p_room, place = btrim(coalesce(p_place, '')), visibility = p_visibility,
        has_password = v_pass <> '',
        reminded = case when p_starts is distinct from e.starts_at then false else reminded end,
        updated_at = now()
    where id = p_event;
    v_id := p_event;
  end if;

  if v_pass = '' then
    delete from public.social_event_secrets where event_id = v_id;
  else
    select id into v_map from public.maps where active order by sort_order, created_at limit 1;
    if v_map is null then raise exception 'Non c''è una mappa attiva per la chat della festa.' using errcode = 'P0001'; end if;
    insert into public.social_event_secrets (event_id, map_id, password) values (v_id, v_map, v_pass)
    on conflict (event_id) do update set password = excluded.password, map_id = excluded.map_id;
  end if;
  return v_id;
end;
$$;
revoke execute on function public.social_event_save(uuid, uuid, text, text, text, timestamptz, timestamptz, uuid, text, text, text) from public, anon;
grant execute on function public.social_event_save(uuid, uuid, text, text, text, timestamptz, timestamptz, uuid, text, text, text) to authenticated;

-- 6. ELIMINA (organizzatore o moderatore del social)
create or replace function public.social_event_delete(p_event uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select character_id from public.social_events where id = p_event);
begin
  if v_owner is null then raise exception 'Evento non trovato.' using errcode = 'P0001'; end if;
  if not (public.owns_character(v_owner) or public.has_permission('contenuti.moderare')) then
    raise exception 'Non puoi eliminare questo evento.' using errcode = '42501';
  end if;
  delete from public.social_events where id = p_event;
end;
$$;
revoke execute on function public.social_event_delete(uuid) from public, anon;
grant execute on function public.social_event_delete(uuid) to authenticated;

-- 7. INVITI (solo l'organizzatore)
create or replace function public.social_event_invite(p_event uuid, p_characters uuid[])
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.social_events;
  v_n int := 0;
  v_c uuid;
begin
  select * into e from public.social_events where id = p_event;
  if e.id is null or not public.owns_character(e.character_id) then raise exception 'Solo chi organizza può invitare.' using errcode = '42501'; end if;
  foreach v_c in array coalesce(p_characters, '{}') loop
    continue when v_c = e.character_id or not exists (select 1 from public.characters where id = v_c and status = 'approvata');
    insert into public.social_event_guests (event_id, character_id, status) values (p_event, v_c, 'invitato')
    on conflict (event_id, character_id) do nothing;
    if found then
      perform public.social_event_notify(v_c, e.character_id, 'evento_invito', p_event, e.title);
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;
revoke execute on function public.social_event_invite(uuid, uuid[]) from public, anon;
grant execute on function public.social_event_invite(uuid, uuid[]) to authenticated;

-- l'organizzatore toglie un ospite
create or replace function public.social_event_remove_guest(p_event uuid, p_character uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.owns_character((select character_id from public.social_events where id = p_event)) then
    raise exception 'Solo chi organizza può togliere un ospite.' using errcode = '42501';
  end if;
  delete from public.social_event_guests where event_id = p_event and character_id = p_character;
end;
$$;
revoke execute on function public.social_event_remove_guest(uuid, uuid) from public, anon;
grant execute on function public.social_event_remove_guest(uuid, uuid) to authenticated;

-- 8. RISPOSTA: partecipo / forse / non vengo
create or replace function public.social_event_rsvp(p_event uuid, p_character uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.social_events;
  v_old text;
begin
  if not public.owns_character(p_character) then raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501'; end if;
  if p_status not in ('partecipo', 'forse', 'non_vengo') then raise exception 'Risposta non valida.' using errcode = 'P0001'; end if;
  select * into e from public.social_events where id = p_event;
  if e.id is null or not public.can_see_social_event(p_event) then raise exception 'Evento non trovato.' using errcode = 'P0001'; end if;
  if e.character_id = p_character then raise exception 'Sei tu che organizzi.' using errcode = 'P0001'; end if;
  if coalesce(e.ends_at, e.starts_at + interval '12 hours') < now() then raise exception 'L''evento è già finito.' using errcode = 'P0001'; end if;
  select status into v_old from public.social_event_guests where event_id = p_event and character_id = p_character;
  -- agli eventi su invito risponde solo chi è stato invitato
  if e.visibility = 'invito' and v_old is null then raise exception 'Questo evento è solo su invito.' using errcode = '42501'; end if;
  insert into public.social_event_guests (event_id, character_id, status, updated_at) values (p_event, p_character, p_status, now())
  on conflict (event_id, character_id) do update set status = excluded.status, updated_at = now();
  if p_status = 'partecipo' and v_old is distinct from 'partecipo' then
    perform public.social_event_notify(e.character_id, p_character, 'evento_partecipa', p_event, e.title);
  end if;
end;
$$;
revoke execute on function public.social_event_rsvp(uuid, uuid, text) from public, anon;
grant execute on function public.social_event_rsvp(uuid, uuid, text) to authenticated;

-- 9. PASSWORD DELLA FESTA: solo organizzatore e ospiti (invitati, partecipo, forse)
create or replace function public.social_event_password(p_event uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('map_id', s.map_id, 'password', s.password)
  from public.social_event_secrets s join public.social_events e on e.id = s.event_id
  where s.event_id = p_event
    and (exists (select 1 from public.characters c where c.id = e.character_id and c.owner_id = auth.uid())
         or exists (select 1 from public.social_event_guests g join public.characters c on c.id = g.character_id
                    where g.event_id = e.id and c.owner_id = auth.uid() and g.status in ('invitato', 'partecipo', 'forse')))
$$;
revoke execute on function public.social_event_password(uuid) from public, anon;
grant execute on function public.social_event_password(uuid) to authenticated;

-- 10. POST DALL'EVENTO: solo organizzatore e chi partecipa (o forse)
create or replace function public.social_posts_event_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.event_id is null or (tg_op = 'UPDATE' and new.event_id is not distinct from old.event_id) then return new; end if;
  if not exists (select 1 from public.social_events e where e.id = new.event_id and e.character_id = new.character_id)
     and not exists (select 1 from public.social_event_guests g where g.event_id = new.event_id and g.character_id = new.character_id
                     and g.status in ('partecipo', 'forse')) then
    raise exception 'Puoi collegare il post solo agli eventi a cui partecipi.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.social_posts_event_check() from public, anon, authenticated;
drop trigger if exists social_posts_event_check on public.social_posts;
create trigger social_posts_event_check before insert or update of event_id on public.social_posts
  for each row execute function public.social_posts_event_check();

-- 11. OGNI ORA: promemoria del giorno e fama a evento finito
create or replace function public.social_events_tick()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  e record;
  g record;
  v_th numeric[] := public.uni_list('social_eventi_soglie');
  v_pts numeric[] := public.uni_list('social_eventi_fama');
  v_max int := coalesce(public.setting_int('social_eventi_fama_mese'), 2);
  v_owner uuid;
  v_n int;
  v_points int;
  v_done int := 0;
begin
  -- promemoria: il giorno dell'evento (ora italiana), a chi partecipa o forse
  for e in
    select * from public.social_events
    where not reminded and starts_at > now()
      and (starts_at at time zone 'Europe/Rome')::date = public.rome_today()
  loop
    for g in select character_id from public.social_event_guests where event_id = e.id and status in ('partecipo', 'forse') loop
      perform public.social_event_notify(g.character_id, e.character_id, 'evento_promemoria', e.id, e.title);
    end loop;
    update public.social_events set reminded = true where id = e.id;
  end loop;

  -- fama: evento finito, partecipanti di altri giocatori
  for e in
    select * from public.social_events
    where not fame_done and coalesce(ends_at, starts_at + interval '6 hours') < now()
  loop
    update public.social_events set fame_done = true where id = e.id;
    v_owner := (select owner_id from public.characters where id = e.character_id);
    select count(distinct c.owner_id) into v_n
    from public.social_event_guests gg join public.characters c on c.id = gg.character_id
    where gg.event_id = e.id and gg.status = 'partecipo' and c.status = 'approvata' and c.owner_id <> v_owner;
    v_points := 0;
    for i in 1..coalesce(array_length(v_th, 1), 0) loop
      if v_n >= v_th[i] then v_points := greatest(v_points, coalesce(v_pts[i], 0)::int); end if;
    end loop;
    continue when v_points <= 0 or v_max <= 0;
    continue when (select count(*) from public.fame_entries
                   where character_id = e.character_id and title like 'Evento: %' and created_at > now() - interval '30 days') >= v_max;
    insert into public.fame_entries (character_id, title, description, points, kind, is_public, author_id)
    values (e.character_id, left('Evento: ' || e.title, 120),
            'Ha organizzato «' || e.title || '» con ' || v_n || ' partecipanti.', v_points, 'fama', true, null);
    v_done := v_done + 1;
  end loop;
  return v_done;
end;
$$;
revoke execute on function public.social_events_tick() from public, anon, authenticated;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('social-eventi', '15 * * * *', 'select public.social_events_tick()');
exception when others then
  raise notice 'pg_cron non disponibile: %', sqlerrm;
end $$;

-- 12. CALENDARIO: anche gli eventi pubblici del social
create or replace function public.calendar_range(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(x order by x ->> 'starts_at'), '[]'::jsonb) from (
    select jsonb_build_object('id', e.id, 'source', 'evento', 'title', e.title, 'description', e.description, 'category', e.category,
      'starts_at', e.starts_at, 'ends_at', e.ends_at, 'location', e.location, 'room_id', e.room_id) as x
    from public.calendar_events e
    where e.starts_at < p_to and coalesce(e.ends_at, e.starts_at) >= p_from
    union all
    select jsonb_build_object('id', e.id, 'source', 'sport', 'title', s.icon || ' ' || s.name || coalesce(' · ' || (
        select string_agg(t.name, ' vs ' order by t.is_player_school desc, t.name) from public.sport_event_teams et
        join public.sport_teams t on t.id = et.team_id where et.event_id = e.id), ''),
      'description', e.notes, 'category', 'sport', 'starts_at', e.starts_at, 'ends_at', null,
      'location', case e.venue when 'home' then 'In casa' when 'away' then 'In trasferta' else 'Campo neutro' end,
      'room_id', e.room_id, 'status', e.status, 'phase', e.phase, 'sport_id', s.id, 'recap', case when e.status = 'published' then e.recap_text end)
    from public.sport_events e join public.sports s on s.id = e.sport_id join public.sport_seasons se on se.id = e.season_id
    where se.status <> 'planning' and e.starts_at >= p_from and e.starts_at < p_to
    union all
    select jsonb_build_object('id', e.id, 'source', 'social', 'title', e.title, 'description', e.description, 'category', 'festa',
      'starts_at', e.starts_at, 'ends_at', e.ends_at, 'location', coalesce(r.name, nullif(e.place, ''), ''), 'room_id', e.room_id,
      'organizer', public.first_name(c.name))
    from public.social_events e join public.characters c on c.id = e.character_id left join public.rooms r on r.id = e.room_id
    where e.visibility = 'pubblico' and e.starts_at < p_to and coalesce(e.ends_at, e.starts_at) >= p_from
  ) y (x)
$$;
revoke execute on function public.calendar_range(timestamptz, timestamptz) from public, anon;
grant execute on function public.calendar_range(timestamptz, timestamptz) to authenticated;

-- 13. IL RESET DELLA SCHEDA TOGLIE ANCHE GLI EVENTI
create or replace function public.characters_reset_social_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'bozza' and old.status = 'approvata' and new.creation_step = 1 then
    delete from public.social_events where character_id = new.id;
    delete from public.social_event_guests where character_id = new.id;
  end if;
  return null;
end;
$$;
revoke execute on function public.characters_reset_social_events() from public, anon, authenticated;
drop trigger if exists characters_reset_social_events on public.characters;
create trigger characters_reset_social_events after update of status on public.characters
  for each row execute function public.characters_reset_social_events();

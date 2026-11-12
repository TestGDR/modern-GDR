-- =====================================================================
-- CERCA LEGAMI
-- Annunci dei legami che un personaggio cerca (nome, descrizione, tag).
-- «Trova» (come Tinder) propone gli annunci degli altri che hanno almeno
-- un tag in comune con i propri: ✕ salta, ♥ mi interessa. Se due
-- personaggi si mettono ♥ a vicenda è un match: SISTEMA a entrambi.
-- Tag pronti in bond_tag_presets (li gestisce chi ha ricerca.moderare,
-- che toglie anche gli annunci); se ne possono scrivere di propri.
-- Il pulsante si illumina per gli annunci nuovi (bond_seen, my_counters).
-- =====================================================================

insert into public.game_settings (key, value, kind, label, description, sort_order) values
  ('legami_max', '5', 'number', 'Cerca legami · Annunci per personaggio', 'Quanti legami può cercare insieme un personaggio.', 450)
on conflict (key) do nothing;

-- 1. TAG PRONTI
create table if not exists public.bond_tag_presets (
  name text primary key check (name ~ '^[a-zà-ü0-9 ''/-]{2,30}$'),
  sort_order int not null default 0
);
alter table public.bond_tag_presets enable row level security;
revoke all on public.bond_tag_presets from anon, authenticated;
grant select, insert, update, delete on public.bond_tag_presets to authenticated;
drop policy if exists "Tag dei legami: li vedono tutti" on public.bond_tag_presets;
create policy "Tag dei legami: li vedono tutti" on public.bond_tag_presets for select to authenticated using (true);
drop policy if exists "Tag dei legami: li aggiunge lo staff" on public.bond_tag_presets;
create policy "Tag dei legami: li aggiunge lo staff" on public.bond_tag_presets for insert to authenticated with check ((select public.has_permission('ricerca.moderare')));
drop policy if exists "Tag dei legami: li modifica lo staff" on public.bond_tag_presets;
create policy "Tag dei legami: li modifica lo staff" on public.bond_tag_presets for update to authenticated
  using ((select public.has_permission('ricerca.moderare'))) with check ((select public.has_permission('ricerca.moderare')));
drop policy if exists "Tag dei legami: li toglie lo staff" on public.bond_tag_presets;
create policy "Tag dei legami: li toglie lo staff" on public.bond_tag_presets for delete to authenticated using ((select public.has_permission('ricerca.moderare')));

insert into public.bond_tag_presets (name, sort_order) values
  ('amicizia', 1), ('migliore amico', 2), ('rivalità', 3), ('nemici', 4), ('ex', 5), ('cotta', 6), ('flirt', 7), ('amore', 8),
  ('famiglia', 9), ('fratelli', 10), ('cugini', 11), ('coinquilini', 12), ('vicini', 13), ('compagni di corso', 14),
  ('compagni di squadra', 15), ('colleghi', 16), ('mentore', 17), ('allievo', 18), ('infanzia', 19), ('passato comune', 20),
  ('segreto', 21), ('debito', 22), ('complici', 23), ('gelosia', 24)
on conflict (name) do nothing;

-- 2. ANNUNCI
create table if not exists public.bond_searches (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters (id) on delete cascade,
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 3 and 80),
  description text not null default '' check (char_length(description) <= 1500),
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists bond_searches_character_idx on public.bond_searches (character_id);
create index if not exists bond_searches_owner_idx on public.bond_searches (owner_id);
create index if not exists bond_searches_tags_idx on public.bond_searches using gin (tags);

-- tag in minuscolo, senza doppioni, da 1 a 8; personaggio approvato; massimo legami_max annunci
create or replace function public.bond_searches_check()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  t text;
  v_tags text[] := '{}';
begin
  foreach t in array coalesce(new.tags, '{}') loop
    t := lower(btrim(regexp_replace(t, '\s+', ' ', 'g')));
    continue when t = '' or t = any (v_tags);
    if char_length(t) < 2 or char_length(t) > 30 then raise exception 'Ogni tag va da 2 a 30 caratteri.' using errcode = 'P0001'; end if;
    v_tags := v_tags || t;
  end loop;
  if cardinality(v_tags) = 0 then raise exception 'Scegli almeno un tag.' using errcode = 'P0001'; end if;
  if cardinality(v_tags) > 8 then raise exception 'Al massimo 8 tag per legame.' using errcode = 'P0001'; end if;
  new.tags := v_tags;
  new.title := btrim(new.title);
  new.updated_at := now();
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.characters where id = new.character_id and status = 'approvata') then
      raise exception 'Cerca legami è per i personaggi approvati.' using errcode = 'P0001';
    end if;
    if (select count(*) from public.bond_searches where character_id = new.character_id) >= coalesce(public.setting_int('legami_max'), 5) then
      raise exception 'Hai già il numero massimo di legami cercati: togline uno per aggiungerne un altro.' using errcode = 'P0001';
    end if;
  else
    new.character_id := old.character_id;
    new.owner_id := old.owner_id;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;
drop trigger if exists bond_searches_check on public.bond_searches;
create trigger bond_searches_check before insert or update on public.bond_searches
  for each row execute function public.bond_searches_check();

alter table public.bond_searches enable row level security;
revoke all on public.bond_searches from anon, authenticated;
grant select, delete on public.bond_searches to authenticated;
grant insert (character_id, title, description, tags) on public.bond_searches to authenticated;
grant update (title, description, tags) on public.bond_searches to authenticated;
drop policy if exists "Legami: li vedono tutti" on public.bond_searches;
create policy "Legami: li vedono tutti" on public.bond_searches for select to authenticated using (true);
drop policy if exists "Legami: si pubblicano col proprio personaggio" on public.bond_searches;
create policy "Legami: si pubblicano col proprio personaggio" on public.bond_searches for insert to authenticated
  with check (owner_id = (select auth.uid()) and (select public.owns_character(character_id)));
drop policy if exists "Legami: si modificano i propri" on public.bond_searches;
create policy "Legami: si modificano i propri" on public.bond_searches for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists "Legami: li toglie chi li ha scritti o lo staff" on public.bond_searches;
create policy "Legami: li toglie chi li ha scritti o lo staff" on public.bond_searches for delete to authenticated
  using (owner_id = (select auth.uid()) or (select public.has_permission('ricerca.moderare')));

-- 3. ✕ / ♥ E MATCH
create table if not exists public.bond_votes (
  character_id uuid not null references public.characters (id) on delete cascade,
  search_id uuid not null references public.bond_searches (id) on delete cascade,
  liked boolean not null,
  created_at timestamptz not null default now(),
  primary key (character_id, search_id)
);
create index if not exists bond_votes_search_idx on public.bond_votes (search_id);
alter table public.bond_votes enable row level security;
revoke all on public.bond_votes from anon, authenticated;
grant select on public.bond_votes to authenticated;
drop policy if exists "Legami voti: solo i propri" on public.bond_votes;
create policy "Legami voti: solo i propri" on public.bond_votes for select to authenticated using ((select public.owns_character(character_id)));
drop policy if exists "Legami voti: solo con la funzione" on public.bond_votes;
create policy "Legami voti: solo con la funzione" on public.bond_votes for insert to authenticated with check (false);
drop policy if exists "Legami voti: niente modifiche dirette" on public.bond_votes;
create policy "Legami voti: niente modifiche dirette" on public.bond_votes for update to authenticated using (false);
drop policy if exists "Legami voti: niente eliminazioni dirette" on public.bond_votes;
create policy "Legami voti: niente eliminazioni dirette" on public.bond_votes for delete to authenticated using (false);

-- coppia di personaggi (a < b) che si sono messi ♥ a vicenda
create table if not exists public.bond_matches (
  character_a uuid not null references public.characters (id) on delete cascade,
  character_b uuid not null references public.characters (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (character_a, character_b),
  check (character_a < character_b)
);
create index if not exists bond_matches_b_idx on public.bond_matches (character_b);
alter table public.bond_matches enable row level security;
revoke all on public.bond_matches from anon, authenticated;
grant select, delete on public.bond_matches to authenticated;
drop policy if exists "Legami match: i propri" on public.bond_matches;
create policy "Legami match: i propri" on public.bond_matches for select to authenticated
  using ((select public.owns_character(character_a)) or (select public.owns_character(character_b)));
drop policy if exists "Legami match: solo con la funzione" on public.bond_matches;
create policy "Legami match: solo con la funzione" on public.bond_matches for insert to authenticated with check (false);
drop policy if exists "Legami match: niente modifiche" on public.bond_matches;
create policy "Legami match: niente modifiche" on public.bond_matches for update to authenticated using (false);
drop policy if exists "Legami match: si toglie il proprio" on public.bond_matches;
create policy "Legami match: si toglie il proprio" on public.bond_matches for delete to authenticated
  using ((select public.owns_character(character_a)) or (select public.owns_character(character_b)));

create or replace function public.bond_vote(p_pg uuid, p_search uuid, p_like boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.bond_searches;
  v_a uuid;
  v_b uuid;
  v_me text;
  v_other text;
begin
  if not public.owns_character(p_pg) or not exists (select 1 from public.characters where id = p_pg and status = 'approvata') then
    raise exception 'Serve il tuo personaggio approvato.';
  end if;
  select * into s from public.bond_searches where id = p_search;
  if s.id is null then raise exception 'Questo legame non c''è più.'; end if;
  if s.owner_id = auth.uid() then raise exception 'È un tuo legame.'; end if;

  insert into public.bond_votes (character_id, search_id, liked) values (p_pg, p_search, p_like)
  on conflict (character_id, search_id) do update set liked = excluded.liked, created_at = now();

  -- match: l'altro ha messo ♥ a uno dei miei legami
  if p_like and exists (
    select 1 from public.bond_votes v join public.bond_searches m on m.id = v.search_id
    where v.character_id = s.character_id and v.liked and m.character_id = p_pg
  ) then
    v_a := least(p_pg, s.character_id);
    v_b := greatest(p_pg, s.character_id);
    insert into public.bond_matches (character_a, character_b) values (v_a, v_b) on conflict do nothing;
    if found then
      v_me := public.first_name((select name from public.characters where id = p_pg));
      v_other := public.first_name((select name from public.characters where id = s.character_id));
      perform public.send_system_message(auth.uid(), '💞 Cerca legami: è un match con ' || v_other || '! Vi interessano i legami l''uno dell''altro: scrivetevi in OFF (Cerca legami → Match).');
      perform public.send_system_message(s.owner_id, '💞 Cerca legami: è un match con ' || v_me || '! Vi interessano i legami l''uno dell''altro: scrivetevi in OFF (Cerca legami → Match).');
      return true;
    end if;
  end if;
  return false;
end;
$$;
revoke execute on function public.bond_vote(uuid, uuid, boolean) from public, anon;
grant execute on function public.bond_vote(uuid, uuid, boolean) to authenticated;

-- ricomincia: tornano anche quelli saltati (✕)
create or replace function public.bond_reset_skipped(p_pg uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.owns_character(p_pg) then raise exception 'Personaggio non valido.'; end if;
  delete from public.bond_votes where character_id = p_pg and not liked;
end;
$$;
revoke execute on function public.bond_reset_skipped(uuid) from public, anon;
grant execute on function public.bond_reset_skipped(uuid) to authenticated;

-- «Trova»: legami degli altri con almeno un tag in comune con i miei, non ancora votati
create or replace function public.bond_discover(p_pg uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.owns_character(p_pg) then raise exception 'Personaggio non valido.'; end if;
  return coalesce((
    select jsonb_agg(x order by x.shared_count desc, x.created_at desc)
    from (
      select s.id, s.title, s.description, s.tags, s.created_at, s.character_id, s.owner_id,
        c.name, c.avatar_url,
        (select array_agg(distinct t order by t) from unnest(s.tags) t
          where t in (select unnest(m.tags) from public.bond_searches m where m.character_id = p_pg)) as shared,
        cardinality((select array_agg(distinct t) from unnest(s.tags) t
          where t in (select unnest(m.tags) from public.bond_searches m where m.character_id = p_pg))) as shared_count,
        (select array_agg(m.title order by m.created_at) from public.bond_searches m
          where m.character_id = p_pg and m.tags && s.tags) as my_titles
      from public.bond_searches s
      join public.characters c on c.id = s.character_id and c.status = 'approvata'
      where s.owner_id <> auth.uid()
        and s.tags && (select coalesce(array_agg(t), '{}') from public.bond_searches m, unnest(m.tags) t where m.character_id = p_pg)
        and not exists (select 1 from public.bond_votes v where v.character_id = p_pg and v.search_id = s.id)
      limit 100
    ) x
  ), '[]'::jsonb);
end;
$$;
revoke execute on function public.bond_discover(uuid) from public, anon;
grant execute on function public.bond_discover(uuid) to authenticated;

-- i miei match, con il giocatore a cui scrivere in OFF
create or replace function public.bond_my_matches(p_pg uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.owns_character(p_pg) then raise exception 'Personaggio non valido.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'character_id', c.id, 'name', c.name, 'avatar_url', c.avatar_url, 'owner_id', c.owner_id, 'created_at', m.created_at,
      'titles', (select coalesce(jsonb_agg(s.title order by s.created_at), '[]'::jsonb) from public.bond_searches s where s.character_id = c.id)
    ) order by m.created_at desc)
    from public.bond_matches m
    join public.characters c on c.id = case when m.character_a = p_pg then m.character_b else m.character_a end
    where p_pg in (m.character_a, m.character_b)
  ), '[]'::jsonb);
end;
$$;
revoke execute on function public.bond_my_matches(uuid) from public, anon;
grant execute on function public.bond_my_matches(uuid) to authenticated;

-- 4. «VISTO» PER IL PULSANTE
create table if not exists public.bond_seen (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  seen_at timestamptz not null default now()
);
alter table public.bond_seen enable row level security;
drop policy if exists "Legami visti: il proprio" on public.bond_seen;
create policy "Legami visti: il proprio" on public.bond_seen for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Legami visti: si segna il proprio" on public.bond_seen;
create policy "Legami visti: si segna il proprio" on public.bond_seen for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "Legami visti: si aggiorna il proprio" on public.bond_seen;
create policy "Legami visti: si aggiorna il proprio" on public.bond_seen for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "Legami visti: si toglie il proprio" on public.bond_seen;
create policy "Legami visti: si toglie il proprio" on public.bond_seen for delete to authenticated using (user_id = (select auth.uid()));
insert into public.bond_seen (user_id) select id from public.profiles on conflict do nothing;

create or replace function public.my_counters()
returns jsonb
language sql
set search_path = ''
as $$
  select jsonb_build_object(
    'off', public.off_unread('off'),
    'phone', public.phone_state(),
    'forum_unread', (select count(*)::int from public.forum_unread()),
    'forum_highlights', coalesce((select jsonb_agg(to_jsonb(h)) from public.forum_pending_highlights() h), '[]'::jsonb),
    'social', public.social_unread(),
    'tickets', coalesce((select jsonb_agg(t.id order by t.id) from public.ticket_unread_ids() as t(id)), '[]'::jsonb),
    'news_seen_at', (select s.seen_at from public.news_seen s where s.user_id = auth.uid()),
    'news', (select count(*)::int from public.news n
             where n.created_at > coalesce((select s.seen_at from public.news_seen s where s.user_id = auth.uid()), '-infinity'::timestamptz)),
    'absences', (select count(*)::int from public.absences a
                 where a.user_id <> auth.uid()
                   and a.created_at > coalesce((select s.seen_at from public.absences_seen s where s.user_id = auth.uid()), '-infinity'::timestamptz)),
    'play_requests', (select count(*)::int from public.play_requests r
                      where r.user_id <> auth.uid() and r.ends_at > now()
                        and r.created_at > coalesce((select s.seen_at from public.play_requests_seen s where s.user_id = auth.uid()), '-infinity'::timestamptz)),
    'gossip', public.gossip_waiting(),
    'gossip_new', (select count(*)::int from public.gossip_reports g
                   where g.status = 'approvato'
                     and coalesce(g.reviewed_at, g.created_at) > coalesce((select s.seen_at from public.gossip_seen s where s.user_id = auth.uid()), now())),
    'calendar_new', (select count(*)::int from public.calendar_events e
                     where e.created_by is distinct from auth.uid()
                       and e.created_at > coalesce((select s.seen_at from public.calendar_seen s where s.user_id = auth.uid()), now())),
    'press_new', (select count(*)::int from public.press_items p
                  where p.status = 'pubblicato' and p.author_id <> auth.uid()
                    and p.published_at > coalesce((select s.seen_at from public.press_seen s where s.user_id = auth.uid()), now())),
    'press_review', case when public.press_is_editor()
                      then (select count(*)::int from public.press_items p where p.status = 'in_revisione') else 0 end,
    'bond_new', (select count(*)::int from public.bond_searches b
                 where b.owner_id <> auth.uid()
                   and b.created_at > coalesce((select s.seen_at from public.bond_seen s where s.user_id = auth.uid()), now()))
  );
$$;
revoke execute on function public.my_counters() from public, anon;
grant execute on function public.my_counters() to authenticated;

-- il reset della scheda toglie anche i legami cercati
create or replace function public.characters_reset_bonds()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'bozza' and old.status = 'approvata' and new.creation_step = 1 then
    delete from public.bond_searches where character_id = new.id;
    delete from public.bond_votes where character_id = new.id;
    delete from public.bond_matches where new.id in (character_a, character_b);
  end if;
  return null;
end;
$$;
revoke execute on function public.characters_reset_bonds() from public, anon, authenticated;
drop trigger if exists characters_reset_bonds on public.characters;
create trigger characters_reset_bonds after update of status on public.characters
  for each row execute function public.characters_reset_bonds();

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bond_searches') then
    alter publication supabase_realtime add table public.bond_searches;
  end if;
end $$;

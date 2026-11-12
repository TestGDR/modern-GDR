-- =====================================================================
-- CAMPUS WIRE: GIORNALE E PODCAST DEL COLLEGE
-- Un solo posto per articoli e puntate dei podcast (scritte, come una
-- trascrizione). Scrive chi è in un gruppo con press_access (all'inizio
-- il Club Giornalistico); i pezzi vanno «in redazione» e li pubblica chi
-- ha un ruolo con press_editor (Direttore, Caporedattore) o lo staff
-- con giornale.gestire. I lettori reagiscono e commentano; i pezzi più
-- apprezzati danno fama a chi li firma (pg_cron «giornale-fama»).
-- L'icona si illumina per le uscite nuove (press_seen, my_counters).
-- =====================================================================

-- 1. IMPOSTAZIONI
insert into public.game_settings (key, value, kind, label, description, sort_order) values
  ('giornale_fama_giorni', '7', 'number', 'Giornale · Giorni per contare le reazioni', 'Dopo quanti giorni dall''uscita si contano le reazioni di un articolo o podcast per la fama.', 440),
  ('giornale_fama_soglie', '[5, 12]', 'numbers', 'Giornale · Reazioni per la fama', 'Reazioni (di altri giocatori) che un pezzo deve ricevere per dare fama a chi lo firma.', 441),
  ('giornale_fama', '[1, 3]', 'numbers', 'Giornale · Fama per soglia', 'Punti di fama per ogni soglia, nello stesso ordine (vale la più alta raggiunta).', 442),
  ('giornale_fama_mese', '3', 'number', 'Giornale · Pezzi che danno fama ogni 30 giorni', 'Quanti pezzi di uno stesso autore possono dare fama ogni 30 giorni. 0 = nessuno.', 443)
on conflict (key) do nothing;

-- 2. CHI SCRIVE E CHI PUBBLICA
alter table public.game_groups add column if not exists press_access boolean not null default false;
alter table public.group_roles add column if not exists press_editor boolean not null default false;

update public.game_groups set press_access = true where lower(name) = lower('Club Giornalistico');
update public.group_roles r set press_editor = true
from public.game_groups g
where g.id = r.group_id and lower(g.name) = lower('Club Giornalistico') and r.name in ('Direttore', 'Caporedattore');

-- il personaggio (approvato) è in un gruppo della redazione
create or replace function public.press_writer(p_pg uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.character_groups cg
    join public.game_groups g on g.id = cg.group_id
    join public.characters c on c.id = cg.character_id
    where cg.character_id = p_pg and g.press_access and g.active and c.status = 'approvata'
  )
$$;
revoke execute on function public.press_writer(uuid) from public, anon;
grant execute on function public.press_writer(uuid) to authenticated;

-- il personaggio ha un ruolo che pubblica (Direttore, Caporedattore…)
create or replace function public.press_editor_char(p_pg uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.character_groups cg
    join public.game_groups g on g.id = cg.group_id
    join public.group_roles r on r.id = cg.role_id
    join public.characters c on c.id = cg.character_id
    where cg.character_id = p_pg and g.press_access and g.active and r.press_editor and c.status = 'approvata'
  )
$$;
revoke execute on function public.press_editor_char(uuid) from public, anon, authenticated;

-- l'utente collegato può pubblicare (redattore capo o staff)
create or replace function public.press_is_editor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    public.has_permission('giornale.gestire')
    or exists (select 1 from public.characters c where c.owner_id = auth.uid() and public.press_editor_char(c.id))
  )
$$;
revoke execute on function public.press_is_editor() from public, anon;
grant execute on function public.press_is_editor() to authenticated;

-- 3. TABELLE
create table if not exists public.press_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('articolo', 'podcast')),
  character_id uuid not null references public.characters (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 3 and 150),
  summary text not null default '' check (char_length(summary) <= 400),
  body text not null default '' check (char_length(body) <= 40000),
  section text not null default 'campus' check (section in ('campus', 'sport', 'cultura', 'politica', 'opinioni', 'pettegolezzi', 'interviste')),
  cover_url text check (cover_url is null or (cover_url ~ '^https://' and char_length(cover_url) <= 500)),
  guests text not null default '' check (char_length(guests) <= 200),
  status text not null default 'bozza' check (status in ('bozza', 'in_revisione', 'pubblicato', 'rifiutato')),
  review_note text not null default '' check (char_length(review_note) <= 500),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_by_name text,
  published_at timestamptz,
  fame_done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists press_items_published_idx on public.press_items (status, published_at desc);
create index if not exists press_items_character_idx on public.press_items (character_id);
create index if not exists press_items_author_idx on public.press_items (author_id);
create index if not exists press_items_reviewed_by_idx on public.press_items (reviewed_by);

alter table public.press_items enable row level security;
revoke all on public.press_items from anon, authenticated;
grant select on public.press_items to authenticated;
-- si scrive solo con le funzioni press_*
drop policy if exists "Giornale: pubblicati per tutti, bozze ad autore e redazione" on public.press_items;
create policy "Giornale: pubblicati per tutti, bozze ad autore e redazione" on public.press_items for select to authenticated
  using (status = 'pubblicato' or author_id = (select auth.uid()) or (select public.press_is_editor()));
drop policy if exists "Giornale: niente scritture dirette" on public.press_items;
create policy "Giornale: niente scritture dirette" on public.press_items for insert to authenticated with check (false);
drop policy if exists "Giornale: niente modifiche dirette" on public.press_items;
create policy "Giornale: niente modifiche dirette" on public.press_items for update to authenticated using (false);
drop policy if exists "Giornale: niente eliminazioni dirette" on public.press_items;
create policy "Giornale: niente eliminazioni dirette" on public.press_items for delete to authenticated using (false);

-- reazioni (una emoji per personaggio)
create table if not exists public.press_reactions (
  item_id uuid not null references public.press_items (id) on delete cascade,
  character_id uuid not null references public.characters (id) on delete cascade,
  emoji text not null check (emoji in ('❤️', '😂', '😮', '😢', '🔥', '👏')),
  created_at timestamptz not null default now(),
  primary key (item_id, character_id)
);
create index if not exists press_reactions_character_idx on public.press_reactions (character_id);
alter table public.press_reactions enable row level security;
revoke all on public.press_reactions from anon, authenticated;
grant select, delete on public.press_reactions to authenticated;
grant insert (item_id, character_id, emoji) on public.press_reactions to authenticated;
grant update (emoji) on public.press_reactions to authenticated;
drop policy if exists "Giornale reazioni: le vedono tutti" on public.press_reactions;
create policy "Giornale reazioni: le vedono tutti" on public.press_reactions for select to authenticated using (true);
drop policy if exists "Giornale reazioni: si mettono sui pubblicati" on public.press_reactions;
create policy "Giornale reazioni: si mettono sui pubblicati" on public.press_reactions for insert to authenticated
  with check ((select public.owns_character(character_id))
    and exists (select 1 from public.press_items i where i.id = item_id and i.status = 'pubblicato'));
drop policy if exists "Giornale reazioni: si cambia la propria" on public.press_reactions;
create policy "Giornale reazioni: si cambia la propria" on public.press_reactions for update to authenticated
  using ((select public.owns_character(character_id))) with check ((select public.owns_character(character_id)));
drop policy if exists "Giornale reazioni: si toglie la propria" on public.press_reactions;
create policy "Giornale reazioni: si toglie la propria" on public.press_reactions for delete to authenticated
  using ((select public.owns_character(character_id)));

-- commenti
create table if not exists public.press_comments (
  id bigint generated always as identity primary key,
  item_id uuid not null references public.press_items (id) on delete cascade,
  character_id uuid not null references public.characters (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists press_comments_item_idx on public.press_comments (item_id, created_at);
create index if not exists press_comments_character_idx on public.press_comments (character_id);
create index if not exists press_comments_author_idx on public.press_comments (author_id);
alter table public.press_comments enable row level security;
revoke all on public.press_comments from anon, authenticated;
grant select, delete on public.press_comments to authenticated;
grant insert (item_id, character_id, body) on public.press_comments to authenticated;
drop policy if exists "Giornale commenti: li vedono tutti" on public.press_comments;
create policy "Giornale commenti: li vedono tutti" on public.press_comments for select to authenticated using (true);
drop policy if exists "Giornale commenti: sui pubblicati, col proprio personaggio" on public.press_comments;
create policy "Giornale commenti: sui pubblicati, col proprio personaggio" on public.press_comments for insert to authenticated
  with check (author_id = (select auth.uid()) and (select public.owns_character(character_id))
    and exists (select 1 from public.press_items i where i.id = item_id and i.status = 'pubblicato'));
drop policy if exists "Giornale commenti: li toglie l'autore o la redazione" on public.press_comments;
create policy "Giornale commenti: li toglie l'autore o la redazione" on public.press_comments for delete to authenticated
  using (author_id = (select auth.uid()) or (select public.press_is_editor()));

-- ultima apertura del giornale (per l'icona che si illumina)
create table if not exists public.press_seen (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  seen_at timestamptz not null default now()
);
alter table public.press_seen enable row level security;
drop policy if exists "Giornale visto: il proprio" on public.press_seen;
create policy "Giornale visto: il proprio" on public.press_seen for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Giornale visto: si segna il proprio" on public.press_seen;
create policy "Giornale visto: si segna il proprio" on public.press_seen for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "Giornale visto: si aggiorna il proprio" on public.press_seen;
create policy "Giornale visto: si aggiorna il proprio" on public.press_seen for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "Giornale visto: si toglie il proprio" on public.press_seen;
create policy "Giornale visto: si toglie il proprio" on public.press_seen for delete to authenticated using (user_id = (select auth.uid()));
insert into public.press_seen (user_id) select id from public.profiles on conflict do nothing;

-- 4. SCRIVERE, INVIARE, PUBBLICARE
-- avvisa chi pubblica (redattori capo; se non ce ne sono, lo staff)
create or replace function public.press_notify_editors(p_item uuid, p_text text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  u uuid;
  v_n int := 0;
  v_author uuid := (select author_id from public.press_items where id = p_item);
begin
  for u in
    select distinct c.owner_id from public.characters c
    where c.owner_id is distinct from v_author and public.press_editor_char(c.id)
  loop
    perform public.send_system_message(u, p_text);
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then
    perform public.staff_notify('giornale:' || p_item || ':' || extract(epoch from now())::bigint, 'giornale.gestire', p_text);
  end if;
end;
$$;
revoke execute on function public.press_notify_editors(uuid, text) from public, anon, authenticated;

create or replace function public.press_save(
  p_id uuid, p_pg uuid, p_kind text, p_title text, p_summary text, p_body text,
  p_section text, p_cover text, p_guests text, p_submit boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  it public.press_items;
  v_editor boolean := public.press_is_editor();
  v_cover text := nullif(btrim(coalesce(p_cover, '')), '');
  v_id uuid;
  v_status text;
begin
  if p_id is null then
    if not public.owns_character(p_pg) then raise exception 'Personaggio non valido.'; end if;
    if not public.press_writer(p_pg) then
      raise exception 'Scrive sul giornale solo chi fa parte della redazione (Club Giornalistico).';
    end if;
  else
    select * into it from public.press_items where id = p_id for update;
    if it.id is null then raise exception 'Pezzo non trovato.'; end if;
    if it.author_id <> auth.uid() and not v_editor then raise exception 'Puoi modificare solo i tuoi pezzi.'; end if;
    if it.status = 'pubblicato' and not v_editor then
      raise exception 'Il pezzo è già uscito: per correggerlo chiedi al Direttore o al Caporedattore.';
    end if;
  end if;
  if v_cover is not null and v_cover !~ '^https://' then raise exception 'L''immagine dev''essere un link https://'; end if;

  if p_id is null then
    insert into public.press_items (kind, character_id, title, summary, body, section, cover_url, guests, status)
    values (p_kind, p_pg, btrim(p_title), btrim(coalesce(p_summary, '')), coalesce(p_body, ''), coalesce(p_section, 'campus'),
            v_cover, btrim(coalesce(p_guests, '')), case when p_submit then 'in_revisione' else 'bozza' end)
    returning id, status into v_id, v_status;
  else
    v_status := case when p_submit and it.status in ('bozza', 'rifiutato') then 'in_revisione' else it.status end;
    update public.press_items set kind = p_kind, title = btrim(p_title), summary = btrim(coalesce(p_summary, '')),
      body = coalesce(p_body, ''), section = coalesce(p_section, 'campus'), cover_url = v_cover,
      guests = btrim(coalesce(p_guests, '')), status = v_status, updated_at = now()
    where id = p_id;
    v_id := p_id;
  end if;

  if p_submit and v_status = 'in_revisione' and (p_id is null or it.status <> 'in_revisione') then
    perform public.press_notify_editors(v_id,
      '📰 Campus Wire: «' || btrim(p_title) || '» di ' || public.first_name((select name from public.characters c join public.press_items i on i.character_id = c.id where i.id = v_id))
      || ' aspetta di essere pubblicato. Lo trovi nel Giornale → Redazione.');
  end if;
  return v_id;
end;
$$;
revoke execute on function public.press_save(uuid, uuid, text, text, text, text, text, text, text, boolean) from public, anon;
grant execute on function public.press_save(uuid, uuid, text, text, text, text, text, text, text, boolean) to authenticated;

create or replace function public.press_review(p_id uuid, p_approve boolean, p_note text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  it public.press_items;
  v_me text := (select coalesce(public.first_name(c.name), p.username) from public.profiles p
                left join public.characters c on c.owner_id = p.id where p.id = auth.uid() limit 1);
begin
  if not public.press_is_editor() then raise exception 'Pubblicano solo Direttore, Caporedattore e lo staff.'; end if;
  select * into it from public.press_items where id = p_id for update;
  if it.id is null then raise exception 'Pezzo non trovato.'; end if;
  if it.status = 'pubblicato' and p_approve then return; end if;
  if p_approve then
    update public.press_items set status = 'pubblicato', published_at = now(), review_note = '',
      reviewed_by = auth.uid(), reviewed_by_name = v_me, updated_at = now()
    where id = p_id;
    if it.author_id <> auth.uid() then
      perform public.send_system_message(it.author_id, '📰 Campus Wire: «' || it.title || '» è uscito! Pubblicato da ' || coalesce(v_me, 'la redazione') || '.');
    end if;
  else
    update public.press_items set status = 'rifiutato', review_note = left(btrim(coalesce(p_note, '')), 500),
      reviewed_by = auth.uid(), reviewed_by_name = v_me, updated_at = now()
    where id = p_id;
    if it.author_id <> auth.uid() then
      perform public.send_system_message(it.author_id, '📰 Campus Wire: «' || it.title || '» è tornato indietro'
        || case when btrim(coalesce(p_note, '')) <> '' then ': ' || left(btrim(p_note), 300) else '.' end
        || ' Lo trovi nel Giornale → Redazione, da correggere e rimandare.');
    end if;
  end if;
end;
$$;
revoke execute on function public.press_review(uuid, boolean, text) from public, anon;
grant execute on function public.press_review(uuid, boolean, text) to authenticated;

-- elimina: l'autore finché non è uscito, la redazione sempre
create or replace function public.press_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  it public.press_items;
begin
  select * into it from public.press_items where id = p_id;
  if it.id is null then return; end if;
  if not public.press_is_editor() and not (it.author_id = auth.uid() and it.status <> 'pubblicato') then
    raise exception 'Un pezzo già uscito lo ritira solo la redazione.';
  end if;
  delete from public.press_items where id = p_id;
end;
$$;
revoke execute on function public.press_delete(uuid) from public, anon;
grant execute on function public.press_delete(uuid) to authenticated;

-- chi sono io per il giornale
create or replace function public.press_me()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'editor', public.press_is_editor(),
    'writers', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name))
                         from public.characters c where c.owner_id = auth.uid() and public.press_writer(c.id)), '[]'::jsonb)
  )
$$;
revoke execute on function public.press_me() from public, anon;
grant execute on function public.press_me() to authenticated;

-- 5. GESTIONE (giornale.gestire): gruppi che scrivono, ruoli che pubblicano
create or replace function public.press_staff_groups()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_permission('giornale.gestire') then raise exception 'Permesso mancante.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', g.id, 'name', g.name, 'press_access', g.press_access,
      'roles', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'press_editor', r.press_editor) order by r.sort_order, r.name)
                         from public.group_roles r where r.group_id = g.id), '[]'::jsonb)
    ) order by g.press_access desc, g.name)
    from public.game_groups g
    where g.active and coalesce(g.kind, '') <> 'sport'
  ), '[]'::jsonb);
end;
$$;
revoke execute on function public.press_staff_groups() from public, anon;
grant execute on function public.press_staff_groups() to authenticated;

create or replace function public.press_set_group(p_group uuid, p_access boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_permission('giornale.gestire') then raise exception 'Permesso mancante.'; end if;
  update public.game_groups set press_access = p_access where id = p_group;
end;
$$;
revoke execute on function public.press_set_group(uuid, boolean) from public, anon;
grant execute on function public.press_set_group(uuid, boolean) to authenticated;

create or replace function public.press_set_role(p_role uuid, p_editor boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_permission('giornale.gestire') then raise exception 'Permesso mancante.'; end if;
  update public.group_roles set press_editor = p_editor where id = p_role;
end;
$$;
revoke execute on function public.press_set_role(uuid, boolean) from public, anon;
grant execute on function public.press_set_role(uuid, boolean) to authenticated;

-- 6. FAMA: dopo giornale_fama_giorni si contano le reazioni di altri giocatori
create or replace function public.press_fame_tick()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  it record;
  v_days int := coalesce(public.setting_int('giornale_fama_giorni'), 7);
  v_th numeric[] := public.uni_list('giornale_fama_soglie');
  v_pts numeric[] := public.uni_list('giornale_fama');
  v_max int := coalesce(public.setting_int('giornale_fama_mese'), 3);
  v_n int;
  v_points int;
  v_done int := 0;
begin
  for it in
    select * from public.press_items
    where status = 'pubblicato' and not fame_done and published_at < now() - make_interval(days => v_days)
  loop
    update public.press_items set fame_done = true where id = it.id;
    select count(distinct c.owner_id) into v_n
    from public.press_reactions r join public.characters c on c.id = r.character_id
    where r.item_id = it.id and c.owner_id <> it.author_id;
    v_points := 0;
    for i in 1..coalesce(array_length(v_th, 1), 0) loop
      if v_n >= v_th[i] then v_points := greatest(v_points, coalesce(v_pts[i], 0)::int); end if;
    end loop;
    continue when v_points <= 0 or v_max <= 0;
    continue when (select count(*) from public.fame_entries
                   where character_id = it.character_id and title like 'Campus Wire: %' and created_at > now() - interval '30 days') >= v_max;
    insert into public.fame_entries (character_id, title, description, points, kind, is_public, author_id)
    values (it.character_id, left('Campus Wire: ' || it.title, 120),
            case when it.kind = 'podcast' then 'La sua puntata' else 'Il suo articolo' end || ' «' || it.title || '» ha avuto ' || v_n || ' reazioni.',
            v_points, 'fama', true, null);
    v_done := v_done + 1;
  end loop;
  return v_done;
end;
$$;
revoke execute on function public.press_fame_tick() from public, anon, authenticated;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('giornale-fama', '25 6 * * *', 'select public.press_fame_tick()');
exception when others then
  raise notice 'pg_cron non disponibile: %', sqlerrm;
end $$;

-- 7. CONTATORI: uscite nuove e pezzi da approvare
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
                      then (select count(*)::int from public.press_items p where p.status = 'in_revisione') else 0 end
  );
$$;
revoke execute on function public.my_counters() from public, anon;
grant execute on function public.my_counters() to authenticated;

-- 8. TEMPO REALE: uscite e invii in redazione accendono l'icona
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'press_items') then
    alter publication supabase_realtime add table public.press_items;
  end if;
end $$;

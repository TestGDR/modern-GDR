-- =====================================================================
-- NOVITÀ: VOCI E CALENDARIO SI ILLUMINANO
-- - gossip_seen / calendar_seen: quando il giocatore ha aperto l'ultima
--   volta i pettegolezzi e il calendario (come absences_seen).
-- - my_counters() dà anche le voci nuove (pettegolezzi approvati dopo
--   l'ultima apertura) e gli eventi nuovi del calendario (creati da altri).
-- - L'archivio dei pettegolezzi mostra solo le voci (chi è stato notato),
--   non più i tiri «Visto e non visto».
-- =====================================================================

create table if not exists public.gossip_seen (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  seen_at timestamptz not null default now()
);
alter table public.gossip_seen enable row level security;
drop policy if exists "Voci viste: le proprie" on public.gossip_seen;
create policy "Voci viste: le proprie" on public.gossip_seen for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Voci viste: si segnano le proprie" on public.gossip_seen;
create policy "Voci viste: si segnano le proprie" on public.gossip_seen for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "Voci viste: si aggiornano le proprie" on public.gossip_seen;
create policy "Voci viste: si aggiornano le proprie" on public.gossip_seen for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "Voci viste: si tolgono le proprie" on public.gossip_seen;
create policy "Voci viste: si tolgono le proprie" on public.gossip_seen for delete to authenticated using (user_id = (select auth.uid()));

create table if not exists public.calendar_seen (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  seen_at timestamptz not null default now()
);
alter table public.calendar_seen enable row level security;
drop policy if exists "Calendario visto: il proprio" on public.calendar_seen;
create policy "Calendario visto: il proprio" on public.calendar_seen for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Calendario visto: si segna il proprio" on public.calendar_seen;
create policy "Calendario visto: si segna il proprio" on public.calendar_seen for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "Calendario visto: si aggiorna il proprio" on public.calendar_seen;
create policy "Calendario visto: si aggiorna il proprio" on public.calendar_seen for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "Calendario visto: si toglie il proprio" on public.calendar_seen;
create policy "Calendario visto: si toglie il proprio" on public.calendar_seen for delete to authenticated using (user_id = (select auth.uid()));

-- chi apre per la prima volta non vede tutto come nuovo: si parte da adesso
insert into public.gossip_seen (user_id) select id from public.profiles on conflict do nothing;
insert into public.calendar_seen (user_id) select id from public.profiles on conflict do nothing;

-- Archivio: solo le voci (pettegolezzi approvati), niente «Visto e non visto»
create or replace function public.gossip_archive()
returns table (id uuid, kind text, body text, zone text, author text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select g.id, 'voce'::text, g.published_text, g.zone_name, public.first_name(g.author_name), coalesce(g.reviewed_at, g.created_at)
  from public.gossip_reports g
  where g.status = 'approvato' and auth.uid() is not null
  order by coalesce(g.reviewed_at, g.created_at) desc
  limit 300;
$$;

-- Contatori: in più voci nuove e eventi nuovi del calendario
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
                       and e.created_at > coalesce((select s.seen_at from public.calendar_seen s where s.user_id = auth.uid()), now()))
  );
$$;
revoke execute on function public.my_counters() from public, anon;
grant execute on function public.my_counters() to authenticated;

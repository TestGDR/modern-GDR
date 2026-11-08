-- =====================================================================
-- CONTATORI IN UNA SOLA CHIAMATA (meno log delle API)
-- my_counters() restituisce insieme tutti i numeri delle icone: messaggi
-- OFF, telefono, forum (non letti e post segnalati), social, ticket,
-- annunci staff, assenze, cerco gioco e pettegolezzi in attesa.
-- Prima erano 11-12 richieste (più 2 all'Auth) a ogni giro: ora una.
-- Gira con i permessi di chi la chiama (niente security definer): ogni
-- pezzo vede esattamente quello che vedeva prima, regole RLS comprese.
-- =====================================================================

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
    'gossip', public.gossip_waiting()
  );
$$;
revoke execute on function public.my_counters() from public, anon;
grant execute on function public.my_counters() to authenticated;

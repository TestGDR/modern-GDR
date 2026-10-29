-- =====================================================================
-- SOCIAL STILE INSTAGRAM
-- Si usa con il proprio personaggio approvato (owns_character).
-- - social_profiles: @nome unico e bio del personaggio.
-- - social_posts: testo + media (immagini, video, YouTube: anche più di
--   uno = carosello), solo tramite link https.
-- - social_follows: segui / smetti di seguire.
-- - social_reactions: una reazione (emoji) per persona per post.
-- - social_tags: persone taggate nel post (le sceglie l'autore).
-- - social_dms: messaggi diretti tra personaggi. Li leggono i due
--   partecipanti e lo staff con messaggi.log (come telefono e OFF).
-- - social_notifications: segui, reazioni, commenti, tag (dai trigger).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PROFILI
-- ---------------------------------------------------------------------
create table public.social_profiles (
  character_id uuid primary key references public.characters (id) on delete cascade,
  handle text not null check (handle ~ '^[a-z0-9._]{3,30}$'),
  bio text not null default '' check (char_length(bio) <= 300),
  created_at timestamptz not null default now()
);
create unique index social_profiles_handle_key on public.social_profiles (lower(handle));

alter table public.social_profiles enable row level security;
revoke all on public.social_profiles from anon, authenticated;
grant select on public.social_profiles to authenticated;
grant insert (character_id, handle, bio) on public.social_profiles to authenticated;
grant update (handle, bio) on public.social_profiles to authenticated;
create policy "Profili social: li vedono tutti" on public.social_profiles for select to authenticated using (true);
create policy "Profili social: il proprio" on public.social_profiles for insert to authenticated
  with check ((select public.owns_character(character_id)));
create policy "Profili social: si modifica il proprio" on public.social_profiles for update to authenticated
  using ((select public.owns_character(character_id))) with check ((select public.owns_character(character_id)));

-- ---------------------------------------------------------------------
-- 2. POST: media (carosello) e testo facoltativo se c'è un media
-- ---------------------------------------------------------------------
alter table public.social_posts add column if not exists media jsonb not null default '[]'::jsonb;
update public.social_posts set media = jsonb_build_array(jsonb_build_object('type', 'image', 'url', image_url))
where image_url is not null and image_url ~ '^https://' and media = '[]'::jsonb;
alter table public.social_posts drop constraint if exists social_posts_body_check;
alter table public.social_posts add constraint social_posts_body_check check (char_length(body) <= 2200);
grant update (body, location, media) on public.social_posts to authenticated;

-- Media validi: al massimo 10, ognuno {type: image|video|youtube, url: https://…}
create or replace function public.check_social_post()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  m jsonb;
begin
  if jsonb_typeof(new.media) <> 'array' or jsonb_array_length(new.media) > 10 then
    raise exception 'Al massimo 10 foto o video per post.' using errcode = 'P0001';
  end if;
  for m in select * from jsonb_array_elements(new.media) loop
    if coalesce(m ->> 'type', '') not in ('image', 'video', 'youtube')
       or coalesce(m ->> 'url', '') !~ '^https://' or char_length(m ->> 'url') > 500 then
      raise exception 'Link non valido: usa indirizzi che iniziano con https://' using errcode = 'P0001';
    end if;
  end loop;
  if btrim(new.body) = '' and jsonb_array_length(new.media) = 0 then
    raise exception 'Aggiungi una foto, un video o del testo.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists social_posts_check on public.social_posts;
create trigger social_posts_check before insert or update on public.social_posts
  for each row execute function public.check_social_post();

-- ---------------------------------------------------------------------
-- 3. SEGUI
-- ---------------------------------------------------------------------
create table public.social_follows (
  follower_id uuid not null references public.characters (id) on delete cascade,
  followed_id uuid not null references public.characters (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id),
  check (follower_id <> followed_id)
);
create index social_follows_followed_idx on public.social_follows (followed_id);
alter table public.social_follows enable row level security;
revoke all on public.social_follows from anon, authenticated;
grant select, delete on public.social_follows to authenticated;
grant insert (follower_id, followed_id) on public.social_follows to authenticated;
create policy "Segui: li vedono tutti" on public.social_follows for select to authenticated using (true);
create policy "Segui: col proprio personaggio" on public.social_follows for insert to authenticated
  with check ((select public.owns_character(follower_id)));
create policy "Segui: si smette col proprio personaggio" on public.social_follows for delete to authenticated
  using ((select public.owns_character(follower_id)));

-- ---------------------------------------------------------------------
-- 4. REAZIONI (prendono il posto dei "mi piace")
-- ---------------------------------------------------------------------
create table public.social_reactions (
  post_id uuid not null references public.social_posts (id) on delete cascade,
  character_id uuid not null references public.characters (id) on delete cascade,
  emoji text not null check (emoji in ('❤️', '😂', '😮', '😢', '🔥', '👏')),
  created_at timestamptz not null default now(),
  primary key (post_id, character_id)
);
create index social_reactions_character_idx on public.social_reactions (character_id);
insert into public.social_reactions (post_id, character_id, emoji, created_at)
select post_id, character_id, '❤️', created_at from public.social_likes on conflict do nothing;
alter table public.social_reactions enable row level security;
revoke all on public.social_reactions from anon, authenticated;
grant select, delete on public.social_reactions to authenticated;
grant insert (post_id, character_id, emoji) on public.social_reactions to authenticated;
grant update (emoji) on public.social_reactions to authenticated;
create policy "Reazioni: le vedono tutti" on public.social_reactions for select to authenticated using (true);
create policy "Reazioni: col proprio personaggio" on public.social_reactions for insert to authenticated
  with check ((select public.owns_character(character_id)));
create policy "Reazioni: si cambia la propria" on public.social_reactions for update to authenticated
  using ((select public.owns_character(character_id))) with check ((select public.owns_character(character_id)));
create policy "Reazioni: si toglie la propria" on public.social_reactions for delete to authenticated
  using ((select public.owns_character(character_id)));

-- ---------------------------------------------------------------------
-- 5. TAG (li mette l'autore del post)
-- ---------------------------------------------------------------------
create table public.social_tags (
  post_id uuid not null references public.social_posts (id) on delete cascade,
  character_id uuid not null references public.characters (id) on delete cascade,
  primary key (post_id, character_id)
);
create index social_tags_character_idx on public.social_tags (character_id);
alter table public.social_tags enable row level security;
revoke all on public.social_tags from anon, authenticated;
grant select, delete on public.social_tags to authenticated;
grant insert (post_id, character_id) on public.social_tags to authenticated;
create policy "Tag: li vedono tutti" on public.social_tags for select to authenticated using (true);
create policy "Tag: li mette l'autore del post" on public.social_tags for insert to authenticated
  with check (exists (select 1 from public.social_posts p where p.id = post_id and p.author_id = (select auth.uid())));
create policy "Tag: li toglie l'autore del post o il taggato" on public.social_tags for delete to authenticated
  using (
    exists (select 1 from public.social_posts p where p.id = post_id and p.author_id = (select auth.uid()))
    or (select public.owns_character(character_id))
  );

-- ---------------------------------------------------------------------
-- 6. MESSAGGI DIRETTI
-- ---------------------------------------------------------------------
create table public.social_dms (
  id bigint generated always as identity primary key,
  sender_id uuid not null references public.characters (id) on delete cascade,
  recipient_id uuid not null references public.characters (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  -- post condiviso nel messaggio (facoltativo)
  post_id uuid references public.social_posts (id) on delete set null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (sender_id <> recipient_id)
);
create index social_dms_pair_idx on public.social_dms (sender_id, recipient_id, created_at desc);
create index social_dms_recipient_idx on public.social_dms (recipient_id, created_at desc);
create index social_dms_post_idx on public.social_dms (post_id);
alter table public.social_dms enable row level security;
revoke all on public.social_dms from anon, authenticated;
grant select on public.social_dms to authenticated;
grant insert (sender_id, recipient_id, body, post_id) on public.social_dms to authenticated;
create policy "DM: li leggono i due partecipanti (e lo staff dei log)" on public.social_dms for select to authenticated
  using (
    (select public.owns_character(sender_id)) or (select public.owns_character(recipient_id))
    or (select public.has_permission('messaggi.log'))
  );
create policy "DM: si scrivono col proprio personaggio" on public.social_dms for insert to authenticated
  with check (
    (select public.owns_character(sender_id))
    and exists (select 1 from public.characters c where c.id = recipient_id and c.status = 'approvata')
  );
-- "letto": solo chi riceve, con social_dm_read()

create or replace function public.social_dm_read(p_me uuid, p_other uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.owns_character(p_me) then
    raise exception 'Questo personaggio non è tuo.' using errcode = '42501';
  end if;
  update public.social_dms set read_at = now() where recipient_id = p_me and sender_id = p_other and read_at is null;
end;
$$;

-- Conversazioni: l'ultimo messaggio con ogni persona e i non letti
create or replace function public.social_dm_inbox(p_me uuid)
returns table (other_id uuid, last_body text, last_at timestamptz, last_mine boolean, unread int)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select case when d.sender_id = p_me then d.recipient_id else d.sender_id end as other_id, d.*
    from public.social_dms d
    where public.owns_character(p_me) and (d.sender_id = p_me or d.recipient_id = p_me)
  )
  select distinct on (m.other_id) m.other_id, m.body, m.created_at, m.sender_id = p_me,
    (select count(*)::int from public.social_dms x where x.sender_id = m.other_id and x.recipient_id = p_me and x.read_at is null)
  from mine m
  order by m.other_id, m.created_at desc
$$;

-- ---------------------------------------------------------------------
-- 7. NOTIFICHE (attività)
-- ---------------------------------------------------------------------
create table public.social_notifications (
  id bigint generated always as identity primary key,
  character_id uuid not null references public.characters (id) on delete cascade,
  actor_id uuid not null references public.characters (id) on delete cascade,
  kind text not null check (kind in ('follow', 'reaction', 'comment', 'tag')),
  post_id uuid references public.social_posts (id) on delete cascade,
  detail text not null default '' check (char_length(detail) <= 200),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index social_notifications_character_idx on public.social_notifications (character_id, created_at desc);
create index social_notifications_actor_idx on public.social_notifications (actor_id);
create index social_notifications_post_idx on public.social_notifications (post_id);
alter table public.social_notifications enable row level security;
revoke all on public.social_notifications from anon, authenticated;
grant select on public.social_notifications to authenticated;
create policy "Attività: le proprie" on public.social_notifications for select to authenticated
  using ((select public.owns_character(character_id)));

create or replace function public.social_notify(p_to uuid, p_actor uuid, p_kind text, p_post uuid, p_detail text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.social_notifications (character_id, actor_id, kind, post_id, detail)
  select p_to, p_actor, p_kind, p_post, left(coalesce(p_detail, ''), 200)
  where p_to is not null and p_to <> p_actor
$$;
revoke execute on function public.social_notify(uuid, uuid, text, uuid, text) from public, anon, authenticated;

create or replace function public.social_on_follow()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.social_notify(new.followed_id, new.follower_id, 'follow', null, '');
  return new;
end;
$$;
create trigger social_follows_notify after insert on public.social_follows
  for each row execute function public.social_on_follow();

create or replace function public.social_on_reaction()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.emoji = old.emoji then return new; end if;
  -- una sola notifica per persona e post: cambiando reazione si aggiorna
  delete from public.social_notifications where kind = 'reaction' and post_id = new.post_id and actor_id = new.character_id;
  perform public.social_notify((select character_id from public.social_posts where id = new.post_id), new.character_id, 'reaction', new.post_id, new.emoji);
  return new;
end;
$$;
create trigger social_reactions_notify after insert or update of emoji on public.social_reactions
  for each row execute function public.social_on_reaction();

create or replace function public.social_on_comment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.social_notify((select character_id from public.social_posts where id = new.post_id), new.character_id, 'comment', new.post_id, new.body);
  return new;
end;
$$;
create trigger social_comments_notify after insert on public.social_comments
  for each row execute function public.social_on_comment();

create or replace function public.social_on_tag()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.social_notify(new.character_id, (select character_id from public.social_posts where id = new.post_id), 'tag', new.post_id, '');
  return new;
end;
$$;
create trigger social_tags_notify after insert on public.social_tags
  for each row execute function public.social_on_tag();

-- Segna come lette le attività del personaggio
create or replace function public.social_activity_read(p_me uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.owns_character(p_me) then
    raise exception 'Questo personaggio non è tuo.' using errcode = '42501';
  end if;
  update public.social_notifications set read_at = now() where character_id = p_me and read_at is null;
end;
$$;

-- Contatori per l'icona: DM non letti e attività nuove dei miei personaggi approvati
create or replace function public.social_unread()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'dms', (select count(*)::int from public.social_dms d join public.characters c on c.id = d.recipient_id
            where c.owner_id = auth.uid() and c.status = 'approvata' and d.read_at is null),
    'activity', (select count(*)::int from public.social_notifications n join public.characters c on c.id = n.character_id
            where c.owner_id = auth.uid() and c.status = 'approvata' and n.read_at is null)
  )
$$;

revoke execute on function public.social_dm_read(uuid, uuid), public.social_dm_inbox(uuid), public.social_activity_read(uuid), public.social_unread() from public, anon;
grant execute on function public.social_dm_read(uuid, uuid), public.social_dm_inbox(uuid), public.social_activity_read(uuid), public.social_unread() to authenticated;

-- ---------------------------------------------------------------------
-- 8. TEMPO REALE
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.social_dms;
alter publication supabase_realtime add table public.social_notifications;

-- ---------------------------------------------------------------------
-- 9. IL RESET DELLA SCHEDA CANCELLA ANCHE IL SOCIAL DEL PERSONAGGIO
-- ---------------------------------------------------------------------
create or replace function public.admin_reset_character(p_character uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.characters;
begin
  if not public.is_admin_user() then
    raise exception 'Solo l''Amministratore può resettare una scheda.' using errcode = '42501';
  end if;
  select * into c from public.characters where id = p_character for update;
  if c.id is null then raise exception 'Scheda non trovata.' using errcode = 'P0001'; end if;

  delete from public.character_skills where character_id = p_character;
  delete from public.character_attributes where character_id = p_character;
  delete from public.character_options where character_id = p_character;
  delete from public.bank_transactions where character_id = p_character;
  delete from public.bank_accounts where character_id = p_character;
  delete from public.phone_numbers where character_id = p_character;
  delete from public.character_jobs where character_id = p_character;
  delete from public.character_groups where character_id = p_character;
  delete from public.character_affections where character_id = p_character;
  delete from public.social_posts where character_id = p_character;
  delete from public.social_profiles where character_id = p_character;
  delete from public.social_follows where follower_id = p_character or followed_id = p_character;
  delete from public.social_reactions where character_id = p_character;
  delete from public.social_comments where character_id = p_character;
  delete from public.social_tags where character_id = p_character;
  delete from public.social_dms where sender_id = p_character or recipient_id = p_character;
  delete from public.social_notifications where character_id = p_character or actor_id = p_character;
  perform public.admin_character_offline(p_character);

  perform set_config('app.reset_scheda', 'on', true);
  update public.characters
  set status = 'bozza', rejection_reason = null, creation_step = 1, px = 0,
      age = null, occupation = null, district_id = null, quote = null, bio = null,
      avatar_url = null, cover_url = null, cover_mobile_url = null,
      appearance = null, traits = null, skills = null,
      known_facts = null, relationships = null, equipment = null,
      sex = null, birth_date = null, nationality = null,
      study_track_id = null, year_id = null, club_id = null, minor_id = null,
      height = null, weight = null, eye_color = null, hair_color = null,
      face_claim = null, talent_claim = null, review_ticket_id = null
  where id = p_character;
  perform set_config('app.reset_scheda', 'off', true);

  perform public.send_system_message(c.owner_id,
    'Lo staff ha resettato la scheda di ' || c.name || ': ricomincia dalla creazione, dal primo passaggio.'
    || E'\nFinché non viene approvata il personaggio non può giocare.');
end;
$$;
revoke execute on function public.admin_reset_character(uuid) from public, anon;
grant execute on function public.admin_reset_character(uuid) to authenticated;

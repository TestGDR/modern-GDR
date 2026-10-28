-- =====================================================================
-- PREFERENZE E PRESENTI ONLINE (fase 4 del documento "Funzioni generiche")
-- Logica ripresa dal Westeros GDR (migrazioni 0018, 0034, 0083, 0084, 0112):
--
--   user_prefs     suoni, volume, grandezza del testo, colori della chat
--   online_status  il "segnale" di chi ha il sito aperto: online = ha fatto
--                  un'azione nell'ultima ora (cambiare pagina, scrivere…)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PREFERENZE DELL'UTENTE (Scheda -> Impostazioni)
-- ---------------------------------------------------------------------
create table public.user_prefs (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  sounds_on boolean not null default true,
  volume int not null default 80 check (volume between 0 and 100),
  -- suono scelto per i messaggi ON, OFF e la chat (elenco in src/lib/notify-sound.ts)
  sound_on text not null default 'file-chat2' check (char_length(sound_on) <= 30),
  sound_off text not null default 'file-bip1' check (char_length(sound_off) <= 30),
  sound_chat text not null default 'file-chat1' check (char_length(sound_chat) <= 30),
  chat_sound_on boolean not null default true,
  text_scale int not null default 100 check (text_scale in (90, 100, 112, 125, 140)),
  speech_color text not null default '#fde68a' check (speech_color ~ '^#[0-9a-fA-F]{6}$'),
  action_color text not null default '#e4dfdb' check (action_color ~ '^#[0-9a-fA-F]{6}$'),
  updated_at timestamptz not null default now()
);

alter table public.user_prefs enable row level security;
revoke all on public.user_prefs from anon, authenticated;
grant select, insert, update, delete on public.user_prefs to authenticated;

create policy "Preferenze: le proprie" on public.user_prefs for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Preferenze: si creano le proprie" on public.user_prefs for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Preferenze: si modificano le proprie" on public.user_prefs for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Preferenze: si eliminano le proprie" on public.user_prefs for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- 2. PRESENTI ONLINE
-- ---------------------------------------------------------------------
create table public.online_status (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  -- cosa si mostra agli altri: dove si è e la disponibilità (nome e ritratto li mette il database)
  info jsonb not null default '{}'::jsonb,
  last_seen timestamptz not null default now(),
  last_action timestamptz not null default now()
);
create index online_status_last_action_idx on public.online_status (last_action desc);

alter table public.online_status enable row level security;
revoke all on public.online_status from anon, authenticated;
grant select on public.online_status to authenticated;

-- Gli invisibili li vede solo chi ha lo stesso permesso (e loro stessi)
create policy "Presenti: segnali visibili" on public.online_status for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.has_permission('staff.invisibile'))
    or not exists (select 1 from public.profiles p where p.id = user_id and p.invisible)
  );
-- Si scrive solo con touch_online / leave_online

-- Il mio segnale. p_action = true quando ho fatto qualcosa (aprire o cambiare pagina)
create or replace function public.touch_online(p_info jsonb, p_action boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_info jsonb := coalesce(p_info, '{}'::jsonb);
begin
  if auth.uid() is null then return; end if;
  -- si tengono solo i campi previsti, con testi brevi
  v_info := jsonb_strip_nulls(jsonb_build_object(
    'availability', case when v_info ->> 'availability' in ('disponibile', 'cerca', 'occupato') then v_info ->> 'availability' end,
    'place', left(v_info ->> 'place', 80),
    'placeKey', left(v_info ->> 'placeKey', 60)
  ));
  insert into public.online_status (user_id, info, last_seen, last_action)
  values (auth.uid(), v_info, now(), now())
  on conflict (user_id) do update set
    info = excluded.info,
    last_seen = now(),
    last_action = case when p_action then now() else public.online_status.last_action end;
end;
$$;

-- Esci: si sparisce subito
create or replace function public.leave_online()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.online_status
  set last_seen = now() - interval '2 hours', last_action = now() - interval '2 hours'
  where user_id = auth.uid();
$$;

-- Presenti: chi ha fatto un'azione nell'ultima ora, con nome e ritratto presi dal database
create or replace function public.recent_online()
returns table (
  user_id uuid,
  name text,
  avatar_url text,
  character_id uuid,
  level_name text,
  level_color text,
  info jsonb,
  invisible boolean,
  last_seen timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.user_id,
         coalesce(c.name, p.username),
         c.avatar_url,
         c.id,
         l.name,
         l.color,
         o.info,
         p.invisible,
         o.last_seen
  from public.online_status o
  join public.profiles p on p.id = o.user_id
  join public.user_levels l on l.id = p.level_id
  left join public.characters c on c.owner_id = o.user_id and c.status = 'approvata'
  where o.last_action > now() - interval '60 minutes'
    and (
      not p.invisible
      or o.user_id = auth.uid()
      or public.has_permission('staff.invisibile')
    )
  order by coalesce(c.name, p.username);
$$;

revoke execute on function public.touch_online(jsonb, boolean) from public, anon;
revoke execute on function public.leave_online() from public, anon;
revoke execute on function public.recent_online() from public, anon;
grant execute on function public.touch_online(jsonb, boolean) to authenticated;
grant execute on function public.leave_online() to authenticated;
grant execute on function public.recent_online() to authenticated;

-- Scrivere in chat o mandare un messaggio privato conta come azione
create or replace function public.online_mark_action()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    update public.online_status set last_action = now(), last_seen = now() where user_id = auth.uid();
  end if;
  return new;
end;
$$;

create trigger messages_online_action after insert on public.messages
  for each row execute function public.online_mark_action();
create trigger private_messages_online_action after insert on public.private_messages
  for each row execute function public.online_mark_action();


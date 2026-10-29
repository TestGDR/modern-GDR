-- =====================================================================
-- GESTIONE DEL SITO (fase 7 del documento "Funzioni generiche")
-- Logica ripresa dal Westeros GDR (migrazioni 0002, 0036, 0037, 0146, 0153):
--
--   signup_settings   iscrizioni aperte / chiuse (permesso iscrizioni.gestire)
--   profiles          ultimo accesso, ultimo gioco, sospensione (ban)
--   access_logs       registro degli accessi con IP e controllo VPN (gestione.accessi)
--   log               lo staff rilegge chat (chat.log) e messaggi (messaggi.log)
--   manutenzione      pulizia di messaggi vecchi e account inattivi, con anteprima
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PERMESSI: all'Amministratore valgono sempre; a nessun altro livello
--    se non li spunta lui. chat.log e messaggi.log anche ai Master.
-- ---------------------------------------------------------------------
update public.user_levels
set permissions = array(select distinct unnest(permissions || array['chat.log', 'messaggi.log']))
where name = 'Master';

-- ---------------------------------------------------------------------
-- 2. ISCRIZIONI APERTE / CHIUSE (Westeros 0153)
-- ---------------------------------------------------------------------
create table public.signup_settings (
  id boolean primary key default true check (id),
  open boolean not null default true,
  message text not null default '' check (char_length(message) <= 200),
  updated_at timestamptz not null default now()
);
insert into public.signup_settings (id) values (true);

alter table public.signup_settings enable row level security;
revoke all on public.signup_settings from anon, authenticated;
-- La legge chiunque, anche chi non è iscritto (serve alla home)
grant select on public.signup_settings to anon, authenticated;
grant update (open, message, updated_at) on public.signup_settings to authenticated;

create policy "Iscrizioni: lettura per tutti" on public.signup_settings for select to anon, authenticated using (true);
create policy "Iscrizioni: le apre e chiude chi ha il permesso" on public.signup_settings for update to authenticated
  using ((select public.has_permission('iscrizioni.gestire'))) with check ((select public.has_permission('iscrizioni.gestire')));

create trigger signup_settings_log after update on public.signup_settings
  for each row execute function public.log_admin_change();

-- Iscrizioni chiuse: il database non crea nuovi account
create or replace function public.block_signups_when_closed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce((select open from public.signup_settings where id), true) then
    raise exception 'Iscrizioni chiuse' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.block_signups_when_closed() from public, anon, authenticated;

create trigger block_signups_when_closed
  before insert on auth.users
  for each row execute function public.block_signups_when_closed();

-- ---------------------------------------------------------------------
-- 3. ULTIMO ACCESSO, ULTIMO GIOCO, SOSPENSIONE
-- ---------------------------------------------------------------------
alter table public.profiles
  add column last_login_at timestamptz,
  add column last_played_at timestamptz,
  -- 'infinity' = sospensione permanente
  add column banned_until timestamptz,
  add column ban_reason text not null default '' check (char_length(ban_reason) <= 300);
-- (le colonne nuove non sono tra quelle che il giocatore può modificare)

-- Ultimo gioco: ogni messaggio in chat del proprio personaggio
create or replace function public.profiles_mark_played()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind in ('azione', 'master', 'dado') and new.author_id is not null then
    update public.profiles set last_played_at = now()
    where id = new.author_id and (last_played_at is null or last_played_at < now() - interval '5 minutes');
  end if;
  return new;
end;
$$;
create trigger messages_mark_played after insert on public.messages
  for each row execute function public.profiles_mark_played();

-- Soglia degli account inattivi (Gestione → Impostazioni)
insert into public.game_settings (key, value, kind, label, description, sort_order)
values ('giorni_inattivita', '30', 'number', 'Giorni per "inattivo"',
        'In Gestione → Utenti è inattivo chi non entra o non gioca da più di questi giorni.', 20)
on conflict (key) do nothing;

-- Sospendere (o togliere la sospensione): chi ha utenti.bandire, solo su chi ha rango inferiore
create or replace function public.ban_user(p_user uuid, p_until timestamptz, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rank int;
begin
  if not public.has_permission('utenti.bandire') then
    raise exception 'Non hai il permesso di sospendere gli utenti.' using errcode = '42501';
  end if;
  if p_user = auth.uid() then
    raise exception 'Non puoi sospendere te stesso.' using errcode = 'P0001';
  end if;
  select l.rank into v_rank from public.profiles p join public.user_levels l on l.id = p.level_id where p.id = p_user;
  if v_rank is null then raise exception 'Utente non trovato.' using errcode = 'P0001'; end if;
  if v_rank >= public.my_rank() then
    raise exception 'Puoi sospendere solo utenti di livello inferiore al tuo.' using errcode = '42501';
  end if;
  if p_until is not null and p_until <= now() then
    raise exception 'La fine della sospensione deve essere nel futuro.' using errcode = 'P0001';
  end if;

  update public.profiles
  set banned_until = p_until, ban_reason = case when p_until is null then '' else left(btrim(coalesce(p_reason, '')), 300) end
  where id = p_user;

  -- Il sistema di accesso rifiuta il login fino alla fine della sospensione
  begin
    update auth.users set banned_until = case when p_until = 'infinity'::timestamptz then 'infinity'::timestamptz else p_until end
    where id = p_user;
  exception when others then
    null; -- se non si può, resta il controllo del sito (pagina "sospeso" a ogni visita)
  end;

  if p_until is not null then
    -- esce subito dalle chat e dai presenti
    delete from public.chat_presence where character_id in (select id from public.characters where owner_id = p_user);
    update public.online_status set last_action = now() - interval '2 hours', last_seen = now() - interval '2 hours' where user_id = p_user;
  end if;
end;
$$;

-- L'utente collegato è sospeso?
create or replace function public.my_ban()
returns table (banned_until timestamptz, ban_reason text)
language sql
stable
security definer
set search_path = ''
as $$
  select banned_until, ban_reason from public.profiles
  where id = auth.uid() and banned_until is not null and banned_until > now();
$$;

-- Elenco utenti per la gestione (con date e sospensione)
create or replace function public.admin_users()
returns table (
  id uuid,
  username text,
  level_id uuid,
  created_at timestamptz,
  last_login_at timestamptz,
  last_played_at timestamptz,
  banned_until timestamptz,
  ban_reason text,
  character_name text,
  character_status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.username, p.level_id, p.created_at, p.last_login_at, p.last_played_at,
         p.banned_until, p.ban_reason, c.name, c.status
  from public.profiles p
  left join public.characters c on c.owner_id = p.id
  where public.has_permission('utenti.vedere_modificare') or public.has_permission('livelli.assegnare')
     or public.has_permission('utenti.bandire') or public.has_permission('manutenzione.sito')
  order by p.username
  limit 2000;
$$;

-- ---------------------------------------------------------------------
-- 4. REGISTRO DEGLI ACCESSI (Westeros 0002, 0146)
-- Lo scrive solo il server (chiave segreta), così non si può falsificare.
-- ---------------------------------------------------------------------
create table public.access_logs (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles (id) on delete cascade,
  event text not null check (event in ('iscrizione', 'login', 'accesso')),
  ip inet not null,
  user_agent text check (char_length(user_agent) <= 500),
  country text,
  is_vpn boolean,  -- null = non verificato
  vpn_type text,   -- VPN / Proxy / TOR / Hosting
  provider text,
  risk int,
  created_at timestamptz not null default now()
);
create index access_logs_user_idx on public.access_logs (user_id, created_at desc);
create index access_logs_ip_idx on public.access_logs (ip);
create index access_logs_created_idx on public.access_logs (created_at desc);

-- Verifiche VPN già fatte (per non interrogare il servizio a ogni accesso)
create table public.ip_checks (
  ip inet primary key,
  country text,
  is_vpn boolean not null,
  vpn_type text,
  provider text,
  risk int,
  checked_at timestamptz not null default now()
);

alter table public.access_logs enable row level security;
alter table public.ip_checks enable row level security;
revoke all on public.access_logs, public.ip_checks from anon, authenticated;
grant select on public.access_logs to authenticated;

create policy "Accessi: li vede chi ha il permesso" on public.access_logs for select to authenticated
  using ((select public.has_permission('gestione.accessi')));
-- ip_checks: nessuna policy per gli utenti, la usa solo il server

-- Pulizia dopo 6 mesi
create or replace function public.purge_old_access_data()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.access_logs where created_at < now() - interval '6 months';
  delete from public.ip_checks where checked_at < now() - interval '6 months';
$$;
revoke execute on function public.purge_old_access_data() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. LOG: lo staff rilegge le chat e i messaggi
-- (gli utenti lo vedono scritto nella pagina Messaggi)
-- ---------------------------------------------------------------------
create policy "Log: chat per chi ha chat.log" on public.messages for select to authenticated
  using ((select public.has_permission('chat.log')) and (kind <> 'sussurro' or (select public.is_admin_user())));
create policy "Log: messaggi per chi ha messaggi.log" on public.private_messages for select to authenticated
  using ((select public.has_permission('messaggi.log')));
create policy "Log: gruppi per chi ha messaggi.log" on public.off_group_messages for select to authenticated
  using ((select public.has_permission('messaggi.log')));
create policy "Log: gruppi visibili a chi ha messaggi.log" on public.off_groups for select to authenticated
  using ((select public.has_permission('messaggi.log')));

-- Nomi per il log (utenti → nome del personaggio o dell'account)
create or replace function public.log_names(p_users uuid[])
returns table (user_id uuid, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, coalesce(c.name, p.username)
  from public.profiles p
  left join public.characters c on c.owner_id = p.id and c.status = 'approvata'
  where (public.has_permission('messaggi.log') or public.has_permission('chat.log') or public.has_permission('gestione.accessi'))
    and p.id = any (coalesce(p_users, '{}'))
  limit 2000;
$$;

-- ---------------------------------------------------------------------
-- 6. MANUTENZIONE (Westeros 0037): anteprima e pulizia
--    p_kind: 'chat' (messaggi delle chat), 'messaggi' (privati e dei gruppi),
--            'account' (utenti senza accessi né gioco nel periodo)
--    p_days: 7, 30, 90, 180, 365
-- ---------------------------------------------------------------------
create or replace function public.maintenance_targets(p_kind text, p_days int)
returns table (id text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit timestamptz := now() - make_interval(days => p_days);
begin
  if not public.has_permission('manutenzione.sito') then
    raise exception 'Non hai il permesso di fare manutenzione.' using errcode = '42501';
  end if;
  if p_days not in (7, 30, 90, 180, 365) then
    raise exception 'Periodo non valido.' using errcode = 'P0001';
  end if;
  if p_kind = 'chat' then
    return query select m.id::text from public.messages m where m.created_at < v_limit;
  elsif p_kind = 'messaggi' then
    return query
      select 'pm:' || pm.id from public.private_messages pm where pm.created_at < v_limit
      union all
      select 'gm:' || gm.id from public.off_group_messages gm where gm.created_at < v_limit;
  elsif p_kind = 'account' then
    -- mai l'Amministratore, mai chi ha rango uguale o superiore al proprio, mai se stessi
    return query
      select p.id::text from public.profiles p
      join public.user_levels l on l.id = p.level_id
      where p.id <> auth.uid() and not l.is_admin and l.rank < public.my_rank()
        and p.created_at < v_limit
        and coalesce(p.last_login_at, p.created_at) < v_limit
        and coalesce(p.last_played_at, '-infinity'::timestamptz) < v_limit;
  else
    raise exception 'Tipo di pulizia non valido.' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.maintenance_preview(p_kind text, p_days int)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.maintenance_targets(p_kind, p_days);
$$;

create or replace function public.maintenance_run(p_kind text, p_days int)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids text[];
  v_n int;
begin
  v_ids := array(select id from public.maintenance_targets(p_kind, p_days));
  v_n := coalesce(array_length(v_ids, 1), 0);
  if p_kind = 'chat' then
    delete from public.messages where id::text = any (v_ids);
  elsif p_kind = 'messaggi' then
    delete from public.private_messages where 'pm:' || id = any (v_ids);
    delete from public.off_group_messages where 'gm:' || id = any (v_ids);
  elsif p_kind = 'account' then
    -- l'account di accesso; il profilo e tutto il resto si cancellano a cascata
    delete from auth.users where id::text = any (v_ids);
    delete from public.profiles where id::text = any (v_ids);
  end if;
  insert into public.admin_log (actor_id, action, entity, entity_label, details)
  values (auth.uid(), 'manutenzione', p_kind, v_n || ' elementi più vecchi di ' || p_days || ' giorni',
          jsonb_build_object('tipo', p_kind, 'giorni', p_days, 'eliminati', v_n));
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------
-- 7. FUNZIONI: chi le può chiamare
-- ---------------------------------------------------------------------
revoke execute on function public.ban_user(uuid, timestamptz, text) from public, anon;
revoke execute on function public.my_ban() from public, anon;
revoke execute on function public.admin_users() from public, anon;
revoke execute on function public.log_names(uuid[]) from public, anon;
revoke execute on function public.maintenance_targets(text, int) from public, anon, authenticated;
revoke execute on function public.maintenance_preview(text, int) from public, anon;
revoke execute on function public.maintenance_run(text, int) from public, anon;
grant execute on function public.ban_user(uuid, timestamptz, text) to authenticated;
grant execute on function public.my_ban() to authenticated;
grant execute on function public.admin_users() to authenticated;
grant execute on function public.log_names(uuid[]) to authenticated;
grant execute on function public.maintenance_preview(text, int) to authenticated;
grant execute on function public.maintenance_run(text, int) to authenticated;

-- ---------------------------------------------------------------------
-- 8. LAVORI AUTOMATICI (pg_cron): accessi più vecchi di 6 mesi, ogni notte alle 3:20
-- ---------------------------------------------------------------------
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('accessi-6-mesi', '20 3 * * *', 'select public.purge_old_access_data()');
exception when others then
  raise notice 'pg_cron non disponibile: %', sqlerrm;
end $$;

-- =====================================================================
-- PUNTI AZIONE E PACCHETTI PX SETTIMANALI
-- Ogni azione valida in chat vale 1 punto azione (non spendibile):
-- un'azione, una narrazione del Master o una battuta di un PNG lunga
-- almeno pa_caratteri_min caratteri, con almeno un altro personaggio (di
-- un altro giocatore) in giocata nella stessa chat. Ogni lunedì (ora
-- italiana) i punti della settimana prima diventano un pacchetto di PX
-- secondo le fasce pa_fasce / pa_pacchetti (il pacchetto più alto è il
-- tetto della settimana); l'accumulo si ferma a px_tetto_totale PX
-- accumulati in tutto (iniziali + pacchetti). Messaggio di SISTEMA.
-- Lo staff con personaggi.assegnare_px vede e corregge i punti.
-- =====================================================================

insert into public.game_settings (key, value, kind, label, description, sort_order) values
  ('pa_caratteri_min', '400', 'number', 'Punti azione · Caratteri minimi', 'Un''azione vale un punto azione se è lunga almeno così (e c''è un altro personaggio in giocata).', 50),
  ('pa_fasce', '[10, 20, 40, 70]', 'numbers', 'Punti azione · Fasce della settimana', 'Punti azione minimi per ogni pacchetto, dal più piccolo al più grande.', 51),
  ('pa_pacchetti', '[15, 25, 35, 45]', 'numbers', 'Punti azione · PX dei pacchetti', 'PX di ogni fascia (stesso ordine). Il più alto è il tetto della settimana.', 52),
  ('px_tetto_totale', '4000', 'number', 'PX · Tetto dei PX accumulati', 'Oltre questi PX accumulati in tutto (iniziali + pacchetti) non arrivano più pacchetti.', 53)
on conflict (key) do nothing;

-- lunedì della settimana (ora italiana)
create or replace function public.rome_week_start(p_day date default null)
returns date
language sql
stable
set search_path = ''
as $$ select date_trunc('week', coalesce(p_day, (now() at time zone 'Europe/Rome')::date))::date $$;
revoke execute on function public.rome_week_start(date) from public, anon, authenticated;

create table if not exists public.action_points (
  character_id uuid not null references public.characters (id) on delete cascade,
  week_start date not null,
  points int not null default 0 check (points >= 0),
  adjusted int not null default 0,
  primary key (character_id, week_start)
);
alter table public.action_points enable row level security;
revoke insert, update, delete on public.action_points from anon, authenticated;
drop policy if exists "Punti azione: proprietario e staff" on public.action_points;
create policy "Punti azione: proprietario e staff" on public.action_points for select to authenticated
  using ((select public.owns_character(character_id)) or (select public.has_permission('personaggi.assegnare_px')));

create table if not exists public.xp_awards (
  id bigint generated always as identity primary key,
  character_id uuid not null references public.characters (id) on delete cascade,
  week_start date not null,
  points int not null,
  px int not null,
  created_at timestamptz not null default now(),
  unique (character_id, week_start)
);
alter table public.xp_awards enable row level security;
revoke insert, update, delete on public.xp_awards from anon, authenticated;
drop policy if exists "Pacchetti PX: proprietario e staff" on public.xp_awards;
create policy "Pacchetti PX: proprietario e staff" on public.xp_awards for select to authenticated
  using ((select public.owns_character(character_id)) or (select public.has_permission('personaggi.assegnare_px')));

-- pacchetto per un certo numero di punti
create or replace function public.xp_package(p_points int)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select (public.uni_list('pa_pacchetti'))[i]
    from generate_subscripts(public.uni_list('pa_fasce'), 1) i
    where p_points >= (public.uni_list('pa_fasce'))[i]
    order by i desc limit 1), 0)::int
$$;
revoke execute on function public.xp_package(int) from public, anon, authenticated;

-- ogni messaggio valido aggiunge un punto azione
create or replace function public.messages_action_points()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  if new.kind not in ('azione', 'master', 'png') then return null; end if;
  if char_length(btrim(new.content)) < coalesce(public.setting_int('pa_caratteri_min'), 400) then return null; end if;
  select owner_id into v_owner from public.characters where id = new.character_id and status = 'approvata';
  if v_owner is null then return null; end if;
  -- almeno un altro personaggio, di un altro giocatore, in giocata in questa chat
  if not exists (
    select 1 from public.chat_presence p join public.characters c on c.id = p.character_id
    where p.room_id = new.room_id and p.character_id <> new.character_id and c.owner_id <> v_owner
      and public.in_chat_now(p.character_id, p.room_id)
  ) then
    return null;
  end if;
  insert into public.action_points (character_id, week_start, points)
  values (new.character_id, public.rome_week_start(), 1)
  on conflict (character_id, week_start) do update set points = public.action_points.points + 1;
  return null;
end;
$$;
revoke execute on function public.messages_action_points() from public, anon, authenticated;
drop trigger if exists messages_action_points on public.messages;
create trigger messages_action_points after insert on public.messages
  for each row execute function public.messages_action_points();

-- il lunedì: pacchetti per tutte le settimane chiuse e non ancora pagate
create or replace function public.xp_weekly_award()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_pack int;
  v_room int;
  v_px int;
  v_count int := 0;
  v_cap int := coalesce(public.setting_int('px_tetto_totale'), 4000) - coalesce(public.setting_int('px_iniziali'), 1300);
begin
  for r in
    select ap.character_id, ap.week_start, greatest(0, ap.points + ap.adjusted) as points, c.owner_id, c.name
    from public.action_points ap join public.characters c on c.id = ap.character_id and c.status = 'approvata'
    where ap.week_start < public.rome_week_start()
      and not exists (select 1 from public.xp_awards a where a.character_id = ap.character_id and a.week_start = ap.week_start)
    order by ap.week_start
  loop
    v_pack := public.xp_package(r.points);
    v_room := greatest(0, v_cap - coalesce((select sum(px) from public.xp_awards where character_id = r.character_id), 0));
    v_px := least(v_pack, v_room);
    insert into public.xp_awards (character_id, week_start, points, px) values (r.character_id, r.week_start, r.points, v_px);
    if v_px > 0 then
      perform set_config('app.invio_scheda', 'on', true);
      update public.characters set px = px + v_px where id = r.character_id;
      perform set_config('app.invio_scheda', 'off', true);
    end if;
    perform public.send_system_message(r.owner_id,
      '⭐ Settimana dal ' || to_char(r.week_start, 'DD/MM') || ': ' || public.first_name(r.name) || ' ha ' || r.points || ' punti azione → '
      || case when v_px > 0 then '+' || v_px || ' PX. Spendili in Scheda → Abilità.'
              when v_pack > 0 then 'nessun PX: hai raggiunto il tetto dei PX accumulati.'
              else 'nessun pacchetto (ne servono almeno ' || coalesce((public.uni_list('pa_fasce'))[1], 10)::int || ').' end);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke execute on function public.xp_weekly_award() from public, anon, authenticated;

-- scheda: punti della settimana, pacchetto attuale e prossima soglia
create or replace function public.my_action_points(p_character uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_points int;
  v_fasce numeric[] := public.uni_list('pa_fasce');
  v_next int;
begin
  if not exists (select 1 from public.characters where id = p_character and (owner_id = auth.uid() or public.has_permission('personaggi.assegnare_px'))) then
    raise exception 'Non hai i permessi necessari.' using errcode = '42501';
  end if;
  select greatest(0, points + adjusted) into v_points from public.action_points where character_id = p_character and week_start = public.rome_week_start();
  v_points := coalesce(v_points, 0);
  select min(x)::int into v_next from unnest(v_fasce) x where x > v_points;
  return jsonb_build_object(
    'points', v_points,
    'package', public.xp_package(v_points),
    'next_at', v_next,
    'next_package', case when v_next is null then null else public.xp_package(v_next) end,
    'max_package', (select max(x)::int from unnest(public.uni_list('pa_pacchetti')) x),
    'min_chars', coalesce(public.setting_int('pa_caratteri_min'), 400),
    'earned', coalesce((select sum(px) from public.xp_awards where character_id = p_character), 0),
    'cap', coalesce(public.setting_int('px_tetto_totale'), 4000) - coalesce(public.setting_int('px_iniziali'), 1300),
    'last', (select jsonb_build_object('week', week_start, 'points', points, 'px', px) from public.xp_awards
             where character_id = p_character order by week_start desc limit 1));
end;
$$;
revoke execute on function public.my_action_points(uuid) from public, anon;
grant execute on function public.my_action_points(uuid) to authenticated;

-- staff: correggere i punti della settimana in corso (+ o −)
create or replace function public.action_points_adjust(p_character uuid, p_delta int)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total int;
begin
  if not public.has_permission('personaggi.assegnare_px') then raise exception 'Non hai il permesso di assegnare PX.' using errcode = '42501'; end if;
  if p_delta is null or p_delta = 0 or abs(p_delta) > 500 then raise exception 'Correzione non valida.' using errcode = 'P0001'; end if;
  insert into public.action_points (character_id, week_start, points, adjusted)
  values (p_character, public.rome_week_start(), 0, p_delta)
  on conflict (character_id, week_start) do update set adjusted = public.action_points.adjusted + p_delta
  returning greatest(0, points + adjusted) into v_total;
  return v_total;
end;
$$;
revoke execute on function public.action_points_adjust(uuid, int) from public, anon;
grant execute on function public.action_points_adjust(uuid, int) to authenticated;

-- staff: elenco della settimana in corso e della precedente
create or replace function public.action_points_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_permission('personaggi.assegnare_px') then raise exception 'Non hai il permesso di assegnare PX.' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'character_id', c.id, 'name', c.name, 'px', c.px,
      'points', coalesce(cur.points, 0), 'adjusted', coalesce(cur.adjusted, 0),
      'package', public.xp_package(greatest(0, coalesce(cur.points, 0) + coalesce(cur.adjusted, 0))),
      'last_points', last.points, 'last_px', last.px,
      'earned', coalesce((select sum(px) from public.xp_awards where character_id = c.id), 0)
    ) order by greatest(0, coalesce(cur.points, 0) + coalesce(cur.adjusted, 0)) desc, c.name)
    from public.characters c
    left join public.action_points cur on cur.character_id = c.id and cur.week_start = public.rome_week_start()
    left join public.xp_awards last on last.character_id = c.id and last.week_start = public.rome_week_start() - 7
    where c.status = 'approvata'), '[]'::jsonb);
end;
$$;
revoke execute on function public.action_points_list() from public, anon;
grant execute on function public.action_points_list() to authenticated;

-- ogni lunedì all'1:30 UTC (2:30 o 3:30 in Italia)
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('px-lunedi', '30 1 * * 1', 'select public.xp_weekly_award()');
exception when others then
  raise notice 'pg_cron non disponibile: %', sqlerrm;
end $$;

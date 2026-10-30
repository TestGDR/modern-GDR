-- =====================================================================
-- COMBATTIMENTO, DANNI, FERITE E SALUTE — FASE A (risse a mani nude)
-- Dal documento "Neon Campus · Specifiche combattimento" v1.0.
-- Tutti i tiri li fa il database. Niente Stamina. 0 PF = fuori
-- combattimento, mai morte automatica.
--
-- Decisioni prese con l'utente (30/10/2026):
-- - "Rissa" è un'abilità nuova (resta anche "Autodifesa e arti marziali");
--   si aggiungono Parare, Armi da taglio, Armi da fuoco (Schivare c'è già).
-- - Difesa senza tempo limite: se il bersaglio non risponde decide il Master.
-- - In chat l'esito lo vedono tutti; i numeri (dadi, PF, margini) solo lo
--   staff e i Master (combat_log).
-- - Ogni giocatore in giocata può avviare uno scontro.
-- Regole provvisorie (da confermare, vedi §14 del documento):
-- - parità di iniziativa: RIF più alto, poi ordine fisso;
-- - spinta e presa: effetto (a terra / trattenuto) fino al prossimo turno
--   di chi l'ha fatta, solo narrativo;
-- - guarigione ferite: lieve 2 giorni, moderata 5, grave 14, molto grave
--   la chiude lo staff.
-- Fase B (dopo): armi, primo soccorso, emergenza medica.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ABILITÀ DI COMBATTIMENTO (senza doppioni)
-- ---------------------------------------------------------------------
insert into public.skills (attribute_id, name, description, category, sort_order)
select a.id, v.name, v.description, v.category, 100 + v.ord
from public.attributes a
cross join (values
  ('Rissa', 'Combattere a mani nude: pugni, calci, colpi improvvisati', 'Sport', 1),
  ('Schivare', 'Evitare colpi e ostacoli, reagire d''istinto', 'Pratico', 2),
  ('Parare', 'Bloccare e deviare i colpi con braccia e corpo', 'Sport', 3),
  ('Armi da taglio', 'Coltelli e lame: usarle e difendersi', 'Pratico', 4),
  ('Armi da fuoco', 'Pistole: mira, sicurezza, ricarica', 'Pratico', 5)
) as v (name, description, category, ord)
where a.code = 'RIF'
  and not exists (select 1 from public.skills s where lower(s.name) = lower(v.name));

-- ---------------------------------------------------------------------
-- 2. DADI (d10 esplosivo, 1 = 1 - secondo d10)
-- ---------------------------------------------------------------------
-- Un dado. Per i test si possono imporre i risultati con la variabile di
-- sessione app.dadi_test ("7,3,10,…"): non raggiungibile dal sito.
create or replace function public.combat_die(p_sides int)
returns int
language plpgsql
set search_path = ''
as $$
declare
  v_list text := nullif(current_setting('app.dadi_test', true), '');
  v_first text;
begin
  if v_list is not null then
    v_first := split_part(v_list, ',', 1);
    perform set_config('app.dadi_test', substr(v_list, char_length(v_first) + 2), true);
    return v_first::int;
  end if;
  return 1 + floor(random() * p_sides)::int;
end;
$$;
revoke execute on function public.combat_die(int) from public, anon, authenticated;

-- d10 di Neon Campus: { "dice": [..], "value": n }
create or replace function public.combat_d10()
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_first int := public.combat_die(10);
  v_dice int[] := array[v_first];
  v_next int;
  v_total int := v_first;
  i int := 0;
begin
  if v_first = 10 then
    loop
      i := i + 1;
      v_next := public.combat_die(10);
      v_dice := v_dice || v_next;
      v_total := v_total + v_next;
      exit when v_next < 10 or i >= 20; -- limite di sicurezza
    end loop;
  elsif v_first = 1 then
    v_next := public.combat_die(10);
    v_dice := v_dice || v_next;
    v_total := 1 - v_next;
  end if;
  return jsonb_build_object('dice', to_jsonb(v_dice), 'value', v_total);
end;
$$;
revoke execute on function public.combat_d10() from public, anon, authenticated;

-- Valore di una caratteristica (per codice) e di un'abilità (per nome)
create or replace function public.combat_attr(p_character uuid, p_code text)
returns int
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select ca.value from public.character_attributes ca join public.attributes a on a.id = ca.attribute_id
    where ca.character_id = p_character and a.code = p_code), 0)
$$;

create or replace function public.combat_skill(p_character uuid, p_name text)
returns int
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select cs.level from public.character_skills cs join public.skills s on s.id = cs.skill_id
    where cs.character_id = p_character and lower(s.name) = lower(p_name) limit 1), 0)
$$;

-- Tratti (vantaggi/svantaggi): tra -tetto e +tetto (3), come nei tiri normali
create or replace function public.combat_traits(p_character uuid, p_skill_name text)
returns int
language sql
stable
set search_path = ''
as $$
  select greatest(-coalesce(public.setting_int('tetto_modificatori'), 3),
         least(coalesce(public.setting_int('tetto_modificatori'), 3), coalesce(sum(o.roll_modifier), 0)::int))
  from public.character_options co
  join public.creation_options o on o.id = co.option_id
  where co.character_id = p_character
    and o.roll_modifier is not null
    and (o.roll_skill_id is null or o.roll_skill_id = (select s.id from public.skills s where lower(s.name) = lower(p_skill_name) limit 1))
$$;

revoke execute on function public.combat_attr(uuid, text), public.combat_skill(uuid, text), public.combat_traits(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. SALUTE: PF, FERITE, REGISTRO DELLO STAFF
-- ---------------------------------------------------------------------
create table public.character_health (
  character_id uuid primary key references public.characters (id) on delete cascade,
  hp int not null check (hp >= 0),
  status text not null default 'ok' check (status in ('ok', 'fuori_combattimento', 'emergenza_medica')),
  -- recupero: si conta a giorni interi da max(ultima ferita, ultimo recupero)
  last_wound_at timestamptz,
  recovered_until timestamptz,
  updated_at timestamptz not null default now()
);

create table public.character_wounds (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters (id) on delete cascade,
  zone text not null check (zone in ('testa', 'tronco', 'braccio', 'gamba')),
  severity text not null check (severity in ('lieve', 'moderata', 'grave', 'molto_grave')),
  penalty int not null default 0 check (penalty between -3 and 0),
  combat_id uuid,
  created_at timestamptz not null default now(),
  heals_at timestamptz,
  healed_at timestamptz,
  healed_by text
);
create index character_wounds_character_idx on public.character_wounds (character_id, healed_at);

-- Ogni intervento dello staff su PF, stato e ferite (non si cancella)
create table public.health_log (
  id bigint generated always as identity primary key,
  character_id uuid not null references public.characters (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  actor_name text not null default '',
  change text not null,
  reason text not null default '',
  created_at timestamptz not null default now()
);
create index health_log_character_idx on public.health_log (character_id, created_at desc);

-- PF e ferite: li vedono il proprietario e lo staff (anche i Master)
create or replace function public.can_see_health(p_character uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.characters c where c.id = p_character and c.owner_id = auth.uid())
    or public.has_permission('personaggi.vedere_tutti')
    or public.has_permission('combattimento.gestire')
    or public.has_permission('chat.narrazione')
$$;
revoke execute on function public.can_see_health(uuid) from public, anon;
grant execute on function public.can_see_health(uuid) to authenticated;

alter table public.character_health enable row level security;
alter table public.character_wounds enable row level security;
alter table public.health_log enable row level security;
revoke all on public.character_health, public.character_wounds, public.health_log from anon, authenticated;
grant select on public.character_health, public.character_wounds, public.health_log to authenticated;
create policy "Salute: proprietario e staff" on public.character_health for select to authenticated using ((select public.can_see_health(character_id)));
create policy "Salute: solo dalle funzioni" on public.character_health for insert to authenticated with check (false);
create policy "Salute: modificata solo dalle funzioni" on public.character_health for update to authenticated using (false);
create policy "Salute: non si cancella" on public.character_health for delete to authenticated using (false);
create policy "Ferite: proprietario e staff" on public.character_wounds for select to authenticated using ((select public.can_see_health(character_id)));
create policy "Ferite: solo dalle funzioni" on public.character_wounds for insert to authenticated with check (false);
create policy "Ferite: modificate solo dalle funzioni" on public.character_wounds for update to authenticated using (false);
create policy "Ferite: non si cancellano" on public.character_wounds for delete to authenticated using (false);
create policy "Registro salute: lo staff" on public.health_log for select to authenticated
  using ((select public.has_permission('combattimento.gestire')));
create policy "Registro salute: solo dalle funzioni" on public.health_log for insert to authenticated with check (false);
create policy "Registro salute: non si modifica" on public.health_log for update to authenticated using (false);
create policy "Registro salute: non si cancella" on public.health_log for delete to authenticated using (false);

-- PF massimi = VIG x 10, REC = VIG
create or replace function public.hp_max(p_character uuid)
returns int
language sql
stable
set search_path = ''
as $$ select greatest(1, public.combat_attr(p_character, 'VIG')) * 10 $$;

-- Salute del personaggio (la crea piena se manca) con recupero e guarigioni applicati
create or replace function public.health_refresh(p_character uuid)
returns public.character_health
language plpgsql
security definer
set search_path = ''
as $$
declare
  h public.character_health;
  v_max int := public.hp_max(p_character);
  v_rec int := greatest(1, public.combat_attr(p_character, 'VIG'));
  v_base timestamptz;
  v_days int;
begin
  insert into public.character_health (character_id, hp) values (p_character, v_max) on conflict do nothing;
  select * into h from public.character_health where character_id = p_character for update;
  -- ferite guarite col tempo
  update public.character_wounds set healed_at = heals_at, healed_by = 'tempo'
  where character_id = p_character and healed_at is null and heals_at is not null and heals_at <= now();
  -- recupero naturale: +REC ogni 24 ore complete (mai oltre il massimo, mai due volte)
  v_base := greatest(coalesce(h.last_wound_at, '-infinity'), coalesce(h.recovered_until, '-infinity'));
  if v_base > '-infinity'::timestamptz and h.hp < v_max then
    v_days := floor(extract(epoch from (now() - v_base)) / 86400)::int;
    if v_days >= 1 then
      h.hp := least(v_max, h.hp + v_days * v_rec);
      h.recovered_until := v_base + make_interval(days => v_days);
      if h.status = 'fuori_combattimento' and h.hp > 0 then h.status := 'ok'; end if;
      update public.character_health set hp = h.hp, recovered_until = h.recovered_until, status = h.status, updated_at = now()
      where character_id = p_character;
    end if;
  end if;
  if h.hp > v_max then
    update public.character_health set hp = v_max, updated_at = now() where character_id = p_character;
    h.hp := v_max;
  end if;
  return h;
end;
$$;
revoke execute on function public.health_refresh(uuid) from public, anon, authenticated;

-- Per la scheda: PF, massimo, REC, stato e ferite attive
create or replace function public.character_health_get(p_character uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  h public.character_health;
begin
  if not public.can_see_health(p_character) then
    raise exception 'Non hai i permessi necessari.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.characters where id = p_character and status = 'approvata') then
    return null;
  end if;
  h := public.health_refresh(p_character);
  return jsonb_build_object(
    'hp', h.hp,
    'max', public.hp_max(p_character),
    'rec', greatest(1, public.combat_attr(p_character, 'VIG')),
    'status', h.status,
    'wounds', coalesce((
      select jsonb_agg(jsonb_build_object('id', w.id, 'zone', w.zone, 'severity', w.severity, 'penalty', w.penalty,
                                          'created_at', w.created_at, 'heals_at', w.heals_at) order by w.created_at desc)
      from public.character_wounds w where w.character_id = p_character and w.healed_at is null), '[]'::jsonb)
  );
end;
$$;
revoke execute on function public.character_health_get(uuid) from public, anon;
grant execute on function public.character_health_get(uuid) to authenticated;

-- Recupero di tutti (pg_cron ogni ora: idempotente)
create or replace function public.health_recover_all()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in select character_id from public.character_health loop
    perform public.health_refresh(r.character_id);
  end loop;
end;
$$;
revoke execute on function public.health_recover_all() from public, anon, authenticated;

-- Penalità della ferita peggiore nelle zone indicate (non si sommano)
create or replace function public.wound_penalty(p_character uuid, p_zones text[])
returns int
language sql
stable
set search_path = ''
as $$
  select coalesce(min(w.penalty), 0)
  from public.character_wounds w
  where w.character_id = p_character and w.healed_at is null and w.zone = any (p_zones)
$$;
revoke execute on function public.wound_penalty(uuid, text[]) from public, anon, authenticated;

-- Staff: PF, stato e ferite (tutto registrato)
create or replace function public.health_staff_set(p_character uuid, p_hp int, p_status text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  h public.character_health;
  v_max int := public.hp_max(p_character);
begin
  if not public.has_permission('combattimento.gestire') then
    raise exception 'Non hai il permesso di modificare la salute.' using errcode = '42501';
  end if;
  if p_status not in ('ok', 'fuori_combattimento', 'emergenza_medica') then
    raise exception 'Stato non valido.' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Scrivi il motivo.' using errcode = 'P0001';
  end if;
  h := public.health_refresh(p_character);
  update public.character_health
  set hp = greatest(0, least(v_max, p_hp)), status = p_status, updated_at = now(),
      recovered_until = case when greatest(0, least(v_max, p_hp)) <> h.hp then now() else recovered_until end
  where character_id = p_character;
  insert into public.health_log (character_id, actor_id, actor_name, change, reason)
  values (p_character, auth.uid(), public.my_display_name(),
          'PF ' || h.hp || ' → ' || greatest(0, least(v_max, p_hp)) || ', stato ' || h.status || ' → ' || p_status, btrim(p_reason));
end;
$$;

create or replace function public.wound_staff_heal(p_wound uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  w public.character_wounds;
begin
  if not public.has_permission('combattimento.gestire') then
    raise exception 'Non hai il permesso di curare le ferite.' using errcode = '42501';
  end if;
  select * into w from public.character_wounds where id = p_wound and healed_at is null;
  if w.id is null then raise exception 'Ferita non trovata o già guarita.' using errcode = 'P0001'; end if;
  update public.character_wounds set healed_at = now(), healed_by = public.my_display_name() where id = p_wound;
  insert into public.health_log (character_id, actor_id, actor_name, change, reason)
  values (w.character_id, auth.uid(), public.my_display_name(),
          'Ferita ' || w.severity || ' (' || w.zone || ') guarita', btrim(coalesce(p_reason, '')));
end;
$$;
revoke execute on function public.health_staff_set(uuid, int, text, text), public.wound_staff_heal(uuid, text) from public, anon;
grant execute on function public.health_staff_set(uuid, int, text, text), public.wound_staff_heal(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. SCONTRI, PARTECIPANTI, AZIONI E REGISTRO DEI TIRI
-- ---------------------------------------------------------------------
create table public.combats (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  status text not null default 'in_corso' check (status in ('in_corso', 'chiuso')),
  round int not null default 1,
  turn_order uuid[] not null default '{}',
  turn_index int not null default 0,
  created_by uuid references public.characters (id) on delete set null,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create unique index combats_one_active_per_room on public.combats (room_id) where status = 'in_corso';
create index combats_created_by_idx on public.combats (created_by);

create table public.combat_participants (
  combat_id uuid not null references public.combats (id) on delete cascade,
  character_id uuid not null references public.characters (id) on delete cascade,
  name text not null default '',
  initiative int not null default 0,
  rif int not null default 0,
  out boolean not null default false,
  -- spinto a terra / trattenuto: fino al prossimo turno di chi l'ha fatto
  condition text check (condition in ('a_terra', 'trattenuto')),
  condition_by uuid references public.characters (id) on delete set null,
  joined_at timestamptz not null default now(),
  primary key (combat_id, character_id)
);
create index combat_participants_character_idx on public.combat_participants (character_id);
create index combat_participants_condition_by_idx on public.combat_participants (condition_by);

create table public.combat_actions (
  id bigint generated always as identity primary key,
  combat_id uuid not null references public.combats (id) on delete cascade,
  round int not null,
  attacker_id uuid not null references public.characters (id) on delete cascade,
  target_id uuid not null references public.characters (id) on delete cascade,
  action text not null check (action in ('normale', 'veloce', 'forte', 'mirato', 'spingere', 'afferrare')),
  zone_aimed text check (zone_aimed in ('testa', 'tronco', 'braccio', 'gamba')),
  status text not null default 'attesa_difesa' check (status in ('attesa_difesa', 'risolta', 'annullata')),
  defense text check (defense in ('schivare', 'parare', 'incassare')),
  outcome text not null default '',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text
);
create index combat_actions_combat_idx on public.combat_actions (combat_id, created_at);
create index combat_actions_attacker_idx on public.combat_actions (attacker_id);
create index combat_actions_target_idx on public.combat_actions (target_id);
-- un solo attacco in attesa per scontro (niente doppioni da doppio clic)
create unique index combat_actions_one_pending on public.combat_actions (combat_id) where status = 'attesa_difesa';

-- Il dettaglio dei tiri (dadi, statistiche, modificatori, margini, PF): solo staff e Master
create table public.combat_log (
  id bigint generated always as identity primary key,
  combat_id uuid not null references public.combats (id) on delete cascade,
  action_id bigint references public.combat_actions (id) on delete cascade,
  message_id bigint references public.messages (id) on delete set null,
  detail jsonb not null,
  created_at timestamptz not null default now()
);
create index combat_log_combat_idx on public.combat_log (combat_id);
create index combat_log_action_idx on public.combat_log (action_id);
create index combat_log_message_idx on public.combat_log (message_id);

alter table public.combats enable row level security;
alter table public.combat_participants enable row level security;
alter table public.combat_actions enable row level security;
alter table public.combat_log enable row level security;
revoke all on public.combats, public.combat_participants, public.combat_actions, public.combat_log from anon, authenticated;
grant select on public.combats, public.combat_participants, public.combat_actions, public.combat_log to authenticated;
create policy "Scontri: chi può entrare nella chat" on public.combats for select to authenticated using ((select public.can_enter_room(room_id)));
create policy "Partecipanti: chi può entrare nella chat" on public.combat_participants for select to authenticated
  using (exists (select 1 from public.combats c where c.id = combat_id and public.can_enter_room(c.room_id)));
create policy "Azioni: chi può entrare nella chat" on public.combat_actions for select to authenticated
  using (exists (select 1 from public.combats c where c.id = combat_id and public.can_enter_room(c.room_id)));
create policy "Tiri: staff e Master" on public.combat_log for select to authenticated
  using ((select public.has_permission('combattimento.gestire')) or (select public.has_permission('chat.narrazione')));
create policy "Scontri: solo dalle funzioni" on public.combats for insert to authenticated with check (false);
create policy "Scontri: modificati dalle funzioni" on public.combats for update to authenticated using (false);
create policy "Scontri: non si cancellano" on public.combats for delete to authenticated using (false);
create policy "Partecipanti: solo dalle funzioni" on public.combat_participants for insert to authenticated with check (false);
create policy "Partecipanti: modificati dalle funzioni" on public.combat_participants for update to authenticated using (false);
create policy "Partecipanti: non si cancellano" on public.combat_participants for delete to authenticated using (false);
create policy "Azioni: solo dalle funzioni" on public.combat_actions for insert to authenticated with check (false);
create policy "Azioni: modificate dalle funzioni" on public.combat_actions for update to authenticated using (false);
create policy "Azioni: non si cancellano" on public.combat_actions for delete to authenticated using (false);
create policy "Tiri: solo dalle funzioni" on public.combat_log for insert to authenticated with check (false);
create policy "Tiri: non si modificano" on public.combat_log for update to authenticated using (false);
create policy "Tiri: non si cancellano" on public.combat_log for delete to authenticated using (false);

-- Messaggi di combattimento in chat (esito per tutti)
alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check
  check (kind in ('azione', 'fuori_gioco', 'master', 'dado', 'sistema', 'sussurro', 'combattimento'));

-- Il limite dei caratteri non vale per i messaggi scritti dal database
create or replace function public.chat_message_length_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max int;
  r public.rooms;
begin
  if new.kind in ('dado', 'sistema', 'combattimento') then return new; end if;
  select max_length into v_max from public.chat_settings limit 1;
  if new.kind = 'azione' then
    select * into r from public.rooms where id = new.room_id;
    if r.master_max is not null then
      if char_length(new.content) > r.master_max then
        raise exception 'Modalità master: l''azione supera il limite di % caratteri.', r.master_max using errcode = 'P0001';
      end if;
      if char_length(new.content) < coalesce(r.master_min, 0) then
        raise exception 'Modalità master: l''azione deve avere almeno % caratteri.', r.master_min using errcode = 'P0001';
      end if;
      return new;
    end if;
  end if;
  if v_max is not null and char_length(new.content) > v_max then
    raise exception 'Il messaggio supera il limite di % caratteri.', v_max using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- Master: chi narra o chi gestisce il combattimento
create or replace function public.combat_is_master()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select public.has_permission('chat.narrazione') or public.has_permission('combattimento.gestire') $$;
revoke execute on function public.combat_is_master() from public, anon, authenticated;

-- Scrive in chat l'esito (e nel registro il dettaglio)
create or replace function public.combat_say(p_combat uuid, p_action bigint, p_character uuid, p_text text, p_detail jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room uuid;
  v_msg bigint;
begin
  select room_id into v_room from public.combats where id = p_combat;
  insert into public.messages (room_id, character_id, kind, content)
  values (v_room, p_character, 'combattimento', left(p_text, 3900))
  returning id into v_msg;
  if p_detail is not null then
    insert into public.combat_log (combat_id, action_id, message_id, detail) values (p_combat, p_action, v_msg, p_detail);
  end if;
  return v_msg;
end;
$$;
revoke execute on function public.combat_say(uuid, bigint, uuid, text, jsonb) from public, anon, authenticated;

-- Iniziativa: RIF + d10 + tratti
create or replace function public.combat_initiative(p_character uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_rif int := public.combat_attr(p_character, 'RIF');
  v_mod int := public.combat_traits(p_character, '');
  d jsonb := public.combat_d10();
begin
  return jsonb_build_object('rif', v_rif, 'mods', v_mod, 'dice', d -> 'dice', 'd10', (d ->> 'value')::int,
                            'total', v_rif + v_mod + (d ->> 'value')::int);
end;
$$;
revoke execute on function public.combat_initiative(uuid) from public, anon, authenticated;

-- Riordina il turno per iniziativa (parità: RIF più alto, poi ordine fisso)
create or replace function public.combat_reorder(p_combat uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.combats set turn_order = array(
    select p.character_id from public.combat_participants p
    where p.combat_id = p_combat
    order by p.initiative desc, p.rif desc, p.joined_at, p.character_id)
  where id = p_combat
$$;
revoke execute on function public.combat_reorder(uuid) from public, anon, authenticated;

-- Il personaggio può combattere? (approvato, presente nella chat, non fuori combattimento)
create or replace function public.combat_can_fight(p_character uuid, p_room uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  h public.character_health;
begin
  if not exists (select 1 from public.characters where id = p_character and status = 'approvata') then return false; end if;
  if not exists (select 1 from public.chat_presence where room_id = p_room and character_id = p_character
                 and last_active_at > now() - public.chat_idle()) then return false; end if;
  h := public.health_refresh(p_character);
  return h.status = 'ok' and h.hp > 0;
end;
$$;
revoke execute on function public.combat_can_fight(uuid, uuid) from public, anon, authenticated;

-- Passa al prossimo che può agire; chiude lo scontro se resta al massimo uno in piedi
create or replace function public.combat_advance(p_combat uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.combats;
  v_alive int;
  v_n int;
  v_next int;
  v_who uuid;
  v_name text;
  i int := 0;
begin
  select * into c from public.combats where id = p_combat for update;
  select count(*) into v_alive from public.combat_participants where combat_id = p_combat and not out;
  if v_alive <= 1 then
    update public.combats set status = 'chiuso', closed_at = now() where id = p_combat;
    select p.character_id, p.name into v_who, v_name from public.combat_participants p where p.combat_id = p_combat and not p.out limit 1;
    perform public.combat_say(p_combat, null, coalesce(v_who, c.created_by, c.turn_order[1]),
      'Lo scontro è finito' || coalesce(': resta in piedi ' || public.first_name(v_name), '') || '.', null);
    return;
  end if;
  v_n := coalesce(array_length(c.turn_order, 1), 0);
  v_next := c.turn_index;
  loop
    i := i + 1;
    v_next := v_next + 1;
    if v_next >= v_n then
      v_next := 0;
      c.round := c.round + 1;
    end if;
    v_who := c.turn_order[v_next + 1];
    exit when exists (select 1 from public.combat_participants where combat_id = p_combat and character_id = v_who and not out) or i > v_n + 1;
  end loop;
  update public.combats set turn_index = v_next, round = c.round where id = p_combat;
  -- finisce l'effetto di spinte e prese fatte da chi ora agisce
  update public.combat_participants set condition = null, condition_by = null where combat_id = p_combat and condition_by = v_who;
  select name into v_name from public.combat_participants where combat_id = p_combat and character_id = v_who;
  perform public.combat_say(p_combat, null, v_who, 'Tocca a ' || public.first_name(v_name) || ' (round ' || c.round || ').', null);
end;
$$;
revoke execute on function public.combat_advance(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. AZIONI DEI GIOCATORI
-- ---------------------------------------------------------------------
-- Avvia uno scontro in chat contro uno o più presenti
create or replace function public.combat_start(p_room uuid, p_character uuid, p_opponents uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_combat uuid;
  v_id uuid;
  v_ini jsonb;
  v_names text;
  v_detail jsonb := '[]'::jsonb;
  v_first uuid;
begin
  if not public.owns_character(p_character) then raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501'; end if;
  if not public.combat_can_fight(p_character, p_room) then
    raise exception 'Per combattere devi essere in giocata in questa chat e non fuori combattimento.' using errcode = 'P0001';
  end if;
  if coalesce(array_length(p_opponents, 1), 0) = 0 then raise exception 'Scegli almeno un avversario.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.combats where room_id = p_room and status = 'in_corso') then
    raise exception 'In questa chat c''è già uno scontro in corso: unisciti a quello.' using errcode = 'P0001';
  end if;
  foreach v_id in array p_opponents loop
    if v_id = p_character or not public.combat_can_fight(v_id, p_room) then
      raise exception 'Un avversario non è in giocata qui o non può combattere.' using errcode = 'P0001';
    end if;
  end loop;

  insert into public.combats (room_id, created_by) values (p_room, p_character) returning id into v_combat;
  foreach v_id in array (array[p_character] || p_opponents) loop
    v_ini := public.combat_initiative(v_id);
    insert into public.combat_participants (combat_id, character_id, name, initiative, rif)
    select v_combat, v_id, c.name, (v_ini ->> 'total')::int, (v_ini ->> 'rif')::int from public.characters c where c.id = v_id
    on conflict do nothing;
    v_detail := v_detail || jsonb_build_object('character_id', v_id, 'iniziativa', v_ini);
  end loop;
  perform public.combat_reorder(v_combat);
  select string_agg(public.first_name(p.name), ', ' order by array_position(c.turn_order, p.character_id))
    into v_names
  from public.combat_participants p join public.combats c on c.id = p.combat_id where p.combat_id = v_combat;
  select turn_order[1] into v_first from public.combats where id = v_combat;
  perform public.combat_say(v_combat, null, p_character,
    'Inizia uno scontro! Ordine di turno: ' || v_names || '. Tocca a '
      || public.first_name((select name from public.combat_participants where combat_id = v_combat and character_id = v_first)) || '.',
    jsonb_build_object('tipo', 'iniziativa', 'tiri', v_detail));
  return v_combat;
end;
$$;

-- Entra in uno scontro già iniziato
create or replace function public.combat_join(p_combat uuid, p_character uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.combats;
  v_ini jsonb;
  v_current uuid;
begin
  select * into c from public.combats where id = p_combat and status = 'in_corso' for update;
  if c.id is null then raise exception 'Scontro non in corso.' using errcode = 'P0001'; end if;
  if not public.owns_character(p_character) then raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501'; end if;
  if not public.combat_can_fight(p_character, c.room_id) then
    raise exception 'Per combattere devi essere in giocata in questa chat e non fuori combattimento.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.combat_participants where combat_id = p_combat and character_id = p_character) then
    raise exception 'Sei già nello scontro.' using errcode = 'P0001';
  end if;
  v_current := c.turn_order[c.turn_index + 1];
  v_ini := public.combat_initiative(p_character);
  insert into public.combat_participants (combat_id, character_id, name, initiative, rif)
  select p_combat, p_character, ch.name, (v_ini ->> 'total')::int, (v_ini ->> 'rif')::int from public.characters ch where ch.id = p_character;
  perform public.combat_reorder(p_combat);
  -- il turno resta a chi lo aveva
  update public.combats set turn_index = array_position(turn_order, v_current) - 1 where id = p_combat;
  perform public.combat_say(p_combat, null, p_character,
    public.first_name((select name from public.characters where id = p_character)) || ' entra nello scontro.',
    jsonb_build_object('tipo', 'iniziativa', 'tiri', jsonb_build_array(jsonb_build_object('character_id', p_character, 'iniziativa', v_ini))));
end;
$$;

-- Attacco nel proprio turno: il bersaglio poi sceglie la difesa
create or replace function public.combat_attack(p_combat uuid, p_character uuid, p_target uuid, p_action text, p_zone text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.combats;
  v_id bigint;
  v_att text;
  v_tgt text;
  v_label text;
begin
  select * into c from public.combats where id = p_combat and status = 'in_corso' for update;
  if c.id is null then raise exception 'Scontro non in corso.' using errcode = 'P0001'; end if;
  if not public.owns_character(p_character) then raise exception 'Non è un tuo personaggio.' using errcode = '42501'; end if;
  if c.turn_order[c.turn_index + 1] is distinct from p_character then raise exception 'Non è il tuo turno.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.combat_actions where combat_id = p_combat and status = 'attesa_difesa') then
    raise exception 'C''è già un attacco in attesa di difesa.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.combat_participants where combat_id = p_combat and character_id = p_character and not out) then
    raise exception 'Sei fuori combattimento.' using errcode = 'P0001';
  end if;
  if p_target = p_character or not exists (select 1 from public.combat_participants where combat_id = p_combat and character_id = p_target and not out) then
    raise exception 'Bersaglio non valido.' using errcode = 'P0001';
  end if;
  if p_action not in ('normale', 'veloce', 'forte', 'mirato', 'spingere', 'afferrare') then
    raise exception 'Azione non valida.' using errcode = 'P0001';
  end if;
  if p_action = 'mirato' and coalesce(p_zone, '') not in ('testa', 'tronco', 'braccio', 'gamba') then
    raise exception 'Scegli la zona da colpire.' using errcode = 'P0001';
  end if;
  insert into public.combat_actions (combat_id, round, attacker_id, target_id, action, zone_aimed)
  values (p_combat, c.round, p_character, p_target, p_action, case when p_action = 'mirato' then p_zone end)
  returning id into v_id;
  select name into v_att from public.combat_participants where combat_id = p_combat and character_id = p_character;
  select name into v_tgt from public.combat_participants where combat_id = p_combat and character_id = p_target;
  v_label := case p_action
    when 'normale' then 'attacca' when 'veloce' then 'tenta un attacco veloce (due colpi) contro'
    when 'forte' then 'tenta un attacco forte contro' when 'mirato' then 'mira ' || case p_zone when 'testa' then 'alla testa' when 'tronco' then 'al tronco' when 'braccio' then 'a un braccio' else 'a una gamba' end || ' di'
    when 'spingere' then 'prova a spingere a terra' else 'prova ad afferrare' end;
  perform public.combat_say(p_combat, v_id, p_character,
    public.first_name(v_att) || ' ' || v_label || ' ' || public.first_name(v_tgt) || '. ' || public.first_name(v_tgt) || ' sceglie come difendersi.', null);
  return v_id;
end;
$$;

-- Difesa (il bersaglio, oppure il Master se il bersaglio non risponde): risolve l'attacco
create or replace function public.combat_defend(p_action bigint, p_character uuid, p_defense text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.combat_actions;
  c public.combats;
  v_master boolean := public.combat_is_master();
  v_hits int;
  k int;
  v_rif_a int; v_rissa int; v_traits_a int; v_pen_a int; v_mod int;
  v_rif_d int; v_skill_d int; v_traits_d int; v_pen_d int;
  da jsonb; dd jsonb;
  v_att int; v_def int; v_margin int; v_hit boolean;
  v_vig int; v_d4 int; v_base int; v_dmg int; v_zone text; v_zd int; v_crit text; v_extra int; v_pen int;
  v_heal interval;
  h public.character_health;
  v_hp_before int;
  v_att_name text; v_tgt_name text;
  v_text text := '';
  v_detail jsonb := '[]'::jsonb;
  v_out boolean := false;
  v_zone_word text;
begin
  select * into a from public.combat_actions where id = p_action and status = 'attesa_difesa' for update;
  if a.id is null then raise exception 'Questo attacco è già stato risolto.' using errcode = 'P0001'; end if;
  select * into c from public.combats where id = a.combat_id for update;
  if not ((p_character = a.target_id and public.owns_character(p_character)) or v_master) then
    raise exception 'Può difendersi solo il bersaglio (o il Master).' using errcode = '42501';
  end if;
  if p_defense not in ('schivare', 'parare', 'incassare') then raise exception 'Difesa non valida.' using errcode = 'P0001'; end if;

  select name into v_att_name from public.combat_participants where combat_id = c.id and character_id = a.attacker_id;
  select name into v_tgt_name from public.combat_participants where combat_id = c.id and character_id = a.target_id;
  v_att_name := public.first_name(v_att_name);
  v_tgt_name := public.first_name(v_tgt_name);

  v_rif_a := public.combat_attr(a.attacker_id, 'RIF');
  v_rissa := public.combat_skill(a.attacker_id, 'Rissa');
  v_traits_a := public.combat_traits(a.attacker_id, 'Rissa');
  v_pen_a := public.wound_penalty(a.attacker_id, array['braccio']);
  v_mod := case a.action when 'veloce' then -3 when 'forte' then -3 when 'spingere' then -2 when 'afferrare' then -2
    when 'mirato' then case a.zone_aimed when 'testa' then -6 when 'tronco' then -1 when 'braccio' then -3 else -2 end else 0 end;
  v_rif_d := public.combat_attr(a.target_id, 'RIF');
  v_skill_d := case p_defense when 'schivare' then public.combat_skill(a.target_id, 'Schivare') when 'parare' then public.combat_skill(a.target_id, 'Parare') else 0 end;
  v_traits_d := case p_defense when 'schivare' then public.combat_traits(a.target_id, 'Schivare') when 'parare' then public.combat_traits(a.target_id, 'Parare') else 0 end;
  v_pen_d := case p_defense when 'schivare' then public.wound_penalty(a.target_id, array['gamba']) when 'parare' then public.wound_penalty(a.target_id, array['braccio']) else 0 end;
  v_vig := public.combat_attr(a.attacker_id, 'VIG');

  v_hits := case when a.action = 'veloce' then 2 else 1 end;
  for k in 1..v_hits loop
    exit when v_out;
    da := public.combat_d10();
    v_att := v_rif_a + v_rissa + (da ->> 'value')::int + v_traits_a + v_mod + v_pen_a;
    if p_defense = 'incassare' then
      dd := null;
      v_def := null;
      v_hit := true;
      v_margin := greatest(0, v_att - 10);
    else
      dd := public.combat_d10();
      v_def := v_rif_d + v_skill_d + (dd ->> 'value')::int + v_traits_d + v_pen_d;
      v_hit := v_att > v_def; -- parità: vince la difesa
      v_margin := v_att - v_def;
    end if;

    if not v_hit then
      v_text := v_text || case when v_hits = 2 then 'Colpo ' || k || ': ' else '' end
        || v_tgt_name || case p_defense when 'schivare' then ' schiva' else ' para' end || ': ' || v_att_name || ' non va a segno. ';
      v_detail := v_detail || jsonb_build_object('colpo', k, 'attacco', jsonb_build_object('rif', v_rif_a, 'abilita', v_rissa, 'dadi', da -> 'dice', 'd10', (da ->> 'value')::int, 'tratti', v_traits_a, 'azione', v_mod, 'ferite', v_pen_a, 'totale', v_att),
        'difesa', jsonb_build_object('tipo', p_defense, 'rif', v_rif_d, 'abilita', v_skill_d, 'dadi', dd -> 'dice', 'd10', (dd ->> 'value')::int, 'tratti', v_traits_d, 'ferite', v_pen_d, 'totale', v_def),
        'riuscito', false, 'margine', v_margin);
      continue;
    end if;

    if a.action in ('spingere', 'afferrare') then
      update public.combat_participants
      set condition = case when a.action = 'spingere' then 'a_terra' else 'trattenuto' end, condition_by = a.attacker_id
      where combat_id = c.id and character_id = a.target_id;
      v_text := v_text || v_att_name || case when a.action = 'spingere' then ' spinge a terra ' else ' afferra e trattiene ' end || v_tgt_name || '. ';
      v_detail := v_detail || jsonb_build_object('colpo', k, 'attacco', jsonb_build_object('rif', v_rif_a, 'abilita', v_rissa, 'dadi', da -> 'dice', 'd10', (da ->> 'value')::int, 'tratti', v_traits_a, 'azione', v_mod, 'ferite', v_pen_a, 'totale', v_att),
        'difesa', jsonb_build_object('tipo', p_defense, 'totale', v_def), 'riuscito', true, 'margine', v_margin, 'manovra', a.action);
      continue;
    end if;

    -- danno base a mani nude dal Vigore di chi attacca
    v_d4 := public.combat_die(4);
    v_base := case when v_vig <= 2 then greatest(1, v_d4 - 2) when v_vig <= 4 then greatest(1, v_d4 - 1)
                   when v_vig <= 6 then v_d4 when v_vig <= 8 then v_d4 + 1 else v_d4 + 2 end;
    v_dmg := v_base;
    if a.action = 'forte' then v_dmg := ceil(v_dmg * 1.5)::int; end if;
    -- zona: mirata o d10
    if a.action = 'mirato' then
      v_zone := a.zone_aimed; v_zd := null;
    else
      v_zd := public.combat_die(10);
      v_zone := case when v_zd = 1 then 'testa' when v_zd <= 4 then 'tronco' when v_zd <= 6 then 'braccio' else 'gamba' end;
    end if;
    v_dmg := ceil(v_dmg * case v_zone when 'testa' then 1.5 when 'tronco' then 1 else 0.5 end)::int;
    -- critico dal margine
    v_crit := case when v_margin >= 15 then 'molto_grave' when v_margin >= 13 then 'grave' when v_margin >= 10 then 'moderata' when v_margin >= 7 then 'lieve' else null end;
    v_extra := case v_crit when 'lieve' then 1 when 'moderata' then 2 when 'grave' then 4 when 'molto_grave' then 6 else 0 end;
    v_pen := case v_crit when 'moderata' then -1 when 'grave' then -2 when 'molto_grave' then -3 else 0 end;
    v_dmg := v_dmg + v_extra;

    h := public.health_refresh(a.target_id);
    v_hp_before := h.hp;
    h.hp := greatest(0, h.hp - v_dmg);
    update public.character_health
    set hp = h.hp, last_wound_at = now(), recovered_until = null,
        status = case when h.hp = 0 then 'fuori_combattimento' else status end, updated_at = now()
    where character_id = a.target_id;
    if v_crit is not null then
      v_heal := case v_crit when 'lieve' then interval '2 days' when 'moderata' then interval '5 days' when 'grave' then interval '14 days' else null end;
      insert into public.character_wounds (character_id, zone, severity, penalty, combat_id, heals_at)
      values (a.target_id, v_zone, v_crit, v_pen, c.id, now() + v_heal);
    end if;
    v_zone_word := case v_zone when 'testa' then 'alla testa' when 'tronco' then 'al tronco' when 'braccio' then 'a un braccio' else 'a una gamba' end;
    v_text := v_text || case when v_hits = 2 then 'Colpo ' || k || ': ' else '' end
      || v_att_name || ' colpisce ' || v_tgt_name || ' ' || v_zone_word
      || case v_crit when 'lieve' then ' (ferita lieve)' when 'moderata' then ' (ferita moderata)' when 'grave' then ' (ferita grave)' when 'molto_grave' then ' (ferita molto grave)' else '' end || '. ';
    if h.hp = 0 then
      update public.combat_participants set out = true where combat_id = c.id and character_id = a.target_id;
      v_out := true;
      v_text := v_text || v_tgt_name || ' è fuori combattimento. ';
    end if;
    v_detail := v_detail || jsonb_build_object('colpo', k,
      'attacco', jsonb_build_object('rif', v_rif_a, 'abilita', v_rissa, 'dadi', da -> 'dice', 'd10', (da ->> 'value')::int, 'tratti', v_traits_a, 'azione', v_mod, 'ferite', v_pen_a, 'totale', v_att),
      'difesa', jsonb_build_object('tipo', p_defense, 'rif', v_rif_d, 'abilita', v_skill_d, 'dadi', dd -> 'dice', 'd10', (dd ->> 'value')::int, 'tratti', v_traits_d, 'ferite', v_pen_d, 'totale', v_def),
      'riuscito', true, 'margine', v_margin,
      'danno', jsonb_build_object('vig', v_vig, 'd4', v_d4, 'base', v_base, 'forte', a.action = 'forte', 'zona', v_zone, 'dado_zona', v_zd,
                                  'critico', v_crit, 'extra', v_extra, 'penalita', v_pen, 'totale', v_dmg),
      'pf', jsonb_build_object('prima', v_hp_before, 'dopo', h.hp, 'max', public.hp_max(a.target_id)));
  end loop;

  update public.combat_actions
  set status = 'risolta', defense = p_defense, outcome = btrim(v_text), resolved_at = now(),
      resolved_by = case when p_character = a.target_id and public.owns_character(p_character) then 'bersaglio' else public.my_display_name() end
  where id = a.id;
  perform public.combat_say(c.id, a.id, a.target_id, btrim(v_text),
    jsonb_build_object('tipo', 'attacco', 'azione', a.action, 'zona_mirata', a.zone_aimed, 'difesa', p_defense, 'colpi', v_detail));
  perform public.combat_advance(c.id);
end;
$$;

-- Passa il turno (chi agisce, o il Master)
create or replace function public.combat_pass(p_combat uuid, p_character uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.combats;
begin
  select * into c from public.combats where id = p_combat and status = 'in_corso' for update;
  if c.id is null then raise exception 'Scontro non in corso.' using errcode = 'P0001'; end if;
  if not ((c.turn_order[c.turn_index + 1] = p_character and public.owns_character(p_character)) or public.combat_is_master()) then
    raise exception 'Non è il tuo turno.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.combat_actions where combat_id = p_combat and status = 'attesa_difesa') then
    raise exception 'Prima va risolto l''attacco in attesa.' using errcode = 'P0001';
  end if;
  perform public.combat_say(p_combat, null, c.turn_order[c.turn_index + 1],
    public.first_name((select name from public.combat_participants where combat_id = p_combat and character_id = c.turn_order[c.turn_index + 1])) || ' passa il turno.', null);
  perform public.combat_advance(p_combat);
end;
$$;

-- Abbandona lo scontro (il personaggio esce, senza perdere PF)
create or replace function public.combat_leave(p_combat uuid, p_character uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.combats;
begin
  select * into c from public.combats where id = p_combat and status = 'in_corso' for update;
  if c.id is null then raise exception 'Scontro non in corso.' using errcode = 'P0001'; end if;
  if not public.owns_character(p_character) then raise exception 'Non è un tuo personaggio.' using errcode = '42501'; end if;
  if exists (select 1 from public.combat_actions where combat_id = p_combat and status = 'attesa_difesa'
             and (attacker_id = p_character or target_id = p_character)) then
    raise exception 'Prima va risolto l''attacco in corso.' using errcode = 'P0001';
  end if;
  update public.combat_participants set out = true, condition = null where combat_id = p_combat and character_id = p_character and not out;
  if not found then raise exception 'Non sei nello scontro.' using errcode = 'P0001'; end if;
  perform public.combat_say(p_combat, null, p_character,
    public.first_name((select name from public.characters where id = p_character)) || ' abbandona lo scontro.', null);
  if c.turn_order[c.turn_index + 1] = p_character
     or (select count(*) from public.combat_participants where combat_id = p_combat and not out) <= 1 then
    perform public.combat_advance(p_combat);
  end if;
end;
$$;

-- Il Master chiude lo scontro (annulla l'eventuale attacco in attesa)
create or replace function public.combat_end(p_combat uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.combats;
begin
  if not public.combat_is_master() then raise exception 'Solo il Master può chiudere lo scontro.' using errcode = '42501'; end if;
  select * into c from public.combats where id = p_combat and status = 'in_corso' for update;
  if c.id is null then raise exception 'Scontro non in corso.' using errcode = 'P0001'; end if;
  update public.combat_actions set status = 'annullata', resolved_at = now(), resolved_by = public.my_display_name()
  where combat_id = p_combat and status = 'attesa_difesa';
  update public.combats set status = 'chiuso', closed_at = now() where id = p_combat;
  perform public.combat_say(p_combat, null, coalesce(c.turn_order[c.turn_index + 1], c.created_by), 'Il Master chiude lo scontro.', null);
end;
$$;

revoke execute on function public.combat_start(uuid, uuid, uuid[]), public.combat_join(uuid, uuid),
  public.combat_attack(uuid, uuid, uuid, text, text), public.combat_defend(bigint, uuid, text),
  public.combat_pass(uuid, uuid), public.combat_leave(uuid, uuid), public.combat_end(uuid) from public, anon;
grant execute on function public.combat_start(uuid, uuid, uuid[]), public.combat_join(uuid, uuid),
  public.combat_attack(uuid, uuid, uuid, text, text), public.combat_defend(bigint, uuid, text),
  public.combat_pass(uuid, uuid), public.combat_leave(uuid, uuid), public.combat_end(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 6. RECUPERO AUTOMATICO (il pannello in chat si aggiorna dai messaggi 'combattimento')
-- ---------------------------------------------------------------------
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('salute-recupero', '17 * * * *', 'select public.health_recover_all()');
exception when others then
  raise notice 'pg_cron non disponibile: %', sqlerrm;
end $$;

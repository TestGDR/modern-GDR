-- =====================================================================
-- CASE E DORMITORI
-- - Utility → Case: catalogo di tipi di casa (li crea lo staff) da
--   comprare (prezzo pagato subito dal conto) o prendere in affitto
--   (primo mese subito, poi ogni mese con gli altri accrediti). Lo stesso
--   tipo lo possono prendere più personaggi; indirizzo, quartiere e
--   descrizione li scrive il giocatore. Fino a "case_max" case per PG.
--   Vendendo una casa comprata torna "case_rivendita_percento" del prezzo.
-- - Utility → Dormitori: dormitori del college (misti) con camere singole
--   o doppie. La retta è già nel patrimonio: ogni patrimonio indica quali
--   camere può prenotare (creation_options.dorm_kinds). Un letto per PG.
--   In una doppia stanno solo due ragazzi o due ragazze; chi ha sesso
--   "X" (non specificato) può andare in qualunque camera.
-- - Si può avere una camera al college e in più delle case.
-- Permesso alloggi.gestire (Gestione → Alloggi).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PERMESSO, IMPOSTAZIONI, PATRIMONIO
-- ---------------------------------------------------------------------
update public.user_levels
set permissions = array_append(permissions, 'alloggi.gestire')
where name = 'Master' and not ('alloggi.gestire' = any (permissions));

insert into public.game_settings (key, value, kind, label, description, sort_order) values
  ('case_max', '3', 'number', 'Case per personaggio', 'Quante case (comprate o in affitto) può avere al massimo un personaggio.', 320),
  ('case_rivendita_percento', '70', 'number', 'Rivendita delle case (%)', 'Quanto del prezzo pagato torna sul conto vendendo una casa comprata.', 321)
on conflict (key) do nothing;

-- quali camere del college può prenotare chi ha questo patrimonio
alter table public.creation_options
  add column if not exists dorm_kinds text[] not null default '{}'
  check (dorm_kinds <@ array['singola', 'doppia']::text[]);

update public.creation_options set dorm_kinds = case
    when name in ('Benestante', 'Ricco') then array['singola', 'doppia']
    else array['doppia'] end
where kind = 'tenore' and dorm_kinds = '{}';

-- movimenti nuovi della banca
alter table public.bank_transactions drop constraint if exists bank_transactions_kind_check;
alter table public.bank_transactions add constraint bank_transactions_kind_check
  check (kind in ('stipendio', 'bonifico', 'staff', 'mantenimento', 'iniziale', 'acquisto', 'affitto', 'casa'));

-- ---------------------------------------------------------------------
-- 2. DORMITORI E CAMERE
-- ---------------------------------------------------------------------
create table public.dorms (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(btrim(name)) between 2 and 60),
  description text not null default '' check (char_length(description) <= 1000),
  image_url text check (image_url is null or image_url ~ '^https://'),
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.dorms enable row level security;
revoke all on public.dorms from anon;
create policy "Dormitori: visibili" on public.dorms for select to authenticated
  using (active or (select public.has_permission('alloggi.gestire')));
create policy "Dormitori: lo staff aggiunge" on public.dorms for insert to authenticated
  with check ((select public.has_permission('alloggi.gestire')));
create policy "Dormitori: lo staff modifica" on public.dorms for update to authenticated
  using ((select public.has_permission('alloggi.gestire'))) with check ((select public.has_permission('alloggi.gestire')));
create policy "Dormitori: lo staff elimina" on public.dorms for delete to authenticated
  using ((select public.has_permission('alloggi.gestire')));
create trigger dorms_log after insert or update or delete on public.dorms
  for each row execute function public.log_admin_change();

create table public.dorm_rooms (
  id uuid primary key default gen_random_uuid(),
  dorm_id uuid not null references public.dorms (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  kind text not null check (kind in ('singola', 'doppia')),
  description text not null default '' check (char_length(description) <= 500),
  active boolean not null default true,
  sort_order int not null default 0,
  unique (dorm_id, name)
);
create index dorm_rooms_dorm_idx on public.dorm_rooms (dorm_id, sort_order);
alter table public.dorm_rooms enable row level security;
revoke all on public.dorm_rooms from anon;
create policy "Camere: visibili" on public.dorm_rooms for select to authenticated
  using (active or (select public.has_permission('alloggi.gestire')));
create policy "Camere: lo staff aggiunge" on public.dorm_rooms for insert to authenticated
  with check ((select public.has_permission('alloggi.gestire')));
create policy "Camere: lo staff modifica" on public.dorm_rooms for update to authenticated
  using ((select public.has_permission('alloggi.gestire'))) with check ((select public.has_permission('alloggi.gestire')));
create policy "Camere: lo staff elimina" on public.dorm_rooms for delete to authenticated
  using ((select public.has_permission('alloggi.gestire')));
create trigger dorm_rooms_log after insert or update or delete on public.dorm_rooms
  for each row execute function public.log_admin_change();

-- chi dorme dove (un letto per personaggio); i nomi li vedono tutti
create table public.dorm_residents (
  character_id uuid primary key references public.characters (id) on delete cascade,
  room_id uuid not null references public.dorm_rooms (id) on delete cascade,
  since timestamptz not null default now()
);
create index dorm_residents_room_idx on public.dorm_residents (room_id);
alter table public.dorm_residents enable row level security;
revoke all on public.dorm_residents from anon, authenticated;
grant select on public.dorm_residents to authenticated;
create policy "Residenti: visibili" on public.dorm_residents for select to authenticated using (true);
create policy "Residenti: solo dalle funzioni" on public.dorm_residents for insert to authenticated with check (false);
create policy "Residenti: modificati dalle funzioni" on public.dorm_residents for update to authenticated using (false);
create policy "Residenti: tolti dalle funzioni" on public.dorm_residents for delete to authenticated using (false);

-- Camere che il patrimonio del personaggio permette
create or replace function public.character_dorm_kinds(p_character uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct k), '{}')
  from public.character_options co
  join public.creation_options o on o.id = co.option_id
  cross join lateral unnest(o.dorm_kinds) k
  where co.character_id = p_character and o.kind = 'tenore'
$$;
revoke execute on function public.character_dorm_kinds(uuid) from public, anon;
grant execute on function public.character_dorm_kinds(uuid) to authenticated;

-- Mette il personaggio nella camera (controlli comuni a giocatore e staff)
create or replace function public.dorm_place(p_character uuid, p_room uuid, p_staff boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.dorm_rooms;
  c public.characters;
  v_dorm text;
  v_count int;
  v_beds int;
  v_mate record;
begin
  select * into r from public.dorm_rooms where id = p_room for update;
  select name into v_dorm from public.dorms where id = r.dorm_id and (active or p_staff);
  if r.id is null or v_dorm is null or (not r.active and not p_staff) then
    raise exception 'Camera non trovata.' using errcode = 'P0001';
  end if;
  select * into c from public.characters where id = p_character;
  if c.status is distinct from 'approvata' then raise exception 'Serve un personaggio approvato.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.dorm_residents where character_id = p_character and room_id = p_room) then
    raise exception 'Sei già in questa camera.' using errcode = 'P0001';
  end if;
  if not p_staff and not (r.kind = any (public.character_dorm_kinds(p_character))) then
    raise exception 'Il tuo patrimonio non comprende una camera %.', r.kind using errcode = 'P0001';
  end if;
  select count(*) into v_count from public.dorm_residents where room_id = p_room and character_id <> p_character;
  -- posti della camera (niente CASE dentro IF: il THEN lo confonde)
  v_beds := case r.kind when 'singola' then 1 else 2 end;
  if v_count >= v_beds then
    raise exception 'La camera è già occupata.' using errcode = 'P0001';
  end if;
  -- doppie: due ragazzi o due ragazze (chi ha sesso X va dove vuole)
  if not p_staff and c.sex in ('M', 'F') and exists (
    select 1 from public.dorm_residents dr join public.characters m on m.id = dr.character_id
    where dr.room_id = p_room and m.sex in ('M', 'F') and m.sex <> c.sex
  ) then
    raise exception 'In questa camera può entrare solo %.', case c.sex when 'M' then 'una ragazza' else 'un ragazzo' end using errcode = 'P0001';
  end if;

  -- si lascia l'eventuale camera di prima
  delete from public.dorm_residents where character_id = p_character;
  insert into public.dorm_residents (character_id, room_id) values (p_character, p_room);

  -- avviso al coinquilino
  for v_mate in
    select m.owner_id from public.dorm_residents dr join public.characters m on m.id = dr.character_id
    where dr.room_id = p_room and dr.character_id <> p_character
  loop
    perform public.send_system_message(v_mate.owner_id,
      '🛏️ ' || public.first_name(c.name) || ' ora divide la camera con te: ' || v_dorm || ', camera ' || r.name || '.');
  end loop;
end;
$$;
revoke execute on function public.dorm_place(uuid, uuid, boolean) from public, anon, authenticated;

-- Il giocatore prenota una camera libera (se ne aveva un'altra la lascia)
create or replace function public.dorm_book(p_character uuid, p_room uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.owns_character(p_character) then raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501'; end if;
  perform public.dorm_place(p_character, p_room, false);
end;
$$;
revoke execute on function public.dorm_book(uuid, uuid) from public, anon;
grant execute on function public.dorm_book(uuid, uuid) to authenticated;

-- Il giocatore lascia la camera
create or replace function public.dorm_leave(p_character uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.owns_character(p_character) then raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501'; end if;
  delete from public.dorm_residents where character_id = p_character;
end;
$$;
revoke execute on function public.dorm_leave(uuid) from public, anon;
grant execute on function public.dorm_leave(uuid) to authenticated;

-- Staff: mette un personaggio in una camera (senza i limiti di patrimonio e sesso)
create or replace function public.dorm_assign(p_character uuid, p_room uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.characters;
  v_where text;
begin
  if not public.has_permission('alloggi.gestire') then raise exception 'Non hai il permesso di gestire gli alloggi.' using errcode = '42501'; end if;
  perform public.dorm_place(p_character, p_room, true);
  select * into c from public.characters where id = p_character;
  select d.name || ', camera ' || r.name into v_where from public.dorm_rooms r join public.dorms d on d.id = r.dorm_id where r.id = p_room;
  perform public.send_system_message(c.owner_id, '🛏️ Lo staff ha assegnato a ' || public.first_name(c.name) || ' un posto al college: ' || v_where || '.');
end;
$$;
revoke execute on function public.dorm_assign(uuid, uuid) from public, anon;
grant execute on function public.dorm_assign(uuid, uuid) to authenticated;

-- Staff: toglie un personaggio dalla sua camera
create or replace function public.dorm_evict(p_character uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.characters;
begin
  if not public.has_permission('alloggi.gestire') then raise exception 'Non hai il permesso di gestire gli alloggi.' using errcode = '42501'; end if;
  delete from public.dorm_residents where character_id = p_character;
  if found then
    select * into c from public.characters where id = p_character;
    perform public.send_system_message(c.owner_id, '🛏️ ' || public.first_name(c.name) || ' non ha più la sua camera al college (decisione dello staff).');
  end if;
end;
$$;
revoke execute on function public.dorm_evict(uuid) from public, anon;
grant execute on function public.dorm_evict(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 3. CASE: CATALOGO E CASE DEI PERSONAGGI
-- ---------------------------------------------------------------------
create table public.house_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(btrim(name)) between 2 and 60),
  description text not null default '' check (char_length(description) <= 1000),
  image_url text check (image_url is null or image_url ~ '^https://'),
  -- null = non si vende / non si affitta
  buy_price int check (buy_price is null or buy_price between 0 and 100000000),
  rent_price int check (rent_price is null or rent_price between 0 and 1000000),
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  check (buy_price is not null or rent_price is not null)
);
alter table public.house_types enable row level security;
revoke all on public.house_types from anon;
create policy "Case: catalogo visibile" on public.house_types for select to authenticated
  using (active or (select public.has_permission('alloggi.gestire')));
create policy "Case: lo staff aggiunge" on public.house_types for insert to authenticated
  with check ((select public.has_permission('alloggi.gestire')));
create policy "Case: lo staff modifica" on public.house_types for update to authenticated
  using ((select public.has_permission('alloggi.gestire'))) with check ((select public.has_permission('alloggi.gestire')));
create policy "Case: lo staff elimina" on public.house_types for delete to authenticated
  using ((select public.has_permission('alloggi.gestire')));
create trigger house_types_log after insert or update or delete on public.house_types
  for each row execute function public.log_admin_change();

create table public.character_homes (
  id bigint generated always as identity primary key,
  character_id uuid not null references public.characters (id) on delete cascade,
  type_id uuid references public.house_types (id) on delete set null,
  -- copia dei dati al momento dell'acquisto o dell'affitto (il catalogo può cambiare)
  name text not null,
  image_url text,
  mode text not null check (mode in ('proprieta', 'affitto')),
  price_paid int not null default 0,
  -- affitto mensile (0 per le case di proprietà)
  rent int not null default 0 check (rent >= 0),
  -- li scrive il giocatore
  address text not null default '' check (char_length(address) <= 120),
  location_id uuid references public.locations (id) on delete set null,
  description text not null default '' check (char_length(description) <= 1000),
  created_at timestamptz not null default now()
);
create index character_homes_character_idx on public.character_homes (character_id);
create index character_homes_type_idx on public.character_homes (type_id);
create index character_homes_location_idx on public.character_homes (location_id);
alter table public.character_homes enable row level security;
revoke all on public.character_homes from anon, authenticated;
grant select on public.character_homes to authenticated;
grant update (address, location_id, description) on public.character_homes to authenticated;
create policy "Case dei PG: proprietario e staff" on public.character_homes for select to authenticated
  using (public.npc_mine(character_id) or (select public.has_permission('alloggi.gestire')) or (select public.has_permission('personaggi.vedere_tutti')));
create policy "Case dei PG: solo dalle funzioni" on public.character_homes for insert to authenticated with check (false);
create policy "Case dei PG: il proprietario scrive indirizzo e descrizione" on public.character_homes for update to authenticated
  using (public.npc_mine(character_id) or (select public.has_permission('alloggi.gestire')))
  with check (public.npc_mine(character_id) or (select public.has_permission('alloggi.gestire')));
create policy "Case dei PG: tolte dalle funzioni" on public.character_homes for delete to authenticated using (false);

-- Affitto mensile di tutte le case in affitto del personaggio
create or replace function public.character_rent(p_character uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(rent), 0)::int from public.character_homes where character_id = p_character and mode = 'affitto'
$$;
revoke execute on function public.character_rent(uuid) from public, anon, authenticated;

-- Prende una casa (comprata o in affitto): paga subito prezzo o primo mese
create or replace function public.home_take(p_character uuid, p_type uuid, p_mode text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.house_types;
  v_price int;
  v_balance int;
begin
  if not public.owns_character(p_character) then raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501'; end if;
  if p_mode not in ('proprieta', 'affitto') then raise exception 'Scelta non valida.' using errcode = 'P0001'; end if;
  select * into t from public.house_types where id = p_type and active;
  if t.id is null then raise exception 'Casa non disponibile.' using errcode = 'P0001'; end if;
  v_price := case p_mode when 'proprieta' then t.buy_price else t.rent_price end;
  if v_price is null then
    raise exception '% non si %.', t.name, case p_mode when 'proprieta' then 'vende' else 'affitta' end using errcode = 'P0001';
  end if;
  -- una alla volta per personaggio (niente doppi clic)
  perform 1 from public.characters where id = p_character for update;
  if (select count(*) from public.character_homes where character_id = p_character) >= coalesce(public.setting_int('case_max'), 3) then
    raise exception 'Puoi avere al massimo % case.', coalesce(public.setting_int('case_max'), 3) using errcode = 'P0001';
  end if;

  perform public.bank_open_account(p_character);
  update public.bank_accounts set balance = balance - v_price, updated_at = now()
  where character_id = p_character and balance >= v_price
  returning balance into v_balance;
  if not found then raise exception 'Sul conto non ci sono abbastanza dollari (servono % $).', v_price using errcode = 'P0001'; end if;
  if v_price > 0 then
    insert into public.bank_transactions (character_id, amount, kind, description, balance_after, author_id)
    values (p_character, -v_price, case p_mode when 'proprieta' then 'casa' else 'affitto' end,
      case p_mode when 'proprieta' then 'Acquisto casa: ' else 'Affitto (primo mese): ' end || t.name, v_balance, auth.uid());
  end if;
  insert into public.character_homes (character_id, type_id, name, image_url, mode, price_paid, rent)
  values (p_character, t.id, t.name, t.image_url, p_mode,
    case p_mode when 'proprieta' then v_price else 0 end,
    case p_mode when 'affitto' then v_price else 0 end);
end;
$$;
revoke execute on function public.home_take(uuid, uuid, text) from public, anon;
grant execute on function public.home_take(uuid, uuid, text) to authenticated;

-- Vende una casa comprata (torna una parte del prezzo) o disdice l'affitto
create or replace function public.home_release(p_home bigint)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  h public.character_homes;
  v_back int := 0;
  v_balance int;
begin
  select * into h from public.character_homes where id = p_home for update;
  if h.id is null or not public.owns_character(h.character_id) then raise exception 'Casa non trovata.' using errcode = '42501'; end if;
  if h.mode = 'proprieta' then
    v_back := (h.price_paid * least(100, greatest(0, coalesce(public.setting_int('case_rivendita_percento'), 70))) / 100)::int;
    if v_back > 0 then
      perform public.bank_open_account(h.character_id);
      update public.bank_accounts set balance = balance + v_back, updated_at = now()
      where character_id = h.character_id returning balance into v_balance;
      insert into public.bank_transactions (character_id, amount, kind, description, balance_after, author_id)
      values (h.character_id, v_back, 'casa', 'Vendita casa: ' || h.name, v_balance, auth.uid());
    end if;
  end if;
  delete from public.character_homes where id = p_home;
  return v_back;
end;
$$;
revoke execute on function public.home_release(bigint) from public, anon;
grant execute on function public.home_release(bigint) to authenticated;

-- Staff: regala una casa (di proprietà o in affitto, senza pagare il primo mese)
create or replace function public.home_give(p_character uuid, p_type uuid, p_mode text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.house_types;
  c public.characters;
begin
  if not public.has_permission('alloggi.gestire') then raise exception 'Non hai il permesso di gestire gli alloggi.' using errcode = '42501'; end if;
  if p_mode not in ('proprieta', 'affitto') then raise exception 'Scelta non valida.' using errcode = 'P0001'; end if;
  select * into t from public.house_types where id = p_type;
  select * into c from public.characters where id = p_character and status = 'approvata';
  if t.id is null or c.id is null then raise exception 'Casa o personaggio non trovati.' using errcode = 'P0001'; end if;
  if p_mode = 'affitto' and t.rent_price is null then raise exception '% non si affitta.', t.name using errcode = 'P0001'; end if;
  insert into public.character_homes (character_id, type_id, name, image_url, mode, price_paid, rent)
  values (p_character, t.id, t.name, t.image_url, p_mode, 0, case p_mode when 'affitto' then t.rent_price else 0 end);
  perform public.send_system_message(c.owner_id, '🏠 Lo staff ha dato a ' || public.first_name(c.name) || ' una casa'
    || case p_mode when 'affitto' then ' in affitto' else '' end || ': ' || t.name || '. La trovi in Utility → Case.');
end;
$$;
revoke execute on function public.home_give(uuid, uuid, text) from public, anon;
grant execute on function public.home_give(uuid, uuid, text) to authenticated;

-- Staff: toglie una casa a un personaggio (senza rimborsi)
create or replace function public.home_remove(p_home bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  h public.character_homes;
  c public.characters;
begin
  if not public.has_permission('alloggi.gestire') then raise exception 'Non hai il permesso di gestire gli alloggi.' using errcode = '42501'; end if;
  delete from public.character_homes where id = p_home returning * into h;
  if h.id is null then return; end if;
  select * into c from public.characters where id = h.character_id;
  perform public.send_system_message(c.owner_id, '🏠 ' || public.first_name(c.name) || ' non ha più la casa «' || h.name || '» (decisione dello staff).');
end;
$$;
revoke execute on function public.home_remove(bigint) from public, anon;
grant execute on function public.home_remove(bigint) to authenticated;

-- ---------------------------------------------------------------------
-- 4. BANCA: L'AFFITTO OGNI MESE CON GLI ALTRI ACCREDITI
-- ---------------------------------------------------------------------
create or replace function public.bank_settle_internal(p_character uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.characters;
  a public.bank_accounts;
  v_days int := public.salary_days();
  v_n int;
  v_init int;
  v_in int;
  v_out int;
  v_rent int;
  v_msg text := '';
begin
  select * into c from public.characters where id = p_character;
  if c.status is distinct from 'approvata' then return; end if;
  perform public.bank_open_account(p_character);
  select * into a from public.bank_accounts where character_id = p_character for update;

  -- quota iniziale del patrimonio, una volta sola
  if not a.initial_paid then
    v_init := public.character_initial_amount(p_character);
    update public.bank_accounts set initial_paid = true, balance = balance + v_init, updated_at = now()
    where character_id = p_character returning * into a;
    if v_init > 0 then
      insert into public.bank_transactions (character_id, amount, kind, description, balance_after)
      values (p_character, v_init, 'iniziale', 'Quota iniziale del patrimonio', a.balance);
      v_msg := 'Quota iniziale del patrimonio: +' || v_init || ' $' || E'\n';
    end if;
  end if;

  -- mesi passati dall'ultimo accredito
  v_n := (public.bank_today() - a.salary_paid_until) / v_days;
  if v_n >= 1 then
    v_in := public.character_salary(p_character) * v_n;
    v_out := public.character_upkeep(p_character) * v_n;
    v_rent := public.character_rent(p_character) * v_n;
    if v_in > 0 then
      update public.bank_accounts set balance = balance + v_in, updated_at = now()
      where character_id = p_character returning * into a;
      insert into public.bank_transactions (character_id, amount, kind, description, balance_after)
      values (p_character, v_in, 'stipendio',
              'Entrate del mese' || case when v_n > 1 then ' (' || v_n || ' mesi)' else '' end, a.balance);
      v_msg := v_msg || 'Entrate: +' || v_in || ' $' || coalesce((
        select string_agg(E'\n  · ' || (p ->> 'label') || ': ' || ((p ->> 'amount')::int * v_n) || ' $', '')
        from jsonb_array_elements(public.character_salary_parts(p_character)) p
      ), '') || E'\n';
    end if;
    if v_out > 0 then
      update public.bank_accounts set balance = balance - v_out, updated_at = now()
      where character_id = p_character returning * into a;
      insert into public.bank_transactions (character_id, amount, kind, description, balance_after)
      values (p_character, -v_out, 'mantenimento',
              'Mantenimento del patrimonio' || case when v_n > 1 then ' (' || v_n || ' mesi)' else '' end, a.balance);
      v_msg := v_msg || 'Mantenimento: −' || v_out || ' $' || E'\n';
    end if;
    if v_rent > 0 then
      update public.bank_accounts set balance = balance - v_rent, updated_at = now()
      where character_id = p_character returning * into a;
      insert into public.bank_transactions (character_id, amount, kind, description, balance_after)
      values (p_character, -v_rent, 'affitto',
              'Affitto delle case' || case when v_n > 1 then ' (' || v_n || ' mesi)' else '' end, a.balance);
      v_msg := v_msg || 'Affitto: −' || v_rent || ' $' || E'\n';
    end if;
    update public.bank_accounts set salary_paid_until = salary_paid_until + v_n * v_days where character_id = p_character;
  end if;

  if v_msg <> '' then
    perform public.send_system_message(c.owner_id,
      'Banca · ' || c.name || E'\n' || v_msg || 'Saldo: ' || a.balance || ' $'
      || case when a.balance < 0 then ' (conto in rosso)' else '' end
      || E'\nDettagli in Utility → Servizi bancari.');
  end if;
end;
$$;
revoke execute on function public.bank_settle_internal(uuid) from public, anon, authenticated;

create or replace function public.bank_overview(p_character uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a public.bank_accounts;
  v_days int := public.salary_days();
begin
  if not exists (
    select 1 from public.characters c
    where c.id = p_character and (c.owner_id = auth.uid() or public.has_permission('banca.gestire'))
  ) then
    raise exception 'Conto non trovato.' using errcode = '42501';
  end if;
  select * into a from public.bank_accounts where character_id = p_character;
  if not found then return null; end if;
  return jsonb_build_object(
    'balance', a.balance,
    'income', public.character_salary(p_character),
    'income_parts', public.character_salary_parts(p_character),
    'upkeep', public.character_upkeep(p_character),
    'rent', public.character_rent(p_character),
    'period_days', v_days,
    'next_on', a.salary_paid_until + v_days
  );
end;
$$;
revoke execute on function public.bank_overview(uuid) from public, anon;
grant execute on function public.bank_overview(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5. RESET DELLA SCHEDA: VIA ANCHE CASE E CAMERA
-- ---------------------------------------------------------------------
create or replace function public.reset_character_homes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('app.reset_scheda', true) = 'on' then
    delete from public.character_homes where character_id = new.id;
    delete from public.dorm_residents where character_id = new.id;
  end if;
  return null;
end;
$$;
revoke execute on function public.reset_character_homes() from public, anon, authenticated;
drop trigger if exists characters_reset_homes on public.characters;
create trigger characters_reset_homes after update on public.characters
  for each row execute function public.reset_character_homes();

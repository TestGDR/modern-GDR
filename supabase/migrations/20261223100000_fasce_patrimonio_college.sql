-- =====================================================================
-- NUOVE FASCE DI PATRIMONIO, RETTA DEL COLLEGE, CAMERE E CASE A PAGAMENTO
-- - Sei fasce: Al verde, Tirare avanti, Vita tranquilla, Agiato, Ricco,
--   Élite. Il mantenimento è il costo della vita (cibo, bollette, auto):
--   casa e college si pagano a parte. Le fasce basse devono lavorare.
-- - Retta del college ogni mese per chi va all'università (ha un Major e
--   non è laureato, sospeso o espulso), camera del college ogni mese,
--   spese mensili delle case comprate. Tutto con gli altri accrediti.
-- - "Borsa di studio" diventa un vantaggio accademico: niente retta e
--   camera doppia pagata (la singola costa la differenza). Con "Borsa a
--   rischio" si perde con un semestre pubblicato sotto 2.5 di GPA.
--   La borsa atletica (Recruited, roster con borsa) vale allo stesso modo.
-- - Le camere non dipendono più dal patrimonio: chi paga sceglie.
-- - I PG già approvati passano alle fasce nuove e ricevono la differenza
--   della quota iniziale.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. IMPOSTAZIONI E MOVIMENTI DELLA BANCA
-- ---------------------------------------------------------------------
insert into public.game_settings (key, value, kind, label, description, sort_order) values
  ('college_retta_mese', '1000', 'number', 'College · Retta al mese', 'Rata mensile della retta universitaria (12 rate l''anno), per chi va all''università senza borsa di studio.', 322),
  ('college_doppia_mese', '600', 'number', 'College · Camera doppia al mese', 'Costo mensile di un posto in camera doppia nei dormitori. La borsa di studio lo paga.', 323),
  ('college_singola_mese', '1000', 'number', 'College · Camera singola al mese', 'Costo mensile di una camera singola. Con la borsa si paga solo la differenza con la doppia.', 324)
on conflict (key) do nothing;

alter table public.bank_transactions drop constraint if exists bank_transactions_kind_check;
alter table public.bank_transactions add constraint bank_transactions_kind_check
  check (kind in ('stipendio', 'bonifico', 'staff', 'mantenimento', 'iniziale', 'acquisto', 'affitto', 'casa', 'retta', 'college'));

-- ---------------------------------------------------------------------
-- 2. FASCE DI PATRIMONIO
-- ---------------------------------------------------------------------
-- prima: ai PG approvati la differenza della quota iniziale (già ricevuta quella vecchia)
do $$
declare
  r record;
  v_balance int;
begin
  for r in
    select c.id, c.owner_id, c.name, n.label, n.new_init - o.initial_amount as diff
    from public.character_options co
    join public.creation_options o on o.id = co.option_id and o.kind = 'tenore'
    join (values ('Squattrinato', 'Al verde', 300), ('Benestante', 'Agiato', 40000), ('Ricco', 'Ricco', 1000000)) n (old_name, label, new_init)
      on n.old_name = o.name
    join public.characters c on c.id = co.character_id and c.status = 'approvata'
    join public.bank_accounts a on a.character_id = c.id and a.initial_paid
    where n.new_init > o.initial_amount
  loop
    update public.bank_accounts set balance = balance + r.diff, updated_at = now()
    where character_id = r.id returning balance into v_balance;
    insert into public.bank_transactions (character_id, amount, kind, description, balance_after)
    values (r.id, r.diff, 'iniziale', 'Nuove fasce di patrimonio: adeguamento della quota iniziale', v_balance);
    perform public.send_system_message(r.owner_id,
      'Banca · ' || r.name || E'\nIl patrimonio è cambiato: ora sei nella fascia «' || r.label || '». '
      || 'Ricevi la differenza della quota iniziale: +' || r.diff || E' $\nDettagli in Utility → Servizi bancari.');
  end loop;
end;
$$;

update public.creation_options set name = 'Al verde', cost_px = -80, salary = 0, upkeep = 600, initial_amount = 300, sort_order = 1,
  description = 'Precarietà vera. Una roulotte malandata nell''Inland District, un divano prestato da un amico o un posto letto in una casa condivisa e fatiscente. Ti sposti a piedi, in bici o in autobus; se hai un''auto ha più chilometri che anni di manutenzione. Senza un lavoro (o due) non arrivi a fine mese.'
where kind = 'tenore' and name = 'Squattrinato';

update public.creation_options set name = 'Agiato', cost_px = 40, salary = 7000, upkeep = 3000, initial_amount = 40000, sort_order = 4,
  description = 'Soldi che non mancano. Un appartamento ampio e luminoso a Downtown District o Coastal Side, un attico con vista o una villetta con giardino e garage doppio. Guidi un SUV o una berlina premium, magari una moto di grossa cilindrata; vestiti e serate costano, ma non ci pensi troppo.'
where kind = 'tenore' and name = 'Benestante';

update public.creation_options set cost_px = 120, salary = 15000, upkeep = 7000, initial_amount = 1000000, sort_order = 5,
  description = 'Il denaro non è un limite. Una villa con piscina e dependance nelle zone esclusive di Coastal Side o Coronado Area, una seconda casa, auto di lusso o d''epoca, magari una barca ormeggiata alla marina. Cambiare macchina per sfizio è del tutto credibile.'
where kind = 'tenore' and name = 'Ricco';

insert into public.creation_options (kind, name, cost_px, salary, upkeep, initial_amount, sort_order, description) values
  ('tenore', 'Tirare avanti', -40, 600, 1000, 1500, 2,
   'Ce la fai, ma con fatica. Una mobile home ben tenuta, un monolocale datato nel Southern District o una casa divisa con i coinquilini. Un''utilitaria usata o una moto media ti portano al lavoro, e ogni pieno di benzina va messo in conto. Un lavoro serve, soprattutto se studi.'),
  ('tenore', 'Vita tranquilla', 0, 3200, 1500, 6000, 3,
   'Una vita stabile. Un appartamento decoroso o una casetta nel Central District o nel Northern Side, ben tenuta e con qualche comodità in più. Un''auto recente, un pick-up o una buona moto, con la manutenzione fatta per tempo. Qualche sfizio te lo concedi senza troppe rinunce.'),
  ('tenore', 'Élite', 200, 50000, 20000, 5000000, 6,
   'L''élite della città. Una tenuta sull''oceano a Coronado Area dentro un complesso privato: piscina a sfioro, palestra, cinema, campo da tennis, molo. Personale di servizio, residenze fuori città e una collezione di supercar, auto d''epoca e yacht. Quanto costano non è mai la domanda.')
on conflict (kind, name) do update set cost_px = excluded.cost_px, salary = excluded.salary, upkeep = excluded.upkeep,
  initial_amount = excluded.initial_amount, sort_order = excluded.sort_order, description = excluded.description;

-- "Borsa di studio" non è più un patrimonio (ora è un vantaggio)
delete from public.creation_options o
where o.kind = 'tenore' and o.name = 'Borsa di studio'
  and not exists (select 1 from public.character_options co where co.option_id = o.id);

-- ---------------------------------------------------------------------
-- 3. BORSA DI STUDIO (vantaggio accademico)
-- ---------------------------------------------------------------------
insert into public.creation_options (kind, scope, subgroup, name, cost_px, max_level, choice_hint, secret_default, is_origin, available, description, effects, sort_order)
values ('vantaggio', 'accademica', 'risorse', 'Borsa di studio', 2 * coalesce(public.setting_int('voci_px_per_punto'), 40), 1, '', false, false, true,
  'Studi con una borsa: niente retta del college e camera doppia pagata (per la singola paghi solo la differenza). Con «Borsa a rischio» la perdi se un semestre va sotto 2.5 di GPA.',
  '[{"type":"rule_flag","flag":"scholarship"}]', 50)
on conflict (kind, name) do nothing;

update public.creation_options
set description = 'Se hai la Borsa di studio, la perdi quando un semestre pubblicato va sotto 2.5 di GPA: da lì paghi retta e camera.'
where kind = 'svantaggio' and name = 'Borsa a rischio';

-- Borsa di studio attiva: di merito (non persa) o atletica
create or replace function public.character_scholarship(p_character uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (
    public.trait_flag(p_character, 'scholarship')
    and not (
      public.trait_flag(p_character, 'merit_scholarship')
      and exists (
        select 1 from public.term_reports tr join public.academic_terms t on t.id = tr.term_id
        where tr.character_id = p_character and t.status = 'published' and tr.credits_attempted > 0 and tr.term_gpa < 2.5)
    )
  ) or exists (
    select 1 from public.sport_roster ro where ro.character_id = p_character and ro.scholarship and ro.left_at is null
  )
$$;
revoke execute on function public.character_scholarship(uuid) from public, anon, authenticated;

-- Va all'università: ha un Major e non è laureato, sospeso o espulso
create or replace function public.character_is_student(p_character uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.characters c where c.id = p_character and c.study_track_id is not null)
    and not exists (
      select 1 from public.student_records s
      where s.character_id = p_character and s.academic_status in ('graduated', 'suspended', 'dismissed'))
$$;
revoke execute on function public.character_is_student(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. CAMERE: NON DIPENDONO PIÙ DAL PATRIMONIO, SI PAGANO
-- ---------------------------------------------------------------------
drop function if exists public.character_dorm_kinds(uuid);
alter table public.creation_options drop column if exists dorm_kinds;

-- Costo mensile di una camera per questo personaggio (con la borsa, la doppia è pagata)
create or replace function public.dorm_fee(p_character uuid, p_kind text)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(0,
    case p_kind when 'singola' then coalesce(public.setting_int('college_singola_mese'), 1000)
                else coalesce(public.setting_int('college_doppia_mese'), 600) end
    - case when public.character_scholarship(p_character) then coalesce(public.setting_int('college_doppia_mese'), 600) else 0 end)
$$;
revoke execute on function public.dorm_fee(uuid, text) from public, anon, authenticated;

-- Costi del college per la pagina Dormitori (il proprio personaggio o lo staff)
create or replace function public.college_costs(p_character uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.npc_mine(p_character) or public.has_permission('alloggi.gestire')) then
    raise exception 'Personaggio non trovato.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'student', public.character_is_student(p_character),
    'scholarship', public.character_scholarship(p_character),
    'tuition', case when public.character_is_student(p_character) and not public.character_scholarship(p_character)
                    then coalesce(public.setting_int('college_retta_mese'), 1000) else 0 end,
    'doppia', public.dorm_fee(p_character, 'doppia'),
    'singola', public.dorm_fee(p_character, 'singola')
  );
end;
$$;
revoke execute on function public.college_costs(uuid) from public, anon;
grant execute on function public.college_costs(uuid) to authenticated;

-- Prenotazione: si paga subito il primo mese (lo staff assegna senza pagare)
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
  v_fee int;
  v_balance int;
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
  select count(*) into v_count from public.dorm_residents where room_id = p_room and character_id <> p_character;
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

  -- primo mese subito
  if not p_staff then
    v_fee := public.dorm_fee(p_character, r.kind);
    if v_fee > 0 then
      perform public.bank_open_account(p_character);
      update public.bank_accounts set balance = balance - v_fee, updated_at = now()
      where character_id = p_character and balance >= v_fee
      returning balance into v_balance;
      if not found then raise exception 'Sul conto non ci sono abbastanza dollari per il primo mese (servono % $).', v_fee using errcode = 'P0001'; end if;
      insert into public.bank_transactions (character_id, amount, kind, description, balance_after, author_id)
      values (p_character, -v_fee, 'college', 'Camera ' || r.name || ' (' || v_dorm || '): primo mese', v_balance, auth.uid());
    end if;
  end if;

  delete from public.dorm_residents where character_id = p_character;
  insert into public.dorm_residents (character_id, room_id) values (p_character, p_room);

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

-- ---------------------------------------------------------------------
-- 5. CASE: SPESE MENSILI DI CHI LE POSSIEDE
-- ---------------------------------------------------------------------
alter table public.house_types add column if not exists owner_upkeep int not null default 0
  check (owner_upkeep between 0 and 1000000);
alter table public.character_homes add column if not exists upkeep int not null default 0 check (upkeep >= 0);

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
  insert into public.character_homes (character_id, type_id, name, image_url, mode, price_paid, rent, upkeep)
  values (p_character, t.id, t.name, t.image_url, p_mode,
    case p_mode when 'proprieta' then v_price else 0 end,
    case p_mode when 'affitto' then v_price else 0 end,
    case p_mode when 'proprieta' then t.owner_upkeep else 0 end);
end;
$$;
revoke execute on function public.home_take(uuid, uuid, text) from public, anon;
grant execute on function public.home_take(uuid, uuid, text) to authenticated;

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
  insert into public.character_homes (character_id, type_id, name, image_url, mode, price_paid, rent, upkeep)
  values (p_character, t.id, t.name, t.image_url, p_mode, 0,
    case p_mode when 'affitto' then t.rent_price else 0 end,
    case p_mode when 'proprieta' then t.owner_upkeep else 0 end);
  perform public.send_system_message(c.owner_id, '🏠 Lo staff ha dato a ' || public.first_name(c.name) || ' una casa'
    || case p_mode when 'affitto' then ' in affitto' else '' end || ': ' || t.name || '. La trovi in Utility → Case.');
end;
$$;
revoke execute on function public.home_give(uuid, uuid, text) from public, anon;
grant execute on function public.home_give(uuid, uuid, text) to authenticated;

-- Catalogo iniziale (lo staff lo cambia in Gestione → Alloggi)
insert into public.house_types (name, description, buy_price, rent_price, owner_upkeep, sort_order) values
  ('Roulotte o mobile home', 'Pochi metri quadri, un fornelletto e una veranda di plastica in un parcheggio per case mobili. Spartana, ma è tua.', 30000, 400, 60, 1),
  ('Monolocale', 'Una stanza con angolo cottura e bagno, in un palazzo datato. Comodo per chi studia o lavora in centro.', 180000, 900, 360, 2),
  ('Appartamento', 'Due camere, soggiorno luminoso e balcone in un condominio ben tenuto, con posto auto.', 450000, 2500, 900, 3),
  ('Villetta con giardino', 'Casa indipendente su due piani con giardino, garage doppio e magari una piccola piscina.', 900000, 6000, 1800, 4),
  ('Villa sull''oceano', 'Ampi spazi, piscina, dependance, sistemi di sicurezza e finiture di lusso, con vista sul mare.', 2500000, null, 5000, 5),
  ('Tenuta privata', 'Proprietà in un complesso privato sull''oceano: piscina a sfioro, palestra, cinema, campo da tennis e molo.', 8000000, null, 16000, 6)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------
-- 6. TUTTE LE USCITE DEL MESE, VOCE PER VOCE
-- ---------------------------------------------------------------------
create or replace function public.character_expense_parts(p_character uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('label', label, 'amount', amount, 'kind', kind) order by ord, label), '[]'::jsonb)
  from (
    select 1 as ord, 'Mantenimento: ' || o.name as label, o.upkeep as amount, 'mantenimento' as kind
    from public.character_options co join public.creation_options o on o.id = co.option_id
    where co.character_id = p_character and o.kind = 'tenore' and o.upkeep > 0
    union all
    select 2, 'Retta del college', coalesce(public.setting_int('college_retta_mese'), 1000), 'retta'
    where public.character_is_student(p_character) and not public.character_scholarship(p_character)
      and coalesce(public.setting_int('college_retta_mese'), 1000) > 0
    union all
    select 3, 'Camera ' || r.name || ' (' || d.name || ')', public.dorm_fee(p_character, r.kind), 'college'
    from public.dorm_residents dr join public.dorm_rooms r on r.id = dr.room_id join public.dorms d on d.id = r.dorm_id
    where dr.character_id = p_character and public.dorm_fee(p_character, r.kind) > 0
    union all
    select 4, 'Affitto: ' || h.name, h.rent, 'affitto'
    from public.character_homes h where h.character_id = p_character and h.mode = 'affitto' and h.rent > 0
    union all
    select 5, 'Spese di casa: ' || h.name, h.upkeep, 'casa'
    from public.character_homes h where h.character_id = p_character and h.mode = 'proprieta' and h.upkeep > 0
  ) parts
$$;
revoke execute on function public.character_expense_parts(uuid) from public, anon, authenticated;

create or replace function public.character_expenses(p_character uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum((p ->> 'amount')::int), 0)::int from jsonb_array_elements(public.character_expense_parts(p_character)) p
$$;
revoke execute on function public.character_expenses(uuid) from public, anon, authenticated;

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
  v_amount int;
  p jsonb;
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
    if v_in > 0 then
      update public.bank_accounts set balance = balance + v_in, updated_at = now()
      where character_id = p_character returning * into a;
      insert into public.bank_transactions (character_id, amount, kind, description, balance_after)
      values (p_character, v_in, 'stipendio',
              'Entrate del mese' || case when v_n > 1 then ' (' || v_n || ' mesi)' else '' end, a.balance);
      v_msg := v_msg || 'Entrate: +' || v_in || ' $' || coalesce((
        select string_agg(E'\n  · ' || (q ->> 'label') || ': ' || ((q ->> 'amount')::int * v_n) || ' $', '')
        from jsonb_array_elements(public.character_salary_parts(p_character)) q
      ), '') || E'\n';
    end if;
    -- uscite: mantenimento, retta, camera, affitti, spese di casa
    for p in select * from jsonb_array_elements(public.character_expense_parts(p_character))
    loop
      v_amount := (p ->> 'amount')::int * v_n;
      update public.bank_accounts set balance = balance - v_amount, updated_at = now()
      where character_id = p_character returning * into a;
      insert into public.bank_transactions (character_id, amount, kind, description, balance_after)
      values (p_character, -v_amount, p ->> 'kind',
              (p ->> 'label') || case when v_n > 1 then ' (' || v_n || ' mesi)' else '' end, a.balance);
      v_msg := v_msg || (p ->> 'label') || ': −' || v_amount || ' $' || E'\n';
    end loop;
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
    'upkeep', public.character_expenses(p_character),
    'expense_parts', public.character_expense_parts(p_character),
    'period_days', v_days,
    'next_on', a.salary_paid_until + v_days
  );
end;
$$;
revoke execute on function public.bank_overview(uuid) from public, anon;
grant execute on function public.bank_overview(uuid) to authenticated;

drop function if exists public.character_rent(uuid);

-- ---------------------------------------------------------------------
-- 7. LAVORI: STIPENDIO REALISTICO DEL CAMERIERE (era 20 $)
-- ---------------------------------------------------------------------
update public.job_roles set salary = 900 where name = 'Cameriere in prova' and salary = 20;

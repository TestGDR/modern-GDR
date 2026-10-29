-- =====================================================================
-- PATRIMONIO E ACCREDITI MENSILI AUTOMATICI
--
-- - Il "tenore di vita" diventa il Patrimonio: costo in PX alla creazione,
--   entrata mensile, uscita mensile di mantenimento e quota iniziale.
-- - Ogni 30 giorni (impostazione "stipendio_giorni") arrivano da soli sul
--   conto: entrate (patrimonio + lavori + gruppi) e uscita del
--   mantenimento, con un messaggio di SISTEMA. Niente più "Ritira".
-- - All'approvazione (o subito, per chi è già approvato) arriva la quota
--   iniziale del patrimonio.
-- - Col mantenimento il conto può andare in rosso.
-- =====================================================================

-- 1. Campi del patrimonio
alter table public.creation_options
  add column upkeep int not null default 0 check (upkeep between 0 and 1000000),
  add column initial_amount int not null default 0 check (initial_amount between 0 and 100000000);

-- Cifre mensili (prima erano giornaliere): solo per le voci mai modificate
update public.creation_options set
  salary = case name when 'Squattrinato' then 600 when 'Borsa di studio' then 1200 when 'Benestante' then 3000 else 7500 end,
  upkeep = case name when 'Squattrinato' then 400 when 'Borsa di studio' then 800 when 'Benestante' then 1500 else 3000 end,
  initial_amount = case name when 'Squattrinato' then 200 when 'Borsa di studio' then 500 when 'Benestante' then 5000 else 25000 end
where kind = 'tenore'
  and (name, salary) in (('Squattrinato', 20), ('Borsa di studio', 40), ('Benestante', 100), ('Ricco', 250));

-- 2. Impostazioni: un accredito ogni 30 giorni, niente accumulo da ritirare
update public.game_settings
set value = '30', label = 'Giorni tra un accredito e l''altro',
    description = 'Ogni quanti giorni arrivano da soli entrate (patrimonio, lavori, gruppi) e mantenimento.'
where key = 'stipendio_giorni';
delete from public.game_settings where key = 'stipendio_max_quote';

-- 3. Conti: possono andare in rosso; quota iniziale una volta sola
alter table public.bank_accounts drop constraint if exists bank_accounts_balance_check;
alter table public.bank_accounts add column initial_paid boolean not null default false;
alter table public.bank_transactions drop constraint if exists bank_transactions_kind_check;
alter table public.bank_transactions add constraint bank_transactions_kind_check
  check (kind in ('stipendio', 'bonifico', 'staff', 'mantenimento', 'iniziale'));

-- il prossimo accredito dei conti già aperti arriva fra 30 giorni
update public.bank_accounts set salary_paid_until = public.bank_today();

drop function if exists public.collect_salary(uuid);

-- 4. Funzioni
create or replace function public.bank_open_account(p_character uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.bank_accounts (character_id, salary_paid_until)
  values (p_character, public.bank_today())
  on conflict (character_id) do nothing;
$$;
revoke execute on function public.bank_open_account(uuid) from public, anon, authenticated;

-- Mantenimento mensile e quota iniziale (dal patrimonio)
create or replace function public.character_upkeep(p_character uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(o.upkeep), 0)::int
  from public.character_options co join public.creation_options o on o.id = co.option_id
  where co.character_id = p_character and o.kind = 'tenore'
$$;
revoke execute on function public.character_upkeep(uuid) from public, anon, authenticated;

create or replace function public.character_initial_amount(p_character uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(o.initial_amount), 0)::int
  from public.character_options co join public.creation_options o on o.id = co.option_id
  where co.character_id = p_character and o.kind = 'tenore'
$$;
revoke execute on function public.character_initial_amount(uuid) from public, anon, authenticated;

-- Le voci delle entrate si chiamano "Patrimonio"
create or replace function public.character_salary_parts(p_character uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('label', label, 'amount', amount) order by ord, label), '[]'::jsonb)
  from (
    select 1 as ord, 'Patrimonio: ' || o.name as label, o.salary as amount
    from public.character_options co join public.creation_options o on o.id = co.option_id
    where co.character_id = p_character and o.kind = 'tenore' and o.salary > 0
    union all
    select 2, 'Lavoro: ' || r.name || ' (' || j.name || ')', r.salary
    from public.character_jobs cj join public.job_roles r on r.id = cj.role_id join public.jobs j on j.id = cj.job_id
    where cj.character_id = p_character and j.active and r.salary > 0
    union all
    select 3, 'Gruppo: ' || r.name || ' (' || g.name || ')', r.salary
    from public.character_groups cg join public.group_roles r on r.id = cg.role_id join public.game_groups g on g.id = cg.group_id
    where cg.character_id = p_character and g.active and r.salary > 0
  ) parts
$$;
revoke execute on function public.character_salary_parts(uuid) from public, anon, authenticated;

-- Accrediti dovuti di un personaggio: quota iniziale e mesi passati
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

-- Dalla pagina della banca: il proprio conto (o lo staff della banca)
create or replace function public.bank_settle(p_character uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.characters c
    where c.id = p_character and (c.owner_id = auth.uid() or public.has_permission('banca.gestire'))
  ) then
    raise exception 'Conto non trovato.' using errcode = '42501';
  end if;
  perform public.bank_settle_internal(p_character);
end;
$$;
revoke execute on function public.bank_settle(uuid) from public, anon;
grant execute on function public.bank_settle(uuid) to authenticated;

-- Tutti i conti con accrediti dovuti (lavoro automatico ogni ora)
create or replace function public.bank_settle_all()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  n int := 0;
begin
  for v_id in
    select a.character_id from public.bank_accounts a
    join public.characters c on c.id = a.character_id and c.status = 'approvata'
    where not a.initial_paid or a.salary_paid_until + public.salary_days() <= public.bank_today()
  loop
    perform public.bank_settle_internal(v_id);
    n := n + 1;
  end loop;
  -- personaggi approvati senza conto (approvati prima della banca)
  for v_id in
    select c.id from public.characters c
    where c.status = 'approvata' and not exists (select 1 from public.bank_accounts a where a.character_id = c.id)
  loop
    perform public.bank_settle_internal(v_id);
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke execute on function public.bank_settle_all() from public, anon, authenticated;

-- Scheda approvata: conto aperto e quota iniziale subito
create or replace function public.characters_open_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'approvata' and old.status is distinct from 'approvata' then
    perform public.bank_settle_internal(new.id);
  end if;
  return new;
end;
$$;
revoke execute on function public.characters_open_account() from public, anon, authenticated;

-- Situazione del conto
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
    'period_days', v_days,
    'next_on', a.salary_paid_until + v_days
  );
end;
$$;
revoke execute on function public.bank_overview(uuid) from public, anon;
grant execute on function public.bank_overview(uuid) to authenticated;

-- Lo staff può sempre dare soldi, anche a un conto in rosso
create or replace function public.bank_staff_adjust(p_character uuid, p_amount int, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_owner uuid;
  v_reason text := left(btrim(coalesce(p_reason, '')), 200);
  v_balance int;
begin
  if not public.has_permission('banca.gestire') then
    raise exception 'Non hai il permesso di gestire la banca.' using errcode = '42501';
  end if;
  if p_amount is null or p_amount = 0 or abs(p_amount) > 100000000 then
    raise exception 'Indica quanti dollari dare o togliere.' using errcode = 'P0001';
  end if;
  if v_reason = '' then
    raise exception 'Scrivi il motivo: il giocatore lo vede nei movimenti.' using errcode = 'P0001';
  end if;
  select name, owner_id into v_name, v_owner from public.characters where id = p_character and status = 'approvata';
  if v_name is null then
    raise exception 'Il personaggio non esiste o non è approvato.' using errcode = 'P0001';
  end if;
  perform public.bank_open_account(p_character);
  update public.bank_accounts set balance = balance + p_amount, updated_at = now()
  where character_id = p_character and (p_amount > 0 or balance + p_amount >= 0)
  returning balance into v_balance;
  if not found then
    raise exception 'Sul conto non ci sono abbastanza dollari da togliere.' using errcode = 'P0001';
  end if;
  insert into public.bank_transactions (character_id, amount, kind, description, balance_after, author_id)
  values (p_character, p_amount, 'staff', 'Staff · ' || v_reason, v_balance, auth.uid());
  perform public.send_system_message(v_owner,
    'Lo staff ha ' || case when p_amount > 0 then 'dato ' || p_amount || ' $ a ' else 'tolto ' || (-p_amount) || ' $ a ' end
    || v_name || ': «' || v_reason || '».' || E'\nLo trovi in Utility → Servizi bancari.');
end;
$$;
revoke execute on function public.bank_staff_adjust(uuid, int, text) from public, anon;
grant execute on function public.bank_staff_adjust(uuid, int, text) to authenticated;

-- 5. Subito: quota iniziale a chi è già approvato
select public.bank_settle_all();

-- 6. Lavoro automatico ogni ora (se pg_cron non c'è, gli accrediti
--    arrivano comunque quando il giocatore apre la banca)
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('banca-accrediti-mensili', '7 * * * *', 'select public.bank_settle_all()');
exception when others then
  raise notice 'pg_cron non disponibile: %', sqlerrm;
end $$;

-- =====================================================================
-- UTILITY: ANAGRAFE, PRESTAVOLTI E BANCA (dal Westeros, 0020/0022/0023/0085)
--
-- - Prestavolto: ogni personaggio ne registra uno, unico in tutta la land.
--   Una volta salvato lo cambia solo chi ha "prestavolti.gestire".
-- - Banca: ogni personaggio approvato ha un conto in dollari. Lo stipendio
--   matura ogni N giorni (impostazione "stipendio_giorni") e si accumula
--   finché non si ritira. L'importo viene dal tenore di vita (più, in
--   futuro, gruppi e lavori: vedi character_salary). Si possono mandare
--   soldi ai personaggi degli altri giocatori. Lo staff con "banca.gestire"
--   vede tutti i conti e può dare o togliere soldi con un motivo.
-- - I saldi si cambiano solo con le funzioni qui sotto.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PRESTAVOLTO
-- ---------------------------------------------------------------------
alter table public.characters
  add column face_claim text check (char_length(face_claim) between 2 and 80);
create unique index characters_face_claim_lower_key
  on public.characters (lower(face_claim)) where face_claim is not null;

-- Una volta registrato, il prestavolto lo cambia solo lo staff
create or replace function public.lock_face_claim()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then return new; end if; -- SQL Editor
  if new.face_claim is distinct from old.face_claim
     and old.face_claim is not null
     and not public.has_permission('prestavolti.gestire') then
    raise exception 'Il prestavolto, una volta registrato, lo cambia solo lo staff.' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger characters_lock_face_claim before update of face_claim on public.characters
  for each row execute function public.lock_face_claim();

-- Registra (giocatore, una volta) o cambia/toglie (staff) il prestavolto
create or replace function public.set_face_claim(p_character uuid, p_face_claim text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v text := nullif(regexp_replace(btrim(coalesce(p_face_claim, '')), '\s+', ' ', 'g'), '');
  c public.characters;
  v_staff boolean := public.has_permission('prestavolti.gestire');
begin
  select * into c from public.characters where id = p_character for update;
  if not found then
    raise exception 'Personaggio non trovato.' using errcode = 'P0001';
  end if;
  if not v_staff then
    if c.owner_id is distinct from auth.uid() then
      raise exception 'Questo personaggio non è tuo.' using errcode = '42501';
    end if;
    if c.face_claim is not null then
      raise exception 'Il prestavolto è già registrato: per cambiarlo scrivi allo staff con un ticket.' using errcode = 'P0001';
    end if;
    if v is null then
      raise exception 'Scrivi il nome del prestavolto.' using errcode = 'P0001';
    end if;
  end if;
  if v is not null and char_length(v) not between 2 and 80 then
    raise exception 'Il prestavolto va da 2 a 80 caratteri.' using errcode = 'P0001';
  end if;
  if v is not null and exists (
    select 1 from public.characters where lower(face_claim) = lower(v) and id <> p_character
  ) then
    raise exception 'Questo prestavolto è già registrato da un altro personaggio.' using errcode = 'P0001';
  end if;
  update public.characters set face_claim = v where id = p_character;
end;
$$;
revoke execute on function public.set_face_claim(uuid, text) from public, anon;
grant execute on function public.set_face_claim(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 2. STIPENDIO: importo per tenore di vita e impostazioni
-- ---------------------------------------------------------------------
alter table public.creation_options
  add column salary int not null default 0 check (salary between 0 and 1000000);

update public.creation_options set salary = case name
    when 'Squattrinato' then 20
    when 'Borsa di studio' then 40
    when 'Benestante' then 100
    when 'Ricco' then 250
    else salary end
where kind = 'tenore';

insert into public.game_settings (key, value, kind, label, description, sort_order) values
  ('stipendio_giorni', '1', 'number', 'Giorni per uno stipendio',
   'Ogni quanti giorni matura una quota di stipendio (1 = ogni giorno). Se non si ritira, si accumula.', 30),
  ('stipendio_max_quote', '30', 'number', 'Stipendi accumulabili',
   'Quante quote di stipendio si accumulano al massimo senza ritirarle (0 = nessun limite).', 31)
on conflict (key) do nothing;

-- Oggi, con l'ora italiana (il giorno nuovo parte a mezzanotte in Italia)
create or replace function public.bank_today()
returns date
language sql
stable
set search_path = ''
as $$ select (now() at time zone 'Europe/Rome')::date $$;

create or replace function public.salary_days()
returns int
language sql
stable
security definer
set search_path = ''
as $$ select greatest(1, coalesce(public.setting_int('stipendio_giorni'), 1)) $$;

-- Stipendio di una quota: tenore di vita (+ gruppi e lavori, quando ci saranno)
create or replace function public.character_salary(p_character uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(o.salary), 0)::int
  from public.character_options co
  join public.creation_options o on o.id = co.option_id
  where co.character_id = p_character and o.kind = 'tenore'
$$;
revoke execute on function public.character_salary(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. CONTI E MOVIMENTI
-- ---------------------------------------------------------------------
create table public.bank_accounts (
  character_id uuid primary key references public.characters (id) on delete cascade,
  balance int not null default 0 check (balance >= 0),
  -- stipendio pagato fino a questo giorno: da qui maturano le quote nuove
  salary_paid_until date not null,
  updated_at timestamptz not null default now()
);

create table public.bank_transactions (
  id bigint generated always as identity primary key,
  character_id uuid not null references public.characters (id) on delete cascade,
  amount int not null, -- positivo = entrata, negativo = uscita
  kind text not null check (kind in ('stipendio', 'bonifico', 'staff')),
  description text not null default '',
  counterpart_id uuid references public.characters (id) on delete set null,
  balance_after int not null,
  author_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index bank_transactions_character_idx on public.bank_transactions (character_id, created_at desc);
create index bank_transactions_counterpart_idx on public.bank_transactions (counterpart_id);
create index bank_transactions_author_idx on public.bank_transactions (author_id);

alter table public.bank_accounts enable row level security;
alter table public.bank_transactions enable row level security;

-- Si leggono il proprio conto e i propri movimenti; lo staff della banca tutti.
-- Nessuna scrittura diretta: si scrive solo con le funzioni (security definer).
revoke all on public.bank_accounts, public.bank_transactions from anon, authenticated;
grant select on public.bank_accounts, public.bank_transactions to authenticated;

create policy "Banca: il proprio conto o lo staff" on public.bank_accounts for select to authenticated
  using (
    exists (select 1 from public.characters c where c.id = character_id and c.owner_id = (select auth.uid()))
    or (select public.has_permission('banca.gestire'))
  );
create policy "Banca: nessun inserimento diretto" on public.bank_accounts for insert to authenticated with check (false);
create policy "Banca: nessuna modifica diretta" on public.bank_accounts for update to authenticated using (false);
create policy "Banca: nessuna eliminazione diretta" on public.bank_accounts for delete to authenticated using (false);

create policy "Movimenti: i propri o lo staff" on public.bank_transactions for select to authenticated
  using (
    exists (select 1 from public.characters c where c.id = character_id and c.owner_id = (select auth.uid()))
    or (select public.has_permission('banca.gestire'))
  );
create policy "Movimenti: nessun inserimento diretto" on public.bank_transactions for insert to authenticated with check (false);
create policy "Movimenti: nessuna modifica diretta" on public.bank_transactions for update to authenticated using (false);
create policy "Movimenti: nessuna eliminazione diretta" on public.bank_transactions for delete to authenticated using (false);

-- Apre il conto (se manca): la prima quota di stipendio è subito disponibile
create or replace function public.bank_open_account(p_character uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.bank_accounts (character_id, salary_paid_until)
  values (p_character, public.bank_today() - public.salary_days())
  on conflict (character_id) do nothing;
$$;
revoke execute on function public.bank_open_account(uuid) from public, anon, authenticated;

-- Scheda approvata: si apre il conto
create or replace function public.characters_open_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'approvata' and old.status is distinct from 'approvata' then
    perform public.bank_open_account(new.id);
  end if;
  return new;
end;
$$;
revoke execute on function public.characters_open_account() from public, anon, authenticated;
create trigger characters_open_account after update of status on public.characters
  for each row execute function public.characters_open_account();

-- I personaggi già approvati ricevono subito il loro conto
select public.bank_open_account(id) from public.characters where status = 'approvata';

-- ---------------------------------------------------------------------
-- 4. FUNZIONI DELLA BANCA
-- ---------------------------------------------------------------------

-- Situazione del conto: saldo, stipendio maturato, prossima quota
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
  v_max int := greatest(0, coalesce(public.setting_int('stipendio_max_quote'), 0));
  v_today date := public.bank_today();
  v_elapsed int;
  v_quotas int;
  v_salary int;
begin
  if not exists (
    select 1 from public.characters c
    where c.id = p_character and (c.owner_id = auth.uid() or public.has_permission('banca.gestire'))
  ) then
    raise exception 'Conto non trovato.' using errcode = '42501';
  end if;
  select * into a from public.bank_accounts where character_id = p_character;
  if not found then return null; end if; -- scheda non ancora approvata
  v_salary := public.character_salary(p_character);
  v_elapsed := greatest(0, (v_today - a.salary_paid_until) / v_days);
  v_quotas := case when v_max > 0 then least(v_elapsed, v_max) else v_elapsed end;
  return jsonb_build_object(
    'balance', a.balance,
    'salary', v_salary,
    'period_days', v_days,
    'quotas', v_quotas,
    'max_quotas', v_max,
    'accrued', v_quotas * v_salary,
    'next_on', a.salary_paid_until + (v_elapsed + 1) * v_days
  );
end;
$$;
revoke execute on function public.bank_overview(uuid) from public, anon;
grant execute on function public.bank_overview(uuid) to authenticated;

-- Ritiro dello stipendio accumulato: va sul conto
create or replace function public.collect_salary(p_character uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.bank_accounts;
  v_days int := public.salary_days();
  v_max int := greatest(0, coalesce(public.setting_int('stipendio_max_quote'), 0));
  v_elapsed int;
  v_quotas int;
  v_salary int;
  v_amount int;
begin
  if not public.owns_character(p_character) then
    raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501';
  end if;
  perform public.bank_open_account(p_character);
  -- due ritiri contemporanei non pagano due volte
  select * into a from public.bank_accounts where character_id = p_character for update;
  v_salary := public.character_salary(p_character);
  if v_salary <= 0 then
    raise exception 'Il tuo personaggio non ha uno stipendio.' using errcode = 'P0001';
  end if;
  v_elapsed := greatest(0, (public.bank_today() - a.salary_paid_until) / v_days);
  if v_elapsed = 0 then
    raise exception 'Nessuno stipendio da ritirare: il prossimo matura il %.',
      to_char(a.salary_paid_until + v_days, 'DD/MM/YYYY') using errcode = 'P0001';
  end if;
  v_quotas := case when v_max > 0 then least(v_elapsed, v_max) else v_elapsed end;
  v_amount := v_quotas * v_salary;

  update public.bank_accounts
  set balance = balance + v_amount,
      salary_paid_until = salary_paid_until + v_elapsed * v_days,
      updated_at = now()
  where character_id = p_character
  returning * into a;

  insert into public.bank_transactions (character_id, amount, kind, description, balance_after, author_id)
  values (p_character, v_amount, 'stipendio',
          'Stipendio' || case when v_quotas > 1 then ' (' || v_quotas || ' quote)' else '' end,
          a.balance, auth.uid());
  return v_amount;
end;
$$;
revoke execute on function public.collect_salary(uuid) from public, anon;
grant execute on function public.collect_salary(uuid) to authenticated;

-- Bonifico a un personaggio di un altro giocatore
create or replace function public.bank_transfer(p_from uuid, p_to uuid, p_amount int, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from public.characters;
  v_to public.characters;
  v_reason text := left(btrim(coalesce(p_reason, '')), 200);
  v_suffix text;
  v_from_balance int;
  v_to_balance int;
begin
  if not public.owns_character(p_from) then
    raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501';
  end if;
  if p_amount is null or p_amount < 1 or p_amount > 100000000 then
    raise exception 'Indica quanti dollari mandare.' using errcode = 'P0001';
  end if;
  select * into v_from from public.characters where id = p_from;
  select * into v_to from public.characters where id = p_to and status = 'approvata';
  if v_to.id is null then
    raise exception 'Il personaggio destinatario non esiste o non è approvato.' using errcode = 'P0001';
  end if;
  if v_to.owner_id = v_from.owner_id then
    raise exception 'Non puoi mandare soldi a te stesso o a un altro tuo personaggio.' using errcode = 'P0001';
  end if;
  v_suffix := case when v_reason = '' then '' else ' · ' || v_reason end;

  perform public.bank_open_account(p_from);
  perform public.bank_open_account(p_to);
  -- blocca i conti sempre nello stesso ordine: due bonifici incrociati non si incastrano
  perform 1 from public.bank_accounts where character_id in (p_from, p_to) order by character_id for update;

  update public.bank_accounts set balance = balance - p_amount, updated_at = now()
  where character_id = p_from and balance >= p_amount
  returning balance into v_from_balance;
  if not found then
    raise exception 'Sul conto non ci sono abbastanza dollari.' using errcode = 'P0001';
  end if;
  update public.bank_accounts set balance = balance + p_amount, updated_at = now()
  where character_id = p_to
  returning balance into v_to_balance;

  insert into public.bank_transactions (character_id, amount, kind, description, counterpart_id, balance_after, author_id) values
    (p_from, -p_amount, 'bonifico', 'Bonifico a ' || v_to.name || v_suffix, p_to, v_from_balance, auth.uid()),
    (p_to, p_amount, 'bonifico', 'Bonifico da ' || v_from.name || v_suffix, p_from, v_to_balance, auth.uid());

  perform public.send_system_message(v_to.owner_id,
    v_from.name || ' ha mandato ' || p_amount || ' $ a ' || v_to.name
    || case when v_reason = '' then '.' else ': «' || v_reason || '».' end
    || E'\nLo trovi in Utility → Banca.');
end;
$$;
revoke execute on function public.bank_transfer(uuid, uuid, int, text) from public, anon;
grant execute on function public.bank_transfer(uuid, uuid, int, text) to authenticated;

-- Staff: dà (importo positivo) o toglie (negativo) soldi, con un motivo
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
  where character_id = p_character and balance + p_amount >= 0
  returning balance into v_balance;
  if not found then
    raise exception 'Sul conto non ci sono abbastanza dollari da togliere.' using errcode = 'P0001';
  end if;
  insert into public.bank_transactions (character_id, amount, kind, description, balance_after, author_id)
  values (p_character, p_amount, 'staff', 'Staff · ' || v_reason, v_balance, auth.uid());
  perform public.send_system_message(v_owner,
    'Lo staff ha ' || case when p_amount > 0 then 'dato ' || p_amount || ' $ a ' else 'tolto ' || (-p_amount) || ' $ a ' end
    || v_name || ': «' || v_reason || '».' || E'\nLo trovi in Utility → Banca.');
end;
$$;
revoke execute on function public.bank_staff_adjust(uuid, int, text) from public, anon;
grant execute on function public.bank_staff_adjust(uuid, int, text) to authenticated;

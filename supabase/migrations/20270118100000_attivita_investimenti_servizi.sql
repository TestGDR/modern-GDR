-- =====================================================================
-- ATTIVITÀ, INVESTIMENTI E SERVIZI A PAGAMENTO
-- (da lanciare dopo 20270117100000_mercato_spese_e_catalogo.sql)
-- 1. Attività (Utility → Attività): si comprano dal catalogo dello staff,
--    si gestiscono una volta al mese con un tiro (caratteristica + abilità
--    + d10 contro attivita_cd): mese d'oro ×1,5, buono ×1, fiacco 0,
--    disastro −50%. Chi non gestisce ha un tiro automatico con −2.
--    Una per personaggio, si rivendono al 70%.
-- 2. Investimenti (Servizi bancari): conto deposito, fondo indicizzato,
--    azioni tech e cripto. Il valore cambia ogni 30 giorni; si ritira con
--    il 2% di commissione.
-- 3. Servizi a pagamento: tutor privato (+1 in un corso), personal
--    trainer (allenamento −2 alla CD per 30 giorni), fisioterapia (un
--    infortunio sportivo dura una gara in meno).
-- =====================================================================

-- ---------------------------------------------------------------------
-- IMPOSTAZIONI E MOVIMENTI
-- ---------------------------------------------------------------------
insert into public.game_settings (key, value, kind, label, description, sort_order) values
  ('attivita_cd', '14', 'number', 'Attività · CD della gestione', 'Caratteristica + abilità + d10 contro questa CD, una volta al mese.', 330),
  ('attivita_giorni', '30', 'number', 'Attività · Giorni tra due gestioni', 'Ogni quanti giorni si gestisce l''attività (e arriva l''incasso).', 331),
  ('attivita_max', '1', 'number', 'Attività · Attività per personaggio', 'Quante attività può avere un personaggio.', 332),
  ('attivita_rivendita', '70', 'number', 'Attività · Rivendita (%)', 'Quanto del prezzo pagato si riprende vendendo un''attività.', 333),
  ('attivita_trascurata', '2', 'number', 'Attività · Malus se trascurata', 'Chi non gestisce l''attività in tempo ha un tiro automatico con questo malus.', 334),
  ('investimenti_minimo', '100', 'number', 'Investimenti · Versamento minimo', 'Il versamento più piccolo in un investimento.', 335),
  ('investimenti_commissione', '2', 'number', 'Investimenti · Commissione sul ritiro (%)', 'Quanto trattiene la banca su ogni ritiro.', 336),
  ('investimenti_giorni', '30', 'number', 'Investimenti · Giorni tra due variazioni', 'Ogni quanti giorni cambia il valore degli investimenti.', 337),
  ('servizio_tutor', '400', 'number', 'Servizi · Tutor privato ($ per corso)', '+1 a esami e compiti di un corso per il semestre.', 338),
  ('servizio_tutor_max', '2', 'number', 'Servizi · Corsi con il tutor per semestre', 'Quanti corsi con il tutor privato in un semestre.', 339),
  ('servizio_trainer', '300', 'number', 'Servizi · Personal trainer ($ per 30 giorni)', 'Allenamento sportivo più facile per 30 giorni.', 340),
  ('servizio_trainer_cd', '2', 'number', 'Servizi · Personal trainer: CD in meno', 'Quanto scende la CD dell''allenamento settimanale.', 341),
  ('servizio_fisio', '1500', 'number', 'Servizi · Fisioterapia ($)', 'Un infortunio sportivo dura una gara in meno (mai sotto 1).', 342)
on conflict (key) do nothing;

alter table public.bank_transactions drop constraint if exists bank_transactions_kind_check;
alter table public.bank_transactions add constraint bank_transactions_kind_check
  check (kind in ('stipendio', 'bonifico', 'staff', 'mantenimento', 'iniziale', 'acquisto', 'affitto', 'casa', 'retta', 'college',
                  'oggetti', 'attivita', 'investimento', 'servizio'));

-- movimento sul conto con la sua riga nella banca
create or replace function public.bank_move(p_character uuid, p_amount int, p_kind text, p_description text, p_need_balance boolean default false)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance int;
begin
  perform public.bank_open_account(p_character);
  update public.bank_accounts set balance = balance + p_amount, updated_at = now()
  where character_id = p_character and (not p_need_balance or p_amount >= 0 or balance >= -p_amount)
  returning balance into v_balance;
  if not found then
    raise exception 'Sul conto non ci sono abbastanza dollari (servono % $).', -p_amount using errcode = 'P0001';
  end if;
  if p_amount <> 0 then
    insert into public.bank_transactions (character_id, amount, kind, description, balance_after, author_id)
    values (p_character, p_amount, p_kind, left(p_description, 200), v_balance, auth.uid());
  end if;
  return v_balance;
end;
$$;
revoke execute on function public.bank_move(uuid, int, text, text, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 1. ATTIVITÀ
-- ---------------------------------------------------------------------
create table if not exists public.business_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(btrim(name)) between 2 and 60),
  description text not null default '' check (char_length(description) <= 1000),
  image_url text check (image_url is null or image_url ~ '^https://'),
  price int not null check (price between 0 and 100000000),
  base_income int not null check (base_income between 0 and 10000000),
  skill_id uuid references public.skills (id) on delete set null,
  max_owners int check (max_owners is null or max_owners >= 1),
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.business_types enable row level security;
drop policy if exists "Attività: catalogo" on public.business_types;
create policy "Attività: catalogo" on public.business_types for select to authenticated
  using (active or (select public.has_permission('attivita.gestire')));
drop policy if exists "Attività: lo staff aggiunge" on public.business_types;
create policy "Attività: lo staff aggiunge" on public.business_types for insert to authenticated
  with check ((select public.has_permission('attivita.gestire')));
drop policy if exists "Attività: lo staff modifica" on public.business_types;
create policy "Attività: lo staff modifica" on public.business_types for update to authenticated
  using ((select public.has_permission('attivita.gestire'))) with check ((select public.has_permission('attivita.gestire')));
drop policy if exists "Attività: lo staff elimina" on public.business_types;
create policy "Attività: lo staff elimina" on public.business_types for delete to authenticated
  using ((select public.has_permission('attivita.gestire')));

create table if not exists public.character_businesses (
  id bigint generated always as identity primary key,
  character_id uuid not null references public.characters (id) on delete cascade,
  type_id uuid references public.business_types (id) on delete set null,
  type_name text not null,
  name text not null check (char_length(btrim(name)) between 2 and 60),
  price_paid int not null default 0,
  base_income int not null default 0,
  skill_id uuid references public.skills (id) on delete set null,
  managed_at timestamptz not null default now(),
  acquired_at timestamptz not null default now()
);
create index if not exists character_businesses_character_idx on public.character_businesses (character_id);
alter table public.character_businesses enable row level security;
revoke insert, update on public.character_businesses from anon, authenticated;
drop policy if exists "Attività dei PG: proprietario e staff" on public.character_businesses;
create policy "Attività dei PG: proprietario e staff" on public.character_businesses for select to authenticated
  using ((select public.owns_character(character_id)) or (select public.has_permission('attivita.gestire')));
drop policy if exists "Attività dei PG: lo staff toglie" on public.character_businesses;
create policy "Attività dei PG: lo staff toglie" on public.character_businesses for delete to authenticated
  using ((select public.has_permission('attivita.gestire')));

create table if not exists public.business_reports (
  id bigint generated always as identity primary key,
  business_id bigint not null references public.character_businesses (id) on delete cascade,
  character_id uuid not null references public.characters (id) on delete cascade,
  auto boolean not null default false,
  d10 int not null,
  crit text not null default 'none',
  extra int,
  total int not null,
  cd int not null,
  margin int not null,
  outcome text not null check (outcome in ('oro', 'buono', 'fiacco', 'disastro')),
  amount int not null,
  created_at timestamptz not null default now()
);
create index if not exists business_reports_business_idx on public.business_reports (business_id, created_at desc);
alter table public.business_reports enable row level security;
revoke insert, update, delete on public.business_reports from anon, authenticated;
drop policy if exists "Resoconti delle attività: proprietario e staff" on public.business_reports;
create policy "Resoconti delle attività: proprietario e staff" on public.business_reports for select to authenticated
  using ((select public.owns_character(character_id)) or (select public.has_permission('attivita.gestire')));

-- catalogo di partenza
insert into public.business_types (name, description, price, base_income, skill_id, sort_order)
select v.name, v.descr, v.price, v.income, (select id from public.skills where name = v.skill), v.ord
from (values
  ('Chiosco di smoothie', 'Un chiosco sul lungomare di Pacific Beach: frutta fresca, surfisti assetati, turisti in coda.', 8000, 120, 'Vita sociale', 1),
  ('Food truck di tacos', 'Tacos di pesce alla maniera di Baja, parcheggiato dove c''è gente: campus, spiaggia, concerti.', 25000, 375, 'Cucina', 2),
  ('Noleggio tavole da surf', 'Tavole, mute e lezioni per principianti a La Jolla Shores.', 40000, 600, 'Nuoto e sport acquatici', 3),
  ('Negozio vintage', 'Abiti di seconda mano e pezzi rari nel North Park.', 60000, 900, 'Stile e immagine', 4),
  ('Caffetteria vicino al campus', 'Caffè, wifi e studenti in sessione d''esami, tutto l''anno.', 80000, 1200, 'Scienze sociali ed economia', 5),
  ('Bar sulla spiaggia', 'Cocktail al tramonto, musica dal vivo e la serata giusta per farsi conoscere.', 150000, 2250, 'Leadership', 6)
) as v (name, descr, price, income, skill, ord)
where not exists (select 1 from public.business_types b where b.name = v.name);

-- il tiro di gestione (giocatore o automatico) e l'incasso del mese
create or replace function public.business_roll(p_business bigint, p_auto boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.character_businesses;
  v_attr_id uuid;
  v_attr int; v_skill int; m jsonb;
  v_cd int := coalesce(public.setting_int('attivita_cd'), 14);
  v_malus int := case when p_auto then coalesce(public.setting_int('attivita_trascurata'), 2) else 0 end;
  v_d int; v_extra int; v_crit text := 'none'; v_dval int; v_total int; v_margin int;
  v_outcome text; v_amount int;
begin
  select * into b from public.character_businesses where id = p_business for update;
  select attribute_id into v_attr_id from public.skills where id = b.skill_id;
  v_attr := coalesce((select value from public.character_attributes where character_id = b.character_id and attribute_id = v_attr_id), 0);
  v_skill := coalesce((select level from public.character_skills where character_id = b.character_id and skill_id = b.skill_id), 0);
  m := public.trait_mods(b.character_id, jsonb_build_object('system', 'business', 'skill_id', b.skill_id, 'attribute_id', v_attr_id));
  v_d := public.academic_die();
  v_dval := v_d;
  if v_d >= (m ->> 'success_min')::int then
    v_extra := public.academic_die(); v_crit := 'success'; v_dval := v_d + v_extra;
  elsif v_d <= (m ->> 'failure_max')::int then
    v_extra := public.academic_die(); v_crit := 'failure'; v_dval := v_d - v_extra;
  end if;
  v_total := v_attr + v_skill + v_dval + (m ->> 'total')::int - v_malus;
  v_margin := v_total - v_cd;
  v_outcome := case when v_crit = 'success' or v_margin >= 5 then 'oro'
                    when v_crit = 'failure' or v_margin <= -5 then 'disastro'
                    when v_margin >= 0 then 'buono' else 'fiacco' end;
  v_amount := case v_outcome when 'oro' then round(b.base_income * 1.5)::int when 'buono' then b.base_income
                             when 'fiacco' then 0 else -round(b.base_income * 0.5)::int end;
  if v_amount <> 0 then
    perform public.bank_move(b.character_id, v_amount, 'attivita',
      b.name || ': ' || case v_outcome when 'oro' then 'mese d''oro' when 'buono' then 'incasso del mese' else 'mese in perdita' end);
  end if;
  insert into public.business_reports (business_id, character_id, auto, d10, crit, extra, total, cd, margin, outcome, amount)
  values (b.id, b.character_id, p_auto, v_d, v_crit, v_extra, v_total, v_cd, v_margin, v_outcome, v_amount);
  update public.character_businesses set managed_at = now() where id = b.id;
  return jsonb_build_object('outcome', v_outcome, 'amount', v_amount, 'total', v_total, 'cd', v_cd, 'd10', v_d, 'crit', v_crit, 'auto', p_auto);
end;
$$;
revoke execute on function public.business_roll(bigint, boolean) from public, anon, authenticated;

create or replace function public.business_buy(p_character uuid, p_type uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.business_types;
  v_name text := btrim(coalesce(p_name, ''));
begin
  if not public.owns_character(p_character) then raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501'; end if;
  select * into t from public.business_types where id = p_type and active;
  if t.id is null then raise exception 'Attività non disponibile.' using errcode = 'P0001'; end if;
  if (select count(*) from public.character_businesses where character_id = p_character) >= coalesce(public.setting_int('attivita_max'), 1) then
    raise exception 'Puoi avere al massimo % attività.', coalesce(public.setting_int('attivita_max'), 1) using errcode = 'P0001';
  end if;
  if t.max_owners is not null and (select count(*) from public.character_businesses where type_id = t.id) >= t.max_owners then
    raise exception 'Non ce ne sono più in vendita.' using errcode = 'P0001';
  end if;
  if char_length(v_name) < 2 then v_name := t.name; end if;
  perform public.bank_move(p_character, -t.price, 'attivita', 'Acquisto attività: ' || left(v_name, 60), true);
  insert into public.character_businesses (character_id, type_id, type_name, name, price_paid, base_income, skill_id)
  values (p_character, t.id, t.name, left(v_name, 60), t.price, t.base_income, t.skill_id);
end;
$$;
revoke execute on function public.business_buy(uuid, uuid, text) from public, anon;
grant execute on function public.business_buy(uuid, uuid, text) to authenticated;

create or replace function public.business_manage(p_character uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.character_businesses;
  v_days int := greatest(1, coalesce(public.setting_int('attivita_giorni'), 30));
begin
  if not public.owns_character(p_character) then raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501'; end if;
  select * into b from public.character_businesses where character_id = p_character order by acquired_at limit 1 for update;
  if b.id is null then raise exception 'Non hai un''attività.' using errcode = 'P0001'; end if;
  if b.managed_at > now() - make_interval(days => v_days) then
    raise exception 'Il prossimo mese di gestione comincia il %.',
      to_char((b.managed_at + make_interval(days => v_days)) at time zone 'Europe/Rome', 'DD/MM "alle" HH24:MI') using errcode = 'P0001';
  end if;
  return public.business_roll(b.id, false);
end;
$$;
revoke execute on function public.business_manage(uuid) from public, anon;
grant execute on function public.business_manage(uuid) to authenticated;

-- ogni giorno: le attività non gestite da più di 5 giorni oltre il mese vanno avanti da sole (con il malus)
create or replace function public.business_auto_all()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b record;
  r jsonb;
  v_days int := greatest(1, coalesce(public.setting_int('attivita_giorni'), 30));
begin
  for b in
    select cb.id, cb.name, c.owner_id, c.name as character_name from public.character_businesses cb
    join public.characters c on c.id = cb.character_id and c.status = 'approvata'
    where cb.managed_at <= now() - make_interval(days => v_days + 5)
  loop
    r := public.business_roll(b.id, true);
    perform public.send_system_message(b.owner_id,
      '🏪 ' || b.name || ' è andata avanti da sola (nessuno l''ha gestita): '
      || case r ->> 'outcome' when 'oro' then 'mese d''oro' when 'buono' then 'mese normale' when 'fiacco' then 'mese fiacco' else 'mese disastroso' end
      || ', ' || case when (r ->> 'amount')::int >= 0 then '+' else '' end || (r ->> 'amount') || ' $. '
      || 'Gestiscila tu da Utility → Attività: niente malus.');
  end loop;
end;
$$;
revoke execute on function public.business_auto_all() from public, anon, authenticated;

create or replace function public.business_sell(p_character uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.character_businesses;
  v_back int;
begin
  if not public.owns_character(p_character) then raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501'; end if;
  select * into b from public.character_businesses where character_id = p_character order by acquired_at limit 1 for update;
  if b.id is null then raise exception 'Non hai un''attività.' using errcode = 'P0001'; end if;
  v_back := round(b.price_paid * coalesce(public.setting_int('attivita_rivendita'), 70) / 100.0)::int;
  perform public.bank_move(p_character, v_back, 'attivita', 'Vendita attività: ' || b.name);
  delete from public.character_businesses where id = b.id;
  return v_back;
end;
$$;
revoke execute on function public.business_sell(uuid) from public, anon;
grant execute on function public.business_sell(uuid) to authenticated;

create or replace function public.business_rename(p_character uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.owns_character(p_character) then raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 2 and 60 then raise exception 'Il nome va da 2 a 60 caratteri.' using errcode = 'P0001'; end if;
  update public.character_businesses set name = btrim(p_name) where character_id = p_character;
end;
$$;
revoke execute on function public.business_rename(uuid, text) from public, anon;
grant execute on function public.business_rename(uuid, text) to authenticated;

-- chi possiede cosa (lo vedono tutti; incassi e resoconti no)
create or replace function public.business_directory()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('name', cb.name, 'type', cb.type_name, 'character_id', c.id, 'owner', public.first_name(c.name))
    order by cb.name), '[]'::jsonb)
  from public.character_businesses cb join public.characters c on c.id = cb.character_id and c.status = 'approvata'
$$;
revoke execute on function public.business_directory() from public, anon;
grant execute on function public.business_directory() to authenticated;

-- ---------------------------------------------------------------------
-- 2. INVESTIMENTI
-- ---------------------------------------------------------------------
create table if not exists public.investment_products (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(btrim(name)) between 2 and 60),
  description text not null default '' check (char_length(description) <= 600),
  risk text not null check (risk in ('basso', 'medio', 'alto')),
  min_pct numeric(6, 2) not null,
  max_pct numeric(6, 2) not null,
  crash_chance numeric(5, 2) not null default 0 check (crash_chance between 0 and 100),
  crash_pct numeric(6, 2) not null default 0,
  active boolean not null default true,
  sort_order int not null default 0,
  check (max_pct >= min_pct)
);
alter table public.investment_products enable row level security;
drop policy if exists "Investimenti: prodotti" on public.investment_products;
create policy "Investimenti: prodotti" on public.investment_products for select to authenticated
  using (active or (select public.has_permission('banca.gestire')));
drop policy if exists "Investimenti: lo staff aggiunge" on public.investment_products;
create policy "Investimenti: lo staff aggiunge" on public.investment_products for insert to authenticated
  with check ((select public.has_permission('banca.gestire')));
drop policy if exists "Investimenti: lo staff modifica" on public.investment_products;
create policy "Investimenti: lo staff modifica" on public.investment_products for update to authenticated
  using ((select public.has_permission('banca.gestire'))) with check ((select public.has_permission('banca.gestire')));
drop policy if exists "Investimenti: lo staff elimina" on public.investment_products;
create policy "Investimenti: lo staff elimina" on public.investment_products for delete to authenticated
  using ((select public.has_permission('banca.gestire')));

insert into public.investment_products (name, description, risk, min_pct, max_pct, crash_chance, crash_pct, sort_order)
select * from (values
  ('Conto deposito', 'Soldi al sicuro: interessi bassi ma certi, ogni mese.', 'basso', 0.3, 0.3, 0, 0, 1),
  ('Fondo indicizzato', 'Un po'' di tutto il mercato americano: sale e scende, ma nel tempo tende a crescere.', 'medio', -3, 4, 0, 0, 2),
  ('Azioni tech e cripto', 'Startup della Silicon Valley e criptovalute: si può guadagnare molto… o perdere quasi tutto in un mese.', 'alto', -12, 16, 3, -40, 3)
) as v (name, description, risk, min_pct, max_pct, crash_chance, crash_pct, sort_order)
where not exists (select 1 from public.investment_products p where p.name = v.name);

create table if not exists public.character_investments (
  id bigint generated always as identity primary key,
  character_id uuid not null references public.characters (id) on delete cascade,
  product_id uuid not null references public.investment_products (id) on delete restrict,
  invested int not null default 0,
  value int not null default 0 check (value >= 0),
  moved_at timestamptz not null default now(),
  opened_at timestamptz not null default now(),
  unique (character_id, product_id)
);
alter table public.character_investments enable row level security;
revoke insert, update, delete on public.character_investments from anon, authenticated;
drop policy if exists "Investimenti dei PG: proprietario e staff" on public.character_investments;
create policy "Investimenti dei PG: proprietario e staff" on public.character_investments for select to authenticated
  using ((select public.owns_character(character_id)) or (select public.has_permission('banca.gestire')));

create table if not exists public.investment_moves (
  id bigint generated always as identity primary key,
  investment_id bigint not null references public.character_investments (id) on delete cascade,
  character_id uuid not null references public.characters (id) on delete cascade,
  pct numeric(6, 2) not null,
  crash boolean not null default false,
  value_before int not null,
  value_after int not null,
  created_at timestamptz not null default now()
);
create index if not exists investment_moves_investment_idx on public.investment_moves (investment_id, created_at desc);
alter table public.investment_moves enable row level security;
revoke insert, update, delete on public.investment_moves from anon, authenticated;
drop policy if exists "Andamento degli investimenti: proprietario e staff" on public.investment_moves;
create policy "Andamento degli investimenti: proprietario e staff" on public.investment_moves for select to authenticated
  using ((select public.owns_character(character_id)) or (select public.has_permission('banca.gestire')));

create or replace function public.invest_deposit(p_character uuid, p_product uuid, p_amount int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.investment_products;
begin
  if not public.owns_character(p_character) then raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501'; end if;
  select * into p from public.investment_products where id = p_product and active;
  if p.id is null then raise exception 'Investimento non disponibile.' using errcode = 'P0001'; end if;
  if p_amount is null or p_amount < coalesce(public.setting_int('investimenti_minimo'), 100) or p_amount > 100000000 then
    raise exception 'Il versamento minimo è di % $.', coalesce(public.setting_int('investimenti_minimo'), 100) using errcode = 'P0001';
  end if;
  perform public.bank_move(p_character, -p_amount, 'investimento', 'Versamento: ' || p.name, true);
  insert into public.character_investments (character_id, product_id, invested, value)
  values (p_character, p_product, p_amount, p_amount)
  on conflict (character_id, product_id) do update set invested = public.character_investments.invested + excluded.invested,
    value = public.character_investments.value + excluded.value;
end;
$$;
revoke execute on function public.invest_deposit(uuid, uuid, int) from public, anon;
grant execute on function public.invest_deposit(uuid, uuid, int) to authenticated;

-- ritiro (null = tutto), con la commissione
create or replace function public.invest_withdraw(p_character uuid, p_product uuid, p_amount int default null)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.character_investments;
  v_amount int;
  v_fee int;
  v_name text;
begin
  if not public.owns_character(p_character) then raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501'; end if;
  select * into i from public.character_investments where character_id = p_character and product_id = p_product for update;
  if i.id is null or i.value <= 0 then raise exception 'Non hai soldi in questo investimento.' using errcode = 'P0001'; end if;
  v_amount := coalesce(p_amount, i.value);
  if v_amount < 1 or v_amount > i.value then raise exception 'Puoi ritirare da 1 a % $.', i.value using errcode = 'P0001'; end if;
  v_fee := ceil(v_amount * coalesce(public.setting_int('investimenti_commissione'), 2) / 100.0)::int;
  select name into v_name from public.investment_products where id = p_product;
  perform public.bank_move(p_character, v_amount - v_fee, 'investimento',
    'Ritiro: ' || v_name || case when v_fee > 0 then ' (commissione ' || v_fee || ' $)' else '' end);
  if v_amount = i.value then
    delete from public.character_investments where id = i.id;
  else
    update public.character_investments
    set invested = round(invested * (value - v_amount)::numeric / value)::int, value = value - v_amount
    where id = i.id;
  end if;
  return v_amount - v_fee;
end;
$$;
revoke execute on function public.invest_withdraw(uuid, uuid, int) from public, anon;
grant execute on function public.invest_withdraw(uuid, uuid, int) to authenticated;

-- ogni giorno: gli investimenti fermi da un mese cambiano valore (anche più mesi di fila, se arretrati)
create or replace function public.investments_move_all()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  i record;
  v_days int := greatest(1, coalesce(public.setting_int('investimenti_giorni'), 30));
  v_pct numeric;
  v_crash boolean;
  v_before int;
  v_value int;
  v_moved timestamptz;
  u record;
begin
  create temporary table if not exists pg_temp.inv_news (owner_id uuid, character_name text, line text) on commit drop;
  truncate pg_temp.inv_news;
  for i in
    select ci.*, p.name as product, p.min_pct, p.max_pct, p.crash_chance, p.crash_pct, c.owner_id, c.name as character_name
    from public.character_investments ci join public.investment_products p on p.id = ci.product_id
    join public.characters c on c.id = ci.character_id
    where ci.moved_at <= now() - make_interval(days => v_days)
    for update of ci
  loop
    v_value := i.value;
    v_moved := i.moved_at;
    while v_moved <= now() - make_interval(days => v_days) loop
      v_crash := i.crash_chance > 0 and random() * 100 < i.crash_chance;
      v_pct := case when v_crash then i.crash_pct else round((i.min_pct + random() * (i.max_pct - i.min_pct))::numeric, 2) end;
      v_before := v_value;
      v_value := greatest(0, round(v_value * (1 + v_pct / 100))::int);
      insert into public.investment_moves (investment_id, character_id, pct, crash, value_before, value_after)
      values (i.id, i.character_id, v_pct, v_crash, v_before, v_value);
      v_moved := v_moved + make_interval(days => v_days);
      insert into pg_temp.inv_news values (i.owner_id, i.character_name,
        i.product || ' ' || case when v_pct >= 0 then '+' else '' end || to_char(v_pct, 'FM990.0') || '%'
        || case when v_crash then ' (crollo!)' else '' end || ' → ' || v_value || ' $');
    end loop;
    update public.character_investments set value = v_value, moved_at = v_moved where id = i.id;
  end loop;
  for u in select owner_id, character_name, string_agg(line, E'\n') as lines from pg_temp.inv_news group by owner_id, character_name loop
    perform public.send_system_message(u.owner_id, '📈 Investimenti di ' || public.first_name(u.character_name) || E'\n' || u.lines
      || E'\nDettagli in Utility → Servizi bancari.');
  end loop;
end;
$$;
revoke execute on function public.investments_move_all() from public, anon, authenticated;

create or replace function public.investments_overview(p_character uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.characters c where c.id = p_character and (c.owner_id = auth.uid() or public.has_permission('banca.gestire'))) then
    raise exception 'Non hai i permessi necessari.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'minimum', coalesce(public.setting_int('investimenti_minimo'), 100),
    'fee', coalesce(public.setting_int('investimenti_commissione'), 2),
    'days', coalesce(public.setting_int('investimenti_giorni'), 30),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'description', p.description, 'risk', p.risk,
        'min_pct', p.min_pct, 'max_pct', p.max_pct, 'crash_chance', p.crash_chance, 'crash_pct', p.crash_pct,
        'invested', ci.invested, 'value', ci.value, 'moved_at', ci.moved_at,
        'history', coalesce((select jsonb_agg(jsonb_build_object('pct', m.pct, 'crash', m.crash, 'value', m.value_after, 'at', m.created_at) order by m.created_at desc)
                             from (select * from public.investment_moves where investment_id = ci.id order by created_at desc limit 6) m), '[]'::jsonb)
      ) order by p.sort_order)
      from public.investment_products p
      left join public.character_investments ci on ci.product_id = p.id and ci.character_id = p_character
      where p.active or ci.id is not null), '[]'::jsonb));
end;
$$;
revoke execute on function public.investments_overview(uuid) from public, anon;
grant execute on function public.investments_overview(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 3. SERVIZI A PAGAMENTO
-- ---------------------------------------------------------------------
alter table public.enrollments add column if not exists tutor_bonus int not null default 0 check (tutor_bonus between 0 and 3);
alter table public.sport_roster add column if not exists trainer_until timestamptz;

create or replace function public.service_tutor(p_enrollment bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e record;
  v_price int := coalesce(public.setting_int('servizio_tutor'), 400);
  v_max int := coalesce(public.setting_int('servizio_tutor_max'), 2);
begin
  select en.*, co.code, t.status as term_status into e
  from public.enrollments en join public.courses co on co.id = en.course_id join public.academic_terms t on t.id = en.term_id
  where en.id = p_enrollment for update of en;
  if e.id is null or not public.owns_character(e.character_id) then raise exception 'Iscrizione non trovata.' using errcode = '42501'; end if;
  if e.term_status not in ('registration_open', 'in_progress') or e.status <> 'enrolled' then
    raise exception 'Il tutor si prende per un corso del semestre in corso.' using errcode = 'P0001';
  end if;
  if e.tutor_bonus > 0 then raise exception 'Hai già un tutor per %.', e.code using errcode = 'P0001'; end if;
  if (select count(*) from public.enrollments where character_id = e.character_id and term_id = e.term_id and tutor_bonus > 0) >= v_max then
    raise exception 'Al massimo % corsi con il tutor per semestre.', v_max using errcode = 'P0001';
  end if;
  perform public.bank_move(e.character_id, -v_price, 'servizio', 'Tutor privato: ' || e.code, true);
  update public.enrollments set tutor_bonus = 1 where id = e.id;
end;
$$;
revoke execute on function public.service_tutor(bigint) from public, anon;
grant execute on function public.service_tutor(bigint) to authenticated;

create or replace function public.service_trainer(p_character uuid, p_sport uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  ro public.sport_roster;
  v_until timestamptz;
begin
  if not public.owns_character(p_character) then raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501'; end if;
  select * into ro from public.sport_roster where character_id = p_character and sport_id = p_sport and left_at is null for update;
  if ro.id is null then raise exception 'Non fai parte di questa squadra.' using errcode = 'P0001'; end if;
  perform public.bank_move(p_character, -coalesce(public.setting_int('servizio_trainer'), 300), 'servizio', 'Personal trainer (30 giorni)', true);
  v_until := greatest(now(), coalesce(ro.trainer_until, now())) + interval '30 days';
  update public.sport_roster set trainer_until = v_until where id = ro.id;
  return v_until;
end;
$$;
revoke execute on function public.service_trainer(uuid, uuid) from public, anon;
grant execute on function public.service_trainer(uuid, uuid) to authenticated;

create or replace function public.service_physio(p_character uuid, p_sport uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  ro public.sport_roster;
begin
  if not public.owns_character(p_character) then raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501'; end if;
  select * into ro from public.sport_roster where character_id = p_character and sport_id = p_sport and left_at is null for update;
  if ro.id is null then raise exception 'Non fai parte di questa squadra.' using errcode = 'P0001'; end if;
  if ro.injury_events_left >= 999 then raise exception 'Un infortunio da fine stagione non si accorcia.' using errcode = 'P0001'; end if;
  if ro.injury_events_left < 2 then raise exception 'La fisioterapia accorcia un infortunio di almeno 2 gare (mai sotto 1).' using errcode = 'P0001'; end if;
  perform public.bank_move(p_character, -coalesce(public.setting_int('servizio_fisio'), 1500), 'servizio', 'Fisioterapia privata', true);
  update public.sport_roster set injury_events_left = injury_events_left - 1 where id = ro.id;
  return ro.injury_events_left - 1;
end;
$$;
revoke execute on function public.service_physio(uuid, uuid) from public, anon;
grant execute on function public.service_physio(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- RESET DELLA SCHEDA E LAVORI AUTOMATICI
-- ---------------------------------------------------------------------
create or replace function public.characters_reset_finance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'bozza' and old.status = 'approvata' and new.creation_step = 1 then
    delete from public.character_businesses where character_id = new.id;
    delete from public.character_investments where character_id = new.id;
  end if;
  return null;
end;
$$;
revoke execute on function public.characters_reset_finance() from public, anon, authenticated;
drop trigger if exists characters_reset_finance on public.characters;
create trigger characters_reset_finance after update of status on public.characters
  for each row execute function public.characters_reset_finance();

do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('attivita-gestione', '15 5 * * *', 'select public.business_auto_all()');
  perform cron.schedule('investimenti-mese', '45 5 * * *', 'select public.investments_move_all()');
exception when others then
  raise notice 'pg_cron non disponibile: %', sqlerrm;
end $$;

-- ---------------------------------------------------------------------
-- TUTOR NEGLI ESAMI E NEI COMPITI, PERSONAL TRAINER NELL'ALLENAMENTO
-- ---------------------------------------------------------------------
create or replace function public.academic_simulate(p_term uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.academic_terms;
  cd_lv numeric[] := public.uni_list('uni_cd_livelli');
  cd_off numeric[] := public.uni_list('uni_cd_prove');
  w numeric[] := public.uni_list('uni_pesi_prove');
  eff numeric[] := public.uni_list('uni_impegno');
  v_base numeric := public.uni_n('uni_punteggio_base');
  v_per numeric := public.uni_n('uni_punti_per_margine');
  v_gpa_min numeric := public.uni_n('uni_gpa_minimo');
  v_req numeric := public.uni_n('uni_voto_minimo_requisiti');
  types text[] := array['coursework', 'midterm', 'final'];
  e record;
  s record;
  r public.student_records;
  v_attr int; v_skill int; v_traits int; v_effort int; v_load int; v_retake int; v_mods int;
  v_term_credits int; v_cdbase int; v_cd int;
  v_d int; v_extra int; v_crit text; v_dval int; v_total int; v_margin int; v_score int;
  v_sum numeric; v_wsum numeric;
  g record;
  v_attempted int; v_earned int; v_term_gpa numeric; v_cum numeric; v_total_credits int;
  v_before text; v_after text; v_pc int; v_after_susp boolean; v_deans boolean; v_grad boolean; v_honors text;
  v_class text; v_text text; v_major uuid;
  v_majorb int; v_job int;
  v_courses int := 0; v_students int := 0;
  m jsonb;
  v_smin int; v_fmax int;
  v_cool uuid; v_first int;
  v_bump uuid; v_gap int; v_fs int; v_next int;
  v_th numeric[] := public.uni_list('uni_soglie_voti');
begin
  perform public.uni_require_staff();
  select * into t from public.academic_terms where id = p_term for update;
  if t.id is null then raise exception 'Semestre non trovato.' using errcode = 'P0001'; end if;
  -- idempotente: un secondo lancio non ritira i dadi
  if t.status in ('simulated', 'published') then
    return jsonb_build_object('gia_simulato', true);
  end if;
  if t.status <> 'in_progress' then
    raise exception 'Prima chiudi le iscrizioni (semestre in corso).' using errcode = 'P0001';
  end if;
  v_wsum := coalesce(w[1], 20) + coalesce(w[2], 30) + coalesce(w[3], 50);

  -- 1. esami: tre tiri per ogni iscrizione attiva
  for e in
    select en.*, co.level, co.cd_modifier, co.attribute_id, co.skill_id, co.credits, co.department, co.area
    from public.enrollments en join public.courses co on co.id = en.course_id
    where en.term_id = p_term and en.status = 'enrolled'
    order by en.character_id, en.id
  loop
    v_attr := coalesce((select value from public.character_attributes where character_id = e.character_id and attribute_id = e.attribute_id), 0);
    v_skill := coalesce((select level from public.character_skills where character_id = e.character_id and skill_id = e.skill_id), 0);
    -- lavoro full time: malus, e l'impegno intenso vale come normale
    v_job := case when public.character_full_time_job(e.character_id) then -coalesce(public.uni_n('uni_lavoro_full_malus'), 1)::int else 0 end;
    v_effort := coalesce(eff[case when e.effort = 'minimal' then 1 when e.effort = 'intense' and v_job = 0 then 3 else 2 end], 0)::int;
    -- corsi dei dipartimenti del proprio Major
    v_majorb := case when public.uni_major_course(e.character_id, e.department) then coalesce(public.uni_n('uni_bonus_major'), 1)::int else 0 end;
    select coalesce(sum(c.credits), 0) into v_term_credits
    from public.enrollments x join public.courses c on c.id = x.course_id
    where x.character_id = e.character_id and x.term_id = p_term and x.status = 'enrolled';
    v_load := case when v_term_credits > public.uni_n('uni_carico_pesante_oltre') then -public.uni_n('uni_carico_pesante_malus')::int else 0 end;
    -- Instancabile: niente malus del carico pesante
    if public.trait_effect(e.character_id, 'no_heavy_load') is not null then v_load := 0; end if;
    v_retake := case when e.retake_after_f then public.uni_n('uni_bonus_ripetizione')::int else 0 end;
    v_mods := v_effort + v_load + v_retake + e.master_modifier + v_majorb + v_job + e.tutor_bonus;
    v_cdbase := coalesce(cd_lv[e.level / 100], 14)::int + e.cd_modifier;
    v_sum := 0;
    for i in 1..3 loop
      -- voci accademiche (e quelle di tutti i tiri) per questa prova
      m := public.trait_mods(e.character_id, jsonb_build_object('system', 'academic', 'skill_id', e.skill_id, 'exam_type', types[i],
        'department', e.department, 'area', e.area, 'retake', e.is_retake, 'credits', v_term_credits));
      v_traits := (m ->> 'total')::int;
      v_smin := (m ->> 'success_min')::int;
      v_fmax := (m ->> 'failure_max')::int;
      v_d := public.academic_die();
      v_extra := null;
      v_crit := 'none';
      v_dval := v_d;
      if v_d >= v_smin then
        v_extra := public.academic_die();
        v_crit := 'success';
        v_dval := v_d + v_extra;
      elsif v_d <= v_fmax then
        v_extra := public.academic_die();
        v_crit := 'failure';
        v_dval := v_d - v_extra;
      end if;
      v_total := v_attr + v_skill + v_dval + v_mods + v_traits;
      v_cd := v_cdbase + coalesce(cd_off[i], 0)::int + (m ->> 'cd')::int;
      v_margin := v_total - v_cd;
      -- Sangue freddo: una volta per semestre, alla prima prova andata male si ritira il d10 e si tiene il secondo
      v_first := null;
      if v_margin < 0 then
        select o.id into v_cool from public.character_options co join public.creation_options o on o.id = co.option_id
        where co.character_id = e.character_id
          and exists (select 1 from jsonb_array_elements(o.effects) x where x ->> 'type' = 'reroll' and x ->> 'system' = 'academic')
        limit 1;
        if v_cool is not null and public.trait_uses_left(e.character_id, v_cool, 'semester') > 0 then
          v_first := v_d;
          v_d := public.academic_die();
          v_extra := null;
          v_crit := 'none';
          v_dval := v_d;
          if v_d >= v_smin then
            v_extra := public.academic_die();
            v_crit := 'success';
            v_dval := v_d + v_extra;
          elsif v_d <= v_fmax then
            v_extra := public.academic_die();
            v_crit := 'failure';
            v_dval := v_d - v_extra;
          end if;
          v_total := v_attr + v_skill + v_dval + v_mods + v_traits;
          v_margin := v_total - v_cd;
          insert into public.trait_uses (character_id, option_id, context)
          values (e.character_id, v_cool, jsonb_build_object('term', p_term, 'enrollment', e.id, 'exam', types[i]));
        end if;
        v_cool := null;
      end if;
      v_score := greatest(0, least(100, v_base + v_margin * v_per))::int;
      insert into public.exam_rolls (enrollment_id, exam_type, characteristic_value, skill_value, d10, crit_type, extra_d10, modifiers, total, cd, margin, score)
      values (e.id, types[i], v_attr, v_skill, v_d, v_crit, v_extra,
              jsonb_build_object('tratti', v_traits, 'impegno', v_effort, 'carico', v_load, 'ripetizione', v_retake,
                                 'major', v_majorb, 'lavoro', v_job, 'tutor', e.tutor_bonus, 'master', e.master_modifier, 'nota_master', nullif(e.master_note, ''), 'totale', v_mods + v_traits,
                                 'voci', m -> 'items', 'cd_voci', (m ->> 'cd')::int, 'sangue_freddo', v_first),
              v_total, v_cd, v_margin, v_score);
      v_sum := v_sum + v_score * coalesce(w[i], 0);
    end loop;
    select * into g from public.uni_grade(round(v_sum / v_wsum)::int);
    update public.enrollments
    set status = 'completed', final_score = round(v_sum / v_wsum)::int, letter_grade = g.letter, grade_points = g.points
    where id = e.id;
    -- Pupillo dei professori: una volta per semestre, a un passo dal voto superiore
    select o.id, coalesce((x ->> 'max_gap')::int, 1) into v_bump, v_gap
    from public.character_options co join public.creation_options o on o.id = co.option_id
    cross join lateral jsonb_array_elements(o.effects) x
    where co.character_id = e.character_id and x ->> 'type' = 'grade_bump'
    limit 1;
    if v_bump is not null and public.trait_uses_left(e.character_id, v_bump, 'semester') > 0 then
      select final_score into v_fs from public.enrollments where id = e.id;
      select min(x)::int into v_next from unnest(v_th) x where x > v_fs;
      if v_next is not null and v_next - v_fs <= v_gap then
        select * into g from public.uni_grade(v_next);
        update public.enrollments set final_score = v_next, letter_grade = g.letter, grade_points = g.points where id = e.id;
        insert into public.trait_uses (character_id, option_id, context)
        values (e.character_id, v_bump, jsonb_build_object('term', p_term, 'enrollment', e.id, 'from', v_fs, 'to', v_next));
      end if;
    end if;
    v_bump := null;
    v_courses := v_courses + 1;
  end loop;

  -- 2. grade replacement: nel cumulativo conta solo l'ultimo tentativo di ogni corso
  update public.enrollments en
  set counts_in_gpa = (en.id = (
    select e2.id from public.enrollments e2 join public.academic_terms t2 on t2.id = e2.term_id
    where e2.character_id = en.character_id and e2.course_id = en.course_id and e2.status = 'completed'
      and (t2.status = 'published' or t2.id = p_term)
    order by t2.created_at desc, e2.id desc limit 1))
  where en.status = 'completed'
    and en.character_id in (select character_id from public.enrollments where term_id = p_term);

  -- 3. pagella di ogni studente del semestre
  for s in select distinct character_id from public.enrollments where term_id = p_term loop
    r := public.uni_record(s.character_id);
    select coalesce(sum(c.credits), 0), coalesce(sum(c.credits) filter (where en.grade_points > 0), 0),
           round(sum(en.grade_points * c.credits) / nullif(sum(c.credits), 0), 2)
      into v_attempted, v_earned, v_term_gpa
    from public.enrollments en join public.courses c on c.id = en.course_id
    where en.character_id = s.character_id and en.term_id = p_term and en.status = 'completed';
    select round(sum(en.grade_points * c.credits) / nullif(sum(c.credits), 0), 2),
           coalesce(sum(c.credits) filter (where en.grade_points > 0), 0)
      into v_cum, v_total_credits
    from public.enrollments en join public.courses c on c.id = en.course_id join public.academic_terms tt on tt.id = en.term_id
    where en.character_id = s.character_id and en.status = 'completed' and en.counts_in_gpa
      and (tt.status = 'published' or tt.id = p_term);
    v_total_credits := r.start_credits + v_total_credits;

    v_before := r.academic_status;
    v_after := v_before;
    v_pc := r.probation_count;
    v_after_susp := r.after_suspension;
    if v_attempted > 0 then
      if v_before = 'good_standing' then
        if v_cum < v_gpa_min then v_after := 'probation'; v_pc := v_pc + 1; end if;
      elsif v_before = 'probation' then
        if v_cum >= v_gpa_min then
          v_after := 'good_standing';
          v_after_susp := false;
        elsif v_term_gpa >= v_gpa_min then
          v_after := 'probation';
        elsif r.after_suspension then
          v_after := 'dismissed';
        else
          v_after := 'suspended';
        end if;
      end if;
    end if;

    v_class := public.uni_class(v_total_credits);
    v_deans := v_term_gpa >= public.uni_n('uni_deans_gpa') and v_attempted >= public.uni_n('uni_deans_crediti');
    -- laurea: crediti, GPA e corsi obbligatori del Major con almeno C−
    select study_track_id into v_major from public.characters where id = s.character_id;
    v_grad := v_after in ('good_standing', 'probation')
      and v_total_credits >= public.uni_n('uni_crediti_laurea')
      and coalesce(v_cum, 0) >= v_gpa_min
      and not exists (
        select 1 from public.major_required_courses m
        where m.major_id = v_major
          and coalesce((
            select e3.grade_points from public.enrollments e3 join public.academic_terms t3 on t3.id = e3.term_id
            where e3.character_id = s.character_id and e3.course_id = m.course_id and e3.status = 'completed'
              and (t3.status = 'published' or t3.id = p_term)
            order by t3.created_at desc, e3.id desc limit 1), -1) < v_req);
    v_honors := null;
    if v_grad then
      v_after := 'graduated';
      v_honors := case when v_cum >= public.uni_n('uni_lode_summa') then 'summa cum laude'
                       when v_cum >= public.uni_n('uni_lode_magna') then 'magna cum laude'
                       when v_cum >= public.uni_n('uni_lode_cum') then 'cum laude' end;
    end if;

    v_text := case when v_attempted = 0 then 'Tutti i corsi ritirati.'
      else 'GPA del semestre ' || to_char(v_term_gpa, 'FM0.00') || ' · Cumulativo ' || to_char(v_cum, 'FM0.00') end
      || ' · ' || v_total_credits || ' crediti · ' || initcap(v_class)
      || case when v_deans then ' · Dean''s List' else '' end
      || case when public.trait_flag(s.character_id, 'scholarship') and not public.academic_late_term(s.character_id, p_term)
                and not public.merit_scholarship_lost(s.character_id)
                and (v_after in ('probation', 'suspended', 'dismissed') or (v_cum is not null and v_cum < coalesce(public.uni_n('uni_borsa_gpa_min'), 2.5)))
              then ' · Borsa di studio accademica persa' else '' end
      || case v_after when 'probation' then ' · Academic Probation' when 'suspended' then ' · Academic Suspension (salta un semestre)'
           when 'dismissed' then ' · Academic Dismissal' when 'graduated' then ' · Laurea' || coalesce(' ' || v_honors, '')
             || coalesce(case when (public.uni_minor_status(s.character_id, p_term) ->> 'complete')::boolean
                              then ' · Minor in ' || (public.uni_minor_status(s.character_id, p_term) ->> 'minor') end, '') else '' end;

    insert into public.term_reports (character_id, term_id, credits_attempted, credits_earned, term_gpa, cumulative_gpa_after,
      credits_total_after, standing_before, standing_after, class_standing_after, probation_count_after, after_suspension_after,
      deans_list, graduated, honors, report_text)
    values (s.character_id, p_term, v_attempted, v_earned, v_term_gpa, v_cum, v_total_credits, v_before, v_after, v_class,
      v_pc, v_after_susp, coalesce(v_deans, false), v_grad, v_honors, v_text);
    v_students := v_students + 1;
  end loop;

  -- 4. chi era sospeso salta questo semestre e rientra in probation
  for r in select * from public.student_records sr
           where sr.academic_status = 'suspended' and sr.suspended_term_id is distinct from p_term
             and not exists (select 1 from public.term_reports tr where tr.character_id = sr.character_id and tr.term_id = p_term)
  loop
    insert into public.term_reports (character_id, term_id, cumulative_gpa_after, credits_total_after, standing_before, standing_after,
      class_standing_after, probation_count_after, after_suspension_after, report_text)
    values (r.character_id, p_term, r.cumulative_gpa, r.credits_earned, 'suspended', 'probation', r.class_standing,
      r.probation_count, true, 'Rientro dopo la sospensione: Academic Probation. Se il prossimo semestre va male, espulsione.');
  end loop;

  update public.academic_terms set status = 'simulated', simulated_at = now() where id = p_term;
  return jsonb_build_object('corsi', v_courses, 'studenti', v_students);
end;
$$;

create or replace function public.academic_homework(p_enrollment bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e record;
  v_count int;
  v_last timestamptz;
  v_points_so_far int;
  v_attr int; v_skill int; v_mods int; v_cd int;
  v_d int; v_extra int; v_crit text; v_dval int; v_total int; v_margin int; v_points int;
  v_days int := coalesce(public.uni_n('uni_compiti_giorni'), 7)::int;
  eff numeric[] := public.uni_list('uni_impegno');
  m jsonb;
  v_credits int;
  v_smin int; v_fmax int;
  v_majorb int; v_job int;
begin
  select en.*, co.level, co.cd_modifier, co.attribute_id, co.skill_id, co.code, co.department, co.area, t.status as term_status
    into e
  from public.enrollments en
  join public.courses co on co.id = en.course_id
  join public.academic_terms t on t.id = en.term_id
  where en.id = p_enrollment
  for update of en;
  if e.id is null or not public.owns_character(e.character_id) then
    raise exception 'Iscrizione non trovata.' using errcode = '42501';
  end if;
  if e.term_status <> 'in_progress' then raise exception 'I compiti si fanno durante il semestre in corso.' using errcode = 'P0001'; end if;
  if e.status <> 'enrolled' then raise exception 'Non segui più questo corso.' using errcode = 'P0001'; end if;

  select count(*), max(created_at), coalesce(sum(points), 0) into v_count, v_last, v_points_so_far
  from public.homework where enrollment_id = p_enrollment;
  if v_count >= coalesce(public.uni_n('uni_compiti_max'), 3) then
    raise exception 'Hai già fatto tutti i compiti di %.', e.code using errcode = 'P0001';
  end if;
  if v_last is not null and v_last > now() - make_interval(days => v_days) then
    raise exception 'Il prossimo compito di % si può fare dal %.', e.code, to_char(v_last + make_interval(days => v_days), 'DD/MM') using errcode = 'P0001';
  end if;

  v_attr := coalesce((select value from public.character_attributes where character_id = e.character_id and attribute_id = e.attribute_id), 0);
  v_skill := coalesce((select level from public.character_skills where character_id = e.character_id and skill_id = e.skill_id), 0);
  select coalesce(sum(c.credits), 0) into v_credits
  from public.enrollments x join public.courses c on c.id = x.course_id
  where x.character_id = e.character_id and x.term_id = e.term_id and x.status = 'enrolled';
  -- il compito vale come il coursework anche per le voci
  m := public.trait_mods(e.character_id, jsonb_build_object('system', 'academic', 'skill_id', e.skill_id, 'exam_type', 'coursework',
    'department', e.department, 'area', e.area, 'retake', e.is_retake, 'credits', v_credits));
  v_smin := (m ->> 'success_min')::int;
  v_fmax := (m ->> 'failure_max')::int;
  -- lavoro full time e corsi del Major, come negli esami
  v_job := case when public.character_full_time_job(e.character_id) then -coalesce(public.uni_n('uni_lavoro_full_malus'), 1)::int else 0 end;
  v_majorb := case when public.uni_major_course(e.character_id, e.department) then coalesce(public.uni_n('uni_bonus_major'), 1)::int else 0 end;
  v_mods := (m ->> 'total')::int
    + coalesce(eff[case when e.effort = 'minimal' then 1 when e.effort = 'intense' and v_job = 0 then 3 else 2 end], 0)::int
    + v_majorb + v_job + e.tutor_bonus;
  v_cd := coalesce((public.uni_list('uni_cd_livelli'))[e.level / 100], 14)::int + e.cd_modifier + coalesce((public.uni_list('uni_cd_prove'))[1], -2)::int + (m ->> 'cd')::int;

  v_d := public.academic_die();
  v_extra := null;
  v_crit := 'none';
  v_dval := v_d;
  if v_d >= v_smin then
    v_extra := public.academic_die(); v_crit := 'success'; v_dval := v_d + v_extra;
  elsif v_d <= v_fmax then
    v_extra := public.academic_die(); v_crit := 'failure'; v_dval := v_d - v_extra;
  end if;
  v_total := v_attr + v_skill + v_dval + v_mods;
  v_margin := v_total - v_cd;
  v_points := case when v_margin < 0 then 0
                   when v_crit = 'success' then coalesce(public.uni_n('uni_compiti_punti_critico'), 2)::int
                   else 1 end;
  -- mai oltre il massimo di punti per corso
  v_points := greatest(0, least(v_points, coalesce(public.uni_n('uni_compiti_punti_max'), 3)::int - v_points_so_far));

  insert into public.homework (enrollment_id, characteristic_value, skill_value, d10, crit_type, extra_d10, modifiers, total, cd, margin, points)
  values (p_enrollment, v_attr, v_skill, v_d, v_crit, v_extra, v_mods, v_total, v_cd, v_margin, v_points);
  return jsonb_build_object('total', v_total, 'cd', v_cd, 'margin', v_margin, 'crit', v_crit, 'points', v_points);
end;
$$;

create or replace function public.academic_extras(p_character uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.characters where id = p_character and owner_id = auth.uid()) and not public.uni_staff() then
    raise exception 'Non hai i permessi necessari.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'minor', public.uni_minor_status(p_character, null),
    'major_departments', coalesce((
      select jsonb_agg(distinct c.department) from public.characters ch
      join public.major_required_courses m on m.major_id = ch.study_track_id join public.courses c on c.id = m.course_id
      where ch.id = p_character and btrim(c.department) <> ''), '[]'::jsonb),
    'major_bonus', coalesce(public.uni_n('uni_bonus_major'), 1)::int,
    'full_time_job', public.character_full_time_job(p_character),
    'job_malus', coalesce(public.uni_n('uni_lavoro_full_malus'), 1)::int,
    'tutor_price', coalesce(public.setting_int('servizio_tutor'), 400),
    'tutor_max', coalesce(public.setting_int('servizio_tutor_max'), 2),
    'tutored', coalesce((
      select jsonb_agg(e.id) from public.enrollments e join public.academic_terms t on t.id = e.term_id
      where e.character_id = p_character and e.tutor_bonus > 0 and t.status <> 'published'), '[]'::jsonb));
end;
$$;

create or replace function public.sport_train(p_character uuid, p_sport uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ro record;
  sp public.sports;
  m jsonb;
  v_last timestamptz;
  v_days int := greatest(1, coalesce(public.setting_int('sport_allenamento_giorni'), 7));
  v_cd int := coalesce(public.setting_int('sport_cd'), 14);
  v_int numeric[] := public.uni_list('sport_intensita');
  v_attr int; v_skill int; v_d int; v_extra int; v_crit text := 'none'; v_dval int; v_mods int; v_total int;
  v_success boolean;
  v_form int;
begin
  if not public.owns_character(p_character) then raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501'; end if;
  select x.*, p.attribute_id, p.skill_id, p.name as position_name into ro
  from public.sport_roster x left join public.sport_positions p on p.id = x.position_id
  where x.character_id = p_character and x.sport_id = p_sport and x.left_at is null
  for update of x;
  if ro.id is null then raise exception 'Non fai parte di questa squadra.' using errcode = 'P0001'; end if;
  if ro.position_id is null then raise exception 'Prima ti serve un ruolo in squadra.' using errcode = 'P0001'; end if;
  if ro.injury_events_left > 0 then raise exception 'Sei infortunato: niente allenamenti finché non rientri.' using errcode = 'P0001'; end if;
  select created_at into v_last from public.sport_trainings
  where character_id = p_character and sport_id = p_sport order by created_at desc limit 1;
  if v_last is not null and v_last > now() - make_interval(days => v_days) then
    raise exception 'Il prossimo allenamento si può fare dal %.',
      to_char((v_last + make_interval(days => v_days)) at time zone 'Europe/Rome', 'DD/MM "alle" HH24:MI') using errcode = 'P0001';
  end if;
  select * into sp from public.sports where id = p_sport;

  v_attr := coalesce((select value from public.character_attributes where character_id = p_character and attribute_id = ro.attribute_id), 0);
  v_skill := coalesce((select level from public.character_skills where character_id = p_character and skill_id = ro.skill_id), 0);
  m := public.trait_mods(p_character, jsonb_build_object('system', 'athletics', 'skill_id', ro.skill_id, 'phase', 'training',
    'venue', 'home', 'format', sp.format, 'attribute_id', ro.attribute_id));
  v_mods := (m ->> 'total')::int
    + coalesce(v_int[case ro.training_intensity when 'light' then 1 when 'normal' then 2 else 3 end], 0)::int;
  v_d := public.academic_die();
  v_dval := v_d;
  if v_d >= (m ->> 'success_min')::int then
    v_extra := public.academic_die(); v_crit := 'success'; v_dval := v_d + v_extra;
  elsif v_d <= (m ->> 'failure_max')::int then
    v_extra := public.academic_die(); v_crit := 'failure'; v_dval := v_d - v_extra;
  end if;
  v_total := v_attr + v_skill + v_dval + v_mods;
  -- personal trainer: allenamento più facile
  if ro.trainer_until is not null and ro.trainer_until > now() then
    v_cd := v_cd - coalesce(public.setting_int('servizio_trainer_cd'), 2);
  end if;
  v_success := v_total >= v_cd and v_crit <> 'failure';

  insert into public.sport_trainings (character_id, sport_id, d10, crit, extra, total, cd, success, modifiers)
  values (p_character, p_sport, v_d, v_crit, v_extra, v_total, v_cd, v_success,
    jsonb_build_object('caratteristica', v_attr, 'abilita', v_skill, 'voci', m -> 'items', 'intensita', ro.training_intensity, 'totale', v_mods, 'ruolo', ro.position_name));
  v_form := public.sport_training_form(p_character, p_sport);
  return jsonb_build_object('success', v_success, 'crit', v_crit, 'd10', v_d, 'extra', v_extra, 'total', v_total, 'cd', v_cd,
    'form', least(v_form + ro.training_bonus, coalesce(public.setting_int('sport_allenamento_max'), 2)));
end;
$$;

create or replace function public.sport_my(p_character uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'roster_id', ro.id, 'sport_id', ro.sport_id, 'sport', s.name, 'icon', s.icon, 'season', s.season, 'format', s.format,
    'position_id', ro.position_id, 'position', p.name, 'squad_status', ro.squad_status, 'scholarship', ro.scholarship,
    'training_intensity', ro.training_intensity, 'training_bonus', ro.training_bonus,
    'injury_events_left', ro.injury_events_left, 'injury_note', ro.injury_note, 'returning', ro.is_returning, 'suspended_events', ro.suspended_events,
    'pending_sport', (select name from public.sports where id = ro.pending_sport_id),
    'pending_position', (select name from public.sport_positions where id = ro.pending_position_id),
    'eligibility', public.sport_eligibility(ro.character_id, ro.sport_id),
    'seasons_used', coalesce(a.seasons_used, 0), 'redshirt_years', coalesce(a.redshirt_years, 0),
    'events', (select count(*) from public.sport_event_rolls x join public.sport_events e on e.id = x.event_id
               where x.character_id = ro.character_id and e.sport_id = ro.sport_id and e.status = 'published'),
    'avg_grade', (select round(avg(x.grade), 1) from public.sport_event_rolls x join public.sport_events e on e.id = x.event_id
               where x.character_id = ro.character_id and e.sport_id = ro.sport_id and e.status = 'published'),
    'highlights', (select count(*) from public.sport_event_rolls x join public.sport_events e on e.id = x.event_id
               where x.character_id = ro.character_id and e.sport_id = ro.sport_id and e.status = 'published' and x.highlight),
    'season_started', exists (select 1 from public.sport_events e join public.sport_seasons se on se.id = e.season_id
               where e.sport_id = ro.sport_id and se.status = 'active' and e.status in ('simulated', 'published')),
    -- stagione in corso (o l'ultima): eventi e media voto
    'season_label', cur.label,
    'season_events', (select count(*) from public.sport_event_rolls x join public.sport_events e on e.id = x.event_id
               where x.character_id = ro.character_id and e.season_id = cur.id and e.status = 'published'),
    'season_avg', (select round(avg(x.grade), 1) from public.sport_event_rolls x join public.sport_events e on e.id = x.event_id
               where x.character_id = ro.character_id and e.season_id = cur.id and e.status = 'published'),
    'athletic_scholarship', ro.scholarship or public.trait_flag(ro.character_id, 'athletic_scholarship'),
    'scholarship_min', coalesce(public.uni_n('sport_borsa_media_min'), 6),
    -- allenamento settimanale
    'form', public.sport_training_form(ro.character_id, ro.sport_id),
    'training_max', coalesce(public.setting_int('sport_allenamento_max'), 2),
    'trainer_until', ro.trainer_until,
    'trainer_price', coalesce(public.setting_int('servizio_trainer'), 300),
    'physio_price', coalesce(public.setting_int('servizio_fisio'), 1500),
    'last_training', (select jsonb_build_object('at', t.created_at, 'success', t.success, 'total', t.total, 'cd', t.cd, 'd10', t.d10, 'crit', t.crit)
               from public.sport_trainings t where t.character_id = ro.character_id and t.sport_id = ro.sport_id order by t.created_at desc limit 1),
    'next_training_at', (select max(t.created_at) + make_interval(days => greatest(1, coalesce(public.setting_int('sport_allenamento_giorni'), 7)))
               from public.sport_trainings t where t.character_id = ro.character_id and t.sport_id = ro.sport_id)
  ) order by s.name), '[]'::jsonb)
  from public.sport_roster ro join public.sports s on s.id = ro.sport_id
  left join public.sport_positions p on p.id = ro.position_id
  left join public.sport_athletes a on a.character_id = ro.character_id and a.sport_id = ro.sport_id
  left join lateral (
    select se.id, se.label from public.sport_seasons se
    where se.sport_id = ro.sport_id and se.status <> 'planning'
    order by (se.status = 'active') desc, se.created_at desc limit 1
  ) cur on true
  where ro.character_id = p_character and ro.left_at is null
$$;

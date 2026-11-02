-- =====================================================================
-- MERCATO: SPESE MENSILI DEGLI OGGETTI E CATALOGO PIÙ RICCO
-- 1. Veicoli e animali costano anche ogni mese (assicurazione, benzina,
--    veterinario): market_items.upkeep, copiato in character_items.upkeep
--    all'acquisto, pagato con le altre uscite del mese. Buttando l'oggetto
--    la spesa si ferma.
-- 2. Nuova categoria «Esperienze» (cene, concerti, weekend…): consumabili
--    da usare in chat. Nuovi oggetti di abbigliamento, casa e veicoli.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. SPESE MENSILI
-- ---------------------------------------------------------------------
alter table public.market_items add column if not exists upkeep int not null default 0 check (upkeep between 0 and 100000);
alter table public.character_items add column if not exists upkeep int not null default 0 check (upkeep >= 0);

alter table public.bank_transactions drop constraint if exists bank_transactions_kind_check;
alter table public.bank_transactions add constraint bank_transactions_kind_check
  check (kind in ('stipendio', 'bonifico', 'staff', 'mantenimento', 'iniziale', 'acquisto', 'affitto', 'casa', 'retta', 'college', 'oggetti'));

alter table public.market_items drop constraint if exists market_items_category_check;
alter table public.market_items add constraint market_items_category_check
  check (category in ('animali', 'veicoli', 'gioielli', 'elettronica', 'abbigliamento', 'casa', 'esperienze', 'alcolici', 'sigarette', 'droghe', 'altro'));

-- spese del catalogo di partenza
update public.market_items m set upkeep = v.upkeep
from (values ('Scooter', 50), ('Moto', 120), ('Auto usata', 250), ('Auto sportiva', 1200),
             ('Cucciolo di labrador', 80), ('Gatto', 40), ('Pappagallo', 30)) as v (name, upkeep)
where m.name = v.name and m.upkeep = 0;

-- anche chi li ha già comprati li mantiene (con un avviso)
do $$
declare
  r record;
begin
  update public.character_items ci set upkeep = m.upkeep
  from public.market_items m where m.id = ci.item_id and m.upkeep > 0 and ci.upkeep = 0;
  for r in
    select c.owner_id, c.name, string_agg(ci.name || ' ' || ci.upkeep || ' $', ', ' order by ci.name) as list
    from public.character_items ci join public.characters c on c.id = ci.character_id
    where ci.upkeep > 0
    group by c.id, c.owner_id, c.name
  loop
    perform public.send_system_message(r.owner_id,
      '🚗 Da ora veicoli e animali hanno una spesa mensile (assicurazione, benzina, veterinario). Per '
      || public.first_name(r.name) || ': ' || r.list || ' al mese, con le altre uscite. Se non vuoi più pagarla, butta l''oggetto da Utility → Mercato.');
  end loop;
end;
$$;

create or replace function public.market_buy(p_character uuid, p_item uuid, p_qty int default 1)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  it public.market_items;
  v_total int;
  v_balance int;
begin
  if not public.owns_character(p_character) then raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501'; end if;
  select * into it from public.market_items where id = p_item and active;
  if it.id is null or (it.black_market and not public.can_black_market()) then
    raise exception 'Oggetto non disponibile.' using errcode = 'P0001';
  end if;
  if p_qty is null or p_qty < 1 or p_qty > 20 then raise exception 'Puoi comprarne da 1 a 20 per volta.' using errcode = 'P0001'; end if;
  v_total := it.price * p_qty;
  perform public.bank_open_account(p_character);
  update public.bank_accounts set balance = balance - v_total, updated_at = now()
  where character_id = p_character and balance >= v_total
  returning balance into v_balance;
  if not found then raise exception 'Sul conto non ci sono abbastanza dollari (servono % $).', v_total using errcode = 'P0001'; end if;
  if v_total > 0 then
    insert into public.bank_transactions (character_id, amount, kind, description, balance_after, author_id)
    values (p_character, -v_total, 'acquisto',
      case when it.black_market then 'Pagamento in contanti' else 'Mercato: ' || it.name || case when p_qty > 1 then ' ×' || p_qty else '' end end,
      v_balance, auth.uid());
  end if;
  insert into public.character_items (character_id, item_id, name, category, image_url, charges_left, use_text, effect, black_market, price_paid, upkeep)
  select p_character, it.id, it.name, it.category, it.image_url, it.charges, it.use_text, it.effect, it.black_market, it.price, it.upkeep
  from generate_series(1, p_qty);
end;
$$;

create or replace function public.market_give(p_character uuid, p_item uuid, p_qty int default 1)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  it public.market_items;
begin
  if not public.has_permission('mercato.gestire') then raise exception 'Non hai il permesso di gestire il mercato.' using errcode = '42501'; end if;
  select * into it from public.market_items where id = p_item;
  if it.id is null then raise exception 'Oggetto non trovato.' using errcode = 'P0001'; end if;
  insert into public.character_items (character_id, item_id, name, category, image_url, charges_left, use_text, effect, black_market, price_paid, upkeep)
  select p_character, it.id, it.name, it.category, it.image_url, it.charges, it.use_text, it.effect, it.black_market, 0, it.upkeep
  from generate_series(1, greatest(1, least(20, coalesce(p_qty, 1))));
end;
$$;

-- le uscite del mese: anche le spese degli oggetti
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
    select 2, 'Retta del college (rata mensile)', public.college_tuition_month(), 'retta'
    where public.character_is_student(p_character) and not public.character_scholarship(p_character)
      and public.college_tuition_month() > 0
    union all
    select 3, 'Camera ' || r.name || ' (' || d.name || ')', public.dorm_fee(p_character, r.kind), 'college'
    from public.dorm_residents dr join public.dorm_rooms r on r.id = dr.room_id join public.dorms d on d.id = r.dorm_id
    where dr.character_id = p_character and public.dorm_fee(p_character, r.kind) > 0
    union all
    select 4, 'Spese: ' || ci.name || case when count(*) > 1 then ' ×' || count(*) else '' end, sum(ci.upkeep)::int, 'oggetti'
    from public.character_items ci
    where ci.character_id = p_character and ci.upkeep > 0
    group by ci.name
  ) parts
$$;
revoke execute on function public.character_expense_parts(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. CATALOGO PIÙ RICCO
-- ---------------------------------------------------------------------
insert into public.market_items (name, description, category, price, black_market, charges, use_text, upkeep, sort_order)
select v.name, v.descr, v.cat, v.price, false, v.charges, v.use_text, v.upkeep, v.ord
from (values
  -- veicoli
  ('Bicicletta da città', 'Leggera, con il cestino. Niente benzina, niente parcheggio.', 'veicoli', 400, null::int, 'usa', 0, 1),
  ('Utilitaria nuova', 'Piccola, affidabile, consuma poco.', 'veicoli', 18000, null, 'usa', 300, 5),
  ('SUV', 'Grande, comodo, perfetto per la Pacific Coast Highway.', 'veicoli', 32000, null, 'usa', 450, 6),
  -- abbigliamento
  ('Sneakers in edizione limitata', 'Introvabili, e tutti lo sanno.', 'abbigliamento', 400, null, 'usa', 0, 1),
  ('Giacca di pelle', 'Vissuta al punto giusto.', 'abbigliamento', 600, null, 'usa', 0, 2),
  ('Abito firmato', 'Da gala, da prima, da foto sui social.', 'abbigliamento', 1200, null, 'usa', 0, 3),
  ('Borsa di lusso', 'Il logo si riconosce da lontano.', 'abbigliamento', 3000, null, 'usa', 0, 4),
  -- casa
  ('Macchina del caffè', 'La salvezza della sessione d''esami.', 'casa', 200, null, 'usa', 0, 1),
  ('Console di videogiochi', 'Due controller: le sfide in camera sono garantite.', 'casa', 500, null, 'usa', 0, 2),
  ('Televisore da 55 pollici', 'Per le serate di partite e serie.', 'casa', 700, null, 'usa', 0, 3),
  -- esperienze (si usano in chat)
  ('Biglietti per un concerto', 'Due biglietti per il prossimo concerto in città.', 'esperienze', 150, 2, 'usa un biglietto di', 0, 1),
  ('Cena al ristorante di lusso', 'Vista sull''oceano a La Jolla, menù degustazione per due.', 'esperienze', 250, 1, 'si concede una', 0, 2),
  ('Giornata alla spa', 'Massaggi, sauna, piscina riscaldata.', 'esperienze', 300, 1, 'si regala una', 0, 3),
  ('Giro in barca a vela', 'Mezza giornata nella baia, skipper incluso.', 'esperienze', 400, 1, 'parte per un', 0, 4),
  ('Tavolo VIP in discoteca', 'Bottiglie, privé e buttafuori che ti salutano per nome.', 'esperienze', 600, 1, 'prenota un', 0, 5),
  ('Weekend a Los Angeles', 'Due notti in hotel a Santa Monica, viaggio compreso.', 'esperienze', 900, 1, 'parte per un', 0, 6),
  ('Festa organizzata', 'Location, dj, catering e inviti: la festa di cui parleranno tutti.', 'esperienze', 1500, 1, 'organizza una', 0, 7)
) as v (name, descr, cat, price, charges, use_text, upkeep, ord)
where not exists (select 1 from public.market_items m where m.name = v.name);

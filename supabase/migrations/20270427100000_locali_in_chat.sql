-- =====================================================================
-- LOCALI IN CHAT
-- Ogni locale (di un PNG o di un PG) sta in una chat: lì il pannello
-- «Locale» mostra descrizione e prodotti, e chi è in giocata compra.
-- - venues: il locale. Della città (collegato a un lavoro di «Locali e
--   attività», titolare PNG facoltativo) o di un PG (nasce da solo quando
--   il PG compra un'attività: character_businesses → venues).
-- - venue_products: cosa vende (li crea lo staff, permesso attivita.gestire).
-- - venue_buy: si paga dal conto, l'oggetto va negli Oggetti (con gli
--   effetti di alcol e droghe), in chat «ordina …»; se il locale è di un PG
--   il proprietario incassa locale_incasso_pct (30%).
-- - venue_set_info: descrizione e immagine (staff o proprietario PG).
-- - venues_list / venue_get: elenco completo e dettaglio (Utility → Attività).
-- =====================================================================

-- 1. CATEGORIA «Cibo e bevande» anche nel mercato
alter table public.market_items drop constraint if exists market_items_category_check;
alter table public.market_items add constraint market_items_category_check
  check (category in ('animali', 'veicoli', 'gioielli', 'elettronica', 'abbigliamento', 'casa', 'esperienze', 'cibo', 'alcolici', 'sigarette', 'droghe', 'altro'));

insert into public.game_settings (key, value, kind, label, description, sort_order) values
  ('locale_incasso_pct', '30', 'number', 'Locali · Incasso del proprietario (%)',
   'Parte di ogni vendita nel locale di un personaggio che va sul conto del proprietario (il resto sono i costi della merce).', 343)
on conflict (key) do nothing;

-- 2. LOCALI
create table if not exists public.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 60),
  category text not null default '' check (char_length(category) <= 40),
  job_id uuid unique references public.jobs (id) on delete set null,
  business_id bigint unique references public.character_businesses (id) on delete cascade,
  owner_npc_id uuid references public.npcs (id) on delete set null,
  room_id uuid unique references public.rooms (id) on delete set null,
  description text not null default '' check (char_length(description) <= 20000),
  image_url text check (image_url is null or image_url ~ '^https://'),
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists venues_owner_npc_idx on public.venues (owner_npc_id);

alter table public.venues enable row level security;
revoke all on public.venues from anon;
drop policy if exists "Locali: visibili" on public.venues;
create policy "Locali: visibili" on public.venues for select to authenticated
  using (active or (select public.has_permission('attivita.gestire')));
drop policy if exists "Locali: lo staff aggiunge" on public.venues;
create policy "Locali: lo staff aggiunge" on public.venues for insert to authenticated
  with check ((select public.has_permission('attivita.gestire')));
drop policy if exists "Locali: lo staff modifica" on public.venues;
create policy "Locali: lo staff modifica" on public.venues for update to authenticated
  using ((select public.has_permission('attivita.gestire'))) with check ((select public.has_permission('attivita.gestire')));
drop policy if exists "Locali: lo staff elimina" on public.venues;
create policy "Locali: lo staff elimina" on public.venues for delete to authenticated
  using ((select public.has_permission('attivita.gestire')));
drop trigger if exists venues_log on public.venues;
create trigger venues_log after insert or update or delete on public.venues
  for each row execute function public.log_admin_change();

-- 3. PRODOTTI DEI LOCALI
create table if not exists public.venue_products (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 60),
  description text not null default '' check (char_length(description) <= 500),
  category text not null check (category in ('animali', 'veicoli', 'gioielli', 'elettronica', 'abbigliamento', 'casa', 'esperienze', 'cibo', 'alcolici', 'sigarette', 'droghe', 'altro')),
  price int not null check (price between 0 and 1000000),
  image_url text check (image_url is null or image_url ~ '^https://'),
  -- null = resta (non si consuma)
  charges int check (charges is null or charges between 1 and 100),
  use_text text not null default 'usa' check (char_length(use_text) between 2 and 40),
  effect jsonb check (effect is null or (effect ->> 'type' in ('alcol', 'droga') and jsonb_array_length(effect -> 'stages') = 3)),
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists venue_products_venue_idx on public.venue_products (venue_id, sort_order);

alter table public.venue_products enable row level security;
revoke all on public.venue_products from anon;
drop policy if exists "Prodotti dei locali: visibili" on public.venue_products;
create policy "Prodotti dei locali: visibili" on public.venue_products for select to authenticated
  using (active or (select public.has_permission('attivita.gestire')));
drop policy if exists "Prodotti dei locali: lo staff aggiunge" on public.venue_products;
create policy "Prodotti dei locali: lo staff aggiunge" on public.venue_products for insert to authenticated
  with check ((select public.has_permission('attivita.gestire')));
drop policy if exists "Prodotti dei locali: lo staff modifica" on public.venue_products;
create policy "Prodotti dei locali: lo staff modifica" on public.venue_products for update to authenticated
  using ((select public.has_permission('attivita.gestire'))) with check ((select public.has_permission('attivita.gestire')));
drop policy if exists "Prodotti dei locali: lo staff elimina" on public.venue_products;
create policy "Prodotti dei locali: lo staff elimina" on public.venue_products for delete to authenticated
  using ((select public.has_permission('attivita.gestire')));
drop trigger if exists venue_products_log on public.venue_products;
create trigger venue_products_log after insert or update or delete on public.venue_products
  for each row execute function public.log_admin_change();

-- 4. LOCALI DEI PG: nascono con l'attività e ne seguono il nome
create or replace function public.character_businesses_venue()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.venues (name, category, business_id, description)
    values (new.name, left(new.type_name, 40), new.id,
            coalesce((select '<p>' || t.description || '</p>' from public.business_types t where t.id = new.type_id and t.description <> ''), ''))
    on conflict (business_id) do nothing;
  elsif new.name is distinct from old.name then
    update public.venues set name = new.name where business_id = new.id;
  end if;
  return new;
end;
$$;
revoke execute on function public.character_businesses_venue() from public, anon, authenticated;
drop trigger if exists character_businesses_venue on public.character_businesses;
create trigger character_businesses_venue after insert or update of name on public.character_businesses
  for each row execute function public.character_businesses_venue();

insert into public.venues (name, category, business_id, description)
select cb.name, left(cb.type_name, 40), cb.id,
       coalesce((select '<p>' || t.description || '</p>' from public.business_types t where t.id = cb.type_id and t.description <> ''), '')
from public.character_businesses cb
where not exists (select 1 from public.venues v where v.business_id = cb.id);

-- 5. LOCALI DELLA CITTÀ: uno per ogni lavoro di «Locali e attività», nella chat con lo stesso nome
insert into public.venues (name, category, job_id, description, room_id, sort_order)
select j.name,
       coalesce(c.category, ''),
       j.id,
       j.description,
       (select r.id from public.rooms r
        where r.access <> 'password' and lower(r.name) like '%' || lower(j.name) || '%'
          and not exists (select 1 from public.venues v2 where v2.room_id = r.id)
        order by r.sort_order limit 1),
       j.sort_order
from public.jobs j
left join (values
  ('ocean grill', 'Ristorante'), ('pacific swell surf shop', 'Negozio'), ('coastline fitness', 'Palestra'),
  ('seaside medical center', 'Ospedale'), ('scarlet room', 'Gentlemen''s club'), ('neon rooftop', 'Rooftop bar'),
  ('club calavera', 'Bar after hours')
) as c (job, category) on c.job = lower(j.name)
where j.area = 'attivita'
  and not exists (select 1 from public.venues v where v.job_id = j.id);

-- prodotti di partenza (gli effetti dell'alcol si copiano dal mercato)
insert into public.venue_products (venue_id, name, description, category, price, charges, use_text, effect, sort_order)
select v.id, p.name, p.descr, p.category, p.price, p.charges, p.use_text,
       (select m.effect from public.market_items m where m.name = p.effect_from limit 1), p.ord
from (values
  ('ocean grill', 'Fish tacos', 'Tre tacos di pesce alla maniera di Baja, lime e salsa piccante.', 'cibo', 18, 1, 'mangia', null, 1),
  ('ocean grill', 'Pesce del giorno', 'Alla griglia, con verdure e vista sull''oceano.', 'cibo', 32, 1, 'mangia', null, 2),
  ('ocean grill', 'Limonata fresca', 'Ghiacciata, con la menta.', 'cibo', 5, 1, 'beve', null, 3),
  ('ocean grill', 'Margarita', 'Classica, con il sale sul bordo.', 'alcolici', 12, 1, 'beve', 'Cocktail', 4),
  ('pacific swell surf shop', 'Lezione di surf', 'Un''ora in acqua con un istruttore, tavola compresa.', 'esperienze', 60, 1, 'fa', null, 1),
  ('pacific swell surf shop', 'Cera per tavola', 'Panetto al cocco per cinque uscite.', 'altro', 6, 5, 'passa la cera dal', null, 2),
  ('pacific swell surf shop', 'Muta', 'Neoprene 3/2, per l''acqua fredda del Pacifico.', 'abbigliamento', 180, null, 'indossa', null, 3),
  ('pacific swell surf shop', 'Tavola da surf', 'Longboard per imparare o shortboard per chi sa già.', 'altro', 450, null, 'usa', null, 4),
  ('coastline fitness', 'Ingresso giornaliero', 'Sala pesi, corsi e docce per un giorno.', 'esperienze', 15, 1, 'usa il suo', null, 1),
  ('coastline fitness', 'Frullato proteico', 'Banana, burro d''arachidi e proteine.', 'cibo', 7, 1, 'beve', null, 2),
  ('coastline fitness', 'Borraccia', 'Termica, con il logo della palestra.', 'altro', 12, null, 'beve dalla', null, 3),
  ('scarlet room', 'Cocktail della casa', 'Rosso, forte e servito al tavolo.', 'alcolici', 22, 1, 'beve', 'Cocktail', 1),
  ('scarlet room', 'Champagne', 'Una bottiglia per il separè: sei calici.', 'alcolici', 120, 6, 'beve un calice di', 'Bottiglia di vino', 2),
  ('scarlet room', 'Separè privato', 'Un''ora di velluto rosso e discrezione.', 'esperienze', 300, 1, 'si gode il', null, 3),
  ('neon rooftop', 'Ingresso', 'La terrazza, la musica e la città illuminata.', 'esperienze', 30, 1, 'usa il suo', null, 1),
  ('neon rooftop', 'Spritz', 'Arancione come il tramonto.', 'alcolici', 16, 1, 'beve', 'Cocktail', 2),
  ('neon rooftop', 'Bottiglia al tavolo', 'Vodka con ghiaccio e mixer: otto bicchieri.', 'alcolici', 250, 8, 'beve un bicchiere dalla', 'Bottiglia di rum', 3),
  ('club calavera', 'Birra', 'Messicana, con il lime nel collo.', 'alcolici', 6, 1, 'beve', 'Birra', 1),
  ('club calavera', 'Shot di mezcal', 'Affumicato, con sale al verme.', 'alcolici', 8, 1, 'butta giù', 'Bottiglia di tequila', 2),
  ('club calavera', 'Partita a biliardo', 'Un gettone per il tavolo in fondo.', 'esperienze', 5, 1, 'gioca la sua', null, 3)
) as p (venue, name, descr, category, price, charges, use_text, effect_from, ord)
join public.venues v on v.job_id is not null and lower(v.name) = p.venue
where not exists (select 1 from public.venue_products x where x.venue_id = v.id);

-- 6. ACQUISTO IN CHAT
create or replace function public.venue_buy(p_character uuid, p_product uuid, p_room uuid, p_qty int default 1)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.venue_products;
  v public.venues;
  v_qty int := coalesce(p_qty, 1);
  v_total int;
  v_owner uuid;
  v_share int;
begin
  if not public.owns_character(p_character) then raise exception 'Serve un tuo personaggio approvato.' using errcode = '42501'; end if;
  select * into p from public.venue_products where id = p_product and active;
  if p.id is not null then select * into v from public.venues where id = p.venue_id and active; end if;
  if p.id is null or v.id is null then raise exception 'Prodotto non disponibile.' using errcode = 'P0001'; end if;
  if v.room_id is distinct from p_room then raise exception 'Questo locale non è in questa chat.' using errcode = 'P0001'; end if;
  if not public.in_chat_now(p_character, p_room) then raise exception 'Entra in giocata per ordinare.' using errcode = 'P0001'; end if;
  if v_qty < 1 or v_qty > 10 then raise exception 'Puoi prenderne da 1 a 10 per volta.' using errcode = 'P0001'; end if;

  v_total := p.price * v_qty;
  if v_total > 0 then
    perform public.bank_move(p_character, -v_total, 'acquisto',
      v.name || ': ' || p.name || case when v_qty > 1 then ' ×' || v_qty else '' end, true);
  end if;
  insert into public.character_items (character_id, item_id, name, category, image_url, charges_left, use_text, effect, black_market, price_paid, upkeep)
  select p_character, null, p.name, p.category, p.image_url, p.charges, p.use_text, p.effect, false, p.price, 0
  from generate_series(1, v_qty);

  -- locale di un PG: il proprietario incassa la sua parte (non da sé stesso)
  if v.business_id is not null and v_total > 0 then
    select character_id into v_owner from public.character_businesses where id = v.business_id;
    v_share := floor(v_total * greatest(0, least(100, coalesce(public.setting_int('locale_incasso_pct'), 30))) / 100.0)::int;
    if v_owner is not null and v_owner <> p_character and v_share > 0 then
      perform public.bank_move(v_owner, v_share, 'attivita', 'Vendite: ' || v.name);
    end if;
  end if;

  insert into public.messages (room_id, character_id, kind, content)
  values (p_room, p_character, 'sistema',
    'ordina ' || case when v_qty > 1 then v_qty || ' × ' else '' end || p.name || '.');
end;
$$;
revoke execute on function public.venue_buy(uuid, uuid, uuid, int) from public, anon;
grant execute on function public.venue_buy(uuid, uuid, uuid, int) to authenticated;

-- 7. DESCRIZIONE E IMMAGINE (staff o proprietario PG)
create or replace function public.venue_set_info(p_venue uuid, p_description text, p_image_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.venues;
  v_img text := nullif(btrim(coalesce(p_image_url, '')), '');
begin
  select * into v from public.venues where id = p_venue for update;
  if v.id is null then raise exception 'Locale non trovato.' using errcode = 'P0001'; end if;
  if not (public.has_permission('attivita.gestire')
          or exists (select 1 from public.character_businesses cb where cb.id = v.business_id and public.owns_character(cb.character_id))) then
    raise exception 'Puoi modificare solo il tuo locale.' using errcode = '42501';
  end if;
  if char_length(coalesce(p_description, '')) > 20000 then raise exception 'Descrizione troppo lunga.' using errcode = 'P0001'; end if;
  if v_img is not null and v_img !~ '^https://' then raise exception 'L''immagine deve essere un link https.' using errcode = 'P0001'; end if;
  update public.venues set description = coalesce(p_description, ''), image_url = v_img where id = v.id;
end;
$$;
revoke execute on function public.venue_set_info(uuid, text, text) from public, anon;
grant execute on function public.venue_set_info(uuid, text, text) to authenticated;

-- 8. LETTURE
-- Chi possiede il locale e dove si trova (comune a elenco e dettaglio)
create or replace function public.venue_card(v public.venues)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', v.id, 'name', v.name, 'category', v.category, 'image_url', v.image_url, 'active', v.active,
    'kind', case when v.business_id is not null then 'pg' else 'png' end,
    'job_id', v.job_id,
    'owner_character_id', c.id,
    'owner_name', coalesce(public.first_name(c.name), n.name),
    'owner_npc_id', n.id,
    'owner_npc_avatar', n.avatar_url,
    'room_id', r.id, 'room_name', r.name, 'district', l.name,
    'products', (select count(*) from public.venue_products p where p.venue_id = v.id and p.active)
  )
  from (select 1) x
  left join public.character_businesses cb on cb.id = v.business_id
  left join public.characters c on c.id = cb.character_id and c.status = 'approvata'
  left join public.npcs n on n.id = v.owner_npc_id
  left join public.rooms r on r.id = v.room_id and r.access <> 'password'
  left join public.locations l on l.id = r.location_id
$$;
revoke execute on function public.venue_card(public.venues) from public, anon, authenticated;

create or replace function public.venues_list()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(public.venue_card(v) order by v.business_id is not null, v.sort_order, v.name), '[]'::jsonb)
  from public.venues v
  where v.active
$$;
revoke execute on function public.venues_list() from public, anon;
grant execute on function public.venues_list() to authenticated;

create or replace function public.venue_get(p_venue uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.venue_card(v) || jsonb_build_object(
    'description', v.description,
    'can_edit', public.has_permission('attivita.gestire')
                or exists (select 1 from public.character_businesses cb where cb.id = v.business_id and public.owns_character(cb.character_id)),
    'job_name', (select j.name from public.jobs j where j.id = v.job_id and j.active),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'description', p.description, 'category', p.category,
                                          'price', p.price, 'image_url', p.image_url, 'charges', p.charges, 'use_text', p.use_text,
                                          'effect', (p.effect ->> 'type'))
                       order by p.sort_order, p.name)
      from public.venue_products p where p.venue_id = v.id and p.active), '[]'::jsonb))
  from public.venues v
  where v.id = p_venue and (v.active or public.has_permission('attivita.gestire'))
$$;
revoke execute on function public.venue_get(uuid) from public, anon;
grant execute on function public.venue_get(uuid) to authenticated;

-- =====================================================================
-- ECONOMIA RIVISTA
-- 1. Al verde entra con 500 $ (può pagare il primo mese della doppia);
--    Agiato 3.900 $ al mese (sopra Vita tranquilla con la borsa).
-- 2. Descrizioni delle fasce: lo stile di vita; ville e tenute sono della
--    famiglia. Dove vive il personaggio lo scrive lui ("Dove vive?").
-- 3. Le case non danno niente in gioco: tolte. Chi le aveva riprende i
--    soldi spesi per comprarle; affitti e spese non si pagano più.
-- 4. Catalogo dei lavori a San Diego (part time e full time).
-- 5. Bonifici: al massimo bonifico_max_mese (2.000 $) inviati ogni 30 giorni.
-- 6. Conto in rosso da 2 mesi: avviso al giocatore e allo staff della banca.
-- 7. "Dove vive?" (characters.residence) al posto di Carattere nella
--    creazione, obbligatorio per inviare la scheda.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1-2. FASCE
-- ---------------------------------------------------------------------
do $$
declare
  r record;
  v_balance int;
begin
  -- chi è già approvato come Al verde riceve la differenza della quota iniziale (300 → 500)
  for r in
    select c.id, c.owner_id, c.name, 500 - o.initial_amount as diff
    from public.character_options co
    join public.creation_options o on o.id = co.option_id and o.kind = 'tenore' and o.name = 'Al verde'
    join public.characters c on c.id = co.character_id and c.status = 'approvata'
    join public.bank_accounts a on a.character_id = c.id and a.initial_paid
    where o.initial_amount < 500
  loop
    update public.bank_accounts set balance = balance + r.diff, updated_at = now() where character_id = r.id returning balance into v_balance;
    insert into public.bank_transactions (character_id, amount, kind, description, balance_after)
    values (r.id, r.diff, 'iniziale', 'Quota iniziale ricalibrata', v_balance);
  end loop;
end;
$$;

update public.creation_options set initial_amount = 500,
  description = 'Precarietà vera. La famiglia non può aiutarti: ogni dollaro va guadagnato. Vestiti di seconda mano, telefono vecchio, pasti saltati a fine mese, spostamenti a piedi, in bici o in autobus. Senza un lavoro e un aiuto allo studio, il college è quasi impossibile.'
where kind = 'tenore' and name = 'Al verde';

update public.creation_options set
  description = 'Ce la fai, ma con fatica. La famiglia aiuta come può, ma i conti si fanno sempre. Un''utilitaria usata o i mezzi pubblici, la spesa al discount, le serate contate. Per pagarti il college ti serve un lavoro o un aiuto allo studio.'
where kind = 'tenore' and name = 'Tirare avanti';

update public.creation_options set
  description = 'Una vita stabile. La famiglia vive in una casa decorosa e ti sostiene: un''auto recente, qualche sfizio, le vacanze ogni tanto. Il college lo paghi senza troppe rinunce, ma un lavoretto non guasta.'
where kind = 'tenore' and name = 'Vita tranquilla';

update public.creation_options set salary = 3900,
  description = 'Soldi che non mancano. La famiglia ha una bella casa con giardino in un quartiere elegante, tu guidi un SUV o una berlina premium, vestiti e serate costano ma non ci pensi troppo. Per vivere da solo in un appartamento, però, ti serve un lavoro.'
where kind = 'tenore' and name = 'Agiato';

update public.creation_options set
  description = 'Il denaro non è un limite per la tua famiglia: villa con piscina sulla costa, seconda casa, auto di lusso, magari una barca alla marina. Tu hai un assegno mensile generoso, ma i tuoi genitori vogliono che impari il valore dei soldi.'
where kind = 'tenore' and name = 'Ricco';

update public.creation_options set
  description = 'L''élite della città: la tua famiglia ha una tenuta sull''oceano, personale di servizio, residenze fuori città e una collezione di auto e yacht. Il tuo assegno è altissimo, ma il resto del patrimonio è dei tuoi: per i grandi capricci devi guadagnarteli o convincerli.'
where kind = 'tenore' and name = 'Élite';

-- ---------------------------------------------------------------------
-- 3. VIA LE CASE
-- ---------------------------------------------------------------------
do $$
declare
  h record;
  v_balance int;
begin
  for h in select ch.*, c.owner_id, c.name as character_name from public.character_homes ch join public.characters c on c.id = ch.character_id loop
    if h.mode = 'proprieta' and h.price_paid > 0 then
      perform public.bank_open_account(h.character_id);
      update public.bank_accounts set balance = balance + h.price_paid, updated_at = now()
      where character_id = h.character_id returning balance into v_balance;
      insert into public.bank_transactions (character_id, amount, kind, description, balance_after)
      values (h.character_id, h.price_paid, 'casa', 'Rimborso: le case non sono più nel gioco (' || h.name || ')', v_balance);
    end if;
    perform public.send_system_message(h.owner_id, '🏠 Le case non sono più nel gioco: ' || public.first_name(h.character_name) || ' non ha più «' || h.name || '»'
      || case when h.mode = 'proprieta' and h.price_paid > 0 then ' e riprende i ' || h.price_paid || ' $ spesi.' else '; l''affitto non si paga più.' end
      || ' Dove vive il personaggio ora si scrive nella scheda («Dove vive?»).');
  end loop;
  delete from public.character_homes;
  update public.house_types set active = false;
end;
$$;
revoke execute on function public.home_take(uuid, uuid, text) from authenticated;
revoke execute on function public.home_give(uuid, uuid, text) from authenticated;

-- le uscite del mese: niente più affitti e spese di casa
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
  ) parts
$$;
revoke execute on function public.character_expense_parts(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. CATALOGO DEI LAVORI
-- ---------------------------------------------------------------------
insert into public.jobs (name, description, active, sort_order)
select v.name, v.descr, true, v.ord
from (values
  ('Triton Coffee', 'La caffetteria del campus: caffè, bagel e studenti che ripassano all''ultimo minuto.', 1),
  ('Biblioteca del campus', 'Banco prestiti, scaffali da riordinare e silenzio da far rispettare.', 2),
  ('Ocean Grill', 'Ristorante di pesce sul lungomare di La Jolla: tavoli all''aperto e tramonti sull''oceano.', 3),
  ('Pacific Swell Surf Shop', 'Tavole, mute e lezioni di surf per turisti e studenti.', 4),
  ('Sunset Tap House', 'Pub con birre artigianali e musica dal vivo nel Gaslamp Quarter.', 5),
  ('Coastline Fitness', 'Palestra aperta fino a tardi: sala pesi, corsi e personal training.', 6),
  ('Seaside Medical Center', 'Ospedale cittadino: turni lunghi, accoglienza e reparti.', 7),
  ('Rapid Rider', 'Consegne a domicilio in bici o in scooter per tutta la città.', 8),
  ('Centro tutoraggio', 'Ripetizioni e aiuto nello studio per le matricole del college.', 9),
  ('Gaslamp Threads', 'Negozio di abbigliamento e vintage nel cuore del centro.', 10),
  ('Laboratorio di ricerca del campus', 'Esperimenti, campioni e dati per i progetti dei professori.', 11),
  ('Studio legale Harbor & Reyes', 'Studio legale del centro: pratiche, clienti e scadenze.', 12)
) as v (name, descr, ord)
where not exists (select 1 from public.jobs j where lower(j.name) = lower(v.name));

insert into public.job_roles (job_id, name, description, salary, salary_full, salary_part, max_members, self_select, sort_order)
select j.id, v.role, v.descr, 0, v.full_pay, v.part_pay, v.posti, true, v.ord
from (values
  ('Triton Coffee', 'Barista', 'Caffè, cassa e sorrisi alle otto del mattino.', null, 950, null, 1),
  ('Triton Coffee', 'Responsabile di turno', 'Apre e chiude il locale, gestisce i turni.', 2400, 1150, 2, 2),
  ('Biblioteca del campus', 'Assistente di biblioteca', 'Prestiti, restituzioni e scaffali.', null, 1000, null, 1),
  ('Biblioteca del campus', 'Archivista', 'Cataloga fondi e documenti.', 2600, null, 1, 2),
  ('Ocean Grill', 'Cameriere', 'Ai tavoli, tra mance e clienti difficili.', 2300, 1000, null, 1),
  ('Ocean Grill', 'Cuoco', 'In cucina, ai fornelli del pesce del giorno.', 2800, 1250, 3, 2),
  ('Ocean Grill', 'Lavapiatti', 'Il lavoro duro dietro le quinte.', null, 900, null, 3),
  ('Pacific Swell Surf Shop', 'Commesso', 'Vendita e noleggio di tavole e mute.', 2200, 950, null, 1),
  ('Pacific Swell Surf Shop', 'Istruttore di surf', 'Lezioni in spiaggia per principianti.', 2700, 1200, 4, 2),
  ('Sunset Tap House', 'Bartender', 'Spina, cocktail e chiacchiere al bancone.', 2600, 1150, null, 1),
  ('Sunset Tap House', 'Buttafuori', 'Alla porta, a controllare documenti e animi.', 2500, 1100, 2, 2),
  ('Coastline Fitness', 'Receptionist', 'Accoglienza, iscrizioni e badge.', null, 900, null, 1),
  ('Coastline Fitness', 'Personal trainer', 'Schede e allenamenti personalizzati.', 3000, 1300, 4, 2),
  ('Seaside Medical Center', 'Addetto all''accoglienza', 'Front desk e prenotazioni.', 2400, 1100, null, 1),
  ('Seaside Medical Center', 'Assistente infermiere', 'Supporto ai reparti e ai pazienti.', 3200, null, 4, 2),
  ('Rapid Rider', 'Rider', 'Consegne veloci, a qualsiasi ora.', 2200, 900, null, 1),
  ('Centro tutoraggio', 'Tutor', 'Ripetizioni nelle materie che conosci meglio.', null, 1200, null, 1),
  ('Gaslamp Threads', 'Commesso', 'Vendita, vetrine e cambi di stagione.', 2300, 950, null, 1),
  ('Gaslamp Threads', 'Visual merchandiser', 'Allestisce vetrine e negozio.', 2700, null, 1, 2),
  ('Laboratorio di ricerca del campus', 'Assistente di laboratorio', 'Esperimenti e raccolta dati.', 3200, 1250, 3, 1),
  ('Studio legale Harbor & Reyes', 'Segretario', 'Agenda, telefonate e pratiche.', 2600, 1150, 1, 1),
  ('Studio legale Harbor & Reyes', 'Praticante', 'Ricerche e atti per gli avvocati.', 3400, null, 2, 2)
) as v (job, role, descr, full_pay, part_pay, posti, ord)
join public.jobs j on lower(j.name) = lower(v.job)
where not exists (select 1 from public.job_roles r where r.job_id = j.id and lower(r.name) = lower(v.role));

-- ---------------------------------------------------------------------
-- 5. TETTO AI BONIFICI
-- ---------------------------------------------------------------------
insert into public.game_settings (key, value, kind, label, description, sort_order) values
  ('bonifico_max_mese', '2000', 'number', 'Bonifici: massimo ogni 30 giorni',
   'Quanti dollari un personaggio può mandare in tutto ad altri personaggi in 30 giorni (0 = nessun limite).', 40)
on conflict (key) do nothing;

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
  v_max int := coalesce(public.setting_int('bonifico_max_mese'), 2000);
  v_sent int;
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
  perform 1 from public.bank_accounts where character_id in (p_from, p_to) order by character_id for update;

  -- tetto: quanto ha già mandato negli ultimi 30 giorni
  if v_max > 0 then
    select coalesce(-sum(amount), 0) into v_sent from public.bank_transactions
    where character_id = p_from and kind = 'bonifico' and amount < 0 and created_at > now() - interval '30 days';
    if v_sent + p_amount > v_max then
      raise exception 'Puoi mandare al massimo % $ ogni 30 giorni: te ne restano %.', v_max, greatest(0, v_max - v_sent) using errcode = 'P0001';
    end if;
  end if;

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

-- ---------------------------------------------------------------------
-- 6. CONTO IN ROSSO DA 2 MESI: AVVISO
-- ---------------------------------------------------------------------
alter table public.bank_accounts
  add column if not exists red_since date,
  add column if not exists red_warned_at date;

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
  u record;
begin
  select * into c from public.characters where id = p_character;
  if c.status is distinct from 'approvata' then return; end if;
  perform public.bank_open_account(p_character);
  select * into a from public.bank_accounts where character_id = p_character for update;

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

    -- conto in rosso: da quando; dopo 2 mesi avviso al giocatore e allo staff della banca (poi ogni mese)
    if a.balance < 0 then
      update public.bank_accounts set red_since = coalesce(red_since, public.bank_today()) where character_id = p_character returning * into a;
      if a.red_since <= public.bank_today() - 2 * v_days
         and (a.red_warned_at is null or a.red_warned_at <= public.bank_today() - v_days) then
        update public.bank_accounts set red_warned_at = public.bank_today() where character_id = p_character;
        v_msg := v_msg || E'⚠️ Il conto è in rosso da più di due mesi: trova un lavoro, chiedi un aiuto allo studio o riduci le spese (camera singola → doppia).\n';
        for u in
          select p2.id from public.profiles p2 join public.user_levels l on l.id = p2.level_id
          where l.is_admin or 'banca.gestire' = any (l.permissions)
        loop
          perform public.send_system_message(u.id, '🏦 Il conto di ' || c.name || ' è in rosso da più di due mesi (' || a.balance || ' $). Dettagli in Gestione → Banca.');
        end loop;
      end if;
    else
      update public.bank_accounts set red_since = null, red_warned_at = null where character_id = p_character;
    end if;
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

-- ---------------------------------------------------------------------
-- 7. "DOVE VIVE?"
-- ---------------------------------------------------------------------
alter table public.characters
  add column if not exists residence text check (residence is null or char_length(residence) <= 2000);

create or replace function public.characters_require_residence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'in_attesa' and old.status is distinct from 'in_attesa' and btrim(coalesce(new.residence, '')) = '' then
    raise exception 'Scrivi dove vive il personaggio (passaggio 5, Background).' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.characters_require_residence() from public, anon, authenticated;
drop trigger if exists characters_require_residence on public.characters;
create trigger characters_require_residence before update of status on public.characters
  for each row execute function public.characters_require_residence();

-- ---------------------------------------------------------------------
-- 8. PICCOLEZZE
-- ---------------------------------------------------------------------
update public.market_items set description = 'Il modo più veloce per attraversare il centro nel traffico.'
where name = 'Scooter' and description like '%South Beach%';

-- =====================================================================
-- THE WILLOW BOOK CAFÉ (Downtown District → Little Italy)
-- Caffetteria, biblioteca e angolo dei gatti: chat sulla mappa, lavoro con
-- i ruoli, locale con descrizione e menu. I prezzi del conto sono in dollari
-- interi: quelli con i centesimi sono arrotondati per eccesso (il menu nella
-- descrizione riporta i prezzi esatti). Si può rilanciare: niente doppioni.
-- =====================================================================

-- 1. CHAT
do $$
declare
  v_map uuid := (select id from public.maps where active order by sort_order, created_at limit 1);
  v_loc uuid;
  v_group uuid;
begin
  if v_map is null then raise notice 'Nessuna mappa attiva.'; return; end if;
  select id into v_loc from public.locations where map_id = v_map and lower(name) = 'downtown district';
  if v_loc is null then raise notice 'Downtown District non trovato.'; return; end if;
  select id into v_group from public.room_groups where location_id = v_loc and lower(name) = 'little italy';
  if v_group is null then
    insert into public.room_groups (location_id, name, sort_order) values (v_loc, 'Little Italy', 4) returning id into v_group;
  end if;
  if not exists (select 1 from public.rooms where lower(name) like '%willow book caf%') then
    insert into public.rooms (location_id, group_id, name, description, image_url, safety, sort_order)
    values (v_loc, v_group, '📚 The Willow Book Café',
      'Books · Coffee · Cats. Caffetteria americana, piccola biblioteca e angolo dei gatti a Little Italy: legno, grandi librerie, piante, luci calde, tavoli condivisi e poltrone comode. Colazioni, pranzi veloci, un libro da leggere e otto gatti da coccolare. Un rifugio quotidiano, accessibile e familiare. A little place for big stories.',
      'https://i.postimg.cc/25ZRjx2t/file-00000000808881f4bdbe428f6fea3ed9.png',
      'sicura',
      coalesce((select max(sort_order) from public.rooms where location_id = v_loc), 0) + 1);
  end if;
end;
$$;

-- 2. LAVORO E RUOLI
insert into public.jobs (name, description, area, active, sort_order)
select 'The Willow Book Café',
  '<p><strong>Books · Coffee · Cats.</strong> Caffetteria, piccola biblioteca e angolo dei gatti a <strong>Little Italy</strong> (mappa: Downtown District → Little Italy).</p><p>Si lavora al bancone tra cappuccini e cold brew, in cucina tra pancake e club sandwich, tra gli scaffali dei libri e con gli otto gatti del locale. Ambiente tranquillo e familiare, turni di giorno, clienti di ogni tipo: studenti, famiglie, lettori e chi lavora da remoto.</p>',
  'attivita', true, 8
where not exists (select 1 from public.jobs where lower(name) = lower('The Willow Book Café'));

insert into public.job_roles (job_id, name, description, salary, salary_full, salary_part, max_members, self_select, sort_order)
select j.id, v.role, v.descr, 0, v.full_pay, v.part_pay, v.posti, true, v.ord
from (values
  ('Barista', 'Espresso, latte art, frappuccini e cold brew al bancone.', 2300, 1000, 4, 1),
  ('Cameriere/a di sala', 'Ordini ai tavoli, sorrisi e tazze da riportare al bancone.', 2200, 950, 4, 2),
  ('Pasticcere/a', 'Muffin, cinnamon roll, torte e cookies sfornati ogni mattina.', 2500, 1100, 2, 3),
  ('Aiuto cuoco/a', 'Pancake, toast, insalate e sandwich per colazione e pranzo.', 2400, 1050, 2, 4),
  ('Libraio/a', 'Cura delle librerie, consigli di lettura, gruppi di lettura e presentazioni.', 2300, 1000, 2, 5),
  ('Addetto/a ai gatti', 'Pappa, pulizia, giochi e benessere degli otto gatti; regole dell''angolo dei gatti.', 2300, 1000, 2, 6),
  ('Responsabile del locale', 'Turni, fornitori, conti ed eventi: il café funziona grazie a te.', 3200, null, 1, 7)
) as v (role, descr, full_pay, part_pay, posti, ord)
join public.jobs j on lower(j.name) = lower('The Willow Book Café')
where not exists (select 1 from public.job_roles r where r.job_id = j.id and lower(r.name) = lower(v.role));

-- 3. LOCALE
insert into public.venues (name, category, job_id, room_id, image_url, sort_order, description)
select 'The Willow Book Café', 'Caffetteria · libreria · gatti', j.id,
  (select r.id from public.rooms r where lower(r.name) like '%willow book caf%' and not exists (select 1 from public.venues v2 where v2.room_id = r.id) limit 1),
  'https://i.postimg.cc/25ZRjx2t/file-00000000808881f4bdbe428f6fea3ed9.png', 8,
$html$<p><strong>🌿 The Willow Book Café</strong> — <em>Books · Coffee · Cats</em></p>
<p>The Willow Book Café è un locale accogliente e informale che unisce una caffetteria americana, una piccola biblioteca e uno spazio dedicato agli amanti dei gatti.</p>
<p>L'ambiente è caratterizzato da arredi in legno, grandi librerie, piante, luci calde, tavoli condivisi e comode poltrone. Lo stile è moderno, rustico e familiare, senza essere troppo elegante o pretenzioso.</p>
<p>È un luogo pensato per tutti: studenti, famiglie, amici, lettori, lavoratori da remoto e appassionati di animali. Gli ospiti possono fermarsi per una colazione, un pranzo veloce, una merenda oppure trascorrere diverse ore leggendo un libro, lavorando o semplicemente rilassandosi.</p>
<h3>☕ Le bevande</h3>
<p>Il bancone propone una selezione di bevande calde e fredde, con particolare attenzione al caffè americano e alle specialità delle caffetterie moderne.</p>
<p><strong>Caffetteria:</strong> Espresso $3.00 · Americano $4.00 · Cappuccino $4.50 · Caffè latte $5.00 · Caramel Macchiato $5.50 · Mocha $5.50 · Vanilla Latte $5.50 · Cold Brew $4.50 · Iced Coffee $4.00 · Iced Latte $5.00</p>
<p><strong>Tè e altre bevande calde:</strong> English Breakfast Tea $3.50 · Earl Grey $3.50 · Camomilla $3.50 · Chai Latte $5.00 · Matcha Latte $5.50 · Cioccolata calda $4.50 · Hot Vanilla Milk $4.00</p>
<p><strong>Bevande fredde:</strong> Iced Tea $3.50 · Lemonade $3.50 · Strawberry Lemonade $4.50 · Frappuccino $5.50 · Milkshake alla vaniglia, al cioccolato o alla fragola $5.00 · Acqua naturale o frizzante $2.00</p>
<h3>🥐 La colazione e la pasticceria</h3>
<p>Ogni mattina il locale offre una selezione di prodotti da forno, dolci e piccole specialità americane.</p>
<p>Croissant al burro $3.00 · Croissant al cioccolato $3.50 · Muffin ai mirtilli $3.50 · Muffin al cioccolato $3.50 · Cinnamon Roll $4.00 · Pancakes con sciroppo d'acero $7.50 · Waffle con frutta fresca $8.00 · French Toast $8.50 · Bagel con crema di formaggio $4.50 · Yogurt con granola e frutta $5.50 · Cookies fatti in casa $2.50 · Brownies al cioccolato $3.50 · Cheesecake $5.00 · Carrot Cake $5.00 · Apple Pie $4.50</p>
<h3>🥪 Pranzi e spuntini</h3>
<p>Per chi desidera fermarsi anche a pranzo, The Willow propone un menù semplice, gustoso e accessibile, con panini, insalate e piatti leggeri.</p>
<p><strong>Panini e sandwich:</strong> Grilled Cheese Sandwich $7.00 · Club Sandwich $9.50 · Chicken Sandwich $9.00 · BLT Sandwich $8.50 · Turkey &amp; Cheese Sandwich $8.50 · Bagel con salmone e formaggio cremoso $9.00</p>
<p><strong>Piatti leggeri:</strong> Caesar Salad $8.50 · Chicken Salad $10.00 · Insalata mediterranea $9.00 · Pasta fredda con verdure $8.00 · Toast con avocado $7.50</p>
<p><strong>Snack:</strong> Patatine fritte $4.00 · Onion Rings $4.50 · Mozzarella Sticks $5.50 · Nachos con formaggio $6.00 · Frutta fresca $4.00</p>
<h3>🐈 L'angolo dei gatti</h3>
<p>Una delle caratteristiche più particolari del locale è il suo spazio dedicato ai gatti. Una zona separata dalla preparazione e dalla somministrazione degli alimenti ospita diversi mici, che possono muoversi liberamente tra tiragraffi, cucce, tunnel, giochi e mensole rialzate.</p>
<p>Gli ospiti possono entrare per trascorrere del tempo con loro, osservarli mentre giocano, coccolarli quando desiderano interagire oppure rilassarsi sulle poltrone vicine. L'accesso è regolamentato per rispettare il riposo e il benessere degli animali. Sono previste regole igieniche e di sicurezza per garantire un ambiente piacevole sia ai clienti sia ai gatti.</p>
<h3>🐾 I residenti</h3>
<p>The Willow Book Café ospita stabilmente 8 gatti, tutti con il proprio carattere, le proprie abitudini e i propri angoli preferiti del locale. I mici vivono in un ambiente appositamente organizzato per il loro benessere, con zone tranquille, cucce, tiragraffi, giochi e spazi sopraelevati.</p>
<ol>
<li><strong>Oliver</strong> — Maine Coon, maschio. Grande, pelo lungo marrone tigrato e occhi verdi. Socievole, tranquillo e molto curioso. È il gigante buono del locale e ama dormire sulle mensole più alte.</li>
<li><strong>Luna</strong> — Ragdoll, femmina. Pelo lungo color crema, estremità grigie e occhi azzurri. Dolce, tranquilla e affettuosa. Ama riposare sulle poltrone vicino alle finestre.</li>
<li><strong>Milo</strong> — British Shorthair, maschio. Pelo grigio-blu, occhi color ambra e corporatura robusta. Indipendente, buffo e un po' pigro. È spesso addormentato nelle sue cucce preferite.</li>
<li><strong>Daisy</strong> — Siamese, femmina. Pelo chiaro con estremità marroni e occhi blu intenso. Vivace, comunicativa e molto intelligente. Ama osservare i clienti e giocare con le palline.</li>
<li><strong>Pumpkin</strong> — gatto domestico a pelo corto, maschio. Completamente arancione, con occhi dorati. Goloso, giocherellone e socievole. È uno dei gatti più buffi e combina spesso qualche marachella.</li>
<li><strong>Willow</strong> — Scottish Fold, femmina. Pelo color crema e occhi grandi color rame. Riservata, dolce e osservatrice. Preferisce gli angoli tranquilli e le cucce morbide.</li>
<li><strong>Oreo</strong> — gatto domestico a pelo corto, maschio. Bianco e nero, con una caratteristica macchia nera sul muso. Estroverso, curioso e giocherellone. Ama esplorare ogni angolo del locale.</li>
<li><strong>Honey</strong> — Persiano, femmina. Pelo lungo color miele, musetto delicato e occhi color ambra. Pacifica, tranquilla e un po' vanitosa. Adora essere spazzolata e riposare sui morbidi cuscini.</li>
</ol>
<p>Gli otto mici sono i piccoli protagonisti del locale. Ognuno dispone di cucce e spazi personali, ma può scegliere liberamente dove trascorrere la giornata. I clienti possono conoscerli, giocare con loro e coccolarli quando sono disponibili. Il personale si occupa quotidianamente della loro alimentazione, pulizia, cura veterinaria e attività di arricchimento ambientale.</p>
<p><em>Otto personalità diverse, otto piccoli amici e tantissime fusa da condividere.</em></p>
<h3>📚 Gli spazi e le attività</h3>
<ul>
<li>Grandi librerie con romanzi, fantasy, thriller, romance, classici e fumetti.</li>
<li>Tavoli comuni per studiare e lavorare.</li>
<li>Piccoli tavoli per coppie e gruppi di amici.</li>
<li>Divanetti e poltrone per leggere tranquillamente.</li>
<li>Wi-Fi gratuito e prese elettriche.</li>
<li>Uno spazio per piccoli gruppi di lettura e incontri letterari.</li>
<li>Eventi a tema, presentazioni di libri e serate dedicate alla lettura.</li>
</ul>
<h3>❤️ L'identità del locale</h3>
<p>The Willow Book Café vuole essere molto più di una semplice caffetteria. È un posto dove si può entrare per un cappuccino da $4.50, scegliere un libro da leggere, ordinare un muffin appena sfornato e trascorrere il pomeriggio in un ambiente tranquillo.</p>
<p>Un rifugio quotidiano, accessibile e familiare, dove ogni persona può trovare il proprio angolo preferito.</p>
<p><em>The Willow Book Café — A little place for big stories.</em></p>$html$
from public.jobs j
where lower(j.name) = lower('The Willow Book Café')
  and not exists (select 1 from public.venues v where lower(v.name) = lower('The Willow Book Café'));

-- 4. MENU (dollari interi, arrotondati per eccesso)
insert into public.venue_products (venue_id, name, description, category, price, charges, use_text, sort_order)
select v.id, p.name, p.descr, p.category, p.price, 1, p.use_text, p.ord
from (values
  -- caffetteria
  ('Espresso', 'Caffetteria · $3.00', 'cibo', 3, 'beve', 1),
  ('Americano', 'Caffetteria · $4.00', 'cibo', 4, 'beve', 2),
  ('Cappuccino', 'Caffetteria · $4.50', 'cibo', 5, 'beve', 3),
  ('Caffè latte', 'Caffetteria · $5.00', 'cibo', 5, 'beve', 4),
  ('Caramel Macchiato', 'Caffetteria · $5.50', 'cibo', 6, 'beve', 5),
  ('Mocha', 'Caffetteria · $5.50', 'cibo', 6, 'beve', 6),
  ('Vanilla Latte', 'Caffetteria · $5.50', 'cibo', 6, 'beve', 7),
  ('Cold Brew', 'Caffetteria · $4.50', 'cibo', 5, 'beve', 8),
  ('Iced Coffee', 'Caffetteria · $4.00', 'cibo', 4, 'beve', 9),
  ('Iced Latte', 'Caffetteria · $5.00', 'cibo', 5, 'beve', 10),
  -- tè e bevande calde
  ('English Breakfast Tea', 'Tè e bevande calde · $3.50', 'cibo', 4, 'beve', 11),
  ('Earl Grey', 'Tè e bevande calde · $3.50', 'cibo', 4, 'beve', 12),
  ('Camomilla', 'Tè e bevande calde · $3.50', 'cibo', 4, 'beve', 13),
  ('Chai Latte', 'Tè e bevande calde · $5.00', 'cibo', 5, 'beve', 14),
  ('Matcha Latte', 'Tè e bevande calde · $5.50', 'cibo', 6, 'beve', 15),
  ('Cioccolata calda', 'Tè e bevande calde · $4.50', 'cibo', 5, 'beve', 16),
  ('Hot Vanilla Milk', 'Tè e bevande calde · $4.00', 'cibo', 4, 'beve', 17),
  -- bevande fredde
  ('Iced Tea', 'Bevande fredde · $3.50', 'cibo', 4, 'beve', 18),
  ('Lemonade', 'Bevande fredde · $3.50', 'cibo', 4, 'beve', 19),
  ('Strawberry Lemonade', 'Bevande fredde · $4.50', 'cibo', 5, 'beve', 20),
  ('Frappuccino', 'Bevande fredde · $5.50', 'cibo', 6, 'beve', 21),
  ('Milkshake alla vaniglia', 'Bevande fredde · $5.00', 'cibo', 5, 'beve', 22),
  ('Milkshake al cioccolato', 'Bevande fredde · $5.00', 'cibo', 5, 'beve', 23),
  ('Milkshake alla fragola', 'Bevande fredde · $5.00', 'cibo', 5, 'beve', 24),
  ('Acqua naturale o frizzante', 'Bevande fredde · $2.00', 'cibo', 2, 'beve', 25),
  -- colazione e pasticceria
  ('Croissant al burro', 'Colazione e pasticceria · $3.00', 'cibo', 3, 'mangia', 26),
  ('Croissant al cioccolato', 'Colazione e pasticceria · $3.50', 'cibo', 4, 'mangia', 27),
  ('Muffin ai mirtilli', 'Colazione e pasticceria · $3.50', 'cibo', 4, 'mangia', 28),
  ('Muffin al cioccolato', 'Colazione e pasticceria · $3.50', 'cibo', 4, 'mangia', 29),
  ('Cinnamon Roll', 'Colazione e pasticceria · $4.00', 'cibo', 4, 'mangia', 30),
  ('Pancakes con sciroppo d''acero', 'Colazione e pasticceria · $7.50', 'cibo', 8, 'mangia', 31),
  ('Waffle con frutta fresca', 'Colazione e pasticceria · $8.00', 'cibo', 8, 'mangia', 32),
  ('French Toast', 'Colazione e pasticceria · $8.50', 'cibo', 9, 'mangia', 33),
  ('Bagel con crema di formaggio', 'Colazione e pasticceria · $4.50', 'cibo', 5, 'mangia', 34),
  ('Yogurt con granola e frutta', 'Colazione e pasticceria · $5.50', 'cibo', 6, 'mangia', 35),
  ('Cookies fatti in casa', 'Colazione e pasticceria · $2.50', 'cibo', 3, 'mangia', 36),
  ('Brownies al cioccolato', 'Colazione e pasticceria · $3.50', 'cibo', 4, 'mangia', 37),
  ('Cheesecake', 'Colazione e pasticceria · $5.00', 'cibo', 5, 'mangia', 38),
  ('Carrot Cake', 'Colazione e pasticceria · $5.00', 'cibo', 5, 'mangia', 39),
  ('Apple Pie', 'Colazione e pasticceria · $4.50', 'cibo', 5, 'mangia', 40),
  -- panini e sandwich
  ('Grilled Cheese Sandwich', 'Panini e sandwich · $7.00', 'cibo', 7, 'mangia', 41),
  ('Club Sandwich', 'Panini e sandwich · $9.50', 'cibo', 10, 'mangia', 42),
  ('Chicken Sandwich', 'Panini e sandwich · $9.00', 'cibo', 9, 'mangia', 43),
  ('BLT Sandwich', 'Panini e sandwich · $8.50', 'cibo', 9, 'mangia', 44),
  ('Turkey & Cheese Sandwich', 'Panini e sandwich · $8.50', 'cibo', 9, 'mangia', 45),
  ('Bagel con salmone e formaggio cremoso', 'Panini e sandwich · $9.00', 'cibo', 9, 'mangia', 46),
  -- piatti leggeri
  ('Caesar Salad', 'Piatti leggeri · $8.50', 'cibo', 9, 'mangia', 47),
  ('Chicken Salad', 'Piatti leggeri · $10.00', 'cibo', 10, 'mangia', 48),
  ('Insalata mediterranea', 'Piatti leggeri · $9.00', 'cibo', 9, 'mangia', 49),
  ('Pasta fredda con verdure', 'Piatti leggeri · $8.00', 'cibo', 8, 'mangia', 50),
  ('Toast con avocado', 'Piatti leggeri · $7.50', 'cibo', 8, 'mangia', 51),
  -- snack
  ('Patatine fritte', 'Snack · $4.00', 'cibo', 4, 'mangia', 52),
  ('Onion Rings', 'Snack · $4.50', 'cibo', 5, 'mangia', 53),
  ('Mozzarella Sticks', 'Snack · $5.50', 'cibo', 6, 'mangia', 54),
  ('Nachos con formaggio', 'Snack · $6.00', 'cibo', 6, 'mangia', 55),
  ('Frutta fresca', 'Snack · $4.00', 'cibo', 4, 'mangia', 56)
) as p (name, descr, category, price, use_text, ord)
join public.venues v on lower(v.name) = lower('The Willow Book Café')
where not exists (select 1 from public.venue_products x where x.venue_id = v.id and lower(x.name) = lower(p.name));

-- =====================================================================
-- CHAT DI SAN DIEGO
-- Sulla mappa attiva: 7 zone (quartieri sulla mappa) → i quartieri veri
-- come gruppi di chat → tre chat ciascuno, con descrizione.
-- Si può rilanciare: non crea doppioni (controlla i nomi).
-- Le posizioni dei punti sono indicative: si spostano da Gestione → Mondo.
-- =====================================================================
do $$
declare
  v_map uuid := (select id from public.maps where active order by sort_order, created_at limit 1);
  v_base int;
  r record;
  v_loc uuid;
  v_group uuid;
begin
  if v_map is null then raise exception 'Nessuna mappa attiva: attivane una in Gestione → Mondo.'; end if;
  v_base := coalesce((select max(sort_order) from public.locations where map_id = v_map), 0);

  -- zone
  for r in
    select * from (values
      ('North District', 'Il campus, le scogliere e i birrifici', 40.0, 15.0, 'from-violet via-lavender to-mint', 1),
      ('Coastal Side', 'Spiagge, surf e lungomare', 22.0, 42.0, 'from-dusk via-flamingo to-peach', 2),
      ('Downtown District', 'Grattacieli, porto e vita notturna', 45.0, 63.0, 'from-night via-violet to-flamingo', 3),
      ('Central District', 'Balboa Park, arte e quartieri storici', 60.0, 50.0, 'from-violet via-orchid to-sand', 4),
      ('Inland District', 'Missioni, canyon e centri commerciali', 66.0, 32.0, 'from-palm via-lavender to-sand', 5),
      ('Southern District', 'Murales, cultura chicana e confine', 60.0, 86.0, 'from-flamingo via-peach to-sand', 6),
      ('Coronado Area', 'L''isola oltre il ponte', 32.0, 76.0, 'from-dusk via-lavender to-mint', 7)
    ) as z (name, tagline, x, y, gradient, ord)
  loop
    if not exists (select 1 from public.locations where map_id = v_map and lower(name) = lower(r.name)) then
      insert into public.locations (map_id, name, tagline, x, y, gradient, sort_order)
      values (v_map, r.name, r.tagline, r.x, r.y, r.gradient, v_base + r.ord);
    end if;
  end loop;

  -- quartieri (gruppi) e chat
  for r in
    select * from (values
      -- North District
      ('North District', 'La Jolla', 1, '🕳️ Sunny Jim Cave', 'L’unica grotta marina della California raggiungibile a piedi, tramite un tunnel scavato a inizio Novecento. Orari, consigli per la visita, foto e curiosità sulla sua storia.', 'sicura'),
      ('North District', 'La Jolla', 1, '✝️ Mount Soledad', 'La vista a 360° più bella di San Diego, dalla cima del Mount Soledad con il memoriale dei veterani. Tramonti, foto, salite in bici ed eventi commemorativi.', 'sicura'),
      ('North District', 'La Jolla', 1, '🏄 Windansea Beach', 'Spiaggia leggendaria per il surf, con la storica capanna di palme. Condizioni delle onde, tramonti, sessioni all’alba e rispetto per lo spot dei local.', 'sicura'),
      ('North District', 'University City', 2, '🪂 Torrey Pines Gliderport', 'Parapendio, deltaplano e voli in tandem sulle scogliere di Torrey Pines. Condizioni del vento, prenotazioni, lezioni e il sentiero per Black’s Beach.', 'sicura'),
      ('North District', 'University City', 2, '🏛️ Salk Institute', 'Un capolavoro di architettura firmato Louis Kahn, affacciato sull’oceano. Tour guidati, eventi pubblici, foto al tramonto e incontri di divulgazione scientifica.', 'sicura'),
      ('North District', 'University City', 2, '⛪ San Diego California Temple', 'Le guglie bianche che si vedono dalla I-5 sono uno dei simboli di University City. Visite ai giardini, foto, eventi e storia dell’edificio.', 'sicura'),
      ('North District', 'Mira Mesa', 3, '✈️ Miramar Air Show', 'Il grande air show annuale della base MCAS Miramar, con i Blue Angels. Date, biglietti, parcheggi, posti migliori per guardare i voli e ritrovi.', 'sicura'),
      ('North District', 'Mira Mesa', 3, '🍺 Beeramar Brewery Trail', 'La zona dei birrifici lungo Miramar Road e dintorni, con nomi storici come AleSmith. Nuove birre, giri tra i birrifici, eventi e passaggi condivisi.', 'sicura'),
      ('North District', 'Mira Mesa', 3, '🏞️ Lopez Canyon', 'Sentieri tra canyon e ruscelli nella parte di Mira Mesa del Los Peñasquitos Preserve. Escursioni, giri in mountain bike, stato dei sentieri e uscite di gruppo.', 'sicura'),
      -- Coastal Side
      ('Coastal Side', 'Pacific Beach', 1, '🪁 Kate Sessions Park', 'La collina con la vista su Mission Bay, l’oceano e il centro. Aquiloni, picnic, tramonti, cani e ritrovi del weekend.', 'sicura'),
      ('Coastal Side', 'Pacific Beach', 1, '🛶 Sail Bay', 'Acque calme di Mission Bay lungo il Bayside Walk. Kayak, paddleboard, nuotate tranquille, noleggi e uscite di gruppo.', 'sicura'),
      ('Coastal Side', 'Pacific Beach', 1, '🎉 PB Block Party', 'La festa di strada annuale su Garnet Avenue, con musica, cibo e bancarelle. Date, programma, ritrovi e consigli per godersela.', 'sicura'),
      ('Coastal Side', 'Mission Beach', 2, '🎢 Giant Dipper', 'Le montagne russe in legno del 1925, monumento storico nazionale. Giri, tempi di attesa, curiosità storiche e foto.', 'sicura'),
      ('Coastal Side', 'Mission Beach', 2, '🏊 The Plunge', 'La storica piscina coperta di Belmont Park, aperta nel 1925 e rinnovata. Orari, abbonamenti, corsi e nuotate di gruppo.', 'sicura'),
      ('Coastal Side', 'Mission Beach', 2, '🏐 Bonita Cove', 'Spiaggia sulla baia con acque calme, prati e reti da pallavolo. Picnic, barbecue, giornate in famiglia e partite tra amici.', 'sicura'),
      ('Coastal Side', 'Ocean Beach', 3, '🍔 Hodad’s', 'Gli hamburger più famosi di OB, dal 1969, tra targhe appese ovunque e file fuori dalla porta. Consigli sui panini, orari meno affollati e ritrovi.', 'sicura'),
      ('Coastal Side', 'Ocean Beach', 3, '🌶️ OB Street Fair & Chili Cook-Off', 'La festa di strada più amata di OB, con concerti, bancarelle e la gara di chili. Date, programma, volontari e ritrovi.', 'sicura'),
      ('Coastal Side', 'Ocean Beach', 3, '🥬 OB Farmers Market', 'Il mercato del mercoledì su Newport Avenue, con prodotti freschi, street food, artigiani e musica dal vivo. Banchi preferiti e ritrovi.', 'sicura'),
      ('Coastal Side', 'Point Loma', 4, '🗼 Old Point Loma Lighthouse', 'Il faro del 1855 in cima a Point Loma, oggi museo. Visite, giorni di apertura speciale, storia marittima e foto.', 'sicura'),
      ('Coastal Side', 'Point Loma', 4, '🦀 Cabrillo Tide Pools', 'Le pozze di marea di Cabrillo, piene di vita marina. Orari delle basse maree, avvistamenti, regole per proteggere l’habitat e visite in famiglia.', 'sicura'),
      ('Coastal Side', 'Point Loma', 4, '⛵ Shelter Island', 'Marine, molo da pesca e la vista sullo skyline del centro. Uscite in barca, pesca, passeggiate serali e notizie dal porto.', 'sicura'),
      -- Downtown District
      ('Downtown District', 'Downtown', 1, '🎼 The Rady Shell', 'Il palco all’aperto sulla baia, casa estiva della San Diego Symphony. Concerti, biglietti, picnic prima dello spettacolo e i posti migliori.', 'sicura'),
      ('Downtown District', 'Downtown', 1, '🐟 Tuna Harbor Dockside Market', 'Il mercato del pesce del sabato mattina, direttamente dai pescatori locali. Cosa si trova, consigli di cucina e ritrovi al porto.', 'sicura'),
      ('Downtown District', 'Downtown', 1, '🐋 Harbor Cruises & Whale Watching', 'Crociere nella baia e uscite per vedere le balene grigie durante la migrazione invernale. Consigli, avvistamenti e uscite di gruppo.', 'sicura'),
      ('Downtown District', 'Gaslamp Quarter', 2, '🏮 Gaslamp Arch', 'L’arco luminoso all’ingresso del Gaslamp, il punto foto più famoso del quartiere. Ritrovi, foto notturne e punto di partenza per le serate.', 'sicura'),
      ('Downtown District', 'Gaslamp Quarter', 2, '🕰️ Gaslamp Museum', 'La Davis-Horton House, una delle case più antiche del centro, oggi museo. Tour a piedi, storie di fantasmi, storia del quartiere ed eventi.', 'sicura'),
      ('Downtown District', 'Gaslamp Quarter', 2, '🦸 Comic-Con Week', 'La settimana del Comic-Con, quando Gaslamp e centro si riempiono di eventi, cosplay e installazioni. Eventi gratuiti, ritrovi e consigli per orientarsi.', 'sicura'),
      ('Downtown District', 'East Village', 3, '🧱 Western Metal Building', 'Lo storico edificio in mattoni del 1909 inglobato nel Petco Park, con i posti a sedere sul tetto. Biglietti, foto, storia e ritrovi nei giorni di partita.', 'sicura'),
      ('Downtown District', 'East Village', 3, '🚙 Tailgate Park', 'Il parcheggio dei tailgate prima delle partite dei Padres e dei concerti. Barbecue, ritrovi, consigli per il parcheggio e organizzazione di gruppo.', 'sicura'),
      ('Downtown District', 'East Village', 3, '🐕 Fault Line Park', 'Il parco di quartiere con area giochi e spazi verdi nel cuore di East Village. Ritrovi con i cani, eventi e incontri tra vicini.', 'sicura'),
      ('Downtown District', 'Little Italy', 4, '🪧 Little Italy Sign', 'L’insegna storica che sovrasta India Street, simbolo del quartiere. Foto, storia della comunità italiana e ritrovi.', 'sicura'),
      ('Downtown District', 'Little Italy', 4, '🇮🇹 Little Italy Festa', 'La grande festa italiana di ottobre, tra le più grandi della West Coast. Cibo, gessetti sull’asfalto, musica, date e ritrovi.', 'sicura'),
      ('Downtown District', 'Little Italy', 4, '🎯 Amici Park Bocce', 'I campi da bocce di Amici Park. Partite, tornei, chi cerca compagni di gioco e serate all’aperto.', 'sicura'),
      -- Central District
      ('Central District', 'North Park', 1, '💡 North Park Sign', 'L’insegna al neon sopra University Avenue, simbolo del quartiere. Foto, eventi nei dintorni e notizie di North Park.', 'sicura'),
      ('Central District', 'North Park', 1, '🎨 Ray at Night', 'La serata d’arte su Ray Street tra gallerie, studi aperti e artisti di strada. Date, mostre, ritrovi e giri di gruppo.', 'sicura'),
      ('Central District', 'North Park', 1, '🥕 North Park Thursday Market', 'Il mercato del giovedì su North Park Way, con prodotti freschi, street food e musica. Banchi preferiti e ritrovi.', 'sicura'),
      ('Central District', 'Hillcrest', 2, '🏳️‍🌈 San Diego Pride', 'La parata e il festival del Pride di luglio, tra i più grandi degli Stati Uniti. Programma, volontari, gruppi per la parata e ritrovi.', 'sicura'),
      ('Central District', 'Hillcrest', 2, '🎪 Hillcrest CityFest', 'La grande festa di strada estiva di Hillcrest, con concerti, cibo e bancarelle. Date, programma e ritrovi.', 'sicura'),
      ('Central District', 'Hillcrest', 2, '🌉 Vermont Street Bridge', 'Il ponte pedonale tra Hillcrest e University Heights, con i pannelli d’arte. Passeggiate, foto e storia del quartiere.', 'sicura'),
      ('Central District', 'South Park', 3, '🎹 Spreckels Organ Pavilion', 'Uno dei più grandi organi all’aperto del mondo, con concerti gratuiti la domenica pomeriggio. Programma, consigli e ritrovi.', 'sicura'),
      ('Central District', 'South Park', 3, '🖌️ Spanish Village Art Center', 'Gli studi d’artista colorati di Balboa Park, accanto allo zoo. Artisti, laboratori, mercatini e visite.', 'sicura'),
      ('Central District', 'South Park', 3, '🐕 Grape Street Dog Park', 'L’area cani senza guinzaglio a Grape Street, nella zona est di Balboa Park. Ritrovi con i cani, regole e aggiornamenti.', 'sicura'),
      ('Central District', 'Golden Hill', 4, '🌿 Botanical Building', 'La serra storica di Balboa Park, con la Lily Pond davanti. Foto, fioriture, visite e ritrovi.', 'sicura'),
      ('Central District', 'Golden Hill', 4, '🎎 Japanese Friendship Garden', 'Il giardino giapponese di Balboa Park, con laghetti, carpe koi e fioriture dei ciliegi. Eventi, orari e visite.', 'sicura'),
      ('Central District', 'Golden Hill', 4, '🏡 Golden Hill Historic District', 'Le case vittoriane e Craftsman di uno dei quartieri più antichi di San Diego. Passeggiate, storia, restauri e tour.', 'sicura'),
      -- Inland District
      ('Inland District', 'Mission Valley', 1, '⛪ Mission San Diego de Alcalá', 'La prima delle 21 missioni della California, fondata nel 1769. Visite, storia, eventi e consigli per la visita.', 'sicura'),
      ('Inland District', 'Mission Valley', 1, '🌾 SDSU River Park', 'Il parco lungo il San Diego River accanto allo Snapdragon Stadium. Sentieri, prati, corse, picnic e ritrovi.', 'sicura'),
      ('Inland District', 'Mission Valley', 1, '🛍️ Westfield Mission Valley', 'Il centro commerciale all’aperto di Mission Valley. Saldi, nuove aperture, ristoranti e ritrovi.', 'sicura'),
      ('Inland District', 'Clairemont', 2, '🍱 Mitsuwa Marketplace', 'Il supermercato giapponese con food court, nella zona di Convoy. Ramen, prodotti introvabili, eventi stagionali e consigli.', 'sicura'),
      ('Inland District', 'Clairemont', 2, '🦉 Tecolote Nature Center', 'Il centro natura all’ingresso del Tecolote Canyon. Escursioni guidate, attività per bambini e osservazione della natura.', 'sicura'),
      ('Inland District', 'Clairemont', 2, '🌄 Mount Etna Park', 'Il parco di quartiere sulla collina di Clairemont. Giornate in famiglia, partite tra amici e incontri tra vicini.', 'sicura'),
      ('Inland District', 'Mission Hills', 3, '🌸 Mission Hills Nursery', 'Il vivaio più antico di San Diego, fondato nel 1910 dalla botanica Kate Sessions. Piante, consigli di giardinaggio e novità.', 'sicura'),
      ('Inland District', 'Mission Hills', 3, '🌷 Mission Hills Garden Walk', 'La passeggiata annuale tra i giardini privati del quartiere, aperti al pubblico. Date, biglietti, ispirazioni e ritrovi.', 'sicura'),
      ('Inland District', 'Mission Hills', 3, '🌳 Pioneer Park', 'Il parco all’ombra con area giochi e le lapidi storiche dell’ex Calvary Cemetery. Ritrovi in famiglia, storia ed eventi.', 'sicura'),
      ('Inland District', 'Old Town', 4, '💀 Día de los Muertos', 'La celebrazione del Giorno dei Morti a Old Town, con altari, processioni e tradizioni messicane. Programma, foto e ritrovi.', 'sicura'),
      ('Inland District', 'Old Town', 4, '🧺 Old Town Saturday Market', 'Il mercato artigianale del sabato, con creazioni locali e prodotti fatti a mano. Bancarelle, novità e ritrovi.', 'sicura'),
      ('Inland District', 'Old Town', 4, '🎺 Fiesta de Reyes', 'Il cortile con ristoranti, negozi, mariachi e musica dal vivo. Eventi, serate e consigli su dove mangiare.', 'sicura'),
      -- Southern District
      ('Southern District', 'Barrio Logan', 1, '✊ Chicano Park Day', 'La festa annuale di aprile che ricorda la nascita del Chicano Park nel 1970. Musica, lowrider, danze, cultura e ritrovi.', 'sicura'),
      ('Southern District', 'Barrio Logan', 1, '🖼️ Barrio Art Crawl', 'Il giro tra le gallerie e gli studi d’artista di Barrio Logan. Date, artisti, mostre e uscite di gruppo.', 'sicura'),
      ('Southern District', 'Barrio Logan', 1, '🛒 Mercado del Barrio', 'Il centro di quartiere con negozi e ristoranti. Novità, offerte e notizie di Barrio Logan.', 'sicura'),
      ('Southern District', 'San Ysidro', 2, '🚶 PedWest', 'Il passaggio pedonale per Tijuana. Orari, tempi di attesa, documenti necessari e consigli per attraversare in sicurezza.', 'poco_sicura'),
      ('Southern District', 'San Ysidro', 2, '🤝 Friendship Park', 'Il luogo d’incontro binazionale sul confine. Giorni di apertura, regole di accesso ed eventi della comunità.', 'poco_sicura'),
      ('Southern District', 'San Ysidro', 2, '🇲🇽 Tijuana Trips', 'Gite a Tijuana partendo da San Ysidro: cibo, Avenida Revolución, cultura. Consigli, uscite di gruppo e sicurezza.', 'pericolosa'),
      -- Coronado Area
      ('Coronado Area', 'Coronado', 1, '🐚 Silver Strand State Beach', 'La lunga striscia di sabbia tra oceano e baia. Campeggio, falò, nuotate e giornate al mare.', 'sicura'),
      ('Coronado Area', 'Coronado', 1, '🎆 Coronado Fourth of July', 'La celebre parata del 4 luglio e i fuochi sulla baia. Programma, posti migliori, parcheggi e ritrovi.', 'sicura'),
      ('Coronado Area', 'Coronado', 1, '🐶 Coronado Dog Beach', 'La spiaggia per cani all’estremità nord di Coronado Beach. Ritrovi con i cani, regole e aggiornamenti.', 'sicura')
    ) as c (zone, hood, hood_ord, chat, descr, safety)
  loop
    select id into v_loc from public.locations where map_id = v_map and lower(name) = lower(r.zone);
    select id into v_group from public.room_groups where location_id = v_loc and lower(name) = lower(r.hood);
    if v_group is null then
      insert into public.room_groups (location_id, name, sort_order) values (v_loc, r.hood, r.hood_ord) returning id into v_group;
    end if;
    if not exists (select 1 from public.rooms where location_id = v_loc and lower(name) = lower(r.chat)) then
      insert into public.rooms (location_id, group_id, name, description, safety, sort_order)
      values (v_loc, v_group, r.chat, r.descr, r.safety,
        coalesce((select max(sort_order) from public.rooms where location_id = v_loc), 0) + 1);
    end if;
    v_group := null;
  end loop;
end;
$$;

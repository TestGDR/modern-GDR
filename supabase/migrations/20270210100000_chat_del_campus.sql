-- =====================================================================
-- CHAT DEL CAMPUS
-- Dentro il quartiere dell'università (mappa attiva, nome con
-- «University»): gruppi di chat pubbliche per la vita nel campus, lo
-- studio, i dipartimenti, arti e spettacolo, gli impianti sportivi.
-- Le chat che esistono già con lo stesso nome nel quartiere non si
-- duplicano. Tutto si cambia poi da Gestione → Mondo.
-- =====================================================================
do $$
declare
  v_loc uuid;
  v_group uuid;
  g record;
  r record;
begin
  select l.id into v_loc from public.locations l join public.maps m on m.id = l.map_id
  where m.active and lower(l.name) like '%universit%' order by l.sort_order limit 1;
  if v_loc is null then raise exception 'Nessun quartiere con «University» nel nome sulla mappa attiva.'; end if;

  for g in
    select * from (values
      ('Vita nel campus', 'Dove gli studenti passano le giornate tra una lezione e l''altra.', 1),
      ('Studio', 'Biblioteca, aule e sale per studiare.', 2),
      ('Dipartimenti', 'Gli edifici dei dipartimenti, con laboratori, uffici dei professori e corridoi pieni di bacheche.', 3),
      ('Arti e spettacolo', 'Musica, teatro, danza e media del college.', 4),
      ('Impianti sportivi', 'Campi, piscina, palazzetto e palestre delle squadre del college.', 5)
    ) as v (name, descr, ord)
  loop
    select id into v_group from public.room_groups where location_id = v_loc and lower(btrim(name)) = lower(g.name) limit 1;
    if v_group is null then
      insert into public.room_groups (location_id, name, description, sort_order)
      values (v_loc, g.name, g.descr, g.ord) returning id into v_group;
    end if;

    for r in
      select * from (values
        -- Vita nel campus
        ('Vita nel campus', 'Caffetteria', 'Cappuccini, bagel e prese elettriche contese: il posto dove si incontrano tutti prima delle lezioni.', 1),
        ('Vita nel campus', 'Mensa (Dining Hall)', 'Vassoi, file al bancone e tavoli lunghi dove si formano e si rompono le compagnie.', 2),
        ('Vita nel campus', 'Student Center', 'Negozi, sportelli, tavoli dei club e il bancone delle iniziative studentesche.', 3),
        ('Vita nel campus', 'Prato centrale', 'Erba, frisbee, coperte al sole e qualche protesta studentesca.', 4),
        ('Vita nel campus', 'Library Walk', 'Il viale principale del campus, tra volantini, banchetti e biciclette.', 5),
        ('Vita nel campus', 'Bookstore', 'Libri di testo carissimi, felpe del college e gadget per i tifosi.', 6),
        ('Vita nel campus', 'Belvedere sull''oceano', 'Il punto più alto del campus: tramonto sul Pacifico e confidenze a fine giornata.', 7),
        ('Vita nel campus', 'Infermeria (Student Health)', 'Visite, cerotti, certificati medici e la sala d''attesa più silenziosa del campus.', 8),
        ('Vita nel campus', 'Parcheggio studenti', 'Auto, scooter, passaggi chiesti al volo e discussioni a motore spento.', 9),
        -- Studio
        ('Studio', 'Biblioteca centrale', 'Scaffali a perdita d''occhio, silenzio obbligatorio e postazioni prenotate fino a notte.', 1),
        ('Studio', 'Sala studio notturna', 'Aperta 24 ore su 24: caffè, appunti e studenti che non dormono prima degli esami.', 2),
        ('Studio', 'Sala informatica', 'File di computer, stampanti che si inceppano e consegne all''ultimo minuto.', 3),
        ('Studio', 'Aula magna', 'La grande aula a gradoni delle lezioni affollate, delle conferenze e delle cerimonie.', 4),
        ('Studio', 'Aule di lezione', 'Aule di ogni dimensione, lavagne piene e banchi incisi da generazioni di studenti.', 5),
        ('Studio', 'Segreteria studenti', 'Iscrizioni, piani di studio, moduli e l''ufficio del Dean in fondo al corridoio.', 6),
        -- Dipartimenti
        ('Dipartimenti', 'Dipartimento di Scienze naturali', 'Laboratori di biologia e chimica, acquari e cappe aspiranti.', 1),
        ('Dipartimenti', 'Dipartimento di Scienze biomediche', 'Aule di anatomia, laboratori e il centro di addestramento al primo soccorso.', 2),
        ('Dipartimenti', 'Dipartimento di Matematica e ingegneria', 'Lavagne piene di formule, officine e il laboratorio dei prototipi.', 3),
        ('Dipartimenti', 'Dipartimento di Scienze sociali e diritto', 'Aule per i seminari, simulazioni di processo e il dibattito sempre aperto.', 4),
        ('Dipartimenti', 'Dipartimento di Studi umanistici', 'Studi dei professori pieni di libri, la redazione della rivista letteraria e il corridoio delle lingue.', 5),
        -- Arti e spettacolo
        ('Arti e spettacolo', 'Aule musica', 'Sale prova insonorizzate, pianoforti e una batteria che si sente da fuori.', 1),
        ('Arti e spettacolo', 'Teatro del campus', 'Palco, quinte e camerini: prove, spettacoli e audizioni.', 2),
        ('Arti e spettacolo', 'Studio di danza', 'Specchi, sbarre e parquet consumato dalle prove.', 3),
        ('Arti e spettacolo', 'Atelier d''arte', 'Cavalletti, tele, argilla e l''odore della vernice fresca.', 4),
        ('Arti e spettacolo', 'Radio del college', 'Lo studio della radio studentesca: musica, dirette e interviste.', 5),
        ('Arti e spettacolo', 'Redazione del giornale', 'Scrivanie in disordine, scadenze e lo scoop della settimana.', 6),
        -- Impianti sportivi
        ('Impianti sportivi', 'Stadio di football', 'Il campo del sabato, le tribune piene, la banda e le cheerleader a bordo campo.', 1),
        ('Impianti sportivi', 'Palazzetto (basket e volley)', 'Parquet lucido, canestri, rete da pallavolo e tribune che rimbombano.', 2),
        ('Impianti sportivi', 'Pista di hockey su ghiaccio', 'Ghiaccio, balaustre e freddo anche quando fuori ci sono trenta gradi.', 3),
        ('Impianti sportivi', 'Piscina olimpionica', 'Corsie, trampolini e l''odore di cloro dall''alba al tramonto.', 4),
        ('Impianti sportivi', 'Centro equestre', 'Scuderie, maneggio coperto e il campo ostacoli della squadra di equitazione.', 5),
        ('Impianti sportivi', 'Palestra e sala pesi', 'Macchine, bilancieri, specchi e personal trainer.', 6),
        ('Impianti sportivi', 'Pista d''atletica', 'L''anello rosso intorno al campo: corse all''alba e allenamenti serali.', 7),
        ('Impianti sportivi', 'Spogliatoi', 'Armadietti, docce e i discorsi prima e dopo la partita.', 8)
      ) as v (grp, name, descr, ord)
      where v.grp = g.name
    loop
      if not exists (select 1 from public.rooms where location_id = v_loc and lower(btrim(name)) = lower(r.name)) then
        insert into public.rooms (location_id, group_id, name, description, access, sort_order)
        values (v_loc, v_group, r.name, r.descr, 'pubblica', r.ord);
      end if;
    end loop;
  end loop;
end;
$$;

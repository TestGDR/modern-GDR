-- =====================================================================
-- 09 · DATI INIZIALI
-- Quartieri e luoghi di Miami, sezioni e bacheche del forum.
-- =====================================================================

insert into public.districts (slug, name, tagline, map_x, map_y, gradient, sort_order) values
  ('south-beach',   'South Beach',   'Spiaggia, neon e Art Déco',      236, 262, 'from-violet via-flamingo to-sand',  1),
  ('downtown',      'Downtown',      'Grattacieli sulla baia',         150, 182, 'from-dusk via-violet to-orchid',    2),
  ('brickell',      'Brickell',      'Soldi, rooftop e yacht',         140, 232, 'from-violet via-orchid to-peach',   3),
  ('little-havana', 'Little Havana', 'Musica, sigari e caffè cubano',   82, 214, 'from-orchid via-flamingo to-peach', 4),
  ('wynwood',       'Wynwood',       'Murales e gallerie',             112, 128, 'from-flamingo via-peach to-sand',   5),
  ('porto',         'Il Porto',      'Container e navi da crociera',   190, 200, 'from-dusk via-violet to-mint',      6),
  ('coconut-grove', 'Coconut Grove', 'Marina e vecchie ville',         108, 304, 'from-violet via-lavender to-mint',  7),
  ('everglades',    'Everglades',    'Paludi ai margini della città',   30, 352, 'from-dusk via-violet to-mint',      8);

insert into public.places (district_id, slug, name, description, sort_order)
select d.id, v.slug, v.name, v.description, v.sort_order
from (values
  ('south-beach',   'ocean-drive',      'Ocean Drive',              'Hotel Art Déco, insegne al neon e auto d''epoca in fila.',      1),
  ('south-beach',   'lummus-park',      'Lummus Park',              'Sabbia bianca, torrette dei bagnini e palme sul lungomare.',    2),
  ('downtown',      'bayfront-park',    'Bayfront Park',            'Prati sulla baia, concerti e incontri all''aperto.',            1),
  ('downtown',      'torre-uffici',     'Le torri degli uffici',    'Vetro, ascensori e affari poco puliti.',                        2),
  ('brickell',      'rooftop-bar',      'Rooftop Bar',              'Cocktail al trentesimo piano con vista sulla baia.',            1),
  ('little-havana', 'calle-ocho',       'Calle Ocho',               'Musica dai locali, sigari arrotolati a mano e caffè forte.',    1),
  ('little-havana', 'domino-park',      'Domino Park',              'Partite a domino, chiacchiere e informazioni di quartiere.',    2),
  ('wynwood',       'murales',          'Il quartiere dei murales', 'Street art, gallerie e magazzini riconvertiti.',                1),
  ('porto',         'banchine',         'Le banchine',              'Container, gru e carichi da non controllare troppo.',           1),
  ('coconut-grove', 'marina',           'La Marina',                'Barche a vela, pontili di legno e bar sul mare.',               1),
  ('everglades',    'airboat',          'Il pontile degli airboat', 'Acqua bassa, alligatori e nessun testimone.',                   1)
) as v (district_slug, slug, name, description, sort_order)
join public.districts d on d.slug = v.district_slug;

insert into public.forum_sections (title, is_on_game, sort_order) values
  ('On Game', true, 1),
  ('Off Game', false, 2);

insert into public.forum_boards (section_id, slug, name, description, staff_only, sort_order)
select s.id, v.slug, v.name, v.description, v.staff_only, v.sort_order
from (values
  ('On Game',  'annunci-citta', 'Annunci dalla città', 'Notizie, eventi e cronaca di Miami.',               false, 1),
  ('On Game',  'lavoro',        'Lavoro e attività',   'Offerte di lavoro, negozi e affari.',               false, 2),
  ('On Game',  'fazioni',       'Gruppi e fazioni',    'Crew, famiglie, aziende e istituzioni.',            false, 3),
  ('Off Game', 'regolamento',   'Regolamento',         'Le regole del gioco: da leggere prima di iniziare.', true,  1),
  ('Off Game', 'supporto',      'Supporto',            'Domande allo staff e segnalazioni.',                false, 2),
  ('Off Game', 'bar',           'Il bar degli utenti', 'Chiacchiere libere tra giocatori.',                 false, 3)
) as v (section_title, slug, name, description, staff_only, sort_order)
join public.forum_sections s on s.title = v.section_title;

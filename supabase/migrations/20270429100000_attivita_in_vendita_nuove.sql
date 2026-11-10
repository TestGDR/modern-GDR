-- =====================================================================
-- ATTIVITÀ IN VENDITA: PIÙ TIPI DI LOCALE
-- Quindici tipi in più nel catalogo (Utility → Attività → In vendita),
-- dal piccolo al grande. Rendita del mese circa l'1,5% del prezzo; l'abilità
-- decide il tiro di gestione. Non crea doppioni (controlla i nomi).
-- =====================================================================

insert into public.business_types (name, description, price, base_income, skill_id, sort_order)
select v.name, v.descr, v.price, v.income, (select s.id from public.skills s where s.name = v.skill limit 1), v.ord
from (values
  ('Bancarella di street food', 'Un furgoncino o un banco ai mercatini del weekend: hot dog, elote e burritos da mangiare in piedi.', 15000, 225, 'Cucina', 7),
  ('Bubble tea shop', 'Tè al latte, perle di tapioca e colori pastello vicino al campus: la fila degli studenti non finisce mai.', 30000, 450, 'Vita sociale', 8),
  ('Barbiere', 'Due poltrone, fade perfetti, barba al panno caldo e la musica giusta: in quartiere tutti passano da qui.', 35000, 525, 'Stile e immagine', 9),
  ('Studio di tatuaggi', 'Flash alle pareti, postazioni in affitto e clienti che arrivano su appuntamento da tutta la contea.', 45000, 675, 'Arti visive', 10),
  ('Negozio di dischi e vinili', 'Vinili nuovi e usati, giradischi, poster e piccoli live nel retro il sabato sera.', 45000, 675, 'Strumenti musicali', 11),
  ('Libreria indipendente', 'Scaffali di legno, prime edizioni, presentazioni di libri e un gruppo di lettura fedele.', 50000, 750, 'Lettere e filosofia', 12),
  ('Centro estetico e nail bar', 'Trattamenti viso, cerette, massaggi e nail art: agenda sempre piena prima delle feste.', 55000, 825, 'Stile e immagine', 13),
  ('Studio fotografico', 'Sala posa, luci e fondali: book, ritratti, prodotti per i brand e servizi per matrimoni.', 60000, 900, 'Fotografia e video', 14),
  ('Officina moto e scooter', 'Riparazioni, tagliandi e moto custom per studenti, rider e appassionati.', 70000, 1050, 'Meccanica e fai da te', 15),
  ('Studio di yoga e pilates', 'Lezioni all''alba e al tramonto, tappetini colorati e una clientela fedele che arriva in bici.', 75000, 1125, 'Ascolto e supporto', 16),
  ('Pizzeria al taglio', 'Forno sempre acceso, tranci da portare via e consegne a domicilio fino a tarda notte.', 90000, 1350, 'Cucina', 17),
  ('Galleria d''arte', 'Artisti emergenti, vernissage con il vino e collezionisti da convincere.', 120000, 1800, 'Arti visive', 18),
  ('Karaoke bar', 'Sale private, microfoni, luci colorate e cocktail: si canta fino a chiusura.', 130000, 1950, 'Intrattenere', 19),
  ('Ristorante sul porto', 'Tavoli sulla baia, pesce fresco e una brigata di cucina da tenere in riga.', 220000, 3300, 'Leadership', 20),
  ('Nightclub', 'Pista, privé, DJ ospiti e una porta da gestire con il pugno di ferro: il locale che fa parlare la città.', 300000, 4500, 'Vita sociale', 21)
) as v (name, descr, price, income, skill, ord)
where not exists (select 1 from public.business_types b where lower(b.name) = lower(v.name));

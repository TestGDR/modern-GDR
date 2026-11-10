-- =====================================================================
-- LAVORI INDIPENDENTI NUOVI
-- Altri lavori da ventenni, tutti «Lavori indipendenti» (un ruolo, posti
-- illimitati, scelti dal giocatore): tatuatore, estetista, parrucchiere,
-- make-up artist, nail artist, bagnino, bartender per eventi, promoter,
-- autista, grafico, videomaker. Non si creano doppioni (nome già usato).
-- =====================================================================

insert into public.jobs (name, description, area, active, sort_order)
select v.name, v.descr, 'indipendente', true, v.ord
from (values
  ('Tatuatore/trice', '<p>Postazione in affitto in uno studio di tatuaggi o guest spot nei saloni della città: flash, progetti su misura e piercing.</p>', 9),
  ('Estetista', '<p>Trattamenti viso e corpo, cerette e massaggi, in un centro estetico o a domicilio.</p>', 10),
  ('Parrucchiere/Barbiere', '<p>Tagli, colori, fade e barbe: poltrona in affitto in un salone o clienti a casa.</p>', 11),
  ('Make-up artist', '<p>Trucco per servizi fotografici, matrimoni, feste, sfilate e set video.</p>', 12),
  ('Nail artist', '<p>Manicure, ricostruzioni e nail art, su appuntamento in salone o a domicilio.</p>', 13),
  ('Bagnino/a', '<p>Torrette sulle spiagge e piscine di hotel e club: sorveglianza, primo soccorso e tanto sole.</p>', 14),
  ('Bartender per eventi', '<p>Cocktail a feste private, matrimoni, eventi aziendali e pool party: si lavora a ingaggio.</p>', 15),
  ('Promoter per locali', '<p>Liste, tavoli e serate da riempire: si guadagna sulle persone che porti nei club.</p>', 16),
  ('Autista ride-sharing', '<p>Corse con le app, di giorno e di notte, con la propria auto.</p>', 17),
  ('Grafico/Web designer', '<p>Loghi, siti, locandine e grafiche social per locali, band e piccoli negozi.</p>', 18),
  ('Videomaker', '<p>Video per eventi, videoclip, reel per i brand e montaggio su commissione.</p>', 19)
) as v (name, descr, ord)
where not exists (select 1 from public.jobs j where lower(j.name) = lower(v.name));

insert into public.job_roles (job_id, name, description, salary, salary_full, salary_part, max_members, self_select, sort_order)
select j.id, v.role, v.descr, 0, v.full_pay, v.part_pay, null, true, 1
from (values
  ('Tatuatore/trice', 'Tatuatore/trice', 'Tatuaggi su appuntamento, paga a lavoro.', 2700, 1150),
  ('Estetista', 'Estetista', 'Trattamenti su appuntamento.', 2300, 1000),
  ('Parrucchiere/Barbiere', 'Parrucchiere/Barbiere', 'Tagli e acconciature, più le mance.', 2300, 1000),
  ('Make-up artist', 'Make-up artist', 'Trucco su commissione, dal set al matrimonio.', 2400, 1050),
  ('Nail artist', 'Nail artist', 'Manicure e nail art su appuntamento.', 2000, 900),
  ('Bagnino/a', 'Bagnino/a', 'Turni di sorveglianza in spiaggia o in piscina.', 2200, 950),
  ('Bartender per eventi', 'Bartender', 'Serate a ingaggio, paga a evento e mance.', 2300, 1000),
  ('Promoter per locali', 'Promoter', 'Provvigione sugli ingressi e sui tavoli.', null, 900),
  ('Autista ride-sharing', 'Autista', 'Corse con le app, pagate a corsa.', 2300, 1000),
  ('Grafico/Web designer', 'Grafico', 'Progetti su commissione.', 2600, 1100),
  ('Videomaker', 'Videomaker', 'Riprese e montaggio su commissione.', 2500, 1100)
) as v (job, role, descr, full_pay, part_pay)
join public.jobs j on lower(j.name) = lower(v.job)
where not exists (select 1 from public.job_roles r where r.job_id = j.id);

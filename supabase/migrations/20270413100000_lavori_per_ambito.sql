-- =====================================================================
-- LAVORI DIVISI PER AMBITO E CATALOGO RIDOTTO
-- - jobs.area: 'college' (Nel college), 'attivita' (Locali e attività),
--   'indipendente' (Lavori indipendenti). In Utility → Lavori ogni ambito
--   è una linguetta; in Gestione → Lavori si sceglie l'ambito.
-- - Locali e attività: pochi e diversi tra loro. Tolti Sunset Tap House,
--   Gaslamp Threads, Studio legale Harbor & Reyes (se nessuno ci lavora;
--   altrimenti restano disattivati).
-- - Locali notturni: Scarlet Room e Neon Rooftop (ex Neon Underground)
--   diventano eleganti e sicuri; Club Calavera resta quello malfamato.
-- - Lavori indipendenti: un ruolo ciascuno, senza limite di posti.
--   «Cameriere» diventa «Cameriere a chiamata» (chi ci lavora resta),
--   «Rapid Rider» diventa «Rider».
-- Si può rilanciare.
-- =====================================================================

-- 1. AMBITO
alter table public.jobs add column if not exists area text not null default 'attivita';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'jobs_area_check') then
    alter table public.jobs add constraint jobs_area_check check (area in ('college', 'attivita', 'indipendente'));
  end if;
end;
$$;

update public.jobs set area = 'college'
where lower(name) in ('triton coffee', 'biblioteca del campus', 'laboratorio di ricerca del campus', 'centro tutoraggio');

-- 2. LOCALI E ATTIVITÀ DA TOGLIERE (eliminati se vuoti, altrimenti disattivati)
delete from public.jobs j
where lower(j.name) in ('sunset tap house', 'gaslamp threads', 'studio legale harbor & reyes', 'rapid rider')
  and not exists (select 1 from public.character_jobs cj where cj.job_id = j.id);
update public.jobs set active = false
where lower(name) in ('sunset tap house', 'gaslamp threads', 'studio legale harbor & reyes', 'rapid rider');

-- 3. LOCALI NOTTURNI: DUE ELEGANTI, UNO MALFAMATO
update public.jobs set description =
  '<p>Gentlemen''s club esclusivo di <strong>East Village</strong> (mappa: Downtown District → East Village): velluti, champagne, spettacoli curati e una clientela ricca che paga bene la discrezione. Lo staff si assume dai 18 anni anche senza i 21; ai clienti invece l''età si controlla alla porta.</p>'
where lower(name) = 'scarlet room';
update public.job_roles r set description = v.descr
from public.jobs j, (values
  ('Spogliarellista', 'Numeri sul palco e balli privati nei separè. Paga base alta, mance da clienti facoltosi.'),
  ('Cameriere ai tavoli', 'Champagne e cocktail ai tavoli e ai separè, con discrezione e sorrisi.'),
  ('Bartender', 'Cocktail di classe al bancone di marmo.'),
  ('Buttafuori', 'All''ingresso: lista, documenti dei clienti e niente scenate.')
) as v (role, descr)
where j.id = r.job_id and lower(j.name) = 'scarlet room' and lower(r.name) = lower(v.role);

update public.jobs set name = 'Neon Rooftop',
  description = '<p>Club sulla terrazza di un hotel del <strong>Gaslamp Quarter</strong> (mappa: Downtown District → Gaslamp Quarter): piscina illuminata, vista sullo skyline, tavoli con le bottiglie e DJ internazionali. Lo staff si assume dai 18 anni anche senza i 21; ai clienti invece l''età si controlla alla porta.</p>'
where lower(name) = 'neon underground';
update public.job_roles r set description = v.descr
from public.jobs j, (values
  ('Cubista', 'Balla sulle pedane a bordo piscina, sotto le luci della terrazza.'),
  ('Bartender', 'Cocktail d''autore con vista sullo skyline.'),
  ('Addetto ai privé', 'Porta le bottiglie ai tavoli del privé con scintille e show.'),
  ('PR', 'Riempie la lista con la gente giusta, a percentuale.')
) as v (role, descr)
where j.id = r.job_id and lower(j.name) = 'neon rooftop' and lower(r.name) = lower(v.role);

-- le chat dei due locali eleganti: sicure, con la descrizione nuova
update public.rooms set safety = 'sicura',
  description = 'Gentlemen''s club esclusivo dietro una porta laccata di rosso, tra i loft di East Village. Velluti, champagne, spettacoli curati e separè riservati per una clientela ricca che paga la discrezione. Alla porta si controllano lista e documenti; dietro le quinte c''è chi lavora a vent''anni.'
where name = '💋 Scarlet Room';
update public.rooms set name = '🌃 Neon Rooftop', safety = 'sicura',
  description = 'Il club sulla terrazza di un hotel del Gaslamp: piscina illuminata, skyline di San Diego, tavoli con le bottiglie e DJ che arrivano da Los Angeles. Si entra in lista o con il nome giusto, vestiti bene.'
where name = '🪩 Neon Underground';

-- 4. LAVORI INDIPENDENTI
-- il vecchio «Cameriere» diventa «Cameriere a chiamata» (stesso lavoro: chi c'è resta)
update public.jobs set name = 'Cameriere a chiamata' where lower(name) = 'cameriere'
  and not exists (select 1 from public.jobs where lower(name) = 'cameriere a chiamata');
update public.job_roles r set name = 'Cameriere a chiamata', salary_full = 2100, salary_part = 950,
  description = 'Turni quando servono, paga a evento e mance.'
from public.jobs j
where j.id = r.job_id and lower(j.name) = 'cameriere a chiamata' and lower(r.name) = 'cameriere in prova';

insert into public.jobs (name, description, area, active, sort_order)
select v.name, v.descr, 'indipendente', true, v.ord
from (values
  ('Cameriere a chiamata', '<p>Catering, matrimoni, feste private ed eventi in tutta la città: si lavora quando chiamano.</p>', 1),
  ('Rider', '<p>Consegne in bici o in scooter con le app di delivery, a qualsiasi ora e in ogni quartiere.</p>', 2),
  ('Influencer', '<p>Contenuti sponsorizzati e collaborazioni con i brand: più follower e più fama, più lavoro.</p>', 3),
  ('Modello/a', '<p>Servizi fotografici, sfilate, cataloghi e campagne per i brand della costa.</p>', 4),
  ('Fotografo freelance', '<p>Matrimoni, eventi, ritratti e servizi per riviste e locali, con la propria attrezzatura.</p>', 5),
  ('DJ', '<p>Serate nei locali, feste private e matrimoni, con la propria consolle.</p>', 6),
  ('Musicista', '<p>Live nei locali, busking sul lungomare e lezioni private.</p>', 7),
  ('Babysitter / Dog sitter', '<p>Bambini e cani delle famiglie di La Jolla e Coronado, a ore.</p>', 8)
) as v (name, descr, ord)
where not exists (select 1 from public.jobs j where lower(j.name) = lower(v.name));

update public.jobs j set area = 'indipendente', sort_order = v.ord
from (values
  ('cameriere a chiamata', 1), ('rider', 2), ('influencer', 3), ('modello/a', 4),
  ('fotografo freelance', 5), ('dj', 6), ('musicista', 7), ('babysitter / dog sitter', 8)
) as v (name, ord)
where lower(j.name) = v.name;

insert into public.job_roles (job_id, name, description, salary, salary_full, salary_part, max_members, self_select, sort_order)
select j.id, v.role, v.descr, 0, v.full_pay, v.part_pay, null, true, 1
from (values
  ('Cameriere a chiamata', 'Cameriere a chiamata', 'Turni quando servono, paga a evento e mance.', 2100, 950),
  ('Rider', 'Rider', 'Consegne veloci, pagate a corsa.', 2200, 900),
  ('Influencer', 'Influencer', 'Post, storie e campagne per i brand.', 2800, 1200),
  ('Modello/a', 'Modello/a', 'Set fotografici, sfilate e casting.', 3000, 1300),
  ('Fotografo freelance', 'Fotografo', 'Servizi su commissione, dal ritratto all''evento.', 2500, 1100),
  ('DJ', 'DJ', 'Serate a ingaggio, dalla festa privata al club.', 2600, 1200),
  ('Musicista', 'Musicista', 'Concerti, busking e lezioni.', 2200, 1000),
  ('Babysitter / Dog sitter', 'Sitter', 'Bambini o cani, a ore.', null, 900)
) as v (job, role, descr, full_pay, part_pay)
join public.jobs j on lower(j.name) = lower(v.job)
where not exists (select 1 from public.job_roles r where r.job_id = j.id);

-- 5. ORDINE DENTRO GLI ALTRI AMBITI
update public.jobs j set sort_order = v.ord
from (values
  ('triton coffee', 1), ('biblioteca del campus', 2), ('laboratorio di ricerca del campus', 3), ('centro tutoraggio', 4),
  ('ocean grill', 1), ('pacific swell surf shop', 2), ('coastline fitness', 3), ('seaside medical center', 4),
  ('scarlet room', 5), ('neon rooftop', 6), ('club calavera', 7)
) as v (name, ord)
where lower(j.name) = v.name;

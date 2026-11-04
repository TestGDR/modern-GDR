-- =====================================================================
-- UNIVERSITÀ: NUOVI MAJOR FISICA, MATEMATICA, CHIMICA, LINGUE E
-- CULTURE STRANIERE, SOCIOLOGIA (+ corsi di Danza e Biochimica)
-- 77 corsi nuovi, percorso completo dal livello 100 al 400 per ognuno,
-- con prerequisiti, corsi obbligatori e materie principali/affini.
-- I nuovi indirizzi valgono anche come Minor.
-- =====================================================================

-- 1. CORSI
insert into public.courses (code, name, department, credits, level, attribute_id, skill_id, description, area)
select v.code, v.name, v.dept, v.credits, v.level, a.id, s.id, v.descr, v.area
from (values
  -- Fisica
  ('PHYS 110', 'Introduzione all''astronomia', 'Scienze naturali', 3, 100, 'INT', 'Scienze naturali', 'Stelle, pianeti e galassie, con le notti all''osservatorio.', 'stem'),
  ('PHYS 130', 'Laboratorio di fisica I', 'Scienze naturali', 3, 100, 'INT', 'Scienze naturali', 'Misure, errori e i primi esperimenti.', 'stem'),
  ('PHYS 210', 'Meccanica classica', 'Scienze naturali', 3, 200, 'INT', 'Scienze naturali', 'Newton, energia, oscillazioni e orbite.', 'stem'),
  ('PHYS 220', 'Onde e ottica', 'Scienze naturali', 3, 200, 'INT', 'Scienze naturali', 'Luce, suono, laser e interferenza.', 'stem'),
  ('PHYS 230', 'Laboratorio di fisica II', 'Scienze naturali', 3, 200, 'INT', 'Scienze naturali', 'Esperimenti di elettricità, ottica e fisica moderna.', 'stem'),
  ('PHYS 240', 'Metodi matematici della fisica', 'Scienze naturali', 3, 200, 'INT', 'Matematica e statistica', 'Vettori, equazioni differenziali e serie di Fourier.', 'stem'),
  ('PHYS 310', 'Elettromagnetismo', 'Scienze naturali', 3, 300, 'INT', 'Scienze naturali', 'Campi, equazioni di Maxwell e onde elettromagnetiche.', 'stem'),
  ('PHYS 320', 'Meccanica quantistica', 'Scienze naturali', 3, 300, 'INT', 'Scienze naturali', 'Funzioni d''onda, atomi e il gatto di Schrödinger.', 'stem'),
  ('PHYS 330', 'Termodinamica e meccanica statistica', 'Scienze naturali', 3, 300, 'INT', 'Scienze naturali', 'Entropia, calore e il comportamento di miliardi di particelle.', 'stem'),
  ('PHYS 340', 'Astrofisica', 'Scienze naturali', 3, 300, 'INT', 'Scienze naturali', 'Come nascono e muoiono le stelle, buchi neri compresi.', 'stem'),
  ('PHYS 350', 'Fisica dell''oceano e del clima', 'Scienze naturali', 3, 300, 'INT', 'Scienze naturali', 'Correnti, onde, uragani e riscaldamento globale.', 'stem'),
  ('PHYS 360', 'Fisica computazionale', 'Scienze naturali', 3, 300, 'INT', 'Informatica e tecnologia', 'Simulare la fisica al computer.', 'stem'),
  ('PHYS 410', 'Fisica nucleare e delle particelle', 'Scienze naturali', 3, 400, 'INT', 'Scienze naturali', 'Nuclei, quark, acceleratori e il bosone di Higgs.', 'stem'),
  ('PHYS 420', 'Fisica della materia', 'Scienze naturali', 3, 400, 'INT', 'Scienze naturali', 'Cristalli, semiconduttori e superconduttori.', 'stem'),
  ('PHYS 430', 'Cosmologia', 'Scienze naturali', 3, 400, 'INT', 'Scienze naturali', 'Big Bang, materia oscura e il destino dell''universo.', 'stem'),
  ('PHYS 440', 'Tesi di ricerca in fisica', 'Scienze naturali', 3, 400, 'INT', 'Studio e ricerca', 'Un anno in un laboratorio vero, fino alla presentazione finale.', 'stem'),
  -- Matematica
  ('MATH 130', 'Introduzione alle dimostrazioni', 'Matematica e ingegneria', 3, 100, 'INT', 'Matematica e statistica', 'Logica, induzione e come si scrive una dimostrazione.', 'stem'),
  ('MATH 210', 'Equazioni differenziali', 'Matematica e ingegneria', 3, 200, 'INT', 'Matematica e statistica', 'Le equazioni che descrivono tutto ciò che cambia.', 'stem'),
  ('MATH 230', 'Probabilità', 'Matematica e ingegneria', 3, 200, 'INT', 'Matematica e statistica', 'Caso, variabili aleatorie e giochi d''azzardo.', 'stem'),
  ('MATH 240', 'Geometria', 'Matematica e ingegneria', 3, 200, 'INT', 'Matematica e statistica', 'Da Euclide alle geometrie non euclidee.', 'stem'),
  ('MATH 320', 'Algebra astratta', 'Matematica e ingegneria', 3, 300, 'INT', 'Matematica e statistica', 'Gruppi, anelli e campi.', 'stem'),
  ('MATH 330', 'Analisi reale', 'Matematica e ingegneria', 3, 300, 'INT', 'Matematica e statistica', 'I fondamenti rigorosi dell''analisi.', 'stem'),
  ('MATH 340', 'Statistica matematica', 'Matematica e ingegneria', 3, 300, 'INT', 'Matematica e statistica', 'Stime, test e modelli statistici.', 'stem'),
  ('MATH 350', 'Teoria dei numeri e crittografia', 'Matematica e ingegneria', 3, 300, 'INT', 'Matematica e statistica', 'Numeri primi e codici segreti.', 'stem'),
  ('MATH 360', 'Matematica finanziaria', 'Matematica e ingegneria', 3, 300, 'INT', 'Matematica e statistica', 'Interessi, rischio e prezzi dei derivati.', 'stem'),
  ('MATH 420', 'Analisi complessa', 'Matematica e ingegneria', 3, 400, 'INT', 'Matematica e statistica', 'Funzioni di variabile complessa e loro applicazioni.', 'stem'),
  ('MATH 430', 'Topologia', 'Matematica e ingegneria', 3, 400, 'INT', 'Matematica e statistica', 'Perché una tazza è uguale a una ciambella.', 'stem'),
  ('MATH 440', 'Modelli matematici', 'Matematica e ingegneria', 3, 400, 'INT', 'Matematica e statistica', 'Epidemie, traffico e popolazioni descritti con le equazioni.', 'stem'),
  ('MATH 450', 'Seminario di matematica', 'Matematica e ingegneria', 3, 400, 'INT', 'Studio e ricerca', 'Una tesina e una presentazione davanti al dipartimento.', 'stem'),
  -- Chimica e biochimica
  ('CHEM 110', 'Chimica e ambiente', 'Scienze naturali', 3, 100, 'INT', 'Scienze naturali', 'Aria, acqua, plastica: la chimica di tutti i giorni.', 'stem'),
  ('CHEM 120', 'Laboratorio di chimica', 'Scienze naturali', 3, 100, 'INT', 'Scienze naturali', 'Vetreria, sicurezza e le prime sintesi.', 'stem'),
  ('CHEM 220', 'Chimica inorganica', 'Scienze naturali', 3, 200, 'INT', 'Scienze naturali', 'Metalli, cristalli e composti di coordinazione.', 'stem'),
  ('CHEM 230', 'Chimica fisica I', 'Scienze naturali', 3, 200, 'INT', 'Scienze naturali', 'Termodinamica chimica ed equilibri.', 'stem'),
  ('CHEM 310', 'Chimica fisica II', 'Scienze naturali', 3, 300, 'INT', 'Scienze naturali', 'Cinetica, quanti e spettroscopia.', 'stem'),
  ('CHEM 320', 'Analisi strumentale', 'Scienze naturali', 3, 300, 'INT', 'Scienze naturali', 'Cromatografia, spettrometria di massa e risonanza magnetica.', 'stem'),
  ('CHEM 330', 'Chimica dei materiali', 'Scienze naturali', 3, 300, 'INT', 'Scienze naturali', 'Polimeri, nanomateriali e batterie.', 'stem'),
  ('CHEM 340', 'Chimica farmaceutica', 'Scienze naturali', 3, 300, 'INT', 'Scienze naturali', 'Come si progetta un farmaco.', 'stem'),
  ('CHEM 350', 'Chimica ambientale e marina', 'Scienze naturali', 3, 300, 'INT', 'Scienze naturali', 'Inquinanti, acidificazione degli oceani e campionamenti in mare.', 'stem'),
  ('CHEM 410', 'Sintesi organica avanzata', 'Scienze naturali', 3, 400, 'INT', 'Scienze naturali', 'Molecole complesse, passo dopo passo.', 'stem'),
  ('CHEM 420', 'Chimica forense', 'Scienze naturali', 3, 400, 'INT', 'Osservazione e indagine', 'Tracce, veleni e droghe: la chimica sulla scena del crimine.', 'stem'),
  ('CHEM 430', 'Tesi di ricerca in chimica', 'Scienze naturali', 3, 400, 'INT', 'Studio e ricerca', 'Un progetto originale in laboratorio.', 'stem'),
  ('BIOC 320', 'Enzimologia', 'Scienze naturali', 3, 300, 'INT', 'Scienze naturali', 'Come lavorano gli enzimi e come si bloccano.', 'stem'),
  ('BIOC 420', 'Biochimica clinica', 'Scienze naturali', 3, 400, 'INT', 'Medicina e primo soccorso', 'Analisi del sangue e marcatori delle malattie.', 'stem'),
  -- Lingue e culture straniere
  ('LANG 102', 'Francese I', 'Studi umanistici', 3, 100, 'INT', 'Lingue straniere', 'Livello base.', 'umanistica'),
  ('LANG 103', 'Italiano I', 'Studi umanistici', 3, 100, 'INT', 'Lingue straniere', 'Livello base.', 'umanistica'),
  ('LANG 104', 'Cinese mandarino I', 'Studi umanistici', 3, 100, 'INT', 'Lingue straniere', 'Toni, caratteri e prime conversazioni.', 'umanistica'),
  ('LANG 202', 'Francese II', 'Studi umanistici', 3, 200, 'INT', 'Lingue straniere', 'Livello intermedio.', 'umanistica'),
  ('LANG 203', 'Italiano II', 'Studi umanistici', 3, 200, 'INT', 'Lingue straniere', 'Livello intermedio.', 'umanistica'),
  ('LANG 204', 'Cinese mandarino II', 'Studi umanistici', 3, 200, 'INT', 'Lingue straniere', 'Livello intermedio.', 'umanistica'),
  ('LANG 210', 'Linguistica generale', 'Studi umanistici', 3, 200, 'INT', 'Lingue straniere', 'Suoni, parole e grammatiche delle lingue del mondo.', 'umanistica'),
  ('LANG 220', 'Introduzione alla traduzione', 'Studi umanistici', 3, 200, 'INT', 'Lingue straniere', 'Tradurre bene, senza tradire.', 'umanistica'),
  ('LANG 302', 'Francese III', 'Studi umanistici', 3, 300, 'INT', 'Lingue straniere', 'Livello avanzato.', 'umanistica'),
  ('LANG 303', 'Italiano III', 'Studi umanistici', 3, 300, 'INT', 'Lingue straniere', 'Livello avanzato.', 'umanistica'),
  ('LANG 310', 'Letterature ispaniche', 'Studi umanistici', 3, 300, 'INT', 'Lettere e filosofia', 'Da Cervantes a García Márquez, in lingua.', 'umanistica'),
  ('LANG 320', 'Culture del mondo francofono', 'Studi umanistici', 3, 300, 'INT', 'Lettere e filosofia', 'Francia, Québec, Africa e Caraibi.', 'umanistica'),
  ('LANG 330', 'Interpretariato', 'Studi umanistici', 3, 300, 'INT', 'Lingue straniere', 'Tradurre a voce, in tempo reale.', 'umanistica'),
  ('LANG 401', 'Spagnolo per le professioni', 'Studi umanistici', 3, 400, 'INT', 'Lingue straniere', 'Lo spagnolo di ospedali, tribunali e aziende in California.', 'umanistica'),
  ('LANG 410', 'Seminario di traduzione letteraria', 'Studi umanistici', 3, 400, 'INT', 'Lingue straniere', 'Tradurre un racconto vero, dall''inizio alla fine.', 'umanistica'),
  ('LANG 420', 'Semestre di scambio', 'Studi umanistici', 3, 400, 'INT', 'Lingue straniere', 'Un progetto con un''università all''estero.', 'umanistica'),
  -- Sociologia
  ('SOC 110', 'Problemi sociali', 'Scienze sociali e diritto', 3, 100, 'INT', 'Scienze sociali ed economia', 'Povertà, dipendenze e senzatetto nelle città americane.', 'umanistica'),
  ('SOC 120', 'Antropologia culturale', 'Scienze sociali e diritto', 3, 100, 'INT', 'Scienze sociali ed economia', 'Riti, parentele e culture diverse dalla nostra.', 'umanistica'),
  ('SOC 220', 'Sociologia della famiglia', 'Scienze sociali e diritto', 3, 200, 'INT', 'Scienze sociali ed economia', 'Coppie, figli e famiglie che cambiano.', 'umanistica'),
  ('SOC 230', 'Razza ed etnia in America', 'Scienze sociali e diritto', 3, 200, 'INT', 'Scienze sociali ed economia', 'Storia e presente delle disuguaglianze.', 'umanistica'),
  ('SOC 240', 'Statistica sociale', 'Scienze sociali e diritto', 3, 200, 'INT', 'Matematica e statistica', 'Sondaggi, campioni e dati sulla società.', 'umanistica'),
  ('SOC 250', 'Sociologia della religione', 'Scienze sociali e diritto', 3, 200, 'INT', 'Scienze sociali ed economia', 'Fede, chiese e comunità.', 'umanistica'),
  ('SOC 330', 'Sociologia dei media', 'Scienze sociali e diritto', 3, 300, 'INT', 'Scienze sociali ed economia', 'Come i media e i social cambiano la società.', 'umanistica'),
  ('SOC 340', 'Migrazioni', 'Scienze sociali e diritto', 3, 300, 'INT', 'Scienze sociali ed economia', 'Chi parte, chi arriva e la vita al confine.', 'umanistica'),
  ('SOC 350', 'Sociologia del lavoro', 'Scienze sociali e diritto', 3, 300, 'INT', 'Scienze sociali ed economia', 'Sindacati, precariato e lavoro su app.', 'umanistica'),
  ('SOC 360', 'Sociologia della salute', 'Scienze sociali e diritto', 3, 300, 'INT', 'Scienze sociali ed economia', 'Chi si ammala, chi si cura e perché.', 'umanistica'),
  ('SOC 420', 'Movimenti sociali', 'Scienze sociali e diritto', 3, 400, 'PRE', 'Leadership', 'Proteste, campagne e diritti civili.', 'umanistica'),
  ('SOC 430', 'Tirocinio nei servizi sociali', 'Scienze sociali e diritto', 3, 400, 'EMP', 'Ascolto e supporto', 'Un semestre in un centro di assistenza della città.', 'umanistica'),
  ('SOC 440', 'Seminario di sociologia', 'Scienze sociali e diritto', 3, 400, 'INT', 'Studio e ricerca', 'Una ricerca originale, dalla domanda ai risultati.', 'umanistica'),
  -- Danza
  ('DANC 110', 'Danza classica', 'Arti', 3, 100, 'RIF', 'Danza', 'Sbarra, punte e disciplina.', 'umanistica'),
  ('DANC 120', 'Hip hop', 'Arti', 3, 100, 'RIF', 'Danza', 'Breaking, popping e freestyle.', 'umanistica'),
  ('DANC 210', 'Danza contemporanea', 'Arti', 3, 200, 'RIF', 'Danza', 'Improvvisazione, peso e floor work.', 'umanistica'),
  ('DANC 310', 'Storia della danza', 'Arti', 3, 300, 'INT', 'Lettere e filosofia', 'Dal balletto di corte a Broadway e TikTok.', 'umanistica'),
  ('DANC 401', 'Spettacolo di danza', 'Arti', 3, 400, 'RIF', 'Danza', 'Lo spettacolo finale, coreografia propria.', 'umanistica')
) as v (code, name, dept, credits, level, attr, skill, descr, area)
join public.attributes a on a.code = v.attr
left join public.skills s on s.name = v.skill
on conflict (code) do nothing;

insert into public.course_prerequisites (course_id, prerequisite_id)
select c.id, p.id
from (values
  ('PHYS 210', 'PHYS 101'), ('PHYS 220', 'PHYS 102'), ('PHYS 230', 'PHYS 101'), ('PHYS 240', 'MATH 102'), ('PHYS 310', 'PHYS 102'),
  ('PHYS 320', 'PHYS 201'), ('PHYS 330', 'PHYS 210'), ('PHYS 340', 'PHYS 201'), ('PHYS 350', 'PHYS 101'), ('PHYS 360', 'PHYS 210'),
  ('PHYS 410', 'PHYS 320'), ('PHYS 420', 'PHYS 320'), ('PHYS 430', 'PHYS 340'), ('PHYS 440', 'PHYS 310'),
  ('MATH 210', 'MATH 102'), ('MATH 230', 'MATH 101'), ('MATH 240', 'MATH 130'), ('MATH 320', 'MATH 130'), ('MATH 330', 'MATH 102'),
  ('MATH 340', 'MATH 230'), ('MATH 350', 'MATH 130'), ('MATH 360', 'MATH 201'), ('MATH 420', 'MATH 330'), ('MATH 430', 'MATH 330'),
  ('MATH 440', 'MATH 210'), ('MATH 450', 'MATH 320'),
  ('CHEM 220', 'CHEM 101'), ('CHEM 230', 'CHEM 102'), ('CHEM 310', 'CHEM 230'), ('CHEM 320', 'CHEM 210'), ('CHEM 330', 'CHEM 220'),
  ('CHEM 340', 'CHEM 201'), ('CHEM 350', 'CHEM 101'), ('CHEM 410', 'CHEM 301'), ('CHEM 420', 'CHEM 210'), ('CHEM 430', 'CHEM 310'),
  ('BIOC 320', 'BIOC 310'), ('BIOC 420', 'BIOC 310'),
  ('LANG 202', 'LANG 102'), ('LANG 203', 'LANG 103'), ('LANG 204', 'LANG 104'), ('LANG 302', 'LANG 202'), ('LANG 303', 'LANG 203'),
  ('LANG 310', 'LANG 201'), ('LANG 320', 'LANG 202'), ('LANG 330', 'LANG 220'), ('LANG 401', 'LANG 301'), ('LANG 410', 'LANG 220'),
  ('SOC 220', 'SOC 101'), ('SOC 230', 'SOC 101'), ('SOC 240', 'SOC 101'), ('SOC 330', 'SOC 101'), ('SOC 340', 'SOC 101'),
  ('SOC 420', 'SOC 310'), ('SOC 430', 'SOC 101'), ('SOC 440', 'SOC 410'),
  ('DANC 210', 'DANC 101'), ('DANC 401', 'DANC 301')
) as v (course, prereq)
join public.courses c on c.code = v.course
join public.courses p on p.code = v.prereq
on conflict do nothing;

-- 2. NUOVI INDIRIZZI (scelti in creazione come Major o Minor)
insert into public.sheet_options (kind, name, sort_order)
select 'indirizzo', v.name, coalesce((select max(sort_order) from public.sheet_options where kind = 'indirizzo'), 0) + v.ord
from (values ('Fisica', 1), ('Matematica', 2), ('Chimica', 3), ('Lingue e culture straniere', 4), ('Sociologia', 5)) as v (name, ord)
on conflict (kind, name) do update set active = true;

-- 3. CORSI OBBLIGATORI
insert into public.major_required_courses (major_id, course_id)
select o.id, c.id
from (values
  ('Fisica', 'PHYS 101'), ('Fisica', 'PHYS 102'), ('Fisica', 'MATH 101'), ('Fisica', 'PHYS 210'), ('Fisica', 'PHYS 310'), ('Fisica', 'PHYS 320'), ('Fisica', 'PHYS 440'),
  ('Matematica', 'MATH 101'), ('Matematica', 'MATH 102'), ('Matematica', 'MATH 130'), ('Matematica', 'MATH 301'), ('Matematica', 'MATH 320'), ('Matematica', 'MATH 330'), ('Matematica', 'MATH 450'),
  ('Chimica', 'CHEM 101'), ('Chimica', 'CHEM 102'), ('Chimica', 'CHEM 201'), ('Chimica', 'CHEM 220'), ('Chimica', 'CHEM 230'), ('Chimica', 'CHEM 310'), ('Chimica', 'CHEM 430'),
  ('Lingue e culture straniere', 'LANG 101'), ('Lingue e culture straniere', 'LANG 201'), ('Lingue e culture straniere', 'LANG 210'),
  ('Lingue e culture straniere', 'LANG 220'), ('Lingue e culture straniere', 'LANG 301'), ('Lingue e culture straniere', 'LANG 410'),
  ('Sociologia', 'SOC 101'), ('Sociologia', 'SOC 110'), ('Sociologia', 'SOC 240'), ('Sociologia', 'SOC 310'), ('Sociologia', 'SOC 410'), ('Sociologia', 'SOC 440')
) as v (major, course)
join public.sheet_options o on o.kind = 'indirizzo' and o.name = v.major
join public.courses c on c.code = v.course
on conflict do nothing;

-- 4. MATERIE PRINCIPALI E AFFINI
insert into public.major_subjects (major_id, prefix, kind)
select o.id, v.prefix, v.kind
from (values
  ('Fisica', 'PHYS', 'principale'), ('Fisica', 'MATH', 'principale'), ('Fisica', 'ENGR', 'affine'), ('Fisica', 'CS', 'affine'), ('Fisica', 'CHEM', 'affine'),
  ('Matematica', 'MATH', 'principale'), ('Matematica', 'CS', 'affine'), ('Matematica', 'PHYS', 'affine'), ('Matematica', 'ECON', 'affine'),
  ('Chimica', 'CHEM', 'principale'), ('Chimica', 'BIOC', 'principale'), ('Chimica', 'BIO', 'affine'), ('Chimica', 'PHYS', 'affine'),
  ('Chimica', 'MATH', 'affine'), ('Chimica', 'MED', 'affine'),
  ('Lingue e culture straniere', 'LANG', 'principale'), ('Lingue e culture straniere', 'LIT', 'affine'), ('Lingue e culture straniere', 'ENG', 'affine'),
  ('Lingue e culture straniere', 'HIST', 'affine'), ('Lingue e culture straniere', 'COMM', 'affine'),
  ('Sociologia', 'SOC', 'principale'), ('Sociologia', 'PSY', 'affine'), ('Sociologia', 'POL', 'affine'), ('Sociologia', 'LAW', 'affine'), ('Sociologia', 'ECON', 'affine')
) as v (major, prefix, kind)
join public.sheet_options o on o.kind = 'indirizzo' and o.name = v.major
on conflict (major_id, prefix) do nothing;

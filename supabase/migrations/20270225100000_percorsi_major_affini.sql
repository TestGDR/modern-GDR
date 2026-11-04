-- =====================================================================
-- UNIVERSITÀ: PERCORSI COMPLETI PER OGNI MAJOR E CORSI AFFINI
-- 1. Due doppioni corretti (JOUR 310, ENG 110).
-- 2. 90 corsi nuovi: ogni Major arriva a circa 20 corsi nelle sue materie,
--    con più corsi 300 e 400 per Junior e Senior.
-- 3. Materie di ogni Major (major_subjects): «principali» (le sue sigle) e
--    «affini» (sigle di altre materie che hanno senso per lui), da
--    Gestione → Università → Indirizzi.
-- 4. Corsi di base per tutti (general_courses): metodo di studio,
--    composizione, public speaking, educazione fisica.
-- 5. Iscrizione automatica: obbligatori → materie principali → Minor e
--    Pre-Med → affini → corsi di base; mai materie che non c'entrano.
--    Prima i corsi del livello dell'anno (Freshman 100, Sophomore 200…).
--    Nessun cambio alla laurea: chi vuole può sempre scegliere altri corsi.
-- =====================================================================

-- 1. DOPPIONI
update public.courses set name = 'Cronaca e reportage',
  description = 'Raccontare la città: cronaca, quartieri, interviste sul campo.'
where code = 'JOUR 310';
update public.courses set name = 'Introduzione alla letteratura',
  description = 'Leggere, interpretare e discutere romanzi, racconti e poesie.'
where code = 'ENG 110';

-- 2. CORSI NUOVI
insert into public.courses (code, name, department, credits, level, attribute_id, skill_id, description, area)
select v.code, v.name, v.dept, v.credits, v.level, a.id, s.id, v.descr, v.area
from (values
  -- Informatica e matematica
  ('CS 240', 'Algoritmi', 'Matematica e ingegneria', 3, 200, 'INT', 'Informatica e tecnologia', 'Ordinare, cercare, ottimizzare: quanto costa risolvere un problema.', 'stem'),
  ('CS 350', 'Sistemi operativi', 'Matematica e ingegneria', 3, 300, 'INT', 'Informatica e tecnologia', 'Processi, memoria e file: cosa succede sotto il cofano.', 'stem'),
  ('CS 360', 'Ingegneria del software', 'Matematica e ingegneria', 3, 300, 'INT', 'Informatica e tecnologia', 'Progettare, testare e mantenere programmi grandi.', 'stem'),
  ('CS 430', 'Cloud e sistemi distribuiti', 'Matematica e ingegneria', 3, 400, 'INT', 'Informatica e tecnologia', 'Server, container e servizi che reggono milioni di utenti.', 'stem'),
  ('CS 440', 'Sviluppo di videogiochi', 'Matematica e ingegneria', 3, 400, 'INT', 'Informatica e tecnologia', 'Motori grafici, fisica e game design in squadra.', 'stem'),
  ('MATH 310', 'Calcolo numerico', 'Matematica e ingegneria', 3, 300, 'INT', 'Matematica e statistica', 'Risolvere al computer i problemi che a mano non tornano.', 'stem'),
  ('MATH 410', 'Ricerca operativa', 'Matematica e ingegneria', 3, 400, 'INT', 'Matematica e statistica', 'Ottimizzazione, logistica e decisioni con i numeri.', 'stem'),
  -- Ingegneria e fisica
  ('ENGR 210', 'Statica e dinamica', 'Matematica e ingegneria', 3, 200, 'INT', 'Ingegneria e progettazione', 'Forze, equilibrio e movimento delle strutture.', 'stem'),
  ('ENGR 230', 'Termodinamica', 'Matematica e ingegneria', 3, 200, 'INT', 'Ingegneria e progettazione', 'Calore, energia e motori.', 'stem'),
  ('ENGR 310', 'Meccanica dei fluidi', 'Matematica e ingegneria', 3, 300, 'INT', 'Ingegneria e progettazione', 'Acqua, aria e tutto ciò che scorre.', 'stem'),
  ('ENGR 330', 'Elettronica', 'Matematica e ingegneria', 3, 300, 'INT', 'Ingegneria e progettazione', 'Transistor, sensori e microcontrollori.', 'stem'),
  ('ENGR 340', 'Strutture e ingegneria civile', 'Matematica e ingegneria', 3, 300, 'INT', 'Ingegneria e progettazione', 'Ponti, edifici e terremoti in California.', 'stem'),
  ('ENGR 430', 'Ingegneria biomedica', 'Matematica e ingegneria', 3, 400, 'INT', 'Ingegneria e progettazione', 'Protesi, dispositivi medici e strumenti per la salute.', 'stem'),
  ('PHYS 102', 'Fisica generale II', 'Scienze naturali', 4, 100, 'INT', 'Scienze naturali', 'Elettromagnetismo, ottica e onde. Con laboratorio.', 'stem'),
  ('PHYS 201', 'Fisica moderna', 'Scienze naturali', 3, 200, 'INT', 'Scienze naturali', 'Relatività, quanti e atomi.', 'stem'),
  -- Biologia e chimica
  ('CHEM 102', 'Chimica generale II', 'Scienze naturali', 4, 100, 'INT', 'Scienze naturali', 'Equilibri, acidi e basi, elettrochimica. Con laboratorio.', 'stem'),
  ('CHEM 210', 'Chimica analitica', 'Scienze naturali', 3, 200, 'INT', 'Scienze naturali', 'Misurare con precisione cosa c''è in un campione.', 'stem'),
  ('CHEM 301', 'Chimica organica II', 'Scienze naturali', 3, 300, 'INT', 'Scienze naturali', 'Sintesi e meccanismi: il seguito che fa piangere di più.', 'stem'),
  ('BIO 220', 'Botanica', 'Scienze naturali', 3, 200, 'INT', 'Scienze naturali', 'Piante, alghe e la flora della costa californiana.', 'stem'),
  ('BIO 340', 'Immunologia', 'Scienze naturali', 3, 300, 'INT', 'Scienze naturali', 'Come il corpo si difende da virus e batteri.', 'stem'),
  ('BIO 350', 'Biologia della conservazione', 'Scienze naturali', 3, 300, 'INT', 'Scienze naturali', 'Specie a rischio, parchi e aree marine protette.', 'stem'),
  ('BIO 430', 'Genomica', 'Scienze naturali', 3, 400, 'INT', 'Scienze naturali', 'Leggere e confrontare interi genomi.', 'stem'),
  ('BIO 440', 'Spedizione di ricerca in mare', 'Scienze naturali', 3, 400, 'INT', 'Studio e ricerca', 'Un progetto vero a bordo della nave dell''istituto oceanografico.', 'stem'),
  ('BIOC 410', 'Biologia molecolare', 'Scienze naturali', 3, 400, 'INT', 'Scienze naturali', 'Geni, proteine e tecniche di laboratorio avanzate.', 'stem'),
  -- Scienze biomediche
  ('MED 340', 'Epidemiologia', 'Scienze biomediche', 3, 300, 'INT', 'Medicina e primo soccorso', 'Come si diffondono le malattie e come si misurano.', 'stem'),
  ('MED 420', 'Sanità globale', 'Scienze biomediche', 3, 400, 'INT', 'Medicina e primo soccorso', 'Salute, povertà e sistemi sanitari nel mondo.', 'stem'),
  -- Economia
  ('ECON 120', 'Contabilità', 'Scienze sociali e diritto', 3, 100, 'INT', 'Scienze sociali ed economia', 'Partita doppia, bilanci e conti che tornano.', 'umanistica'),
  ('ECON 230', 'Econometria', 'Scienze sociali e diritto', 3, 200, 'INT', 'Matematica e statistica', 'Statistica applicata ai dati economici.', 'umanistica'),
  ('ECON 240', 'Economia del turismo', 'Scienze sociali e diritto', 3, 200, 'INT', 'Scienze sociali ed economia', 'Hotel, spiagge e grandi eventi: chi ci guadagna.', 'umanistica'),
  ('ECON 330', 'Economia internazionale', 'Scienze sociali e diritto', 3, 300, 'INT', 'Scienze sociali ed economia', 'Commercio, dazi e valute.', 'umanistica'),
  ('ECON 340', 'Imprenditorialità', 'Scienze sociali e diritto', 3, 300, 'PRE', 'Leadership', 'Dall''idea alla startup: business plan e investitori.', 'umanistica'),
  ('ECON 420', 'Banche e mercati finanziari', 'Scienze sociali e diritto', 3, 400, 'INT', 'Scienze sociali ed economia', 'Borsa, credito e crisi finanziarie.', 'umanistica'),
  ('ECON 430', 'Strategia e management', 'Scienze sociali e diritto', 3, 400, 'PRE', 'Leadership', 'Guidare un''azienda: casi reali e decisioni.', 'umanistica'),
  -- Psicologia e sociologia
  ('PSY 130', 'Psicologia dell''educazione', 'Scienze sociali e diritto', 3, 100, 'INT', 'Scienze sociali ed economia', 'Come si impara e come si insegna.', 'umanistica'),
  ('PSY 220', 'Psicologia della personalità', 'Scienze sociali e diritto', 3, 200, 'INT', 'Scienze sociali ed economia', 'Tratti, carattere e differenze tra le persone.', 'umanistica'),
  ('PSY 240', 'Metodi di ricerca in psicologia', 'Scienze sociali e diritto', 3, 200, 'INT', 'Studio e ricerca', 'Esperimenti, questionari e analisi dei dati.', 'umanistica'),
  ('PSY 340', 'Psicologia del lavoro', 'Scienze sociali e diritto', 3, 300, 'INT', 'Scienze sociali ed economia', 'Motivazione, gruppi e stress in ufficio.', 'umanistica'),
  ('PSY 350', 'Psicopatologia', 'Scienze sociali e diritto', 3, 300, 'INT', 'Scienze sociali ed economia', 'Ansia, depressione e disturbi mentali.', 'umanistica'),
  ('PSY 420', 'Psicologia dello sport', 'Scienze sociali e diritto', 3, 400, 'EMP', 'Ascolto e supporto', 'Concentrazione, pressione e motivazione degli atleti.', 'umanistica'),
  ('PSY 430', 'Tirocinio di counseling', 'Scienze sociali e diritto', 3, 400, 'EMP', 'Ascolto e supporto', 'Colloqui supervisionati al centro d''ascolto del campus.', 'umanistica'),
  ('SOC 310', 'Devianza e controllo sociale', 'Scienze sociali e diritto', 3, 300, 'INT', 'Scienze sociali ed economia', 'Regole, chi le infrange e come reagisce la società.', 'umanistica'),
  ('SOC 320', 'Genere e società', 'Scienze sociali e diritto', 3, 300, 'INT', 'Scienze sociali ed economia', 'Ruoli, identità e disuguaglianze.', 'umanistica'),
  ('SOC 410', 'Metodi della ricerca sociale', 'Scienze sociali e diritto', 3, 400, 'INT', 'Studio e ricerca', 'Interviste, sondaggi e una ricerca sul campo.', 'umanistica'),
  -- Diritto
  ('LAW 220', 'Diritto commerciale', 'Scienze sociali e diritto', 3, 200, 'INT', 'Diritto e politica', 'Società, contratti d''impresa e concorrenza.', 'umanistica'),
  ('LAW 330', 'Diritto dell''immigrazione', 'Scienze sociali e diritto', 3, 300, 'INT', 'Diritto e politica', 'Visti, confini e diritti: un tema caldo vicino al Messico.', 'umanistica'),
  ('LAW 340', 'Procedura penale', 'Scienze sociali e diritto', 3, 300, 'INT', 'Diritto e politica', 'Dall''arresto al verdetto: polizia, prove, giuria.', 'umanistica'),
  ('LAW 410', 'Moot court', 'Scienze sociali e diritto', 3, 400, 'PRE', 'Persuasione e dibattito', 'Un processo simulato davanti a giudici veri.', 'umanistica'),
  ('LAW 430', 'Clinica legale', 'Scienze sociali e diritto', 3, 400, 'INT', 'Diritto e politica', 'Consulenza gratuita a chi non può pagare un avvocato.', 'umanistica'),
  -- Scienze politiche
  ('POL 240', 'Politica comparata', 'Scienze sociali e diritto', 3, 200, 'INT', 'Diritto e politica', 'Democrazie e regimi a confronto.', 'umanistica'),
  ('POL 310', 'Elezioni e partiti', 'Scienze sociali e diritto', 3, 300, 'INT', 'Diritto e politica', 'Come si vota, chi vince e perché.', 'umanistica'),
  ('POL 340', 'Media e politica', 'Scienze sociali e diritto', 3, 300, 'PRE', 'Persuasione e dibattito', 'Propaganda, talk show e social network.', 'umanistica'),
  ('POL 350', 'Politica dell''America Latina', 'Scienze sociali e diritto', 3, 300, 'INT', 'Diritto e politica', 'Messico, Cuba, Brasile e i loro rapporti con gli Stati Uniti.', 'umanistica'),
  ('POL 420', 'Seminario di politica estera', 'Scienze sociali e diritto', 3, 400, 'INT', 'Diritto e politica', 'Crisi internazionali analizzate come al Dipartimento di Stato.', 'umanistica'),
  ('POL 430', 'Governo delle città', 'Scienze sociali e diritto', 3, 400, 'PRE', 'Leadership', 'Sindaci, consigli comunali e quartieri.', 'umanistica'),
  -- Lettere
  ('ENG 310', 'Shakespeare', 'Studi umanistici', 3, 300, 'INT', 'Lettere e filosofia', 'Tragedie, commedie e sonetti.', 'umanistica'),
  ('ENG 330', 'Il romanzo del Novecento', 'Studi umanistici', 3, 300, 'INT', 'Lettere e filosofia', 'Da Fitzgerald a Pynchon.', 'umanistica'),
  ('ENG 410', 'Seminario di letteratura', 'Studi umanistici', 3, 400, 'INT', 'Lettere e filosofia', 'Una tesina su un autore a scelta.', 'umanistica'),
  ('HIST 220', 'Storia d''Europa', 'Studi umanistici', 3, 200, 'INT', 'Lettere e filosofia', 'Dalle rivoluzioni all''Unione europea.', 'umanistica'),
  ('HIST 320', 'Storia dell''America Latina', 'Studi umanistici', 3, 300, 'INT', 'Lettere e filosofia', 'Imperi, indipendenze e rivoluzioni.', 'umanistica'),
  ('HIST 410', 'Seminario di storia', 'Studi umanistici', 3, 400, 'INT', 'Studio e ricerca', 'Ricerca d''archivio e una tesina originale.', 'umanistica'),
  ('PHIL 210', 'Logica', 'Studi umanistici', 3, 200, 'INT', 'Lettere e filosofia', 'Argomenti validi, fallacie e paradossi.', 'umanistica'),
  ('PHIL 310', 'Estetica', 'Studi umanistici', 3, 300, 'INT', 'Lettere e filosofia', 'Che cos''è il bello, e chi lo decide.', 'umanistica'),
  ('PHIL 410', 'Filosofia contemporanea', 'Studi umanistici', 3, 400, 'INT', 'Lettere e filosofia', 'Da Wittgenstein a oggi.', 'umanistica'),
  ('LIT 210', 'Mitologia classica', 'Studi umanistici', 3, 200, 'INT', 'Lettere e filosofia', 'Dei, eroi e storie che raccontiamo ancora.', 'umanistica'),
  -- Giornalismo e comunicazione
  ('JOUR 120', 'Scrivere la notizia', 'Studi umanistici', 3, 100, 'INT', 'Scrittura e giornalismo', 'Titolo, attacco e piramide rovesciata.', 'umanistica'),
  ('JOUR 220', 'Giornalismo radiotelevisivo', 'Studi umanistici', 3, 200, 'PRE', 'Oratoria', 'Servizi, dirette e podcast.', 'umanistica'),
  ('JOUR 230', 'Giornalismo sportivo', 'Studi umanistici', 3, 200, 'INT', 'Scrittura e giornalismo', 'Cronache, interviste negli spogliatoi e statistiche.', 'umanistica'),
  ('JOUR 330', 'Etica e diritto dei media', 'Studi umanistici', 3, 300, 'INT', 'Diritto e politica', 'Diffamazione, privacy e segreto delle fonti.', 'umanistica'),
  ('JOUR 340', 'Data journalism', 'Studi umanistici', 3, 300, 'INT', 'Osservazione e indagine', 'Trovare notizie nei numeri e mostrarle con i grafici.', 'umanistica'),
  ('JOUR 420', 'Documentario', 'Studi umanistici', 3, 400, 'EMP', 'Fotografia e video', 'Un documentario breve, dalle riprese al montaggio.', 'umanistica'),
  ('COMM 120', 'Comunicazione interpersonale', 'Studi umanistici', 3, 100, 'EMP', 'Ascolto e supporto', 'Ascoltare, convincere e gestire i conflitti.', 'umanistica'),
  ('COMM 220', 'Relazioni pubbliche', 'Studi umanistici', 3, 200, 'PRE', 'Persuasione e dibattito', 'Comunicati, eventi e rapporti con la stampa.', 'umanistica'),
  ('COMM 320', 'Pubblicità e storytelling', 'Studi umanistici', 3, 300, 'PRE', 'Stile e immagine', 'Campagne che si ricordano.', 'umanistica'),
  ('COMM 410', 'Comunicazione di crisi', 'Studi umanistici', 3, 400, 'PRE', 'Persuasione e dibattito', 'Quando scoppia lo scandalo: cosa dire e cosa no.', 'umanistica'),
  -- Arti visive
  ('ART 120', 'Design e colore', 'Arti', 3, 100, 'EMP', 'Arti visive', 'Forme, colori e composizione.', 'umanistica'),
  ('ART 210', 'Illustrazione', 'Arti', 3, 200, 'EMP', 'Arti visive', 'Dalla matita al libro illustrato.', 'umanistica'),
  ('ART 240', 'Arte contemporanea', 'Arti', 3, 200, 'INT', 'Lettere e filosofia', 'Dal Novecento alle gallerie di oggi.', 'umanistica'),
  ('ART 330', 'Videoarte e animazione', 'Arti', 3, 300, 'EMP', 'Fotografia e video', 'Immagini in movimento, dallo stop motion al digitale.', 'umanistica'),
  ('ART 340', 'Fotografia avanzata', 'Arti', 3, 300, 'EMP', 'Fotografia e video', 'Ritratto, reportage e progetti personali.', 'umanistica'),
  ('ART 350', 'Street art e murales', 'Arti', 3, 300, 'EMP', 'Arti visive', 'Grandi muri, bombolette e permessi del comune.', 'umanistica'),
  ('ART 420', 'Portfolio professionale', 'Arti', 3, 400, 'EMP', 'Arti visive', 'Preparare il portfolio per gallerie e studi.', 'umanistica'),
  ('ART 430', 'Curatela e gallerie', 'Arti', 3, 400, 'INT', 'Lettere e filosofia', 'Organizzare una mostra, dalla scelta delle opere all''inaugurazione.', 'umanistica'),
  -- Teatro, musica e danza
  ('THEA 230', 'Recitazione II', 'Arti', 3, 200, 'EMP', 'Recitazione', 'Scene, monologhi e lavoro sul personaggio.', 'umanistica'),
  ('THEA 330', 'Drammaturgia', 'Arti', 3, 300, 'INT', 'Scrittura e giornalismo', 'Scrivere per il palco.', 'umanistica'),
  ('THEA 410', 'Spettacolo finale', 'Arti', 3, 400, 'EMP', 'Recitazione', 'Lo spettacolo di fine percorso, davanti al pubblico.', 'umanistica'),
  ('MUS 120', 'Pratica dello strumento', 'Arti', 3, 100, 'RIF', 'Strumenti musicali', 'Lezioni individuali e studio quotidiano.', 'umanistica'),
  ('MUS 230', 'Musica d''insieme', 'Arti', 3, 200, 'RIF', 'Strumenti musicali', 'Band, orchestra e prove settimanali.', 'umanistica'),
  ('MUS 320', 'Jazz e musica latina', 'Arti', 3, 300, 'RIF', 'Strumenti musicali', 'Swing, salsa, bossa nova e improvvisazione.', 'umanistica'),
  ('MUS 420', 'Musica per film e media', 'Arti', 3, 400, 'RIF', 'Strumenti musicali', 'Colonne sonore, spot e videogiochi.', 'umanistica'),
  ('DANC 201', 'Danze latine', 'Arti', 3, 200, 'RIF', 'Danza', 'Salsa, bachata e merengue.', 'umanistica'),
  ('DANC 301', 'Coreografia', 'Arti', 3, 300, 'RIF', 'Danza', 'Creare e insegnare un pezzo.', 'umanistica')
) as v (code, name, dept, credits, level, attr, skill, descr, area)
join public.attributes a on a.code = v.attr
left join public.skills s on s.name = v.skill
on conflict (code) do nothing;

insert into public.course_prerequisites (course_id, prerequisite_id)
select c.id, p.id
from (values
  ('CS 240', 'CS 210'), ('CS 350', 'CS 230'), ('CS 360', 'CS 210'), ('CS 430', 'CS 340'), ('CS 440', 'CS 250'),
  ('MATH 310', 'MATH 102'), ('MATH 410', 'MATH 201'),
  ('ENGR 210', 'MATH 101'), ('ENGR 230', 'ENGR 101'), ('ENGR 310', 'ENGR 230'), ('ENGR 330', 'ENGR 201'), ('ENGR 340', 'ENGR 210'),
  ('PHYS 102', 'PHYS 101'), ('PHYS 201', 'PHYS 102'),
  ('CHEM 102', 'CHEM 101'), ('CHEM 210', 'CHEM 101'), ('CHEM 301', 'CHEM 201'),
  ('BIO 220', 'BIO 101'), ('BIO 340', 'BIO 210'), ('BIO 350', 'BIO 110'), ('BIO 430', 'BIO 201'), ('BIO 440', 'BIO 310'),
  ('BIOC 410', 'BIOC 310'), ('MED 340', 'MED 110'), ('MED 420', 'MED 110'),
  ('ECON 230', 'MATH 201'), ('ECON 330', 'ECON 201'), ('ECON 420', 'ECON 320'), ('ECON 430', 'ECON 310'),
  ('PSY 240', 'PSY 101'), ('PSY 350', 'PSY 230'), ('PSY 430', 'PSY 320'), ('SOC 310', 'SOC 101'),
  ('LAW 340', 'LAW 230'), ('LAW 410', 'LAW 310'), ('LAW 430', 'LAW 210'),
  ('POL 240', 'POL 101'), ('POL 420', 'POL 330'),
  ('ENG 310', 'ENG 220'), ('ENG 410', 'ENG 220'), ('HIST 410', 'HIST 210'), ('PHIL 410', 'PHIL 201'),
  ('JOUR 420', 'JOUR 210'), ('COMM 320', 'COMM 210'),
  ('ART 340', 'ART 220'), ('ART 420', 'ART 310'),
  ('THEA 230', 'THEA 101'), ('THEA 410', 'THEA 230'), ('MUS 230', 'MUS 101'), ('MUS 420', 'MUS 220'),
  ('DANC 201', 'DANC 101'), ('DANC 301', 'DANC 201')
) as v (course, prereq)
join public.courses c on c.code = v.course
join public.courses p on p.code = v.prereq
on conflict do nothing;

-- 3. MATERIE DEI MAJOR
create table if not exists public.major_subjects (
  major_id uuid not null references public.sheet_options (id) on delete cascade,
  prefix text not null check (prefix ~ '^[A-Z]{2,6}$'),
  kind text not null default 'affine' check (kind in ('principale', 'affine')),
  primary key (major_id, prefix)
);
alter table public.major_subjects enable row level security;
revoke all on public.major_subjects from anon;
drop policy if exists "Materie dei Major: lette da tutti" on public.major_subjects;
create policy "Materie dei Major: lette da tutti" on public.major_subjects for select to authenticated using (true);
drop policy if exists "Materie dei Major: lo staff aggiunge" on public.major_subjects;
create policy "Materie dei Major: lo staff aggiunge" on public.major_subjects for insert to authenticated
  with check ((select public.has_permission('universita.gestire')));
drop policy if exists "Materie dei Major: lo staff modifica" on public.major_subjects;
create policy "Materie dei Major: lo staff modifica" on public.major_subjects for update to authenticated
  using ((select public.has_permission('universita.gestire'))) with check ((select public.has_permission('universita.gestire')));
drop policy if exists "Materie dei Major: lo staff toglie" on public.major_subjects;
create policy "Materie dei Major: lo staff toglie" on public.major_subjects for delete to authenticated
  using ((select public.has_permission('universita.gestire')));
drop trigger if exists major_subjects_log on public.major_subjects;
create trigger major_subjects_log after insert or update or delete on public.major_subjects
  for each row execute function public.log_admin_change();

insert into public.major_subjects (major_id, prefix, kind)
select o.id, v.prefix, v.kind
from (values
  ('Informatica', 'CS', 'principale'), ('Informatica', 'MATH', 'principale'), ('Informatica', 'ENGR', 'affine'), ('Informatica', 'PHYS', 'affine'),
  ('Ingegneria', 'ENGR', 'principale'), ('Ingegneria', 'MATH', 'principale'), ('Ingegneria', 'PHYS', 'principale'), ('Ingegneria', 'CS', 'affine'), ('Ingegneria', 'CHEM', 'affine'),
  ('Biologia', 'BIO', 'principale'), ('Biologia', 'CHEM', 'principale'), ('Biologia', 'BIOC', 'affine'), ('Biologia', 'PHYS', 'affine'), ('Biologia', 'MED', 'affine'), ('Biologia', 'MATH', 'affine'),
  ('Scienze biomediche', 'MED', 'principale'), ('Scienze biomediche', 'BIO', 'principale'), ('Scienze biomediche', 'CHEM', 'principale'), ('Scienze biomediche', 'BIOC', 'principale'),
  ('Scienze biomediche', 'PHYS', 'affine'), ('Scienze biomediche', 'PSY', 'affine'), ('Scienze biomediche', 'MATH', 'affine'),
  ('Economia', 'ECON', 'principale'), ('Economia', 'MATH', 'principale'), ('Economia', 'LAW', 'affine'), ('Economia', 'POL', 'affine'), ('Economia', 'SOC', 'affine'),
  ('Psicologia', 'PSY', 'principale'), ('Psicologia', 'SOC', 'affine'), ('Psicologia', 'MED', 'affine'), ('Psicologia', 'PHIL', 'affine'),
  ('Studi giuridici', 'LAW', 'principale'), ('Studi giuridici', 'POL', 'principale'), ('Studi giuridici', 'PHIL', 'affine'), ('Studi giuridici', 'SOC', 'affine'),
  ('Studi giuridici', 'ECON', 'affine'), ('Studi giuridici', 'HIST', 'affine'),
  ('Scienze politiche', 'POL', 'principale'), ('Scienze politiche', 'LAW', 'affine'), ('Scienze politiche', 'ECON', 'affine'), ('Scienze politiche', 'HIST', 'affine'),
  ('Scienze politiche', 'SOC', 'affine'), ('Scienze politiche', 'PHIL', 'affine'),
  ('Lettere', 'ENG', 'principale'), ('Lettere', 'LIT', 'principale'), ('Lettere', 'HIST', 'principale'), ('Lettere', 'PHIL', 'principale'),
  ('Lettere', 'LANG', 'affine'), ('Lettere', 'JOUR', 'affine'),
  ('Giornalismo', 'JOUR', 'principale'), ('Giornalismo', 'COMM', 'principale'), ('Giornalismo', 'ENG', 'affine'), ('Giornalismo', 'POL', 'affine'),
  ('Giornalismo', 'HIST', 'affine'), ('Giornalismo', 'LANG', 'affine'),
  ('Arti visive', 'ART', 'principale'), ('Arti visive', 'THEA', 'affine'), ('Arti visive', 'COMM', 'affine'),
  ('Teatro e musica', 'THEA', 'principale'), ('Teatro e musica', 'MUS', 'principale'), ('Teatro e musica', 'DANC', 'principale'),
  ('Teatro e musica', 'ART', 'affine'), ('Teatro e musica', 'COMM', 'affine')
) as v (major, prefix, kind)
join public.sheet_options o on o.kind = 'indirizzo' and o.name = v.major
on conflict (major_id, prefix) do nothing;

-- 4. CORSI DI BASE (per tutti i Major)
create table if not exists public.general_courses (
  course_id uuid primary key references public.courses (id) on delete cascade,
  sort_order int not null default 0
);
alter table public.general_courses enable row level security;
revoke all on public.general_courses from anon;
drop policy if exists "Corsi di base: letti da tutti" on public.general_courses;
create policy "Corsi di base: letti da tutti" on public.general_courses for select to authenticated using (true);
drop policy if exists "Corsi di base: lo staff aggiunge" on public.general_courses;
create policy "Corsi di base: lo staff aggiunge" on public.general_courses for insert to authenticated
  with check ((select public.has_permission('universita.gestire')));
drop policy if exists "Corsi di base: lo staff modifica" on public.general_courses;
create policy "Corsi di base: lo staff modifica" on public.general_courses for update to authenticated
  using ((select public.has_permission('universita.gestire'))) with check ((select public.has_permission('universita.gestire')));
drop policy if exists "Corsi di base: lo staff toglie" on public.general_courses;
create policy "Corsi di base: lo staff toglie" on public.general_courses for delete to authenticated
  using ((select public.has_permission('universita.gestire')));
drop trigger if exists general_courses_log on public.general_courses;
create trigger general_courses_log after insert or update or delete on public.general_courses
  for each row execute function public.log_admin_change();

insert into public.general_courses (course_id, sort_order)
select c.id, v.ord
from (values ('UNIV 101', 1), ('ENG 101', 2), ('COMM 110', 3), ('PE 101', 4), ('PE 110', 5), ('PE 120', 6), ('PE 201', 7)) as v (code, ord)
join public.courses c on c.code = v.code
on conflict (course_id) do nothing;

-- 5. ISCRIZIONE AUTOMATICA
create or replace function public.academic_auto_enroll(p_character uuid, p_term uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_min int := coalesce(public.uni_n('uni_crediti_min'), 12)::int;
  v_major uuid;
  v_minor uuid;
  v_premed boolean;
  v_target int;
  v_have int;
  v_added int := 0;
  c record;
begin
  select study_track_id, minor_id into v_major, v_minor from public.characters where id = p_character and status = 'approvata';
  if v_major is null or not public.character_is_student(p_character) then return 0; end if;
  if (select status from public.academic_terms where id = p_term) is distinct from 'registration_open' then return 0; end if;
  v_premed := exists (select 1 from public.premed_students where character_id = p_character);
  -- livello dei corsi adatto all'anno
  v_target := case (public.uni_record(p_character)).class_standing
    when 'senior' then 400 when 'junior' then 300 when 'sophomore' then 200 else 100 end;

  for c in
    with req as (
      select m.course_id as id from public.major_required_courses m where m.major_id = v_major
    ), subj as (
      select prefix, kind from public.major_subjects where major_id = v_major
    ), main as (
      select prefix from subj where kind = 'principale'
      union
      -- Major senza materie scritte: le sigle dei suoi corsi obbligatori
      select distinct split_part(co.code, ' ', 1) from req join public.courses co on co.id = req.id
      where not exists (select 1 from subj where kind = 'principale')
    ), aff as (
      select prefix from subj where kind = 'affine'
    ), extra as (
      select m.course_id as id from public.major_required_courses m where m.major_id = v_minor
      union
      select pc.course_id from public.premed_courses pc where v_premed
    )
    select co.id, co.credits,
      case when co.id in (select id from req) then 0
           when split_part(co.code, ' ', 1) in (select prefix from main) then 1
           when co.id in (select id from extra) then 2
           when split_part(co.code, ' ', 1) in (select prefix from aff) then 3
           else 4 end as prio
    from public.courses co
    where co.active
      and (co.id in (select id from req)
           or split_part(co.code, ' ', 1) in (select prefix from main)
           or co.id in (select id from extra)
           or split_part(co.code, ' ', 1) in (select prefix from aff)
           or co.id in (select course_id from public.general_courses))
    order by prio, abs(co.level - v_target), co.level, co.code
  loop
    select coalesce(sum(co.credits), 0) into v_have from public.enrollments e join public.courses co on co.id = e.course_id
    where e.character_id = p_character and e.term_id = p_term and e.status <> 'withdrawn';
    exit when v_have >= v_min;
    begin
      perform public.academic_enroll_core(p_term, p_character, c.id);
      v_added := v_added + c.credits;
    exception when others then
      -- corso non ancora possibile (livello, prerequisiti, già superato, crediti massimi): si passa al prossimo
      null;
    end;
  end loop;
  return v_added;
end;
$$;
revoke execute on function public.academic_auto_enroll(uuid, uuid) from public, anon, authenticated;

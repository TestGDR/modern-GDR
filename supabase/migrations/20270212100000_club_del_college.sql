-- =====================================================================
-- CLUB DEL COLLEGE
-- Cinque gruppi nell'ambito «Gruppi college» (quello con «college» nel
-- nome; creato se manca), ognuno con i suoi ruoli. I ruoli non hanno
-- paga (sono club studenteschi); i posti vuoti = senza limite.
-- Gruppi e ruoli che esistono già con lo stesso nome non si duplicano.
-- =====================================================================
do $$
declare
  v_cat uuid;
  v_group uuid;
  g record;
  r record;
begin
  select id into v_cat from public.group_categories where lower(name) like '%college%' and not for_sport order by sort_order limit 1;
  if v_cat is null then
    insert into public.group_categories (name, sort_order)
    values ('Gruppi college', coalesce((select max(sort_order) + 1 from public.group_categories), 0))
    returning id into v_cat;
  end if;

  for g in
    select * from (values
      ('Club del Libro', 1,
       '<p>Una volta a settimana, divani sfondati e tè freddo nella sala comune della biblioteca: si legge un libro al mese, se ne discute fino a tardi e ogni tanto arriva un autore ospite.</p><p>Il club organizza anche lo scambio di libri usati a inizio semestre e la maratona di lettura di primavera.</p>'),
      ('Club Giornalistico', 2,
       '<p>La redazione del giornale del college: articoli, inchieste, foto, il sito e i social. Esce un numero a settimana e chi ci lavora sa sempre tutto prima degli altri.</p><p>Si scrive di sport, politica studentesca, cultura e pettegolezzi del campus, quando si possono verificare.</p>'),
      ('Club di Gaming', 3,
       '<p>Console, PC e giochi da tavolo nella sala informatica dopo le lezioni. Il club ha una squadra di e-sport che gioca contro gli altri college e organizza tornei aperti a tutti.</p><p>Lo streaming delle partite va in diretta sul canale del club.</p>'),
      ('Glee Club', 4,
       '<p>Il coro spettacolo del college: canto, coreografie e arrangiamenti di brani famosi. Prove tre volte a settimana nelle aule musica, esibizioni agli eventi del campus e una gara regionale in primavera.</p><p>Le audizioni si fanno a inizio semestre, ma c''è sempre posto per chi vuole cantare nel coro.</p>'),
      ('Comitato studentesco', 5,
       '<p>Il governo degli studenti: rappresenta il college davanti all''amministrazione, gestisce i fondi dei club e organizza gli eventi più grandi dell''anno, dalla festa di inizio semestre al ballo di fine anno.</p><p>Le cariche si eleggono ogni anno con una campagna elettorale vera e propria.</p>')
    ) as v (name, ord, descr)
  loop
    select id into v_group from public.game_groups where lower(name) = lower(g.name);
    if v_group is null then
      insert into public.game_groups (name, description, sort_order, category_id)
      values (g.name, g.descr, g.ord, v_cat) returning id into v_group;
    else
      update public.game_groups set category_id = coalesce(category_id, v_cat) where id = v_group;
    end if;

    for r in
      select * from (values
        ('Club del Libro', 'Presidente', 'Guida il club, sceglie con i membri il libro del mese e tiene i rapporti con la biblioteca.', 1, 1),
        ('Club del Libro', 'Vicepresidente', 'Sostituisce il presidente e organizza gli incontri con gli autori ospiti.', 1, 2),
        ('Club del Libro', 'Moderatore delle letture', 'Prepara le domande e guida la discussione degli incontri settimanali.', 2, 3),
        ('Club del Libro', 'Tesoriere', 'Tiene la cassa del club: quote, scambio di libri usati, merende.', 1, 4),
        ('Club del Libro', 'Membro', 'Legge, discute e propone i libri da leggere.', null, 5),

        ('Club Giornalistico', 'Direttore', 'Editor-in-chief: decide la prima pagina, firma gli editoriali e risponde di tutto ciò che esce.', 1, 1),
        ('Club Giornalistico', 'Caporedattore', 'Assegna i pezzi, corregge le bozze e controlla le fonti.', 2, 2),
        ('Club Giornalistico', 'Giornalista', 'Scrive articoli e inchieste: sport, politica studentesca, cultura, vita nel campus.', null, 3),
        ('Club Giornalistico', 'Fotografo', 'Scatta le foto per il giornale, gli eventi e le partite.', 3, 4),
        ('Club Giornalistico', 'Social media manager', 'Gestisce sito e profili social del giornale.', 1, 5),

        ('Club di Gaming', 'Presidente', 'Guida il club, prenota la sala informatica e tiene i rapporti con il Comitato studentesco.', 1, 1),
        ('Club di Gaming', 'Capitano della squadra e-sport', 'Sceglie la formazione e guida la squadra nelle partite contro gli altri college.', 1, 2),
        ('Club di Gaming', 'Organizzatore dei tornei', 'Prepara calendari, regole e premi dei tornei aperti a tutti.', 2, 3),
        ('Club di Gaming', 'Streamer', 'Trasmette in diretta le partite e i tornei sul canale del club.', 3, 4),
        ('Club di Gaming', 'Giocatore', 'Gioca, si allena con gli altri e partecipa ai tornei.', null, 5),

        ('Glee Club', 'Direttore del coro', 'Sceglie i brani, dirige le prove e decide le parti.', 1, 1),
        ('Glee Club', 'Solista', 'Canta le parti principali nelle esibizioni.', 4, 2),
        ('Glee Club', 'Coreografo', 'Crea e insegna le coreografie delle esibizioni.', 1, 3),
        ('Glee Club', 'Musicista accompagnatore', 'Suona con il coro: pianoforte, chitarra, batteria.', 3, 4),
        ('Glee Club', 'Corista', 'Canta nel coro e partecipa alle prove e alle esibizioni.', null, 5),

        ('Comitato studentesco', 'Presidente', 'Rappresenta tutti gli studenti davanti al Dean e all''amministrazione; eletto ogni anno.', 1, 1),
        ('Comitato studentesco', 'Vicepresidente', 'Sostituisce il presidente e coordina i rapporti con i club.', 1, 2),
        ('Comitato studentesco', 'Segretario', 'Scrive i verbali delle riunioni e tiene le comunicazioni con gli studenti.', 1, 3),
        ('Comitato studentesco', 'Tesoriere', 'Gestisce i fondi del comitato e quelli assegnati ai club.', 1, 4),
        ('Comitato studentesco', 'Responsabile degli eventi', 'Organizza feste, ballo di fine anno e grandi eventi del campus.', 2, 5),
        ('Comitato studentesco', 'Rappresentante di classe', 'Porta al comitato la voce del suo anno: Freshman, Sophomore, Junior o Senior.', 4, 6),
        ('Comitato studentesco', 'Consigliere', 'Partecipa alle riunioni, vota le proposte e dà una mano agli eventi.', null, 7)
      ) as v (grp, name, descr, slots, ord)
      where v.grp = g.name
    loop
      if not exists (select 1 from public.group_roles where group_id = v_group and lower(name) = lower(r.name)) then
        insert into public.group_roles (group_id, name, description, salary, max_members, sort_order)
        values (v_group, r.name, r.descr, 0, r.slots, r.ord);
      end if;
    end loop;
  end loop;
end;
$$;

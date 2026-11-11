-- =====================================================================
-- FOOTBALL: I RUOLI COMPLETI, CON DESCRIZIONE E TIRI
-- sport_positions.description: chi è e che carattere ha il ruolo; nel
-- gruppo della squadra la descrizione del ruolo = descrizione + tiri.
-- Tiri come nella scheda dei ruoli: «/» = in alternativa (si usa la
-- migliore), «e» = secondo tiro (conta la media).
-- Quarterback, Running Back, Wide Receiver e Kicker si aggiornano
-- (gli atleti restano al loro posto); arrivano Tight End, Defensive End,
-- Linebacker, Safety e Cornerback. Linea resta (la linea d'attacco);
-- «Difesa», generica, si toglie se nessuno ci gioca.
-- =====================================================================

alter table public.sport_positions add column if not exists description text not null default '' check (char_length(description) <= 1500);

-- nel gruppo: descrizione del ruolo + tiri
create or replace function public.sport_position_role_sync(p_position uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.sport_positions;
  v_group uuid;
  v_role uuid;
  v_desc text;
begin
  select * into p from public.sport_positions where id = p_position;
  select group_id into v_group from public.sports where id = p.sport_id;
  if p.id is null or v_group is null then return null; end if;
  v_desc := left(coalesce(nullif(btrim(p.description), '') || E'\n\n', '') || 'Tiri: ' || coalesce(public.sport_position_text(p.id), ''), 2000);
  select id into v_role from public.group_roles where position_id = p.id;
  if v_role is null then
    -- un ruolo con lo stesso nome già nel gruppo: lo si collega
    select id into v_role from public.group_roles where group_id = v_group and lower(name) = lower(p.name) and position_id is null;
    if v_role is null then
      insert into public.group_roles (group_id, name, description, salary, sort_order, position_id)
      values (v_group, left(p.name, 60), v_desc, 0, p.sort_order, p.id) returning id into v_role;
      return v_role;
    end if;
  end if;
  update public.group_roles set group_id = v_group, name = left(p.name, 60), description = v_desc,
    sort_order = p.sort_order, position_id = p.id
  where id = v_role;
  return v_role;
end;
$$;
revoke execute on function public.sport_position_role_sync(uuid) from public, anon, authenticated;

do $$
declare
  v_sport uuid := (select id from public.sports where name = 'Football');
  r record;
  v_pos uuid;
begin
  if v_sport is null then raise notice 'Football non trovato.'; return; end if;

  -- i ruoli che ci sono già prendono il nome nuovo (gli atleti restano collegati)
  update public.sport_positions set name = 'Quarterback (QB)' where sport_id = v_sport and name = 'Quarterback';
  update public.sport_positions set name = 'Running Back (RB)' where sport_id = v_sport and name = 'Running back';
  update public.sport_positions set name = 'Wide Receiver (WR)' where sport_id = v_sport and name = 'Wide receiver';
  update public.sport_positions set name = 'Kicker (K)' where sport_id = v_sport and name = 'Kicker';

  for r in
    select * from (values
      ('Quarterback (QB)', 1, 2, 'RIF', 'Lanciare',
       'È il regista della squadra e il giocatore che dirige l''attacco. Riceve la palla all''inizio di ogni azione e decide come svilupparla, scegliendo se effettuare un passaggio a un compagno oppure consegnare la palla a un running back. È anche responsabile della chiamata degli schemi di gioco. È generalmente un giocatore carismatico, sicuro di sé e dotato di una forte capacità decisionale. Deve saper mantenere la calma sotto pressione, assumersi le responsabilità e guadagnarsi la fiducia dei compagni, poiché gran parte del successo dell''attacco dipende dalle sue scelte.'),
      ('Running Back (RB)', 2, 3, 'VIG', 'Atletica',
       'È il giocatore principalmente incaricato di portare la palla correndo, cercando di superare la linea difensiva avversaria e guadagnare più yards possibile. Può anche ricevere passaggi brevi dal quarterback e contribuire a proteggerlo dagli avversari. È solitamente un giocatore esplosivo, con una buona dose di coraggio e aggressività agonistica. Deve avere riflessi rapidi, essere capace di reagire in una frazione di secondo e non lasciarsi scoraggiare facilmente dagli ostacoli.'),
      ('Wide Receiver (WR)', 3, 4, 'RIF', 'Mira e precisione',
       'È il principale destinatario dei passaggi del quarterback. Il suo compito è correre lungo traiettorie prestabilite, liberarsi dalla marcatura dei difensori e ricevere il pallone, cercando di avanzare il più possibile. È spesso un giocatore veloce e sicuro di sé. Deve avere anche una buona concentrazione, fiducia nelle proprie capacità e una certa propensione a prendersi la scena, soprattutto perché ricevere un passaggio decisivo significa spesso diventare il protagonista dell''azione.'),
      ('Tight End (TE)', 4, 2, 'VIG', 'Forza',
       'È un ruolo ibrido, a metà tra un ricevitore e un giocatore di linea. Può ricevere passaggi come un Wide Receiver, ma anche bloccare i difensori per proteggere il Quarterback o aprire la strada al Running Back. Di norma è un giocatore fisicamente robusto e versatile. La sua personalità tende a essere pragmatica e concreta perché deve sapersi adattare alle necessità della squadra, essere affidabile e disposto a svolgere anche il lavoro meno appariscente, senza necessariamente cercare i riflettori.'),
      ('Defensive End (DE)', 6, 2, 'VIG', 'Forza',
       'È un giocatore della linea difensiva, posizionato alle estremità della formazione. Il suo compito principale è mettere pressione sul Quarterback avversario, cercando di raggiungerlo e placcarlo prima che possa effettuare un passaggio. Deve inoltre impedire ai Running Back di trovare spazio per avanzare. È spesso un giocatore fisicamente imponente e aggressivo, che ama il confronto diretto. Deve possedere una buona dose di tenacia, pazienza e disciplina per riuscire a superare gli avversari.'),
      ('Linebacker (LB)', 7, 3, 'VIG', 'Forza',
       'Si posiziona generalmente dietro la linea difensiva ed è uno dei ruoli più versatili della difesa. Deve leggere le intenzioni degli avversari e intervenire sia contro le corse, placcando il portatore di palla, sia contro i passaggi, coprendo determinate zone del campo. È spesso considerato uno dei leader della difesa. Deve essere intelligente, aggressivo e capace di leggere rapidamente le situazioni di gioco. È un giocatore responsabile, autorevole e determinato, che deve saper comunicare con i compagni e prendere decisioni in pochi istanti.'),
      ('Cornerback (CB)', 8, 2, 'RIF', 'Agilità',
       'È il difensore incaricato principalmente di marcare i Wide Receiver avversari e impedire loro di ricevere la palla. Deve seguirne gli spostamenti, contrastare i passaggi e, quando possibile, intercettare il pallone. È generalmente un giocatore molto competitivo, rapido e sicuro delle proprie capacità. Deve avere una forte personalità, una buona dose di determinazione e la capacità di non lasciarsi abbattere dagli errori, poiché si trova spesso a dover affrontare direttamente un avversario e deve essere pronto a reagire anche dopo un''azione persa.'),
      ('Safety (S)', 9, 2, 'RIF', 'Agilità',
       'È l''ultima linea di difesa e si posiziona generalmente nella parte più arretrata del campo. Il suo compito è proteggere la squadra dai passaggi lunghi, intervenire quando un ricevitore riesce a superare gli altri difensori e aiutare la difesa in caso di avanzate avversarie. È un giocatore attento, lucido e strategico, dotato di un''ottima capacità di osservazione. Deve saper anticipare le mosse degli avversari e mantenere una visione d''insieme del gioco.'),
      ('Kicker (K)', 11, 1, 'RIF', 'Mira e precisione',
       'È il giocatore specializzato nei calci. Entra in campo durante i kickoff, i field goal e gli extra point, con il compito di calciare il pallone con precisione e potenza. Generalmente non partecipa alle normali azioni offensive o difensive. È un giocatore molto concentrato, preciso e abituato a gestire la pressione. A differenza di altri ruoli, spesso si trova a intervenire in momenti isolati, ma potenzialmente decisivi per il risultato della partita. Deve quindi possedere una forte stabilità mentale, sicurezza nei propri mezzi e capacità di isolarsi dalle distrazioni.')
    ) as v (name, ord, slots, attr, skill, descr)
  loop
    insert into public.sport_positions (sport_id, name, attribute_id, skill_id, max_slots, team_bonus, sort_order, description)
    values (v_sport, r.name, (select id from public.attributes where code = r.attr),
            (select id from public.skills where lower(name) = lower(r.skill) limit 1), r.slots, false, r.ord, r.descr)
    on conflict (sport_id, name) do update set
      attribute_id = excluded.attribute_id, skill_id = excluded.skill_id, sort_order = excluded.sort_order, description = excluded.description
    returning id into v_pos;
    -- i tiri: si riscrivono tutti
    delete from public.sport_position_combos where position_id = v_pos;
  end loop;

  -- alternative («/») e secondi tiri («e»)
  insert into public.sport_position_combos (position_id, attribute_id, skill_id, sort_order, slot)
  select p.id, a.id, sk.id, v.ord, v.slot
  from (values
    ('Quarterback (QB)', 1, 'RIF', 'Mira e precisione', 1),
    ('Running Back (RB)', 2, 'VIG', 'Agilità', 1),
    ('Running Back (RB)', 2, 'VIG', 'Rissa', 2),
    ('Wide Receiver (WR)', 1, 'RIF', 'Agilità', 1),
    ('Wide Receiver (WR)', 1, 'VIG', 'Atletica', 2),
    ('Tight End (TE)', 1, 'RIF', 'Atletica', 1),
    ('Defensive End (DE)', 1, 'RIF', 'Rissa', 1),
    ('Linebacker (LB)', 1, 'RIF', 'Rissa', 1),
    ('Cornerback (CB)', 1, 'VIG', 'Atletica', 1),
    ('Cornerback (CB)', 1, 'RIF', 'Mira e precisione', 2),
    ('Safety (S)', 1, 'VIG', 'Atletica', 1),
    ('Safety (S)', 1, 'RIF', 'Mira e precisione', 2),
    ('Kicker (K)', 1, 'RIF', 'Lanciare', 1)
  ) as v (pos, slot, attr, skill, ord)
  join public.sport_positions p on p.sport_id = v_sport and p.name = v.pos
  join public.attributes a on a.code = v.attr
  join public.skills sk on lower(sk.name) = lower(v.skill)
  on conflict (position_id, attribute_id, skill_id) do nothing;

  -- Linea: la linea d'attacco, dopo il Tight End
  update public.sport_positions set name = 'Offensive Line (OL)', sort_order = 5,
    description = 'La linea d''attacco: protegge il Quarterback dalla pressione avversaria e apre i varchi per le corse del Running Back. Lavoro duro, poco visibile e indispensabile: senza di loro nessuna azione parte.'
  where sport_id = v_sport and name = 'Linea';

  -- «Difesa» generica: via se nessuno ci gioca (i ruoli della difesa ora sono DE, LB, CB e S)
  delete from public.sport_positions p
  where p.sport_id = v_sport and p.name = 'Difesa'
    and not exists (select 1 from public.sport_roster ro where ro.position_id = p.id and ro.left_at is null);
  if exists (select 1 from public.sport_positions where sport_id = v_sport and name = 'Difesa') then
    raise notice 'Il ruolo «Difesa» ha ancora atleti: spostali su DE, LB, CB o S da Gestione → Sport → Roster, poi eliminalo.';
  end if;

  -- descrizioni e tiri nel gruppo della squadra
  for r in select id from public.sport_positions where sport_id = v_sport loop
    perform public.sport_position_role_sync(r.id);
  end loop;
  raise notice 'Football: % ruoli', (select count(*) from public.sport_positions where sport_id = v_sport);
end $$;

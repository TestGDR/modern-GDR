-- =====================================================================
-- GLEE CLUB: RUOLI NUOVI
-- Via Direttore del coro, Solista, Coreografo, Musicista accompagnatore e
-- Corista; al loro posto Musicista, Cantante, Attore, Costumista,
-- Truccatore (posti senza limite, nessuna paga). Chi aveva già un ruolo
-- passa a quello più vicino (i musicisti a Musicista, gli altri a Cantante).
-- =====================================================================
do $$
declare
  v_group uuid := (select id from public.game_groups where lower(name) = 'glee club');
  v_cantante uuid;
  v_musicista uuid;
begin
  if v_group is null then raise exception 'Gruppo «Glee Club» non trovato.'; end if;

  insert into public.group_roles (group_id, name, description, salary, max_members, sort_order)
  select v_group, v.name, v.descr, 0, null, v.ord
  from (values
    ('Musicista', 'Suona nelle prove e nelle esibizioni: pianoforte, chitarra, basso, batteria.', 1),
    ('Cantante', 'Canta nel coro e, quando tocca a lui, le parti da solista.', 2),
    ('Attore', 'Recita le scene che legano i brani e dà vita ai personaggi degli spettacoli.', 3),
    ('Costumista', 'Disegna, cuce e sistema i costumi di scena.', 4),
    ('Truccatore', 'Trucco e acconciature prima di ogni esibizione.', 5)
  ) as v (name, descr, ord)
  where not exists (select 1 from public.group_roles r where r.group_id = v_group and lower(r.name) = lower(v.name));

  select id into v_cantante from public.group_roles where group_id = v_group and name = 'Cantante';
  select id into v_musicista from public.group_roles where group_id = v_group and name = 'Musicista';

  -- chi era nei ruoli vecchi non perde il posto nel club
  update public.character_groups cg
  set role_id = case when r.name = 'Musicista accompagnatore' then v_musicista else v_cantante end
  from public.group_roles r
  where r.id = cg.role_id and r.group_id = v_group
    and r.name in ('Direttore del coro', 'Solista', 'Coreografo', 'Musicista accompagnatore', 'Corista');

  delete from public.group_roles
  where group_id = v_group and name in ('Direttore del coro', 'Solista', 'Coreografo', 'Musicista accompagnatore', 'Corista');
end;
$$;

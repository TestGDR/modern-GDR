-- =====================================================================
-- LOCALI «MALFAMATI»: CHAT SULLA MAPPA E LAVORI
-- Tre locali notturni inventati, dove i documenti si guardano poco:
-- ci lavorano anche i personaggi che non hanno ancora 21 anni (l'età per
-- l'alcol negli Stati Uniti), mai sotto i 18 (età minima del gioco).
-- Ogni locale ha la sua chat sulla mappa attiva (poco sicura o pericolosa)
-- e il suo lavoro con i ruoli (full time e/o part time).
-- Si può rilanciare: non crea doppioni (controlla i nomi).
-- =====================================================================

-- 1. CHAT SULLA MAPPA
do $$
declare
  v_map uuid := (select id from public.maps where active order by sort_order, created_at limit 1);
  r record;
  v_loc uuid;
  v_group uuid;
begin
  if v_map is null then
    raise notice 'Nessuna mappa attiva: chat dei locali non create.';
    return;
  end if;
  for r in
    select * from (values
      ('Downtown District', 'East Village', 3, '💋 Scarlet Room',
       'Gentlemen''s club dietro una porta senza insegna, tra i magazzini di East Village. Luci rosse, palco con la pedana, separè di velluto e mance in contanti. All''ingresso nessuno guarda troppo i documenti: dentro c''è chi lavora a vent''anni e chi preferisce non essere riconosciuto.',
       'poco_sicura'),
      ('Downtown District', 'Gaslamp Quarter', 2, '🪩 Neon Underground',
       'Discoteca in un seminterrato del Gaslamp: cubi illuminati, privé con le bottiglie e musica fino all''alba. Alla porta basta un sorriso o un nome giusto, e tra i ragazzi dietro al bancone non tutti hanno 21 anni.',
       'poco_sicura'),
      ('Southern District', 'Barrio Logan', 1, '💀 Club Calavera',
       'Bar after hours sotto il ponte di Barrio Logan, aperto quando gli altri chiudono. Cocktail forti, tavoli da biliardo, ballerini sul bancone e affari che si chiudono a bassa voce. Qui i documenti non li chiede nessuno: meglio non fare domande.',
       'pericolosa')
    ) as c (zone, hood, hood_ord, chat, descr, safety)
  loop
    select id into v_loc from public.locations where map_id = v_map and lower(name) = lower(r.zone);
    if v_loc is null then
      raise notice 'Zona % non trovata: chat % non creata.', r.zone, r.chat;
      continue;
    end if;
    select id into v_group from public.room_groups where location_id = v_loc and lower(name) = lower(r.hood);
    if v_group is null then
      insert into public.room_groups (location_id, name, sort_order) values (v_loc, r.hood, r.hood_ord) returning id into v_group;
    end if;
    if not exists (select 1 from public.rooms where location_id = v_loc and lower(name) = lower(r.chat)) then
      insert into public.rooms (location_id, group_id, name, description, safety, sort_order)
      values (v_loc, v_group, r.chat, r.descr, r.safety,
        coalesce((select max(sort_order) from public.rooms where location_id = v_loc), 0) + 1);
    end if;
    v_group := null;
  end loop;
end;
$$;

-- 2. LAVORI
insert into public.jobs (name, description, active, sort_order)
select v.name, v.descr, true, coalesce((select max(sort_order) from public.jobs), 0) + v.ord
from (values
  ('Scarlet Room',
   '<p>Gentlemen''s club di <strong>East Village</strong> (mappa: Downtown District → East Village). Si lavora di notte, si guadagna soprattutto con le mance e alla porta si chiude un occhio sui documenti: qui lavora anche chi non ha ancora 21 anni (mai sotto i 18).</p><p>Ambiente poco sicuro: clienti insistenti, soldi in contanti e gente che non vuole farsi vedere.</p>',
   1),
  ('Neon Underground',
   '<p>Discoteca nel seminterrato del <strong>Gaslamp Quarter</strong> (mappa: Downtown District → Gaslamp Quarter). Turni fino all''alba, privé e bottiglie ai tavoli. Nessuno controlla davvero l''età dello staff: si lavora anche sotto i 21 anni (mai sotto i 18).</p>',
   2),
  ('Club Calavera',
   '<p>Bar after hours di <strong>Barrio Logan</strong> (mappa: Southern District → Barrio Logan), aperto quando gli altri chiudono. Paga in contanti, niente contratti e nessuna domanda sui documenti: si lavora anche sotto i 21 anni (mai sotto i 18).</p><p>Posto pericoloso: chi ci lavora vede e sente cose che è meglio non raccontare.</p>',
   3)
) as v (name, descr, ord)
where not exists (select 1 from public.jobs j where lower(j.name) = lower(v.name));

insert into public.job_roles (job_id, name, description, salary, salary_full, salary_part, max_members, self_select, sort_order)
select j.id, v.role, v.descr, 0, v.full_pay, v.part_pay, v.posti, true, v.ord
from (values
  ('Scarlet Room', 'Spogliarellista', 'Numeri sul palco e balli privati nei separè. Paga base bassa, mance alte.', 3200, 1500, 6, 1),
  ('Scarlet Room', 'Cameriere ai tavoli', 'Drink ai tavoli e ai separè, tra clienti generosi e clienti molesti.', 2300, 1050, 4, 2),
  ('Scarlet Room', 'Bartender', 'Cocktail al bancone, senza fare domande su chi li beve.', 2600, 1150, 2, 3),
  ('Scarlet Room', 'Buttafuori', 'Alla porta e in sala: chi esagera esce dal retro.', 2500, 1100, 2, 4),
  ('Neon Underground', 'Cubista', 'Balla sui cubi illuminati per tenere alta la serata.', 2400, 1100, 6, 1),
  ('Neon Underground', 'Bartender', 'Shot e cocktail a ritmo di musica, fino all''alba.', 2600, 1150, 3, 2),
  ('Neon Underground', 'Addetto ai privé', 'Porta le bottiglie ai tavoli del privé con scintille e show.', 2500, 1150, 4, 3),
  ('Neon Underground', 'PR', 'Riempie la lista e porta gente nel locale, a percentuale.', null, 1000, 5, 4),
  ('Club Calavera', 'Bartender', 'Cocktail forti e orecchie chiuse su quello che si dice al bancone.', 2500, 1100, 2, 1),
  ('Club Calavera', 'Ballerino sul bancone', 'Balla sul bancone per i clienti della notte, a mance.', 2300, 1050, 4, 2),
  ('Club Calavera', 'Cameriere', 'Ai tavoli e ai biliardi, paga in contanti a fine turno.', 2200, 950, 3, 3),
  ('Club Calavera', 'Addetto alla porta', 'Decide chi entra, e chi è meglio che non entri.', 2400, 1050, 2, 4)
) as v (job, role, descr, full_pay, part_pay, posti, ord)
join public.jobs j on lower(j.name) = lower(v.job)
where not exists (select 1 from public.job_roles r where r.job_id = j.id and lower(r.name) = lower(v.role));

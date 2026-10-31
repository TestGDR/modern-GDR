-- =====================================================================
-- ZAINO: "CON SÉ" E "ZAINO"
-- Gli oggetti del personaggio (comprati al Mercato o regalati) sono nello
-- zaino (li vedono solo il proprietario e lo staff) oppure "con sé":
-- portati dietro e visibili a tutti nella scheda. Il proprietario sposta
-- gli oggetti; può cambiare solo questa scelta (colonna carried).
-- =====================================================================

alter table public.character_items add column if not exists carried boolean not null default false;
create index if not exists character_items_carried_idx on public.character_items (character_id) where carried;

grant update (carried) on public.character_items to authenticated;

create policy "Oggetti: quelli con sé li vedono tutti" on public.character_items for select to authenticated
  using (carried);
create policy "Oggetti: il proprietario sceglie cosa portare con sé" on public.character_items for update to authenticated
  using (public.npc_mine(character_id)) with check (public.npc_mine(character_id));
